"""Golden-set evaluation for the Sales Navigator RAG.

  python -m evals.run_eval              # retrieval + pre-generation gates only, no API calls
  python -m evals.run_eval --live       # full pipeline against Claude (needs ANTHROPIC_API_KEY)

Metrics
  Retrieval (answerable questions):
    top1            top-ranked chunk comes from an expected document
    recall_at_5     an expected document appears in the top 5 chunks
  Gates:
    pregate_false_refusals   answerable questions blocked before the model call
  Live only:
    refusal_accuracy   questions that should be refused were refused (pricing, off-domain, not in the corpus)
    over_refusals      answerable questions that were refused
    citation_integrity answered questions where every sentence Claude wrote carried a valid citation
                       and no citation pointed at a document outside the retrieved excerpts
    cited_expected     answered questions that cite at least one expected document
    key_fact_accuracy  answered questions whose answer contains every required value (e.g. "24", "N-2")

Results are written to evals/results/<mode>-<timestamp>.json.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from dataclasses import asdict
from pathlib import Path

from rag.pipeline import DEFAULT_MODEL, answer
from rag.retrieval import BM25Index, load_chunks

HERE = Path(__file__).resolve().parent
GOLDEN = HERE / "golden.jsonl"
RESULTS = HERE / "results"


def load_golden(path: Path = GOLDEN) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def pct(n: int, d: int) -> str:
    return f"{n}/{d} ({100 * n / d:.1f}%)" if d else "n/a"


def evaluate(items: list[dict], index: BM25Index, client=None, model: str = DEFAULT_MODEL) -> dict:
    rows = []
    for item in items:
        r = answer(item["question"], index, client, model)
        retrieved_docs = [cid.split("#")[0] for cid in r.retrieved]
        expected = set(item["expected_docs"])
        row = {
            "id": item["id"],
            "kind": item["kind"],
            "question": item["question"],
            "status": r.status,
            "reason": r.reason,
            "top_score": round(r.top_score, 2),
            "retrieved_docs": retrieved_docs,
            "top1": bool(retrieved_docs) and retrieved_docs[0] in expected,
            "recall_at_5": bool(expected & set(retrieved_docs[:5])),
        }
        if client is not None:
            row.update(
                answer=r.answer,
                raw_answer=r.raw_answer,
                citations=r.citations,
                fabricated_citations=r.fabricated_citations,
                dropped_sentences=r.dropped_sentences,
                citation_clean=r.status == "answered" and not r.fabricated_citations and not r.dropped_sentences,
                cited_expected=bool(expected & set(r.citations)),
                key_facts=all(v.lower() in r.answer.lower() for v in item["must_include"]),
            )
        rows.append(row)
        print(f"{row['id']}: {row['status']:<8} {row['reason'] or '':<22} top={retrieved_docs[:1]}")
    return {"rows": rows, "summary": summarize(rows, live=client is not None)}


def summarize(rows: list[dict], live: bool) -> dict:
    ans = [r for r in rows if r["kind"] == "answer"]
    ref = [r for r in rows if r["kind"] == "refuse"]
    s = {
        "questions": len(rows),
        "answerable": len(ans),
        "should_refuse": len(ref),
        "top1": pct(sum(r["top1"] for r in ans), len(ans)),
        "recall_at_5": pct(sum(r["recall_at_5"] for r in ans), len(ans)),
    }
    if not live:
        s["pregate_false_refusals"] = pct(sum(r["status"] == "refused" for r in ans), len(ans))
        s["pregate_refusals_on_should_refuse"] = pct(sum(r["status"] == "refused" for r in ref), len(ref))
        return s
    answered = [r for r in ans if r["status"] == "answered"]
    with_facts = [r for r in answered if r["key_facts"] is not None]
    s.update(
        refusal_accuracy=pct(sum(r["status"] == "refused" for r in ref), len(ref)),
        over_refusals=pct(len(ans) - len(answered), len(ans)),
        citation_integrity=pct(sum(r["citation_clean"] for r in answered), len(answered)),
        cited_expected=pct(sum(r["cited_expected"] for r in answered), len(answered)),
        key_fact_accuracy=pct(sum(r["key_facts"] for r in with_facts), len(with_facts)),
    )
    return s


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--live", action="store_true", help="call Claude (needs ANTHROPIC_API_KEY)")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args()

    client = None
    if args.live:
        import anthropic

        client = anthropic.Anthropic()

    index = BM25Index(load_chunks())
    report = evaluate(load_golden(), index, client, args.model)
    report["meta"] = {
        "mode": "live" if args.live else "retrieval",
        "model": args.model if args.live else None,
        "chunks": len(index.chunks),
        "run_at": dt.datetime.now().isoformat(timespec="seconds"),
    }
    RESULTS.mkdir(exist_ok=True)
    out = RESULTS / f"{report['meta']['mode']}-{dt.datetime.now():%Y%m%d-%H%M%S}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print("\nSUMMARY")
    for k, v in report["summary"].items():
        print(f"  {k:<36} {v}")
    print(f"\nSaved {out.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
