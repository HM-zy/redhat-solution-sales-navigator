"""Unit tests for tokenization, retrieval, guardrails, the pipeline and eval scoring.

Run:  python -m unittest discover -s tests -v
No network or API key needed: the model is replaced by a fake client.
"""
from __future__ import annotations

import unittest
from types import SimpleNamespace

from evals.run_eval import pct, summarize
from rag import guardrails as g
from rag.aliases import expand
from rag.pipeline import answer
from rag.retrieval import (
    CHUNK_WORDS,
    OVERLAP_WORDS,
    BM25Index,
    chunk_document,
    products_in,
    rhel_major_version,
    strip_shared_lines,
)
from rag.text import korean_bigrams, tokenize


def make_index(docs: dict[str, str]) -> BM25Index:
    chunks = []
    for doc_id, body in docs.items():
        chunks += chunk_document({"doc_id": doc_id, "title": doc_id, "url": "u"}, body)
    return BM25Index(chunks)


SAMPLE = {
    "rhel-lifecycle": "# Life cycle\nRed Hat Enterprise Linux 9 delivers a ten-year life cycle with full support and maintenance support phases for every release.",
    "satellite-lifecycle": "# Satellite\nThe Satellite support policy is N-2 so the current and two previous Satellite versions are supported together.",
    "openshift-lifecycle": "# OpenShift\nEach OpenShift minor release receives twelve months of full support and twelve months of maintenance support.",
}


class FakeClient:
    def __init__(self, text: str = "", stop_reason: str = "end_turn"):
        self.calls = 0
        self.text, self.stop_reason = text, stop_reason
        self.messages = self

    def create(self, **kwargs):
        self.calls += 1
        return SimpleNamespace(stop_reason=self.stop_reason, content=[SimpleNamespace(type="text", text=self.text)])


class TextTests(unittest.TestCase):
    def test_korean_bigrams(self):
        self.assertEqual(korean_bigrams("수명주기"), ["수명", "명주", "주기"])

    def test_version_numbers_stay_whole(self):
        self.assertIn("9.4", tokenize("RHEL 9.4 release"))

    def test_stopwords_removed(self):
        self.assertNotIn("the", tokenize("the life cycle"))


class AliasTests(unittest.TestCase):
    def test_korean_phrase_expands(self):
        _, hits = expand("RHEL 8 지원 종료는 언제?")
        self.assertIn("수명주기", hits)

    def test_abbreviation_needs_whole_word(self):
        _, hits = expand("support levels")  # "levels" must not trigger "els"
        self.assertNotIn("확장 지원", hits)
        _, hits = expand("ELS 계약")
        self.assertIn("확장 지원", hits)


class RetrievalTests(unittest.TestCase):
    def test_chunks_overlap(self):
        words = " ".join(f"w{i}" for i in range(CHUNK_WORDS + 50))
        chunks = chunk_document({"doc_id": "d", "title": "t", "url": "u"}, "# H\n" + words)
        self.assertEqual(len(chunks), 2)
        first, second = chunks[0].text.split(), chunks[1].text.split()
        self.assertEqual(first[-OVERLAP_WORDS:], second[:OVERLAP_WORDS])

    def test_chunks_keep_heading(self):
        chunks = chunk_document({"doc_id": "d", "title": "t", "url": "u"}, "# A\n## B\none two three four five six seven eight nine")
        self.assertEqual(chunks[0].heading, "A > B")

    def test_shared_lines_removed(self):
        docs = [({"doc_id": str(i)}, f"Buy online\nunique {i}") for i in range(3)]
        cleaned = strip_shared_lines(docs, min_docs=3)
        self.assertTrue(all("Buy online" not in body for _, body in cleaned))
        self.assertIn("unique 0", cleaned[0][1])

    def test_bm25_ranks_matching_doc_first(self):
        idx = make_index(SAMPLE)
        self.assertEqual(idx.search("Satellite N-2 support policy")[0][0].doc_id, "satellite-lifecycle")

    def test_korean_query_reaches_english_doc_via_alias(self):
        idx = make_index(SAMPLE)
        self.assertEqual(idx.search("OpenShift 수명주기")[0][0].doc_id, "openshift-lifecycle")

    def test_alias_terms_weigh_less_than_own_words(self):
        w = BM25Index.query_weights("Satellite 수명주기")
        self.assertEqual(w["satellite"], 1.0)
        self.assertEqual(w["cycle"], 0.5)

    def test_version_and_product_detection(self):
        self.assertEqual(rhel_major_version("RHEL 8 지원"), "8")
        self.assertIsNone(rhel_major_version("Satellite 6.16"))
        self.assertEqual(products_in("Ansible로 VMware VM 자동화"), {"ansible", "virtualization"})

    def test_off_topic_query_finds_nothing(self):
        self.assertEqual(make_index(SAMPLE).search("오늘 점심 메뉴"), [])


