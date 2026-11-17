"""Unit tests for the local RAG HTTP API (rag/server.py).

Run:  python -m unittest discover -s tests -t .
No network, corpus or API key needed: the index, the model client and the
key state are injected.
"""
from __future__ import annotations

import json
import threading
import unittest
import urllib.error
import urllib.request
from types import SimpleNamespace
from typing import Any

from rag.retrieval import BM25Index, chunk_document
from rag.server import (
    MAX_QUESTION_CHARS,
    RagService,
    create_server,
)

SAMPLE = {
    "rhel-lifecycle": (
        "# Life cycle\nRed Hat Enterprise Linux 9 delivers a ten-year life cycle with full support "
        "and maintenance support phases for every release."
    ),
    "satellite-lifecycle": (
        "# Satellite\nThe Satellite support policy is N-2 so the current and two previous "
        "Satellite versions are supported together."
    ),
}

PRICING_QUESTION = "RHEL Premium 서브스크립션 가격이 얼마예요?"
# Scores above the evidence threshold on the two-document sample index.
ANSWER_QUESTION = "RHEL 9 life cycle ten-year full support maintenance support phases"


def make_index() -> BM25Index:
    chunks = []
    for doc_id, body in SAMPLE.items():
        chunks += chunk_document({"doc_id": doc_id, "title": doc_id, "url": f"https://example.test/{doc_id}"}, body)
    return BM25Index(chunks)


class FakeClient:
    def __init__(self, text: str = "", stop_reason: str = "end_turn") -> None:
        self.calls = 0
        self.text, self.stop_reason = text, stop_reason
        self.messages = self

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.calls += 1
        return SimpleNamespace(stop_reason=self.stop_reason, content=[SimpleNamespace(type="text", text=self.text)])


def missing_corpus() -> list[Any]:
    raise FileNotFoundError("No corpus. Run: python -m rag.build_corpus")


class HealthTests(unittest.TestCase):
    def test_reports_corpus_and_key(self):
        body = RagService(index=make_index(), api_key_available=False).health()
        self.assertTrue(body["ok"])
        self.assertTrue(body["corpus_ready"])
        self.assertFalse(body["has_api_key"])
        self.assertEqual(body["chunks"], len(make_index().chunks))

    def test_missing_corpus_is_reported_not_raised(self):
        body = RagService(loader=missing_corpus, api_key_available=True).health()
        self.assertTrue(body["ok"])
        self.assertFalse(body["corpus_ready"])
        self.assertEqual(body["chunks"], 0)
        self.assertIn("build_corpus", body["detail"])


