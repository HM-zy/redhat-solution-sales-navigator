// 헬스체크 페이지: 고객 RHEL 환경을 점검하면서 Upselling / Cross-selling 기회를 찾는다.
import { useMemo, useState } from 'react';
import { Boxes, Cloud, History, Package, Repeat, Server, ShieldCheck, Sparkles } from 'lucide-react';
import {
  ChoiceQuestion,
  MultiSelectQuestion,
  QuestionList,
  labelOf,
  multiSelectText,
  type ChecklistPage,
  type FitScore,
  type Option,
  type Recommendation
} from './ui';

type Scale = '' | '<5' | '5-20' | '20+';
type Version = '' | 'v7' | 'v8' | 'v9' | 'none';
type Automation = '' | 'manual' | 'community' | 'provision' | 'done';
// RHEL을 안 쓰는 고객(Net-new)은 지금 쓰는 OS로 신규 도입 여지를 본다
type CurrentOs = '' | 'rhel-like' | 'other-linux' | 'windows';
type Container = '' | 'none' | 'plan' | 'self';
// 예/아니오 대신 3단계로 물어 정도·시급성을 구분한다
type Patch = '' | 'none' | 'some' | 'heavy';
type Virt = '' | 'no' | 'review' | 'plan';
type OwnKey = 'satellite' | 'aap' | 'openshift' | 'premium';

export const HEALTH_SHEET = '헬스체크';
export const HEALTH_COLUMNS = [
  'RHEL 서버 규모',
  '가장 오래된 RHEL 버전',
  '보유 Red Hat 제품',
  '패치·보안 수작업 부담',
  '반복 작업 처리 방식',
  '컨테이너/K8s 현황',
  '상용 가상화 대안 검토'
] as const;
// 시트에는 질문 열 뒤에 Technical Fit 점수와 등급을 함께 남긴다
export const FIT_SCORE_COLUMN = 'Technical Fit 점수';
export const FIT_GRADE_COLUMN = 'Fit 등급';
export const CURRENT_OS_COLUMN = '현재 OS (RHEL 미사용)';
export const HEALTH_SAVE_COLUMNS = [...HEALTH_COLUMNS, CURRENT_OS_COLUMN, FIT_SCORE_COLUMN, FIT_GRADE_COLUMN] as const;

const SCALE_OPTIONS: Option<Exclude<Scale, ''>>[] = [
  { value: '<5', label: '5대 미만' },
  { value: '5-20', label: '5 ~ 20대' },
  { value: '20+', label: '20대 이상' }
];
const VERSION_OPTIONS: Option<Exclude<Version, ''>>[] = [
  { value: 'v7', label: 'RHEL 7 이하' },
  { value: 'v8', label: 'RHEL 8' },
  { value: 'v9', label: 'RHEL 9 이상' },
  { value: 'none', label: '없음' }
];
const AUTOMATION_OPTIONS: Option<Exclude<Automation, ''>>[] = [
  { value: 'manual', label: '수작업·자체 스크립트' },
  { value: 'community', label: '커뮤니티 Ansible' },
  { value: 'provision', label: '서버 생성만 자동화' },
  { value: 'done', label: '서버 안쪽까지 자동화 (AAP 등)' }
];
const CONTAINER_OPTIONS: Option<Exclude<Container, ''>>[] = [
  { value: 'none', label: '사용·계획 없음' },
  { value: 'plan', label: '이전 계획 있음' },
  { value: 'self', label: '자체·타사 K8s 운영 중' }
];
const OS_OPTIONS: Option<Exclude<CurrentOs, ''>>[] = [
  { value: 'rhel-like', label: 'CentOS · Rocky · Alma 등' },
  { value: 'other-linux', label: 'Ubuntu · SUSE 등 다른 리눅스' },
  { value: 'windows', label: '주로 Windows · 리눅스 거의 없음' }
];
const OWN_OPTIONS: { key: OwnKey; label: string }[] = [
  { key: 'satellite', label: 'Satellite / Smart Management' },
  { key: 'aap', label: 'Ansible Automation Platform' },
  { key: 'openshift', label: 'OpenShift' },
  { key: 'premium', label: 'Premium 지원 등급' }
];
const NO_OWNS: Record<OwnKey, boolean> = { satellite: false, aap: false, openshift: false, premium: false };