class PreGateTests(unittest.TestCase):
    def test_pricing_refused(self):
        for q in ["RHEL 가격이 얼마예요?", "할인 가능해요?", "how much is the subscription",
                  "RHEL Premium 서브스크립션 가격이 얼마예요?",
                  "Ansible 노드 50개 견적 내면 할인 몇 퍼센트까지 가능해요?",
                  "OpenShift Virtualization 코어당 비용 알려주세요.",
                  "라이선스 금액 알려주세요", "비용이 얼마나 드나요?", "구축 비용이 어느 정도인지 궁금합니다",
                  "What is the price per node?", "Cost per core for OpenShift Virtualization?"]:
            self.assertEqual(g.pre_generation(q, 30).reason, "pricing", q)

    def test_technical_cost_talk_is_not_pricing(self):
        # Regression: the bare word "비용" used to refuse these normal sales/demo questions.
        for q in ["VMware 비용 때문에 OpenShift Virtualization 도입을 검토하고 있습니다",
                  "가상화 비용 제약 때문에 마이그레이션 우선순위를 정하려고 합니다",
                  "비용 절감을 위해 RHEL 9를 선택하면 어떤 장점이 있나요?",
                  "라이선스 비용이 부담이라 ELS 대신 ELCP 지원을 검토합니다",
                  "총 소유 비용(TCO) 관점에서 OpenShift Virtualization은 어떤가요?",
                  "비용이 얼마나 절감되나요?",
                  "How does OpenShift Virtualization help with cost reduction?"]:
            self.assertTrue(g.pre_generation(q, 30).allowed, q)

    def test_how_long_is_not_pricing(self):
        for q in ["RHEL 8 지원 기간이 얼마나 남았나요?", "지원 기간이 얼마 정도인가요?",
                  "Premium 지원에서 Severity 1 장애의 최초 응답 시간은 얼마나 되나요?"]:
            self.assertTrue(g.pre_generation(q, 30).allowed, q)

    def test_off_domain_refused(self):
        self.assertEqual(g.pre_generation("오늘 점심 메뉴", 0).reason, "off_domain")

    def test_low_evidence_refused(self):
        self.assertEqual(g.pre_generation("RHEL 지원", g.EVIDENCE_THRESHOLD - 0.1).reason, "low_evidence")

    def test_allowed(self):
        self.assertTrue(g.pre_generation("RHEL 9 수명주기", g.EVIDENCE_THRESHOLD + 1).allowed)


