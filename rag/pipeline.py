"""Retrieve -> gate -> ask Claude -> check citations.

Usage:  python -m rag.pipeline "RHEL 8 지원 종료는 언제인가요?"
Needs ANTHROPIC_API_KEY (or another credential the Anthropic SDK can find).
"""
from __future__ import annotations

import sys
from dataclasses import asdict, dataclass, field

from .guardrails import INSUFFICIENT, post_generation, pre_generation
from .retrieval import BM25Index, Chunk, load_chunks

DEFAULT_MODEL = "claude-opus-5-5"
TOP_K = 8  # chunks given to Claude; retrieval metrics are still reported at 5

SYSTEM_PROMPT = f"""You help Red Hat sellers in Korea answer customer questions about Red Hat products.
You receive excerpts from official Red Hat documents. Answer only from those excerpts.

Rules:
- Answer in Korean. Keep product names, version numbers and dates as written in the excerpts.
- End every sentence with the id of the document that supports it, in square brackets, e.g. [rhel-lifecycle].
  Use only ids that appear in the excerpts. A sentence you cannot support with an excerpt must not be written.
- Do not state prices, discounts or anything about a specific customer's contract.
- If the excerpts do not contain the answer, reply with exactly {INSUFFICIENT} and nothing else.
- Be brief: at most five sentences."""


@dataclass
class Result:
    query: str
    status: str  # "answered" | "refused"
    reason: str | None
    answer: str
    citations: list[str]
    retrieved: list[str]
    top_score: float
    fabricated_citations: list[str] = field(default_factory=list)
    dropped_sentences: list[str] = field(default_factory=list)
    raw_answer: str = ""


def format_excerpts(hits: list[tuple[Chunk, float]]) -> str:
    return "\n\n".join(
        f'<excerpt doc_id="{c.doc_id}" title="{c.title}" section="{c.heading}">\n{c.text}\n</excerpt>' for c, _ in hits
    )


def call_claude(client, model: str, query: str, hits: list[tuple[Chunk, float]]) -> str:
    response = client.messages.create(
        model=model,
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"{format_excerpts(hits)}\n\nQuestion: {query}"}],
        # Server-side fallback: if a safety classifier declines the request, the API retries on a fallback model.
        extra_headers={"anthropic-beta": "server-side-fallback-2026-07-01"},
        extra_body={"fallbacks": "default"},
    )
    if response.stop_reason == "refusal":
        return INSUFFICIENT
    return "".join(block.text for block in response.content if block.type == "text")


def answer(query: str, index: BM25Index, client=None, model: str = DEFAULT_MODEL) -> Result:
    hits = index.search(query, TOP_K)
    top_score = hits[0][1] if hits else 0.0
    retrieved = [c.chunk_id for c, _ in hits]
    gate = pre_generation(query, top_score)
    if not gate.allowed:
        return Result(query, "refused", gate.reason, "", [], retrieved, top_score)
    if client is None:  # retrieval-only mode: gates passed, no model call
        return Result(query, "answered", None, "", [], retrieved, top_score)

    raw = call_claude(client, model, query, hits)
    checked = post_generation(raw, {c.doc_id for c, _ in hits})
    return Result(
        query,
        "refused" if checked.refused else "answered",
        checked.reason,
        checked.text,
        checked.citations,
        retrieved,
        top_score,
        checked.fabricated_citations,
        checked.dropped_sentences,
        raw,
    )


def main() -> None:
    import anthropic

    query = " ".join(sys.argv[1:]) or "RHEL 8 지원 종료는 언제인가요?"
    result = answer(query, BM25Index(load_chunks()), anthropic.Anthropic())
    for k, v in asdict(result).items():
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()