export interface HealthAnswers {
  scale: Scale;
  version: Version;
  currentOs?: CurrentOs; // version이 'none'일 때만 묻는다
  owns: Record<OwnKey, boolean>;
  patch: Patch;
  automation: Automation;
  container: Container;
  virt: Virt;
}

/**
 * Technical Fit 점수 (100점 만점): 고객 환경에 Red Hat 제품이 들어갈 기술적 여지가 얼마나 큰지.
 *
 * 1) 신호 점수: RHEL 노후도 25 + 운영 수작업 부담 30 (패치 12 + 자동화 18) + 컨테이너 전환 25 + 가상화 대안 20.
 *    답한 항목만으로 100점 환산한다 (미팅 중간에도 등급이 의미 있게).
 * 2) 규모 배율: 서버 수는 기회의 크기라서 더하지 않고 곱한다. 5대 미만 ×0.6 → 최대 60점(Medium).
 * 3) 보유 제품은 점수에 넣지 않는다. 보유해도 수작업이 남아 있으면 그게 확장 기회이고, 답변이 이미 그 현실을 보여 준다.
 *    보유 제품은 추천 목록에서 중복 제안을 빼는 데만 쓴다.
 * 4) 6개 질문 중 5개 이상 답해야 등급을 확정한다. 그 전에는 '잠정'.
 */
export const SCALE_MULTIPLIER: Record<Exclude<Scale, ''>, number> = { '<5': 0.6, '5-20': 0.85, '20+': 1 };
export const CONFIRM_MIN_ANSWERS = 5;

export function scoreHealth(a: HealthAnswers): FitScore {
  const pick = <T extends string>(v: T, table: Partial<Record<T, number>>) => table[v] ?? 0;
  const patchAnswered = a.patch !== '';
  const autoAnswered = a.automation !== '';
  const items: FitScore['items'] = [
    a.version === 'none'
      ? {
          // Net-new: RHEL이 없으면 '신규 도입 여지'로 같은 25점을 본다. RHEL 계열 무상 OS는 전환이 가장 쉽다.
          label: 'RHEL 신규 도입 (Net-new)',
          max: 25,
          answered: !!a.currentOs,
          points: pick(a.currentOs ?? '', { 'rhel-like': 25, 'other-linux': 18, windows: 6 }),
          note: a.currentOs ? undefined : '현재 OS 미응답'
        }
      : {
          label: 'RHEL 버전 노후도',
          max: 25,
          answered: a.version !== '',
          points: pick(a.version, { v7: 25, v8: 15, v9: 5 })
        },
    {
      label: '운영 수작업 부담',
      // 패치(12)와 자동화(18)는 같은 '손으로 운영' 신호라 한 항목으로 묶는다. 답한 쪽만 만점에 넣는다.
      max: (patchAnswered ? 12 : 0) + (autoAnswered ? 18 : 0) || 30,
      answered: patchAnswered || autoAnswered,
      points: pick(a.patch, { some: 3, heavy: 12 }) + pick(a.automation, { manual: 18, community: 13, provision: 10, done: 2 }),
      note: patchAnswered !== autoAnswered ? '패치·자동화 중 일부만 응답' : undefined
    },
    {
      label: '컨테이너 전환',
      max: 25,
      answered: a.container !== '',
      points: pick(a.container, { self: 25, plan: 18, none: 0 })
    },
    {
      label: '가상화 대안 검토',
      max: 20,
      answered: a.virt !== '',
      points: pick(a.virt, { review: 10, plan: 20 })
    }
  ];
  const got = items.filter((i) => i.answered);
  const earned = got.reduce((sum, i) => sum + i.points, 0);
  const possible = got.reduce((sum, i) => sum + i.max, 0);
  const signal = possible ? (earned / possible) * 100 : 0;
  const multiplier = a.scale === '' ? 1 : SCALE_MULTIPLIER[a.scale];
  const total = Math.round(signal * multiplier);

  const versionAnswered = a.version !== '' && (a.version !== 'none' || !!a.currentOs);
  const questions = [a.scale !== '', versionAnswered, patchAnswered, autoAnswered, a.container !== '', a.virt !== ''];
  const answered = questions.filter(Boolean).length;
  const grade: FitScore['grade'] = total >= 70 ? 'High' : total >= 40 ? 'Medium' : 'Low';
  return {
    total,
    grade,
    items,
    multiplier,
    scaleAnswered: a.scale !== '',
    answered,
    of: questions.length,
    provisional: answered < CONFIRM_MIN_ANSWERS,
    complete: answered === questions.length
  };
}