class PostGateTests(unittest.TestCase):
    allowed = {"rhel-lifecycle", "rhel-eus"}

    def test_insufficient_context_refused(self):
        r = g.post_generation(g.INSUFFICIENT, self.allowed)
        self.assertTrue(r.refused)
        self.assertEqual(r.reason, "insufficient_context")

    def test_clean_answer_kept(self):
        r = g.post_generation("RHEL은 10년 지원됩니다 [rhel-lifecycle]. EUS는 24개월입니다 [rhel-eus].", self.allowed)
        self.assertFalse(r.refused)
        self.assertEqual(r.citations, ["rhel-eus", "rhel-lifecycle"])
        self.assertEqual(r.dropped_sentences, [])

    def test_fabricated_citation_removed(self):
        r = g.post_generation("RHEL은 10년입니다 [rhel-lifecycle][made-up-doc].", self.allowed)
        self.assertEqual(r.fabricated_citations, ["made-up-doc"])
        self.assertNotIn("made-up-doc", r.text)

    def test_sentence_citing_only_fake_doc_is_dropped(self):
        r = g.post_generation("RHEL은 10년입니다 [rhel-lifecycle]. 가격은 100달러입니다 [price-list].", self.allowed)
        self.assertEqual(len(r.dropped_sentences), 1)
        self.assertNotIn("100달러", r.text)

    def test_uncited_sentence_dropped(self):
        r = g.post_generation("RHEL은 10년입니다 [rhel-lifecycle]. 아마 더 길 수도 있습니다.", self.allowed)
        self.assertEqual(r.dropped_sentences, ["아마 더 길 수도 있습니다."])

    def test_citation_after_period_is_attached(self):
        r = g.post_generation("RHEL은 10년입니다. [rhel-lifecycle]", self.allowed)
        self.assertFalse(r.refused)
        self.assertEqual(r.dropped_sentences, [])

    def test_citation_after_period_belongs_to_previous_sentence(self):
        # Found by the live eval: Claude put each citation after the period, mid-paragraph.
        text = "RHEL은 10년입니다. [rhel-lifecycle] EUS는 24개월입니다. [rhel-eus]"
        r = g.post_generation(text, self.allowed)
        self.assertEqual(r.dropped_sentences, [])
        self.assertEqual(g.split_sentences(text), ["RHEL은 10년입니다. [rhel-lifecycle]", "EUS는 24개월입니다. [rhel-eus]"])

    def test_nothing_cited_refused(self):
        r = g.post_generation("근거 없는 문장입니다.", self.allowed)
        self.assertTrue(r.refused)
        self.assertEqual(r.reason, "no_cited_sentences")


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.idx = make_index(SAMPLE)

    def test_gate_blocks_before_model_call(self):
        client = FakeClient("anything")
        r = answer("Satellite 가격이 얼마예요?", self.idx, client)
        self.assertEqual((r.status, r.reason), ("refused", "pricing"))
        self.assertEqual(client.calls, 0)

    def test_answer_with_valid_citation(self):
        client = FakeClient("Satellite는 N-2 정책입니다 [satellite-lifecycle].")
        r = answer("Satellite support policy N-2 versions", self.idx, client)
        self.assertEqual(r.status, "answered")
        self.assertEqual(r.citations, ["satellite-lifecycle"])
        self.assertEqual(client.calls, 1)

    def test_citation_outside_retrieved_set_is_fabricated(self):
        client = FakeClient("Satellite는 N-2입니다 [satellite-lifecycle]. 할인 20% [pricing-sheet].")
        r = answer("Satellite support policy N-2 versions", self.idx, client)
        self.assertEqual(r.fabricated_citations, ["pricing-sheet"])
        self.assertNotIn("20%", r.answer)

    def test_model_refusal_becomes_refusal(self):
        client = FakeClient("", stop_reason="refusal")
        r = answer("Satellite support policy N-2 versions", self.idx, client)
        self.assertEqual((r.status, r.reason), ("refused", "insufficient_context"))

    def test_cost_context_statement_reaches_the_model(self):
        # The "VMware 비용 때문에..." scenario must not be stopped by the pricing gate.
        body = "# Life cycle\nRed Hat Enterprise Linux delivers a ten-year life cycle with full support and maintenance support phases."
        chunk = chunk_document({"doc_id": "rhel-lifecycle", "title": "life", "url": "u"}, body)[0]

        class FixedIndex:  # evidence is not what this test is about
            def search(self, query, k=5):
                return [(chunk, 30.0)]

        client = FakeClient("RHEL은 10년 지원됩니다 [rhel-lifecycle].")
        r = answer("VMware 비용 때문에 RHEL 9 수명주기를 다시 확인하려고 합니다", FixedIndex(), client)
        self.assertEqual(client.calls, 1)
        self.assertEqual((r.status, r.reason), ("answered", None))


class EvalScoringTests(unittest.TestCase):
    def test_pct(self):
        self.assertEqual(pct(1, 4), "1/4 (25.0%)")
        self.assertEqual(pct(0, 0), "n/a")

    def test_summary_counts_over_refusal_and_refusal_accuracy(self):
        rows = [
            {"kind": "answer", "status": "answered", "top1": True, "recall_at_5": True,
             "citation_clean": True, "cited_expected": True, "key_facts": True},
            {"kind": "answer", "status": "refused", "top1": False, "recall_at_5": True,
             "citation_clean": False, "cited_expected": False, "key_facts": False},
            {"kind": "refuse", "status": "refused", "top1": False, "recall_at_5": False},
            {"kind": "refuse", "status": "answered", "top1": False, "recall_at_5": False},
        ]
        s = summarize(rows, live=True)
        self.assertEqual(s["over_refusals"], "1/2 (50.0%)")
        self.assertEqual(s["refusal_accuracy"], "1/2 (50.0%)")
        self.assertEqual(s["citation_integrity"], "1/1 (100.0%)")


if __name__ == "__main__":
    unittest.main()
