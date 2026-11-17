"""Tokenization shared by indexing and querying.

English and numbers become lowercase word tokens (version numbers such as "9.4" stay whole).
Korean has no spaces between many compound words, so each run of Hangul is split into
character bigrams. That lets "수명주기" match "수명 주기" and partial words.
"""
from __future__ import annotations

import re

_WORD = re.compile(r"[a-z0-9]+(?:\.[0-9]+)*")
_HANGUL = re.compile(r"[가-힣]+")

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from", "how",
    "i", "in", "is", "it", "its", "of", "on", "or", "our", "that", "the", "their", "this", "to",
    "we", "what", "when", "which", "with", "you", "your", "will", "may", "if", "not", "all",
}


def korean_bigrams(text: str) -> list[str]:
    out: list[str] = []
    for run in _HANGUL.findall(text):
        if len(run) == 1:
            out.append(run)
        else:
            out.extend(run[i : i + 2] for i in range(len(run) - 1))
    return out


def tokenize(text: str) -> list[str]:
    lowered = text.lower()
    words = [w for w in _WORD.findall(lowered) if w not in STOPWORDS]
    return words + korean_bigrams(lowered)
