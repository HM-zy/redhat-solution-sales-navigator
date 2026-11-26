// 리뉴얼 페이지: 구독 갱신 미팅에서 구성을 다시 점검하며 Upselling / Cross-selling 기회를 찾는다.
import { useMemo, useState } from 'react';
import { Calculator, Headset, Layers3, LifeBuoy, Package, Rocket, ShieldCheck, Siren } from 'lucide-react';
import {
  ChoiceQuestion,
  MultiSelectQuestion,
  QuestionList,
  YesNoQuestion,
  labelOf,
  multiSelectText,
  yesNoText,
  type ChecklistPage,
  type Option,
  type Recommendation,
  type YesNo
} from './ui';

type Count = '' | 'more' | 'same' | 'less' | 'unknown';
type Support = '' | 'standard' | 'premium' | 'mixed' | 'unknown';
type OwnKey = 'satellite' | 'aap' | 'openshift';
type PlanKey = 'upgrade' | 'move' | 'container';

export const RENEWAL_SHEET = '리뉴얼';
export const RENEWAL_COLUMNS = [
  '보유 Red Hat 제품',
  '구독 수량 대비 실제 서버',
  '현재 지원 등급',
  '핵심 업무 시스템 운영',
  '호스트당 RHEL VM 여러 대',
  '1년 내 계획된 큰 작업',
  '패치·보안 수작업 부담',
  '기술 지원 아쉬움'
] as const;

const OWN_OPTIONS: { key: OwnKey; label: string }[] = [
  { key: 'satellite', label: 'Satellite / Smart Management' },
  { key: 'aap', label: 'Ansible Automation Platform' },
  { key: 'openshift', label: 'OpenShift' }
];
const NO_OWNS: Record<OwnKey, boolean> = { satellite: false, aap: false, openshift: false };

const COUNT_OPTIONS: Option<Exclude<Count, ''>>[] = [
  { value: 'more', label: '구독보다 서버가 많음' },
  { value: 'same', label: '거의 같음' },
  { value: 'less', label: '구독이 남음' },
  { value: 'unknown', label: '파악 안 됨' }
];
const SUPPORT_OPTIONS: Option<Exclude<Support, ''>>[] = [
  { value: 'standard', label: '모두 Standard' },
  { value: 'premium', label: '모두 Premium' },
  { value: 'mixed', label: '섞여 있음' },
  { value: 'unknown', label: '잘 모름' }
];
const PLAN_OPTIONS: { key: PlanKey; label: string }[] = [
  { key: 'upgrade', label: 'OS 업그레이드 (RHEL 7·8 → 9·10)' },
  { key: 'move', label: '데이터센터·클라우드 이전' },
  { key: 'container', label: '컨테이너·쿠버네티스 도입' }
];
const NO_PLANS: Record<PlanKey, boolean> = { upgrade: false, move: false, container: false };

const CRITICAL = { yes: '있다', no: '없다' };
const VDC = { yes: '그렇다', no: '아니다' };
const PATCH = { yes: '그렇다', no: '아니다' };
const TAM = { yes: '있다', no: '없다' };

