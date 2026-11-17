"""Chunking and BM25 retrieval over the local corpus (no external search service)."""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from .aliases import expand
from .text import tokenize

CORPUS_DIR = Path(__file__).resolve().parent / "corpus"

CHUNK_WORDS = 160
OVERLAP_WORDS = 40
VERSION_BOOST = 1.35  # score multiplier for chunks that mention the RHEL major version asked about
PRODUCT_BOOST = 1.5  # score multiplier for chunks from a document about the product the question names
ALIAS_WEIGHT = 0.5  # alias-expansion terms count half as much as the seller's own words
SHARED_LINE_MIN_DOCS = 3

SOURCES = Path(__file__).resolve().parent / "sources.json"
# Product names a question may contain -> product tags used in sources.json.
PRODUCT_PATTERNS = {
    "satellite": r"satellite|새틀라이트|capsule|캡슐|smart management",
    "ansible": r"ansible|앤서블|aap\b",
    "openshift": r"openshift|오픈시프트",
    "virtualization": r"가상화|가상머신|가상 머신|virtualization|\bvms?\b|vmware",
    "insights": r"insights|인사이트|lightspeed",
    "support": r"severity|심각도|sla\b|응답 시간|지원 등급|24x7",
    "eus": r"\beus\b",
}


@dataclass
class Chunk:
    chunk_id: str
    doc_id: str
    title: str
    url: str
    heading: str
    text: str
    tokens: list[str] = field(default_factory=list, repr=False)


def _read_doc(path: Path) -> tuple[dict, str]:
    raw = path.read_text()
    _, header, body = raw.split("---\n", 2)
    meta = dict(line.split(": ", 1) for line in header.strip().splitlines())
    return meta, body


def _sections(body: str) -> list[tuple[str, list[str]]]:
    """Split a document into (heading path, lines) sections on markdown headings."""
    sections: list[tuple[str, list[str]]] = []
    path: list[str] = []
    lines: list[str] = []
    for line in body.splitlines():
        m = re.match(r"^(#{1,4}) (.*)", line)
        if m:
            if lines:
                sections.append((" > ".join(path), lines))
                lines = []
            level = len(m.group(1))
            path = path[: level - 1] + [m.group(2)]
        else:
            lines.append(line)
    if lines:
        sections.append((" > ".join(path), lines))
    return sections


def chunk_document(meta: dict, body: str) -> list[Chunk]:
    """Heading-aware sliding window: each section is cut into windows of CHUNK_WORDS words
    that overlap by OVERLAP_WORDS, so a fact near a window edge appears whole in one chunk."""
    chunks: list[Chunk] = []
    step = CHUNK_WORDS - OVERLAP_WORDS
    for heading, lines in _sections(body):
        words = " ".join(lines).split()
        if len(words) < 8:  # navigation stubs, empty sections
            continue
        start = 0
        while True:
            window = words[start : start + CHUNK_WORDS]
            text = " ".join(window)
            cid = f"{meta['doc_id']}#{len(chunks)}"
            context = f"{meta['title']} {heading} {text}"
            chunks.append(Chunk(cid, meta["doc_id"], meta["title"], meta["url"], heading, text, tokenize(context)))
            if start + CHUNK_WORDS >= len(words):
                break
            start += step
    return chunks


def strip_shared_lines(docs: list[tuple[dict, str]], min_docs: int = SHARED_LINE_MIN_DOCS) -> list[tuple[dict, str]]:
    """Drop non-heading lines that appear in min_docs or more documents: those are site menus,
    promo cards and link lists that every redhat.com page carries, not content of the page."""
    counts: Counter = Counter()
    for _, body in docs:
        counts.update({ln for ln in body.splitlines() if not ln.startswith("#")})
    shared = {ln for ln, n in counts.items() if n >= min_docs}
    return [(meta, "\n".join(ln for ln in body.splitlines() if ln not in shared)) for meta, body in docs]


def load_chunks(corpus_dir: Path = CORPUS_DIR) -> list[Chunk]:
    docs = [_read_doc(p) for p in sorted(corpus_dir.glob("*.md"))]
    chunks: list[Chunk] = []
    for meta, body in strip_shared_lines(docs):
        chunks.extend(chunk_document(meta, body))
    if not chunks:
        raise FileNotFoundError(f"No corpus in {corpus_dir}. Run: python -m rag.build_corpus")
    return chunks


def products_in(text: str) -> set[str]:
    return {p for p, pat in PRODUCT_PATTERNS.items() if re.search(pat, text, re.I)}


def doc_products(sources_path: Path = SOURCES) -> dict[str, set[str]]:
    return {s["doc_id"]: set(s["products"]) for s in json.loads(sources_path.read_text())}


def rhel_major_version(text: str) -> str | None:
    m = re.search(r"(?:rhel|red hat enterprise linux)\s*(\d{1,2})\b", text, re.I)
    return m.group(1) if m else None


class BM25Index:
    def __init__(self, chunks: list[Chunk], k1: float = 1.5, b: float = 0.75):
        self.chunks = chunks
        self.k1, self.b = k1, b
        self.tf = [Counter(c.tokens) for c in chunks]
        self.lengths = [len(c.tokens) for c in chunks]
        self.avg_len = sum(self.lengths) / len(self.lengths)
        df: Counter = Counter()
        for tf in self.tf:
            df.update(tf.keys())
        n = len(chunks)
        self.idf = {t: math.log(1 + (n - d + 0.5) / (d + 0.5)) for t, d in df.items()}
        try:
            self.products = doc_products()
        except FileNotFoundError:
            self.products = {}

    def score(self, query_weights: dict[str, float], i: int) -> float:
        tf, length = self.tf[i], self.lengths[i]
        s = 0.0
        for t, w in query_weights.items():
            f = tf.get(t)
            if not f:
                continue
            s += w * self.idf[t] * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * length / self.avg_len))
        return s

    @staticmethod
    def query_weights(query: str) -> dict[str, float]:
        """The seller's own words weigh 1.0; terms added by the alias map weigh ALIAS_WEIGHT."""
        expanded, _ = expand(query)
        weights = {t: ALIAS_WEIGHT for t in tokenize(expanded[len(query):])}
        weights.update({t: 1.0 for t in tokenize(query)})
        return weights

    def search(self, query: str, k: int = 5) -> list[tuple[Chunk, float]]:
        weights = self.query_weights(query)
        version = rhel_major_version(query)
        asked = products_in(query)
        scored = []
        for i, chunk in enumerate(self.chunks):
            s = self.score(weights, i)
            if s and version and re.search(rf"(?:rhel|red hat enterprise linux|version)\s*{version}\b", chunk.text, re.I):
                s *= VERSION_BOOST
            if s and asked & self.products.get(chunk.doc_id, set()):
                s *= PRODUCT_BOOST
            if s:
                scored.append((chunk, s))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:k]
