# Red Hat Solution Sales Navigator

고객의 RHEL 운영 환경과 과제를 체크하면 Red Hat 솔루션 후보, 추천 근거, 대화 시작 스크립트를 제안하는 인터랙티브 영업 지원 데모입니다.

관련 글: [구현기·측정 — 63.6%에서 시작해 eval로 버그를 잡기까지](https://hm-zy.github.io/posts/redhat-sales-navigator-rag-evals-build-log/)

## 기능

- RHEL 서버 규모 및 운영 관련 8개 질문 (디스커버리 8문항 → 세일즈 플레이 7종)
- 조건에 따른 Upsell / Cross-sell 솔루션 추천
- 각 추천의 근거와 한국어 대화 스크립트 표시
- Red Hat 공식문서 RAG 어시스턴트: 브라우저에서 바로 질문하고 근거 `[doc_id]`와 가드레일 거절 사유 확인
- 미팅 기록을 로컬 엑셀(`.xlsx`) 한 줄로 저장 (고객사명·미팅 날짜·메모 + 체크 결과·추천 솔루션)
- 입력 초기화

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
```

프로덕션 빌드는 `npm run build`로 생성합니다.

```bash
npm test           # vitest — 엑셀 기록 로직 단위 테스트
npm run api        # 로컬 RAG API 서버 (rag.server, 포트 8000)
npm run build:file # 서버 없이 더블클릭으로 여는 단일 HTML (dist-file/sales-navigator.html)
```

### 엑셀 저장

상단 저장 바에서 고객사명·미팅 날짜·메모를 채우고 체크리스트를 입력한 뒤 **엑셀에 저장**을 누르면, 고른 `.xlsx` 파일의 '미팅 기록' 시트 맨 아래에 한 줄이 추가됩니다. 파일은 [File System Access API](https://developer.mozilla.org/docs/Web/API/File_System_Access_API)로 직접 쓰므로 **Chrome 또는 Edge**에서만 동작하고(그 외 브라우저는 안내 문구만 표시), 서버로 고객 정보가 전송되지 않습니다. 한 번 고른 파일은 브라우저(IndexedDB)에 기억해 다음 미팅에서 그대로 이어 씁니다.

### RAG 어시스턴트까지 함께 띄우기

화면 아래 'Red Hat 공식문서 RAG 어시스턴트' 카드는 로컬 API 서버(`rag/server.py`, 포트 8000)를 `/api` 프록시로 호출합니다. 터미널 두 개로 실행합니다.

```bash
# 터미널 1 — RAG API (HTTP 서버·검색·청킹은 표준 라이브러리, 파이프라인 의존성은 anthropic)
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m rag.build_corpus      # 공식문서 최초 1회 수집
.venv/bin/python -m rag.server            # http://localhost:8000

# 터미널 2 — 웹
npm install
npm run dev                               # http://localhost:5173  (→ /api 는 8000으로 프록시)
```

답변 생성을 쓰려면 터미널 1에서 `export ANTHROPIC_API_KEY=sk-ant-...` 후 서버를 띄웁니다. 키가 없어도 검색과 가드레일 거절(가격·범위 밖)은 그대로 동작하고, 답변이 필요한 질문에만 키 설정 안내가 옵니다.

카드 우측 상단 배지가 서버·코퍼스·API 키 상태를 보여줍니다. 서버가 꺼져 있으면 무엇을 실행해야 하는지 카드 안에 표시되고, 옆의 새로고침 아이콘으로 다시 확인할 수 있습니다.

서버 없이 쓰는 단일 HTML 파일(`npm run build:file`)에는 로컬 API 서버가 없으므로 RAG 카드는 숨겨집니다.

| 엔드포인트 | 요청 | 응답 |
|---|---|---|
| `GET /api/health` | — | `{ok, corpus_ready, has_api_key, chunks, model}` |
| `POST /api/ask` | `{"question": "..."}` | `{status, reason, answer, citations, sources, retrieved, top_score}` |

`status`는 `answered`(답변) / `refused`(가드레일 거절, `reason` = `pricing`·`off_domain`·`low_evidence`·`insufficient_context`·`no_cited_sentences`) / `unavailable`(코퍼스·키 없음)입니다. `retrieved`에는 검색된 청크의 제목·URL·BM25 점수가 담깁니다.

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
rag/server.py         로컬 HTTP API (표준 라이브러리 http.server): GET /api/health, POST /api/ask
src/RagAssistant.tsx  웹의 RAG 질문 UI (예시 질문, 답변·인용·거절 배지, 검색 청크)
evals/golden.jsonl    32문항 (답해야 할 23 + 거절해야 할 9 — 블로그 정리 글의 30문항은 v1·v2 기준, v3에서 가격 회귀 확인 2문항 추가)
evals/run_eval.py     검색 전용 / live Claude 평가
tests/test_rag.py     단위 테스트
tests/test_server.py  로컬 API 테스트 (인덱스·모델·키 상태를 주입, 네트워크 없음)
```

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m rag.build_corpus                 # 공식 문서 수집
.venv/bin/python -m unittest discover -s tests -t .  # 단위 테스트
.venv/bin/python -m evals.run_eval                   # 검색 전용 eval (API 호출 없음)
.venv/bin/python -m evals.run_eval --live            # Claude 호출 eval (ANTHROPIC_API_KEY 필요)
.venv/bin/python -m rag.pipeline "RHEL 8 지원 종료는 언제인가요?"
```

새로 실행한 결과는 `evals/results/<mode>-<시각>.json`으로 저장되고, 아래 파일은 버전별 결과를 이름 붙여 보관한 것입니다.

| 버전 | 변경 | 파일 |
|---|---|---|
| v0 | 첫 구현 | `v0-baseline-retrieval.json` |
| v1 | 여러 페이지에 반복되는 사이트 메뉴 줄 제거, 별칭 확장어 가중치 0.5, 질문에 나온 제품의 문서 우선 | `v1-retrieval.json`, `v1-live.json` |
| v2 | live eval에서 찾은 문제 수정: 마침표 뒤에 붙은 인용을 다음 문장으로 잘못 넘기던 버그, 한국어 단위·기간 표현(개월, 주기) 별칭, Claude에게 주는 청크 5개 → 8개 | `v2-retrieval.json`, `v2-live.json` |
| v3 | 가격 가드레일 정교화: "비용" 한 단어만으로 기술·영업 맥락("VMware 비용 때문에", "비용 절감")까지 거절하던 과잉 차단 수정, 실제 가격·견적·금액 요청은 그대로 차단. 회귀 확인용 2문항 추가 | `v3-retrieval.json` |

문서 단위 Top-1은 "맞는 문서"만 보므로, 답이 있는 문단이 빠져도 맞은 것으로 셉니다. v1 live에서 Claude가 "근거 부족"으로 답한 6건이 이 경우였습니다. v1~v2는 같은 30문항으로 반복 측정했으므로 그 수치에는 과적합 가능성이 있습니다. v3에서 가격 가드레일 회귀 확인용 2문항(q23 비용 맥락, r09 라이선스 금액)을 더해 32문항이 되었고, v3 결과는 이전 버전과 1:1 비교하지 않습니다. 문항은 Claude가 코퍼스 원문을 보고 초안을 썼고, 사람이 직접 검토해야 합니다. `build_corpus`는 실행 시점의 공식 페이지를 내려받으므로, 원문이 개정되면 청크 수와 수치가 조금 달라질 수 있습니다.

## 범위

이 프로젝트는 세일즈 대화 흐름을 설명하기 위한 프런트엔드 PoC입니다. 실제 제품 구성, 자격 요건, 가격 및 라이선스 안내는 Red Hat 공식 자료와 담당 조직의 검토가 필요합니다.
