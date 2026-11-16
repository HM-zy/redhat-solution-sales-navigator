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

## 범위

이 프로젝트는 세일즈 대화 흐름을 설명하기 위한 프런트엔드 PoC입니다. 실제 제품 구성, 자격 요건, 가격 및 라이선스 안내는 Red Hat 공식 자료와 담당 조직의 검토가 필요합니다.