export function useRenewal(): ChecklistPage {
  const [owns, setOwns] = useState<Record<OwnKey, boolean>>(NO_OWNS);
  const [ownsTouched, setOwnsTouched] = useState(false);
  const [count, setCount] = useState<Count>('');
  const [support, setSupport] = useState<Support>('');
  const [critical, setCritical] = useState<YesNo>(null);
  const [vdc, setVdc] = useState<YesNo>(null);
  const [plans, setPlans] = useState<Record<PlanKey, boolean>>(NO_PLANS);
  const [plansTouched, setPlansTouched] = useState(false);
  const [patchSec, setPatchSec] = useState<YesNo>(null);
  const [tam, setTam] = useState<YesNo>(null);

  const answeredCount = [
    ownsTouched,
    count !== '',
    support !== '',
    critical !== null,
    vdc !== null,
    plansTouched,
    patchSec !== null,
    tam !== null
  ].filter(Boolean).length;

  const recommendations = useMemo<Recommendation[]>(() => {
    const recs: Recommendation[] = [];

    // 1. 구독 수량 정합화 (Upselling)
    if (count === 'more' || count === 'unknown') {
      recs.push({
        id: 'rec-true-up',
        type: 'Upselling',
        solution: 'RHEL 구독 수량 정합화 (추가 구독)',
        reasons: [count === 'more' ? '구독 수량보다 실제 운영 서버가 많음' : '구독 대비 실제 사용량 파악 안 됨'],
        script:
          count === 'more'
            ? '갱신 전에 실제 운영 중인 서버 수를 한번 맞춰 보시면 좋겠습니다. 구독 없이 운영 중인 서버는 보안 패치나 기술 지원을 받을 수 없어서, 이번 갱신 때 수량을 함께 정리해 두시면 감사나 장애 때 부담이 줄어듭니다. 서버 목록 기준으로 같이 확인해 볼까요?'
            : '갱신 수량을 정하기 전에 실제로 RHEL이 몇 대에서 돌고 있는지부터 확인해 보시면 좋겠습니다. Red Hat Hybrid Cloud Console의 구독 사용 현황으로 서버별 사용량을 볼 수 있는데, 같이 확인하고 남는 구독과 부족한 구독을 한 번에 정리해 드려도 될까요?'
      });
    }

    // 2. Premium 지원 (Upselling): 핵심 시스템이 있는데 Premium이 아닌 경우
    if (critical === true && support !== '' && support !== 'premium') {
      const reasons = ['장애 영향이 큰 핵심 업무 시스템 운영'];
      reasons.push(support === 'mixed' ? '지원 등급이 섞여 있음' : support === 'unknown' ? '현재 지원 등급 파악 안 됨' : 'Standard 지원');
      recs.push({
        id: 'rec-premium',
        type: 'Upselling',
        solution: 'Premium 지원 등급 (핵심 시스템)',
        reasons,
        script:
          '장애가 나면 업무 영향이 큰 시스템이 있다고 하셨는데, 그 시스템의 지원 등급이 충분한지 갱신 전에 한번 점검해 보시면 좋겠습니다. 전체를 올릴 필요 없이 핵심 시스템만 24시간 대응되는 Premium으로 올리고 나머지는 지금 등급을 유지하는 구성도 가능한데, 대상 서버를 같이 골라 볼까요?'
      });
    }

    // 3. RHEL for Virtual Datacenters (Upselling)
    if (vdc === true) {
      recs.push({
        id: 'rec-vdc',
        type: 'Upselling',
        solution: 'RHEL for Virtual Datacenters (VDC)',
        reasons: ['가상화 호스트 한 대에 RHEL VM 여러 대 운영'],
        script:
          '가상화 호스트 한 대에 RHEL VM을 여러 대 올려 쓰고 계시다면, VM마다 구독을 사는 대신 호스트 기준으로 VM 수 제한 없이 쓰는 Virtual Datacenters 구독이 더 유리할 수 있습니다. 호스트 수와 VM 수를 기준으로 지금 구성과 비교해 드려도 될까요?'
      });
    }

    // 4. Smart Management (Upselling)
    if (patchSec === true && !owns.satellite) {
      recs.push({
        id: 'rec-smart-mgmt',
        type: 'Upselling',
        solution: 'RHEL Smart Management (Satellite)',
        reasons: ['패치·보안 감사 대응에 수작업 부담', 'Satellite 미보유'],
        script:
          '갱신하시면서 패치·감사 대응 부담도 같이 줄여 보시면 어떨까요? RHEL 구독에 Smart Management를 더하면 패치 대상 확인부터 전체 서버 적용, 이력 증빙까지 한 곳에서 관리하실 수 있어서, 갱신 견적에 함께 넣어 비교해 드릴 수 있습니다.'
      });
    }

    // 5. TAM (Upselling)
    if (tam === true) {
      recs.push({
        id: 'rec-tam',
        type: 'Upselling',
        solution: 'Technical Account Manager (TAM)',
        reasons: ['기술 지원 경험에 아쉬움 (응답 속도·전담 창구)'],
        script:
          '지원 받으실 때 매번 환경을 처음부터 설명해야 하거나 응답이 늦어서 아쉬우셨던 적이 있으셨나요? 고객사 환경을 알고 있는 전담 엔지니어가 장애 대응부터 업그레이드 계획까지 같이 챙기는 TAM 서비스가 있는데, 이번 갱신 때 함께 검토해 보시면 어떨까요?'
      });
    }

    // 6. Ansible Automation Platform (Cross-selling): 업그레이드·이전 같은 큰 작업 예정
    if ((plans.upgrade || plans.move) && !owns.aap) {
      const reasons: string[] = [];
      if (plans.upgrade) reasons.push('1년 내 OS 업그레이드 계획');
      if (plans.move) reasons.push('1년 내 데이터센터·클라우드 이전 계획');
      recs.push({
        id: 'rec-aap',
        type: 'Cross-selling',
        solution: 'Ansible Automation Platform',
        reasons,
        script:
          '갱신 후 1년 안에 큰 작업을 계획하고 계신데, 서버가 많을수록 사전 점검과 작업을 서버마다 직접 하기 부담스러우실 것 같습니다. Ansible로 점검·업그레이드·이전 절차를 표준화해 두면 이번 작업뿐 아니라 이후 운영에도 그대로 쓸 수 있어서, 갱신과 함께 검토해 보시면 좋겠습니다.'
      });
    }

    // 7. OpenShift (Cross-selling): 컨테이너 도입 예정
    if (plans.container && !owns.openshift) {
      recs.push({
        id: 'rec-openshift',
        type: 'Cross-selling',
        solution: 'Red Hat OpenShift',
        reasons: ['1년 내 컨테이너·쿠버네티스 도입 계획'],
        script:
          '컨테이너 도입을 계획하고 계시다면, 지금 쓰시는 RHEL과 같은 지원 체계로 쿠버네티스까지 운영하는 방법도 있습니다. 갱신 시점에 OpenShift를 함께 검토하시면 구독과 지원 창구를 한 번에 정리할 수 있는데, 도입 범위에 맞춰 간단히 소개해 드려도 될까요?'
      });
    }

    return recs;
  }, [owns, count, support, critical, vdc, plans, patchSec, tam]);

  const form = (
    <QuestionList>
      {[
        <MultiSelectQuestion<OwnKey>
          icon={<Package className="w-4 h-4 text-slate-500" />}
          label="RHEL 외에 이미 사용 중인 Red Hat 제품을 모두 선택해 주세요."
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
        <ChoiceQuestion<Exclude<Count, ''>>
          icon={<Calculator className="w-4 h-4 text-blue-500" />}
          label="갱신할 RHEL 구독 수량과 실제 운영 중인 서버 수가 맞나요?"
          hint="개발·테스트 서버, 최근 늘어난 VM까지 포함해서 생각해 보세요"
          value={count}
          onChange={setCount}
          options={COUNT_OPTIONS}
        />,
        <ChoiceQuestion<Exclude<Support, ''>>
          icon={<LifeBuoy className="w-4 h-4 text-purple-500" />}
          label="지금 RHEL 구독의 지원 등급은 어떻게 되어 있나요?"
          hint="Standard는 업무 시간 대응, Premium은 심각한 장애에 24시간 대응이에요"
          value={support}
          onChange={setSupport}
          options={SUPPORT_OPTIONS}
        />,
        <YesNoQuestion
          icon={<Siren className="w-4 h-4 text-red-500" />}
          label="장애가 나면 업무 영향이 큰 핵심 시스템이 RHEL 위에서 돌고 있나요?"
          hint="결제·주문·생산·대고객 서비스처럼 멈추면 바로 손실이 나는 시스템"
          {...CRITICAL}
          value={critical}
          onChange={setCritical}
        />,
        <YesNoQuestion
          icon={<Layers3 className="w-4 h-4 text-orange-500" />}
          label="가상화 호스트 한 대에 RHEL VM을 여러 대(대략 4대 이상) 올려 쓰나요?"
          hint="VMware, Hyper-V, KVM 등 가상화 종류는 상관없어요"
          {...VDC}
          value={vdc}
          onChange={setVdc}
        />,
        <MultiSelectQuestion<PlanKey>
          icon={<Rocket className="w-4 h-4 text-sky-500" />}
          label="갱신 후 1년 안에 계획된 큰 작업이 있나요? (복수 선택)"
          hint="계획이 없으면 '없음'을 눌러 주세요"
          options={PLAN_OPTIONS}
          selected={plans}
          touched={plansTouched}
          onToggle={(k) => {
            // 마지막 선택을 해제하면 '없음'이 아니라 미응답으로 돌아간다
            const next = { ...plans, [k]: !plans[k] };
            setPlans(next);
            setPlansTouched(Object.values(next).some(Boolean));
          }}
          onNone={(on) => {
            setPlans(NO_PLANS);
            setPlansTouched(on);
          }}
        />,
        <YesNoQuestion
          icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}
          label="패치 관리나 보안 감사(ISMS 등) 대응에 수작업 부담이 있나요?"
          hint="서버별 직접 패치, 담당자별 스크립트, 취약점·패치 이력 증빙 작업 포함"
          {...PATCH}
          value={patchSec}
          onChange={setPatchSec}
        />,
        <YesNoQuestion
          icon={<Headset className="w-4 h-4 text-teal-500" />}
          label="지난 1년 동안 기술 지원을 받으면서 아쉬웠던 점이 있었나요?"
          hint="응답이 느렸다, 매번 환경을 처음부터 설명해야 했다, 전담 창구가 없었다 등"
          {...TAM}
          value={tam}
          onChange={setTam}
        />
      ]}
    </QuestionList>
  );

  return {
    form,
    recommendations,
    answeredCount,
    totalCount: RENEWAL_COLUMNS.length,
    sheet: RENEWAL_SHEET,
    questionColumns: RENEWAL_COLUMNS,
    answers: () => ({
      '보유 Red Hat 제품': multiSelectText(OWN_OPTIONS, owns, ownsTouched),
      '구독 수량 대비 실제 서버': labelOf(COUNT_OPTIONS, count),
      '현재 지원 등급': labelOf(SUPPORT_OPTIONS, support),
      '핵심 업무 시스템 운영': yesNoText(critical, CRITICAL.yes, CRITICAL.no),
      '호스트당 RHEL VM 여러 대': yesNoText(vdc, VDC.yes, VDC.no),
      '1년 내 계획된 큰 작업': multiSelectText(PLAN_OPTIONS, plans, plansTouched),
      '패치·보안 수작업 부담': yesNoText(patchSec, PATCH.yes, PATCH.no),
      '기술 지원 아쉬움': yesNoText(tam, TAM.yes, TAM.no)
    }),
    reset: () => {
      setOwns(NO_OWNS);
      setOwnsTouched(false);
      setCount('');
      setSupport('');
      setCritical(null);
      setVdc(null);
      setPlans(NO_PLANS);
      setPlansTouched(false);
      setPatchSec(null);
      setTam(null);
    }
  };
}