export const gradeText = (s: FitScore) =>
  (s.grade === 'High' ? 'High (우선 공략)' : s.grade === 'Medium' ? 'Medium (육성)' : 'Low (관망)') +
  (s.provisional ? ` · 잠정 (응답 ${s.answered}/${s.of})` : '');

const PATCH_OPTIONS: Option<Exclude<Patch, ''>>[] = [
  { value: 'none', label: '거의 없음' },
  { value: 'some', label: '일부 있음' },
  { value: 'heavy', label: '크다 (감사 지적·장애 경험)' }
];
const VIRT_OPTIONS: Option<Exclude<Virt, ''>>[] = [
  { value: 'no', label: '검토 안 함' },
  { value: 'review', label: '검토 중' },
  { value: 'plan', label: '1년 내 전환 예정' }
];

/** 헬스체크 답변 → 추천 목록 (화면과 테스트가 같이 쓰는 순수 함수) */
export function recommendHealth({ scale, version, currentOs = '', owns, patch, automation, container, virt }: HealthAnswers): Recommendation[] {
  const recs: Recommendation[] = [];
  const scaleText = scale === '20+' ? '20대 이상' : scale === '5-20' ? '5~20대' : scale === '<5' ? '5대 미만' : '';
  const notSmall = scale !== '<5'; // 규모 미응답은 소규모로 단정하지 않음
  const noRhel = version === 'none';
  const netNew = noRhel && !Object.values(owns).some(Boolean);
  const serverWord = noRhel ? '리눅스' : 'RHEL';
  const patchBurden = patch === 'some' || patch === 'heavy';
  const patchHeavy = patch === 'heavy';
  // '크다'는 고객이 감사 지적이나 패치 누락 장애를 이미 겪은 상태라, 그 경험을 짚고 우선순위를 높여 제안한다
  const patchReason = patchHeavy ? '패치·보안 수작업 부담 큼 (감사 지적·장애 경험)' : '패치·보안 감사 대응에 수작업 부담 (일부)';

  // 0. RHEL 미사용 고객 → RHEL 신규 도입 (Net-new)
  if (version === 'none' && (currentOs === 'rhel-like' || currentOs === 'other-linux')) {
    const reasons = [currentOs === 'rhel-like' ? 'CentOS·Rocky 등 RHEL 계열 무상 OS 사용' : '다른 리눅스 사용 (RHEL 미사용)'];
    if (scaleText) reasons.push(`리눅스 ${scaleText} 운영`);
    // RHEL이 없으면 Smart Management를 따로 '더하는' 제안이 성립하지 않으므로, 패치 부담은 RHEL 도입 제안에 묶는다
    if (patchBurden) reasons.push(patchReason + ' → Smart Management 묶음');
    // 서버 설정·패치를 손으로 하는 고객도 Satellite(구성·패치 일괄 관리)가 바로 효과를 내는 대상이라 같이 묶는다
    const manualOps = automation === 'manual' || automation === 'provision';
    if (manualOps) reasons.push('서버 설정·패치를 수작업으로 운영 → Satellite로 일괄 관리');
    const smBundle = patchBurden || manualOps;
    const base =
      currentOs === 'rhel-like'
        ? 'CentOS 계열로 운영 중이신데, CentOS 7 지원이 끝난 뒤 보안 패치와 장애 지원은 어떻게 받고 계신가요? 같은 계열이라 RHEL로는 재설치 없이 전환하는 방법도 있는데, 지금 서버 기준으로 전환 범위를 같이 그려 봐도 될까요?'
        : '지금 리눅스는 어떤 기준으로 고르셨고, 장애가 나면 지원은 어디서 받고 계신가요? 업무 시스템 중 벤더 인증이나 장기 지원이 중요한 서버부터 RHEL로 표준화하는 고객이 많은데, 대상 서버를 같이 골라 봐도 될까요?';
    recs.push({
      // CentOS 계열과 다른 리눅스는 전환 방식과 설득 포인트가 달라 1분 설명 자료를 따로 둔다
      id: currentOs === 'rhel-like' ? 'rec-netnew-rhel' : 'rec-netnew-other',
      type: 'Net-new',
      solution: smBundle ? 'RHEL 신규 도입 + Smart Management (Satellite)' : 'RHEL 신규 도입 (기존 리눅스 전환)',
      reasons,
      script: patchHeavy
        ? base + ' 특히 감사 지적이나 패치 누락으로 장애를 겪으셨다고 하셨는데, 같은 일이 반복되지 않도록 RHEL 전환 1단계에 Smart Management를 함께 넣어 패치 적용과 증빙부터 자동화하는 구성을 우선 제안드리고 싶습니다.'
        : patchBurden
          ? base + ' 패치·감사 대응이 부담이시라면 RHEL에 Smart Management를 함께 구성해 패치 적용과 증빙을 한 곳에서 관리하는 방식으로 같이 보여 드리겠습니다.'
          : manualOps
            ? base + ' 서버 설정과 패치를 지금 손으로 하고 계시다고 하셨는데, RHEL에 Smart Management(Satellite)를 함께 구성하면 전체 서버에 같은 설정과 패치를 한 번에 적용하고 이력까지 남길 수 있습니다. 전환하면서 운영 방식까지 같이 정리하는 그림으로 보여 드려도 될까요?'
            : base
    });
  }

  // 1. RHEL 7 이하 → ELS 애드온 (Upselling)
  if (version === 'v7') {
    const reasons = ['RHEL 7 이하 운영 (유지보수 종료)'];
    if (scaleText) reasons.push(`${serverWord} ${scaleText} 운영`);
    recs.push({
      id: 'rec-els',
      type: 'Upselling',
      solution: 'RHEL Extended Life Cycle Support (ELS) 애드온',
      reasons,
      script:
        '아직 RHEL 7을 운영 중이신 걸로 이해했는데, 보안 패치를 계속 받으면서 RHEL 9이나 10으로 옮기는 일정은 어떻게 잡고 계신가요? 이전이 끝날 때까지는 ELS 애드온으로 지원을 이어가실 수 있는데, 7.9 기준으로 맞춰야 하는 조건과 이전 일정까지 같이 정리해 드려도 될까요?'
    });
  }

  // 2. 패치·보안 수작업 부담 (RHEL이 있는 고객만. RHEL이 없으면 위 신규 도입 제안에 묶었다)
  if (patchBurden && !owns.satellite && !noRhel) {
    const reasons = [patchReason, 'Satellite 미보유'];
    if (scaleText) reasons.push(`${serverWord} ${scaleText} 운영`);
    recs.push({
      id: 'rec-smart-mgmt',
      type: 'Upselling',
      solution: 'RHEL Smart Management (Satellite)',
      reasons,
      script: patchHeavy
        ? '감사 지적이나 패치 누락으로 장애를 겪으셨다고 하셨는데, 당시 원인이 어떤 서버의 어떤 패치였는지 바로 확인이 되셨나요? 현재 RHEL 구독에 Smart Management를 더하면 전체 서버의 패치 대상과 적용 이력이 한 화면에 남아서, 다음 감사 전에 누락 서버를 먼저 찾아 막을 수 있습니다. 다음 감사 일정 전에 현재 서버 기준으로 점검 데모를 잡아 보면 어떨까요?'
        :
        '보안 감사 때 서버별 패치 이력이나 취약점 현황을 확인하는 데 시간이 많이 들지 않으신가요? 현재 RHEL 구독에 Smart Management를 더하면 패치 대상을 확인하고 전체 서버에 일관되게 적용·증빙하는 흐름을 한 곳에서 관리하실 수 있습니다. 지금 방식과 비교해서 짧게 안내해 드려도 될까요?'
    });
  }
  if (patchBurden && owns.satellite) {
    recs.push({
      id: 'rec-satellite-expand',
      type: 'Upselling',
      solution: 'Satellite 컴플라이언스 / Insights 활용 확대',
      reasons: ['Satellite 보유', patchHeavy ? '감사 지적·장애 경험 (수작업 부담 큼)' : '감사 대응에 수작업 부담 잔존'],
      script: patchHeavy
        ? '이미 Satellite를 쓰고 계신데도 감사 지적이나 패치 누락 장애가 있었다면, 패치 적용은 되는데 정책 점검과 취약점 분석까지는 연결이 안 된 경우가 많습니다. 지적받은 항목을 기준으로 컴플라이언스 점검과 Insights 분석을 어디까지 자동화할 수 있는지 먼저 같이 확인해 볼까요?'
        :
        '이미 Satellite를 쓰고 계신데도 감사 대응에 수작업이 남아 있다면, 컴플라이언스 정책 점검이나 Insights 취약점 분석을 어디까지 연결해 쓰고 계신지 궁금합니다. 정책 점검이 안 되는 서버 범위가 있는지 같이 살펴볼까요?'
    });
  }

  // 3. Ansible Automation Platform — Cross-selling (미보유 고객만)
  const aapByWork = !owns.aap && notSmall && (automation === 'manual' || automation === 'community' || automation === 'provision');
  const aapByUpgrade = !owns.aap && notSmall && version === 'v8';
  if (aapByWork || aapByUpgrade) {
    const reasons: string[] = [];
    if (automation === 'manual') reasons.push('반복 작업을 수작업/자체 스크립트로 처리');
    if (automation === 'community') reasons.push('커뮤니티 Ansible 사용 (지원·거버넌스 필요)');
    if (automation === 'provision') reasons.push('서버 생성만 자동화 (OS 설정·패치 자동화 여지)');
    if (aapByUpgrade) reasons.push('RHEL 8 → 9/10 업그레이드 대상');
    if (scaleText) reasons.push(`${serverWord} ${scaleText} 운영`);

    let script: string;
    if (automation === 'provision') {
      script =
        '서버는 코드로 만들고 계신 걸로 이해했는데, 서버가 만들어진 뒤 OS 패치나 설정 변경, 보안 설정 점검은 어떻게 처리하고 계신가요? 서버 생성 단계의 자동화를 이어서 OS 안쪽까지 Ansible로 표준화하는 방식이 있는데, 사례를 짧게 안내해 드려도 될까요?';
    } else if (automation === 'community') {
      script =
        '이미 Ansible을 활용하고 계시네요. 지금 플레이북은 팀별로 관리되고 있나요? 실행 이력이나 권한 관리, 기술 지원이 필요해지는 시점에 Ansible Automation Platform으로 이어서 쓰는 방식이 있는데, 어떤 차이가 있는지 짧게 안내해 드려도 될까요?';
    } else if (aapByUpgrade && aapByWork) {
      script =
        'RHEL 8 서버를 9이나 10으로 옮기실 때, 점검과 업그레이드 작업도 서버마다 직접 하실 예정인가요? 평소 반복 작업과 함께 Ansible로 표준 절차를 만들어 두면 업그레이드 때도 그대로 재사용할 수 있는데, 사례를 짧게 소개해 드려도 될까요?';
    } else if (aapByUpgrade) {
      script =
        'RHEL 8은 아직 지원 기간이 남아 있지만, 9이나 10으로 이전하는 계획은 세워 두셨나요? 서버가 많을수록 사전 점검과 업그레이드 작업이 부담인데, Ansible로 이 과정을 자동화하는 방식을 간단히 소개해 드려도 될까요?';
    } else {
      script =
        '서버 설정 변경이나 배포 같은 작업이 어느 정도 반복되는지 궁금합니다. 자주 하는 작업 한두 가지만 Ansible로 표준화해도 운영 시간이 꽤 줄어드는데, 적용 사례를 간단히 소개해 드려도 될까요?';
    }
    recs.push({ id: 'rec-aap', type: 'Cross-selling', solution: 'Ansible Automation Platform', reasons, script });
  }

  // 4. OpenShift — Cross-selling (미보유 고객만)
  if (!owns.openshift && (container === 'plan' || container === 'self')) {
    recs.push({
      id: 'rec-openshift',
      type: 'Cross-selling',
      solution: 'Red Hat OpenShift',
      reasons: [container === 'self' ? '자체·타사 쿠버네티스 운영 중' : '클라우드/컨테이너 이전 계획'],
      script:
        container === 'self'
          ? '쿠버네티스를 직접 운영하고 계신데, 버전 업그레이드나 보안 패치, 장애 대응은 팀에서 어디까지 부담하고 계신가요? 클러스터가 늘수록 운영 표준화가 중요해지는데, OpenShift로 지원과 운영 방식을 정리하는 사례를 간단히 소개해 드려도 될까요?'
          : '이전을 계획 중이시라면 어떤 환경으로 옮기실지, 그리고 이전 후 개발·운영 환경을 어떻게 표준화할지도 함께 고민하고 계실 것 같습니다. OpenShift로 온프레미스와 클라우드를 같은 방식으로 운영하는 구성을 간단히 소개해 드려도 될까요?'
    });
  }

  // 5. OpenShift Virtualization — Cross-selling
  if (virt === 'review' || virt === 'plan') {
    const reasons = [virt === 'plan' ? '상용 가상화 1년 내 전환 예정' : '상용 가상화 비용·라이선스 이슈로 대안 검토'];
    if (container === 'plan' || container === 'self') reasons.push('컨테이너 환경과 함께 검토 가능');
    recs.push({
      id: 'rec-openshift-virt',
      type: 'Cross-selling',
      solution: 'OpenShift Virtualization',
      reasons,
      script:
        '가상화 비용 때문에 대안을 찾고 계신 걸로 이해했는데, 기존 VM을 그대로 옮길 수 있는지, 이전 비용이 어느 정도일지가 가장 궁금하실 것 같습니다. VM과 컨테이너를 한 플랫폼에서 운영하는 방식으로 접근하면 어떨지 같이 살펴볼까요?'
    });
  }

  return netNew ? recs.map((r) => ({ ...r, type: 'Net-new' as const })) : recs;
}

