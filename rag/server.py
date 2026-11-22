"""Local HTTP API in front of the RAG pipeline, for the React app in ../src.

Usage:  python -m rag.server                 # http://127.0.0.1:8000
        ANTHROPIC_API_KEY=sk-ant-... python -m rag.server

Only the Python standard library is used (http.server.ThreadingHTTPServer), so
`pip install -r requirements.txt` needs nothing beyond the pipeline's own deps.

  GET  /api/health   -> {ok, corpus_ready, has_api_key, chunks, model}
  POST /api/ask      -> {"question": "..."}
                        -> {status, reason, answer, citations, sources, retrieved, ...}

The server never dies on a missing key or a broken corpus: both become a JSON
answer that says what to run, and the health endpoint reports the same state.
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable
from urllib.parse import urlsplit

from .pipeline import DEFAULT_MODEL, TOP_K, answer as run_pipeline
from .retrieval import BM25Index, load_chunks

HOST = "127.0.0.1"
PORT = 8000
MAX_BODY_BYTES = 16 * 1024
MAX_QUESTION_CHARS = 500

NO_KEY_MESSAGE = (
    "ANTHROPIC_API_KEY가 설정되어 있지 않아 답변을 만들 수 없습니다. "
    "터미널에서 export ANTHROPIC_API_KEY=sk-ant-... 를 실행한 뒤 python -m rag.server 를 다시 띄워 주세요."
)
NO_CORPUS_MESSAGE = (
    "코퍼스가 없습니다. 먼저 python -m rag.build_corpus 로 Red Hat 공식문서를 수집해 주세요."
)
MODEL_ERROR_MESSAGE = "답변 생성 중 오류가 발생했습니다: {error}"


def has_api_key(environ: dict[str, str] | None = None) -> bool:
    env = os.environ if environ is None else environ
    return bool(env.get("ANTHROPIC_API_KEY") or env.get("ANTHROPIC_AUTH_TOKEN"))


def _sources(cited: list[str], hits: list[tuple[Any, float]]) -> list[dict[str, Any]]:
    """Documents behind the retrieved chunks, each flagged with whether the answer cited it."""
    seen: dict[str, dict[str, Any]] = {}
    for chunk, _ in hits:
        if chunk.doc_id not in seen:
            seen[chunk.doc_id] = {
                "doc_id": chunk.doc_id,
                "title": chunk.title,
                "url": chunk.url,
                "cited": False,
            }
    for doc_id in cited:
        if doc_id in seen:
            seen[doc_id]["cited"] = True
    return list(seen.values())


class RagService:
    """Index + model client behind the endpoints. One instance per server.

    `index`, `client` and `api_key_available` are injectable so the tests can run
    without a corpus, an API key or a network call.
    """

    def __init__(
        self,
        index: BM25Index | None = None,
        client: Any = None,
        model: str = DEFAULT_MODEL,
        api_key_available: bool | None = None,
        loader: Callable[[], list[Any]] = load_chunks,
    ) -> None:
        self._index = index
        self._client = client
        self._loader = loader
        self._api_key_available = api_key_available
        self._load_error: str | None = None
        self._lock = threading.Lock()
        self.model = model

    # --- state -----------------------------------------------------------
    @property
    def api_key_available(self) -> bool:
        if self._api_key_available is not None:
            return self._api_key_available
        if self._client is not None:
            return True
        return has_api_key()

    def index(self) -> BM25Index | None:
        """Load the corpus on first use; a missing corpus is remembered, not fatal."""
        with self._lock:
            if self._index is None and self._load_error is None:
                try:
                    self._index = BM25Index(self._loader())
                except (FileNotFoundError, OSError, ValueError) as exc:
                    self._load_error = str(exc)
            return self._index

    def _client_or_create(self) -> Any:
        if self._client is not None:
            return self._client
        import anthropic  # imported here so /api/health works without the SDK installed

        self._client = anthropic.Anthropic()
        return self._client

    # --- endpoints -------------------------------------------------------
    def health(self) -> dict[str, Any]:
        index = self.index()
        body: dict[str, Any] = {
            "ok": True,
            "corpus_ready": index is not None,
            "has_api_key": self.api_key_available,
            "chunks": len(index.chunks) if index is not None else 0,
            "model": self.model,
        }
        if index is None:
            body["detail"] = self._load_error or NO_CORPUS_MESSAGE
        return body

    @staticmethod
    def _retrieved(hits: list[tuple[Any, float]]) -> list[dict[str, Any]]:
        return [
            {
                "chunk_id": chunk.chunk_id,
                "doc_id": chunk.doc_id,
                "title": chunk.title,
                "url": chunk.url,
                "heading": chunk.heading,
                "score": round(score, 2),
            }
            for chunk, score in hits
        ]

    def _body(self, question: str, result: Any, hits: list[tuple[Any, float]]) -> dict[str, Any]:
        return {
            "ok": True,
            "question": question,
            "status": result.status,
            "reason": result.reason,
            "answer": result.answer,
            "citations": result.citations,
            "top_score": round(result.top_score, 2),
            "has_api_key": self.api_key_available,
            "sources": _sources(result.citations, hits),
            "retrieved": self._retrieved(hits),
            "fabricated_citations": result.fabricated_citations,
            "dropped_sentences": result.dropped_sentences,
        }

    def ask(self, payload: Any) -> tuple[int, dict[str, Any]]:
        question = payload.get("question") if isinstance(payload, dict) else None
        if not isinstance(question, str) or not question.strip():
            return HTTPStatus.BAD_REQUEST, {
                "ok": False,
                "status": "invalid",
                "reason": "bad_request",
                "message": '{"question": "..."} 형태의 JSON 본문이 필요합니다.',
            }
        question = question.strip()
        if len(question) > MAX_QUESTION_CHARS:
            return HTTPStatus.BAD_REQUEST, {
                "ok": False,
                "status": "invalid",
                "reason": "bad_request",
                "question": question[:MAX_QUESTION_CHARS],
                "message": f"질문은 {MAX_QUESTION_CHARS}자까지 입력할 수 있습니다.",
            }

        index = self.index()
        if index is None:
            return HTTPStatus.SERVICE_UNAVAILABLE, {
                "ok": False,
                "status": "unavailable",
                "reason": "corpus_missing",
                "question": question,
                "corpus_ready": False,
                "has_api_key": self.api_key_available,
                "message": NO_CORPUS_MESSAGE,
            }
        client: Any = None
        if self.api_key_available:
            try:
                client = self._client_or_create()
            except Exception as exc:  # noqa: BLE001 - bad/missing credentials come back as JSON
                return HTTPStatus.BAD_GATEWAY, {
                    "ok": False,
                    "status": "error",
                    "reason": "pipeline_error",
                    "question": question,
                    "message": MODEL_ERROR_MESSAGE.format(error=exc),
                }

        try:
            # Without a key the pipeline still runs retrieval and the pre-generation
            # gates (pricing / off-domain / low evidence), which need no model call.
            result = run_pipeline(question, index, client, self.model)
        except Exception as exc:  # noqa: BLE001 - a model/API failure must still answer with JSON
            return HTTPStatus.BAD_GATEWAY, {
                "ok": False,
                "status": "error",
                "reason": "pipeline_error",
                "question": question,
                "message": MODEL_ERROR_MESSAGE.format(error=exc),
            }

        # The pipeline ran the same search; repeating it here only to carry title/url/score
        # of each retrieved chunk to the UI (sub-millisecond).
        hits = index.search(question, TOP_K)
        if client is None and result.status != "refused":
            return HTTPStatus.SERVICE_UNAVAILABLE, {
                "ok": False,
                "status": "unavailable",
                "reason": "no_api_key",
                "question": question,
                "corpus_ready": True,
                "has_api_key": False,
                "message": NO_KEY_MESSAGE,
                "top_score": round(result.top_score, 2),
                "retrieved": self._retrieved(hits),
            }
        return HTTPStatus.OK, self._body(question, result, hits)


INDEX_HTML = """<!doctype html>
<meta charset="utf-8">
<title>Red Hat RAG API</title>
<body style="font-family: system-ui; max-width: 40rem; margin: 3rem auto; line-height: 1.7">
<h1>Red Hat 공식문서 RAG API</h1>
<p>이 서버는 웹 UI(<code>npm run dev</code> → http://localhost:5173)의 <code>/api</code> 프록시가 사용합니다.</p>
<ul>
  <li><code>GET /api/health</code> — 코퍼스·API 키 상태</li>
  <li><code>POST /api/ask</code> — <code>{"question": "RHEL 9 수명주기는?"}</code></li>
</ul>
</body>
"""


class _Handler(BaseHTTPRequestHandler):
    server_version = "RagServer/1.0"
    protocol_version = "HTTP/1.1"  # keep-alive; every response sends Content-Length

    @property
    def service(self) -> RagService:
        return self.server.service  # type: ignore[attr-defined]

    # --- helpers ---------------------------------------------------------
    def _send(self, status: int, body: dict[str, Any]) -> None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _send_html(self, status: int, html: str) -> None:
        data = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _cors(self) -> None:
        """Allow a dev page on localhost only; no other site may spend the user's tokens."""
        origin = self.headers.get("Origin", "")
        if origin.startswith(("http://localhost:", "http://127.0.0.1:")) or origin in (
            "http://localhost",
            "http://127.0.0.1",
        ):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write(f"[rag.server] {self.address_string()} {fmt % args}\n")

    # --- routes ----------------------------------------------------------
    def do_OPTIONS(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler naming
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlsplit(self.path).path.rstrip("/") or "/"
        if path in ("/api/health", "/health"):
            self._send(HTTPStatus.OK, self.service.health())
        elif path == "/":
            self._send_html(HTTPStatus.OK, INDEX_HTML)
        else:
            self._send(HTTPStatus.NOT_FOUND, {"ok": False, "reason": "not_found", "path": path})

    def do_POST(self) -> None:  # noqa: N802
        path = urlsplit(self.path).path.rstrip("/")
        if path not in ("/api/ask", "/ask"):
            self._send(HTTPStatus.NOT_FOUND, {"ok": False, "reason": "not_found", "path": path})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length > MAX_BODY_BYTES:
            self._send(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"ok": False, "reason": "body_too_large"})
            return
        raw = self.rfile.read(length) if length else b""
        try:
            payload = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            self._send(
                HTTPStatus.BAD_REQUEST,
                {"ok": False, "status": "invalid", "reason": "bad_request", "message": "JSON 본문을 해석할 수 없습니다."},
            )
            return
        status, body = self.service.ask(payload)
        self._send(status, body)


class RagHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], service: RagService, handler: type[_Handler] = _Handler) -> None:
        super().__init__(address, handler)
        self.service = service


