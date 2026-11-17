"""Deterministic guardrails around the model call.

Before the model is called (cheap, no tokens spent):
  1. pricing_gate     - price / discount / quote requests are refused: the corpus holds no
                        prices, and a seller must not quote numbers an assistant made up.
  2. scope_gate       - a question with no Red Hat product signal and no retrieval hit is off-domain.
  3. evidence_gate    - if the best retrieval score is below a threshold, refuse instead of guessing.

After the model answers:
  4. insufficient_context - the model is told to reply with a fixed token when the excerpts do
                            not answer the question; that token becomes a refusal.
  5. fabricated_citation  - citations to doc_ids that were not in the retrieved excerpts are removed.
  6. uncited_sentence     - every sentence must carry at least one valid [doc_id]; uncited
                            sentences are dropped, and if nothing cited remains the answer is refused.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

INSUFFICIENT = "INSUFFICIENT_CONTEXT"
EVIDENCE_THRESHOLD = 8.0  # minimum top BM25 score to attempt an answer

_PRICING = re.compile(
    # "얼마나" (how long / how many) is a normal question; only "얼마예요/얼마인가요" (how much) is about price.
    r"가격|할인|견적|단가|얼마(?:예요|에요|인가|입니까|죠|야)|비용|요금|price|pricing|discount|quote|\bcost|how much", re.I
)
_PRODUCT_SIGNAL = re.compile(
    r"rhel|red hat|레드햇|리눅스|linux|satellite|새틀라이트|ansible|앤서블|openshift|오픈시프트|insights|"
    r"인사이트|els|eus|elcp|smart management|kubernetes|쿠버네티스|가상화|virtualization|errata|패치|"
    r"수명주기|라이프사이클|지원 종료|업그레이드|sla|장애",
    re.I,
)
_CITATION = re.compile(r"\[([a-z0-9][a-z0-9\-]*)\]")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?。])\s+|\n+")


@dataclass
class GateResult:
    allowed: bool
    reason: str | None = None


def pre_generation(query: str, top_score: float) -> GateResult:
    if _PRICING.search(query):
        return GateResult(False, "pricing")
    if not _PRODUCT_SIGNAL.search(query) and top_score == 0:
        return GateResult(False, "off_domain")
    if top_score < EVIDENCE_THRESHOLD:
        return GateResult(False, "low_evidence")
    return GateResult(True)


@dataclass
class CheckedAnswer:
    text: str
    refused: bool
    reason: str | None
    citations: list[str] = field(default_factory=list)
    dropped_sentences: list[str] = field(default_factory=list)
    fabricated_citations: list[str] = field(default_factory=list)


_LEADING_CITATIONS = re.compile(r"^((?:\s*\[[a-z0-9][a-z0-9\-]*\])+)\s*")


def split_sentences(text: str) -> list[str]:
    """Split on sentence ends and line breaks. Citations written after the period
    ("... 입니다. [rhel-lifecycle] 다음 문장 ...") belong to the sentence before them,
    so a fragment's leading citations are moved back to the previous sentence."""
    out: list[str] = []
    for s in (s.strip() for s in _SENTENCE_SPLIT.split(text) if s):
        if not s:
            continue
        m = _LEADING_CITATIONS.match(s)
        if out and m:
            out[-1] = f"{out[-1]} {m.group(1).strip()}"
            s = s[m.end():].strip()
            if not s:
                continue
        out.append(s)
    return out


def post_generation(answer: str, allowed_doc_ids: set[str]) -> CheckedAnswer:
    if INSUFFICIENT in answer:
        return CheckedAnswer("", True, "insufficient_context")

    kept: list[str] = []
    dropped: list[str] = []
    fabricated: list[str] = []
    cited: list[str] = []
    for sentence in split_sentences(answer):
        ids = _CITATION.findall(sentence)
        bad = [i for i in ids if i not in allowed_doc_ids]
        fabricated.extend(bad)
        for b in bad:
            sentence = sentence.replace(f"[{b}]", "")
        good = [i for i in ids if i in allowed_doc_ids]
        if not good:
            dropped.append(sentence)
            continue
        kept.append(sentence.strip())
        cited.extend(good)

    if not kept:
        return CheckedAnswer("", True, "no_cited_sentences", [], dropped, fabricated)
    return CheckedAnswer("\n".join(kept), False, None, sorted(set(cited)), dropped, fabricated)
