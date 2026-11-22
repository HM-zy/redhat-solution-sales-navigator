Eval run outputs: v0 baseline retrieval, v1 and v2 retrieval-only and live-Claude runs, and the v3 retrieval run.

- `v0-baseline-retrieval.json` — 첫 구현, retrieval only (30문항, 사이트 메뉴가 제거되지 않은 460청크)
- `v1-retrieval.json`, `v1-live.json` — 사이트 메뉴 줄 제거·별칭 가중치·제품 문서 우선 적용 (30문항, 289청크, live는 Claude Opus 5.5)
- `v2-retrieval.json`, `v2-live.json` — 인용 파싱 버그·한국어 단위 별칭·청크 8개 수정 (30문항, 289청크, live는 Claude Opus 5.5)
- `v3-retrieval.json` — 가격 가드레일 과잉 차단 수정 후 회귀 확인 2문항을 더한 32문항 재측정 (292청크). 문항이 달라져 v1·v2와 1:1 비교하지 않습니다.

See the top-level README for the version table and the limits of each number.