def create_server(host: str = HOST, port: int = PORT, service: RagService | None = None) -> RagHTTPServer:
    return RagHTTPServer((host, port), service or RagService())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Red Hat 공식문서 RAG 로컬 API 서버")
    parser.add_argument("--host", default=HOST, help=f"바인드 주소 (기본 {HOST})")
    parser.add_argument("--port", type=int, default=int(os.environ.get("RAG_PORT", PORT)), help=f"포트 (기본 {PORT})")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Claude 모델 (기본 {DEFAULT_MODEL})")
    args = parser.parse_args(argv)

    service = RagService(model=args.model)
    health = service.health()
    host = "localhost" if args.host in ("127.0.0.1", "0.0.0.0") else args.host
    print(f"RAG API      http://{host}:{args.port}")
    print(f"  corpus     {'ready' if health['corpus_ready'] else 'MISSING'} ({health['chunks']} chunks)")
    print(f"  api key    {'set' if health['has_api_key'] else 'NOT SET'}")
    if not health["corpus_ready"]:
        print(f"  ! {NO_CORPUS_MESSAGE}")
    elif not health["has_api_key"]:
        print(f"  ! {NO_KEY_MESSAGE}")
    try:
        server = create_server(args.host, args.port, service)
    except OSError as exc:
        if exc.errno in (48, 98) or isinstance(exc, socket.gaierror):
            print(f"포트 {args.port}를 열 수 없습니다: {exc}", file=sys.stderr)
            return 1
        raise
    print("  GET /api/health, POST /api/ask  (Ctrl+C로 종료)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n-- stopped --")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