class AskTests(unittest.TestCase):
    def setUp(self):
        self.index = make_index()

    def test_without_api_key_pricing_is_still_refused(self):
        service = RagService(index=self.index, api_key_available=False)
        status, body = service.ask({"question": PRICING_QUESTION})
        self.assertEqual(status, 200)
        self.assertEqual((body["status"], body["reason"]), ("refused", "pricing"))
        self.assertFalse(body["has_api_key"])

    def test_without_api_key_answerable_question_asks_for_key(self):
        status, body = RagService(index=self.index, api_key_available=False).ask({"question": ANSWER_QUESTION})
        self.assertEqual(status, 503)
        self.assertFalse(body["ok"])
        self.assertEqual((body["status"], body["reason"]), ("unavailable", "no_api_key"))
        self.assertIn("ANTHROPIC_API_KEY", body["message"])
        self.assertTrue(body["retrieved"])  # retrieval still happened, the UI can show it

    def test_missing_corpus_returns_guidance(self):
        status, body = RagService(loader=missing_corpus, api_key_available=True).ask({"question": "RHEL 9 수명주기"})
        self.assertEqual(status, 503)
        self.assertEqual(body["reason"], "corpus_missing")
        self.assertIn("build_corpus", body["message"])

    def test_pricing_refused_without_model_call(self):
        client = FakeClient("anything")
        status, body = RagService(index=self.index, client=client).ask({"question": PRICING_QUESTION})
        self.assertEqual(status, 200)
        self.assertEqual((body["status"], body["reason"]), ("refused", "pricing"))
        self.assertEqual(body["answer"], "")
        self.assertEqual(client.calls, 0)

    def test_answer_carries_citations_sources_and_chunks(self):
        client = FakeClient("RHEL은 10년 지원됩니다 [rhel-lifecycle].")
        status, body = RagService(index=self.index, client=client).ask({"question": ANSWER_QUESTION})
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "answered")
        self.assertEqual(body["citations"], ["rhel-lifecycle"])
        self.assertIn("[rhel-lifecycle]", body["answer"])
        self.assertEqual(client.calls, 1)
        self.assertTrue(body["retrieved"])
        first = body["retrieved"][0]
        for key in ("chunk_id", "doc_id", "title", "url", "heading", "score"):
            self.assertIn(key, first)
        self.assertIsInstance(first["score"], float)
        source = next(s for s in body["sources"] if s["doc_id"] == "rhel-lifecycle")
        self.assertTrue(source["cited"])
        self.assertEqual(source["url"], "https://example.test/rhel-lifecycle")

    def test_low_evidence_refused_with_retrieved_context(self):
        client = FakeClient("whatever")
        status, body = RagService(index=self.index, client=client).ask({"question": "RHEL 점심 메뉴"})
        self.assertEqual(status, 200)
        self.assertEqual((body["status"], body["reason"]), ("refused", "low_evidence"))
        self.assertEqual(client.calls, 0)

    def test_model_error_is_json_not_crash(self):
        class Exploding:
            def __init__(self) -> None:
                self.messages = self

            def create(self, **kwargs):
                raise RuntimeError("upstream timeout")

        status, body = RagService(index=self.index, client=Exploding()).ask({"question": ANSWER_QUESTION})
        self.assertEqual(status, 502)
        self.assertEqual(body["reason"], "pipeline_error")
        self.assertIn("upstream timeout", body["message"])

    def test_bad_requests(self):
        service = RagService(index=self.index, client=FakeClient("x [rhel-lifecycle]."))
        for payload in ({}, {"question": "   "}, {"question": 42}, ["question"]):
            status, body = service.ask(payload)
            self.assertEqual(status, 400, payload)
            self.assertEqual(body["reason"], "bad_request")
        status, body = service.ask({"question": "R" * (MAX_QUESTION_CHARS + 1)})
        self.assertEqual(status, 400)
        self.assertIn(str(MAX_QUESTION_CHARS), body["message"])


class HTTPTests(unittest.TestCase):
    """End-to-end over a real socket, the way the Vite proxy calls it."""

    @classmethod
    def setUpClass(cls):
        service = RagService(index=make_index(), client=FakeClient("RHEL은 10년입니다 [rhel-lifecycle]."))
        cls.server = create_server("127.0.0.1", 0, service)
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def _request(self, path, data=None, raw=None):
        body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
        req = urllib.request.Request(
            self.base + path,
            data=body,
            headers={"Content-Type": "application/json"} if body else {},
            method="POST" if body is not None else "GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read())

    def test_health_over_http(self):
        status, body = self._request("/api/health")
        self.assertEqual(status, 200)
        self.assertTrue(body["corpus_ready"])
        self.assertTrue(body["has_api_key"])

    def test_health_without_trailing_slash_forms(self):
        for path in ("/health", "/api/health/"):
            status, body = self._request(path)
            self.assertEqual(status, 200, path)
            self.assertIn("corpus_ready", body)

    def test_ask_over_http(self):
        status, body = self._request("/api/ask", {"question": ANSWER_QUESTION})
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "answered")
        self.assertEqual(body["citations"], ["rhel-lifecycle"])

    def test_unknown_path_is_json_404(self):
        status, body = self._request("/api/nope")
        self.assertEqual(status, 404)
        self.assertEqual(body["reason"], "not_found")

    def test_broken_json_is_400(self):
        status, body = self._request("/api/ask", raw=b"{not json")
        self.assertEqual(status, 400)
        self.assertEqual(body["reason"], "bad_request")


if __name__ == "__main__":
    unittest.main()