export function useHealthCheck(): ChecklistPage {
  const [scale, setScale] = useState<Scale>('');
  const [version, setVersion] = useState<Version>('');
  const [currentOs, setCurrentOs] = useState<CurrentOs>('');
  const [owns, setOwns] = useState<Record<OwnKey, boolean>>(NO_OWNS);
  const [ownsTouched, setOwnsTouched] = useState(false);
  const [patch, setPatch] = useState<Patch>('');
  const [automation, setAutomation] = useState<Automation>('');
  const [container, setContainer] = useState<Container>('');
  const [virt, setVirt] = useState<Virt>('');

  const answeredCount = [scale !== '', version !== '', ownsTouched, patch !== '', automation !== '', container !== '', virt !== ''].filter(
    Boolean
  ).length;

  // Upselling = 기존 RHEL 구독/보유 제품 기반 확장 (ELS, Smart Management, 활용 확대)
  // Cross-selling = 이미 Red Hat 고객에게 보유하지 않은 다른 제품군 제안 (Ansible, OpenShift, OpenShift Virtualization)
  // Net-new = RHEL도 다른 Red Hat 제품도 없는 고객. 이 고객에게 나가는 추천은 모두 신규 고객 발굴이라 전부 Net-new로 분류한다.
  // 이미 보유한 제품은 신규 추천에서 제외한다.
  const recommendations = useMemo(
    () => recommendHealth({ scale, version, currentOs, owns, patch, automation, container, virt }),
    [scale, version, currentOs, owns, patch, automation, container, virt]
  );

  const score = useMemo(
    () => scoreHealth({ scale, version, currentOs, owns, patch, automation, container, virt }),
    [scale, version, currentOs, owns, patch, automation, container, virt]
  );

  const form = (
    <QuestionList>
      {[
        <ChoiceQuestion<Exclude<Scale, ''>>
          icon={<Server className="w-4 h-4 text-blue-500" />}
          label="리눅스 서버 운영 규모"
          hint="RHEL이 없으면 CentOS·Rocky·Ubuntu 등 지금 쓰는 리눅스 서버 수 기준"
          value={scale}
          onChange={setScale}
          options={SCALE_OPTIONS}
        />,
        <div className="space-y-4">
          <ChoiceQuestion<Exclude<Version, ''>>
            icon={<History className="w-4 h-4 text-purple-500" />}
            label="가장 오래된 RHEL 서버의 메이저 버전은 무엇인가요?"
            hint="RHEL 기준이에요. CentOS·Rocky 등만 쓰거나 RHEL이 아예 없으면 '없음'을 고르고 아래에서 지금 쓰는 OS를 골라 주세요."
            value={version}
            onChange={setVersion}
            options={VERSION_OPTIONS}
          />
          {version === 'none' && (
            <div className="ml-6 pl-4 border-l-2 border-purple-200">
              <ChoiceQuestion<Exclude<CurrentOs, ''>>
                icon={<Sparkles className="w-4 h-4 text-pink-500" />}
                label="Net-new: 지금 주로 쓰는 서버 OS는 무엇인가요?"
                hint="RHEL 신규 도입 가능성을 봐요. CentOS 계열은 같은 계열이라 전환이 가장 쉬워요."
                value={currentOs}
                onChange={setCurrentOs}
                options={OS_OPTIONS}
              />
            </div>
          )}
        </div>,
        <MultiSelectQuestion<OwnKey>
          icon={<Package className="w-4 h-4 text-slate-500" />}
          label="이미 사용 중인 Red Hat 제품을 모두 선택해 주세요."
          hint="보유 제품은 신규 추천에서 제외돼요. 해당 없으면 '없음'을 눌러 주세요."
          options={OWN_OPTIONS}
          selected={owns}
          touched={ownsTouched}
          onToggle={(k) => {
            // 마지막 선택을 해제하면 '없음'이 아니라 미응답으로 돌아간다
            const next = { ...owns, [k]: !owns[k] };
            setOwns(next);
            setOwnsTouched(Object.values(next).some(Boolean));
          }}
          onNone={(on) => {
            setOwns(NO_OWNS);
            setOwnsTouched(on);
          }}
        />,
        <ChoiceQuestion<Exclude<Patch, ''>>
          icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}
          label="패치 관리나 보안 감사(ISMS 등) 대응에 수작업 부담이 얼마나 되나요?"
          hint="서버별 직접 패치, 담당자별 스크립트, 취약점·패치 이력 증빙 작업 포함. 감사 지적이나 패치 누락으로 인한 장애가 있었다면 '크다'"
          value={patch}
          onChange={setPatch}
          options={PATCH_OPTIONS}
        />,
        <ChoiceQuestion<Exclude<Automation, ''>>
          icon={<Repeat className="w-4 h-4 text-red-500" />}
          label="서버 설정·배포 같은 반복 작업은 어떻게 처리하고 있나요?"
          hint="'서버 생성만 자동화'는 Terraform, CloudFormation 등으로 서버·네트워크만 만들고, 서버 안쪽(패치·설정)은 별도로 관리하는 경우예요"
          value={automation}
          onChange={setAutomation}
          options={AUTOMATION_OPTIONS}
        />,
        <ChoiceQuestion<Exclude<Container, ''>>
          icon={<Cloud className="w-4 h-4 text-sky-500" />}
          label="컨테이너/쿠버네티스 현황과 계획은 어떤가요?"
          hint="OpenShift를 이미 쓰고 있다면 위에서 선택한 대로 추천에서 제외돼요"
          value={container}
          onChange={setContainer}
          options={CONTAINER_OPTIONS}
        />,
        <ChoiceQuestion<Exclude<Virt, ''>>
          icon={<Boxes className="w-4 h-4 text-orange-500" />}
          label="VMware 같은 상용 가상화의 비용·라이선스 때문에 대안을 검토하고 있나요?"
          hint="가상화를 쓰지 않으면 '검토 안 함'. 계약 만료 등으로 1년 안에 바꿔야 한다면 '1년 내 전환 예정'"
          value={virt}
          onChange={setVirt}
          options={VIRT_OPTIONS}
        />
      ]}
    </QuestionList>
  );

  return {
    form,
    recommendations,
    score,
    answeredCount,
    totalCount: HEALTH_COLUMNS.length,
    sheet: HEALTH_SHEET,
    questionColumns: HEALTH_SAVE_COLUMNS,
    answers: () => ({
      'RHEL 서버 규모': labelOf(SCALE_OPTIONS, scale),
      '가장 오래된 RHEL 버전': labelOf(VERSION_OPTIONS, version),
      '보유 Red Hat 제품': multiSelectText(OWN_OPTIONS, owns, ownsTouched),
      '패치·보안 수작업 부담': labelOf(PATCH_OPTIONS, patch),
      [CURRENT_OS_COLUMN]: version === 'none' ? labelOf(OS_OPTIONS, currentOs) : '',
      '반복 작업 처리 방식': labelOf(AUTOMATION_OPTIONS, automation),
      '컨테이너/K8s 현황': labelOf(CONTAINER_OPTIONS, container),
      '상용 가상화 대안 검토': labelOf(VIRT_OPTIONS, virt),
      [FIT_SCORE_COLUMN]: answeredCount ? String(score.total) : '',
      [FIT_GRADE_COLUMN]: answeredCount ? gradeText(score) : ''
    }),
    reset: () => {
      setScale('');
      setVersion('');
      setCurrentOs('');
      setOwns(NO_OWNS);
      setOwnsTouched(false);
      setPatch('');
      setAutomation('');
      setContainer('');
      setVirt('');
    }
  };
}
