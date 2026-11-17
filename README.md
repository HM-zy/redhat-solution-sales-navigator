# Red Hat Solution Sales Navigator

고객의 RHEL 운영 환경과 과제를 체크하면 Red Hat 솔루션 후보, 추천 근거, 대화 시작 스크립트를 제안하는 인터랙티브 영업 지원 데모입니다.

## 기능

- RHEL 서버 규모 및 운영 관련 6개 질문
- 조건에 따른 Upsell / Cross-sell 솔루션 추천
- 각 추천의 근거와 한국어 대화 스크립트 표시
- 입력 초기화

## 실행

```bash
npm install
npm run dev
```

프로덕션 빌드는 `npm run build`로 생성합니다.

## 기술 스택

React, TypeScript, Vite, Tailwind CSS, lucide-react

## RAG 어시스턴트와 eval (Python)

Red Hat 공식 문서(access.redhat.com, redhat.com 14개 페이지)만 근거로 셀러 질문에 답하고, 모든 문장에 출처 `[doc_id]`를 붙이는 RAG 파이프라인입니다.

```
rag/sources.json      수집 대상 공식 문서 목록 (doc_id, URL, 제품 태그)
rag/build_corpus.py   문서를 받아 본문 텍스트로 저장 (rag/corpus/, git에는 올리지 않음)
rag/retrieval.py      제목 단위 sliding-window 청킹, 직접 구현한 BM25, RHEL 버전·제품 부스트
rag/text.py           영어 단어 + 한글 2-gram 토크나이저
rag/aliases.py        한국어 영업 용어 → 영문 제품 용어 별칭 맵
rag/guardrails.py     사전 차단(가격·범위 밖·근거 부족) / 사후 검증(인용 누락·가짜 인용·근거 부족 응답)
rag/pipeline.py       검색 → 사전 차단 → Claude 호출 → 인용 검증
evals/golden.jsonl    30문항 (답해야 할 22 + 거절해야 할 8)
evals/run_eval.py     검색 전용 / live Claude 평가
tests/test_rag.py     단위 테스트
```

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m rag.build_corpus                 # 공식 문서 수집
.venv/bin/python -m unittest discover -s tests -t .  # 단위 테스트
.venv/bin/python -m evals.run_eval                   # 검색 전용 eval (API 호출 없음)
.venv/bin/python -m evals.run_eval --live            # Claude 호출 eval (ANTHROPIC_API_KEY 필요)
.venv/bin/python -m rag.pipeline "RHEL 8 지원 종료는 언제인가요?"
```

결과는 `evals/results/`에 버전별로 저장됩니다.

| 버전 | 변경 | 파일 |
|---|---|---|
| v0 | 첫 구현 | `v0-baseline-retrieval.json` |
| v1 | 여러 페이지에 반복되는 사이트 메뉴 줄 제거, 별칭 확장어 가중치 0.5, 질문에 나온 제품의 문서 우선 | `v1-retrieval.json`, `v1-live.json` |
| v2 | live eval에서 찾은 문제 수정: 마침표 뒤에 붙은 인용을 다음 문장으로 잘못 넘기던 버그, 한국어 단위·기간 표현(개월, 주기) 별칭, Claude에게 주는 청크 5개 → 8개 | `v2-retrieval.json`, `v2-live-*.json` |

문서 단위 Top-1은 "맞는 문서"만 보므로, 답이 있는 문단이 빠져도 맞은 것으로 셉니다. v1 live에서 Claude가 "근거 부족"으로 답한 6건이 이 경우였습니다. 같은 30문항으로 반복 측정했으므로 v1 이후 수치에는 과적합 가능성이 있습니다. 문항은 Claude가 코퍼스 원문을 보고 초안을 썼고, 사용자 검토가 필요합니다.

## 범위

이 프로젝트는 세일즈 대화 흐름을 설명하기 위한 프런트엔드 PoC입니다. 실제 제품 구성, 자격 요건, 가격 및 라이선스 안내는 Red Hat 공식 자료와 담당 조직의 검토가 필요합니다.
