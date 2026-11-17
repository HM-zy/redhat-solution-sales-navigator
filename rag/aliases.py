"""Sales-vocabulary alias map.

Sellers ask in Korean field language ("지원 종료", "패치 관리"); the official documents are
in English product language ("life cycle", "errata", "Satellite"). Each entry maps the
phrases a seller uses to English terms that appear in the corpus. Matching phrases add the
expansion terms to the BM25 query, so a Korean question can still hit English passages.
"""
from __future__ import annotations

import re

ALIASES: list[tuple[tuple[str, ...], str]] = [
    (("수명주기", "수명 주기", "라이프사이클", "지원 기간", "지원기간", "지원 종료", "지원종료", "단종", "eol", "언제까지"),
     "life cycle support phase end of maintenance retirement dates"),
    (("확장 지원", "연장 지원", "els", "elcp", "eus", "마이너 버전 고정", "마이너 릴리스"),
     "extended life cycle premium elcp extended update support eus els long-life add-on minor release"),
    (("패치", "보안 업데이트", "errata", "에라타"), "errata security updates patch"),
    (("업그레이드", "인플레이스", "in-place", "이전", "마이그레이션", "leapp"),
     "in-place upgrade upgrade path leapp migration"),
    (("자동화", "플레이북", "앤서블", "ansible"), "ansible automation platform playbooks automation"),
    (("가상화", "가상머신", "가상 머신", "vm", "vmware", "브이엠웨어", "하이퍼바이저"),
     "openshift virtualization virtual machines vms migrate vmware hypervisor"),
    (("컨테이너", "쿠버네티스", "kubernetes", "오픈시프트", "openshift"), "openshift kubernetes container platform"),
    (("취약점", "cve", "보안 점검", "위험 분석", "인사이트", "insights"), "insights vulnerability cve risk advisor"),
    (("구독 관리", "콘텐츠 관리", "패치 관리", "프로비저닝", "새틀라이트", "satellite", "스마트 매니지먼트", "smart management"),
     "satellite smart management content management patch provisioning subscriptions"),
    (("컴플라이언스", "감사", "규정 준수", "보안 기준"), "compliance openscap security policy audit"),
    (("장애 대응", "지원 등급", "sla", "응답 시간", "severity", "심각도"), "support severity response time sla production support"),
    (("최대", "한계", "제한", "지원 가능한 메모리", "cpu 수"), "limits maximum supported memory cpu capabilities"),
    # Units and time words: Korean questions say "몇 개월/몇 년/주기", the documents say "months/years/cadence".
    (("개월",), "months month"),
    (("몇 년", "년간", "년 동안"), "years year ten-year"),
    (("주기", "얼마나 자주", "릴리스 일정"), "cadence release schedule every"),
    (("동시에", "몇 개 버전", "이전 버전"), "concurrently supported previous versions policy"),
]


def _matches(phrase: str, q: str) -> bool:
    # English abbreviations ("els", "sla", "vm") must match whole words, or "levels" would hit "els".
    if phrase.isascii():
        return re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", q) is not None
    return phrase in q


def expand(query: str) -> tuple[str, list[str]]:
    """Return the query with alias expansions appended, and the list of alias groups that fired."""
    q = query.lower()
    hits: list[str] = []
    extra: list[str] = []
    for phrases, expansion in ALIASES:
        if any(_matches(p, q) for p in phrases):
            hits.append(phrases[0])
            extra.append(expansion)
    return (query + " " + " ".join(extra)).strip(), hits
