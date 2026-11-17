import React, { useState, useMemo } from 'react';
import {
  Server,
  Layers,
  Cloud,
  ShieldCheck,
  MessageSquare,
  RefreshCw,
  ArrowRightCircle,
  Lightbulb,
  SearchX,
  Repeat,
  Boxes,
  CalendarClock,
  History,
  Package
} from 'lucide-react';
import RagAssistant from './RagAssistant';

type Scale = '' | '<10' | '10-50' | '50+';
type Version = '' | 'v7' | 'v8' | 'v9';
type Automation = '' | 'manual' | 'community' | 'provision' | 'done';
type Container = '' | 'none' | 'plan' | 'self';
type YesNo = boolean | null;
type SellType = 'Cross-selling' | 'Upselling';
type OwnKey = 'satellite' | 'aap' | 'openshift' | 'premium';
type YesNoKey = 'patchSec' | 'virt' | 'renewal';

interface Recommendation {
  id: string;
  type: SellType;
  solution: string;
  reasons: string[];
  script: string;
}

interface Option<T extends string> {
  value: T;
  label: string;
}

// --- 질문 구성 (총 8개) ---
// 1 규모 / 2 RHEL 버전 / 3 보유 Red Hat 제품 / 4 패치·보안 / 5 자동화 / 6 컨테이너 / 7 가상화 / 8 갱신
const OWN_OPTIONS: { key: OwnKey; label: string }[] = [
  { key: 'satellite', label: 'Satellite / Smart Management' },
  { key: 'aap', label: 'Ansible Automation Platform' },
  { key: 'openshift', label: 'OpenShift' },
  { key: 'premium', label: 'Premium 지원 등급' }
];

const YES_NO_QUESTIONS: {
  key: YesNoKey;
  icon: React.ReactNode;
  label: string;
  hint: string;
  yes: string;
  no: string;
}[] = [
  {
    key: 'patchSec',
    icon: <ShieldCheck className="w-4 h-4 text-emerald-500" />,
    label: '패치 관리나 보안 감사(ISMS 등) 대응에 수작업 부담이 있나요?',
    hint: '서버별 직접 패치, 담당자별 스크립트, 취약점·패치 이력 증빙 작업 포함',
    yes: '그렇다',
    no: '아니다'
  },
  {
    key: 'virt',
    icon: <Boxes className="w-4 h-4 text-orange-500" />,
    label: 'VMware 같은 상용 가상화를 쓰면서, 비용·라이선스 때문에 대안을 검토 중인가요?',
    hint: '가상화 플랫폼을 쓰지 않거나 대안 검토를 하지 않으면 "아니다"',
    yes: '그렇다',
    no: '아니다'
  },
  {
    key: 'renewal',
    icon: <CalendarClock className="w-4 h-4 text-amber-500" />,
    label: 'RHEL 구독 갱신이 12개월 이내인가요?',
    hint: '갱신 시점은 구성 재점검과 확대 제안의 가장 좋은 기회예요',
    yes: '12개월 이내',
    no: '그 이후'
  }
];

// --- UI Components (바깥에 정의해서 리렌더링 시 재생성 방지) ---
interface OptionButtonProps {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const OptionButton = ({ selected, onClick, children }: OptionButtonProps) => (
  <button
    onClick={onClick}
    className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold border-2 transition-all ${
      selected
        ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm'
        : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-slate-50'
    }`}
  >
    {children}
  </button>
);

interface QuestionLabelProps {
  icon: React.ReactNode;
  label: string;
  hint?: string;
}

const QuestionLabel = ({ icon, label, hint }: QuestionLabelProps) => (
  <>
    <label className="flex items-start gap-2 font-semibold text-slate-700">
      <span className="mt-1">{icon}</span>
      <span>{label}</span>
    </label>
    {hint && <p className="text-xs text-slate-400 mt-1 ml-6">{hint}</p>}
  </>
);

interface ChoiceQuestionProps<T extends string> {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  value: T | '';
  options: Option<T>[];
  onChange: (v: T) => void;
}

function ChoiceQuestion<T extends string>({ icon, label, hint, value, options, onChange }: ChoiceQuestionProps<T>) {
  return (
    <div>
      <QuestionLabel icon={icon} label={label} hint={hint} />
      <div className={options.length >= 4 ? 'grid grid-cols-2 gap-2 w-full mt-2' : 'flex gap-2 w-full mt-2'}>
        {options.map((o) => (
          <OptionButton key={o.value} selected={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </OptionButton>
        ))}
      </div>
    </div>
  );
}

export default function RedHatSalesNavigator() {
  const [scale, setScale] = useState<Scale>('');
  const [version, setVersion] = useState<Version>('');
  const [owns, setOwns] = useState<Record<OwnKey, boolean>>({
    satellite: false,
    aap: false,
    openshift: false,
    premium: false
  });
  const [ownsTouched, setOwnsTouched] = useState(false);
  const [automation, setAutomation] = useState<Automation>('');
  const [container, setContainer] = useState<Container>('');
  const [answers, setAnswers] = useState<Record<YesNoKey, YesNo>>({
    patchSec: null,
    virt: null,
    renewal: null
  });

  const setAnswer = (key: YesNoKey, value: boolean) => setAnswers((prev) => ({ ...prev, [key]: value }));

  const toggleOwn = (key: OwnKey) => {
    setOwns((prev) => ({ ...prev, [key]: !prev[key] }));
    setOwnsTouched(true);
  };

  const clearOwns = () => {
    setOwns({ satellite: false, aap: false, openshift: false, premium: false });
    setOwnsTouched(true);
  };

  const hasAnyOwn = Object.values(owns).some(Boolean);

  const answeredCount =
    (scale !== '' ? 1 : 0) +
    (version !== '' ? 1 : 0) +
    (ownsTouched ? 1 : 0) +
    (automation !== '' ? 1 : 0) +
    (container !== '' ? 1 : 0) +
    (Object.values(answers) as YesNo[]).filter((v) => v !== null).length;
  const totalCount = 8;

  // --- Logic ---
  // Upselling = 기존 RHEL 구독/보유 제품 기반 확장 (ELS, Smart Management, 지원 등급, 활용 확대)
  // Cross-selling = 보유하지 않은 다른 제품군 제안 (Ansible, OpenShift, OpenShift Virtualization)
  // 이미 보유한 제품은 신규 추천에서 제외한다.
  const recommendations = useMemo<Recommendation[]>(() => {
    const recs: Recommendation[] = [];
    const { patchSec, virt, renewal } = answers;
    const scaleText =
      scale === '50+' ? '50대 이상' : scale === '10-50' ? '10~50대' : scale === '<10' ? '10대 미만' : '';
    const notSmall = scale !== '<10'; // 규모 미응답은 소규모로 단정하지 않음

    // 1. RHEL 7 이하 → ELS 애드온 (Upselling)
    if (version === 'v7') {
      const reasons = ['RHEL 7 이하 운영 (유지보수 종료)'];
      if (scaleText) reasons.push(`RHEL ${scaleText} 운영`);
      if (renewal === true) reasons.push('구독 갱신 12개월 이내');

      recs.push({
        id: 'rec-els',
        type: 'Upselling',
        solution: 'RHEL Extended Life Cycle Support (ELS) 애드온',
        reasons,
        script:
          '아직 RHEL 7을 운영 중이신 걸로 이해했는데, 보안 패치를 계속 받으면서 RHEL 9이나 10으로 옮기는 일정은 어떻게 잡고 계신가요? 이전이 끝날 때까지는 ELS 애드온으로 지원을 이어가실 수 있는데, 7.9 기준으로 맞춰야 하는 조건과 이전 일정까지 같이 정리해 드려도 될까요?'
      });
    }

    // 2. 패치·보안 수작업 부담
    if (patchSec === true && !owns.satellite) {
      // 미보유 → Smart Management (Upselling)
      const reasons = ['패치·보안 감사 대응에 수작업 부담', 'Satellite 미보유'];
      if (scaleText) reasons.push(`RHEL ${scaleText} 운영`);

      recs.push({
        id: 'rec-smart-mgmt',
        type: 'Upselling',
        solution: 'RHEL Smart Management (Satellite)',
        reasons,
        script:
          '보안 감사 때 서버별 패치 이력이나 취약점 현황을 확인하는 데 시간이 많이 들지 않으신가요? 현재 RHEL 구독에 Smart Management를 더하면 패치 대상을 확인하고 전체 서버에 일관되게 적용·증빙하는 흐름을 한 곳에서 관리하실 수 있습니다. 지금 방식과 비교해서 짧게 안내해 드려도 될까요?'
      });
    }
    if (patchSec === true && owns.satellite) {
      // 이미 보유 → 활용 확대 (Upselling)
      recs.push({
        id: 'rec-satellite-expand',
        type: 'Upselling',
        solution: 'Satellite 컴플라이언스 / Insights 활용 확대',
        reasons: ['Satellite 보유', '감사 대응에 수작업 부담 잔존'],
        script:
          '이미 Satellite를 쓰고 계신데도 감사 대응에 수작업이 남아 있다면, 컴플라이언스 정책 점검이나 Insights 취약점 분석을 어디까지 연결해 쓰고 계신지 궁금합니다. 정책 점검이 안 되는 서버 범위가 있는지 같이 살펴볼까요?'
      });
    }

    // 3. Ansible Automation Platform — Cross-selling (미보유 고객만)
    const aapByWork =
      !owns.aap && notSmall && (automation === 'manual' || automation === 'community' || automation === 'provision');
    const aapByUpgrade = !owns.aap && notSmall && version === 'v8';
    if (aapByWork || aapByUpgrade) {
      const reasons: string[] = [];
      if (automation === 'manual') reasons.push('반복 작업을 수작업/자체 스크립트로 처리');
      if (automation === 'community') reasons.push('커뮤니티 Ansible 사용 (지원·거버넌스 필요)');
      if (automation === 'provision') reasons.push('서버 생성만 자동화 (OS 설정·패치 자동화 여지)');
      if (aapByUpgrade) reasons.push('RHEL 8 → 9/10 업그레이드 대상');
      if (scaleText) reasons.push(`RHEL ${scaleText} 운영`);

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
    if (virt === true) {
      const reasons = ['상용 가상화 비용·라이선스 이슈로 대안 검토'];
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

    // 6. 구독 갱신 — Upselling (Premium 미보유 고객만)
    if (renewal === true && !owns.premium) {
      const reasons = ['RHEL 구독 갱신 12개월 이내', 'Premium 지원 미보유'];
      if (scaleText) reasons.push(`RHEL ${scaleText} 운영`);

      recs.push({
        id: 'rec-renewal',
        type: 'Upselling',
        solution: 'RHEL 구독 구성 최적화 / Premium 지원 등급',
        reasons,
        script:
          version === 'v7'
            ? '갱신 시점이 가까워지고 있는데, RHEL 7 서버는 ELS 구성까지 포함해서 갱신 때 같이 정리하시면 좋습니다. 장애 시 영향이 큰 핵심 시스템이 있다면 그 시스템만 Premium 지원으로 올리는 구성도 가능한데 함께 검토해 볼까요?'
            : '갱신 시점이 가까워지고 있는데, 장애 시 영향이 큰 핵심 시스템이 있다면 지금 지원 등급이 충분한지 점검해 보셨나요? 핵심 시스템은 Premium 지원으로, 나머지는 현재 등급으로 나누는 식의 구성도 가능해서 갱신 전에 함께 정리해 드릴 수 있습니다.'
      });
    }

    return recs;
  }, [scale, version, owns, automation, container, answers]);

  const crossCount = recommendations.filter((r) => r.type === 'Cross-selling').length;
  const upCount = recommendations.filter((r) => r.type === 'Upselling').length;

  const handleReset = () => {
    setScale('');
    setVersion('');
    setOwns({ satellite: false, aap: false, openshift: false, premium: false });
    setOwnsTouched(false);
    setAutomation('');
    setContainer('');
    setAnswers({ patchSec: null, virt: null, renewal: null });
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-red-600 text-white px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <Layers className="w-6 h-6" />
          <h1 className="text-xl font-bold">Red Hat 솔루션 영업 네비게이터</h1>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          초기화
        </button>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: Discovery questions */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-slate-700" />
              <h2 className="font-bold text-lg text-slate-800">고객 환경 체크리스트</h2>
            </div>
            <span className="text-xs font-semibold text-slate-500">{answeredCount}/{totalCount}</span>
          </div>

          <div className="p-6 space-y-6">
            {/* 1. 규모 */}
            <ChoiceQuestion<Exclude<Scale, ''>>
              icon={<Server className="w-4 h-4 text-blue-500" />}
              label="RHEL 서버 운영 규모"
              value={scale}
              onChange={setScale}
              options={[
                { value: '<10', label: '10대 미만' },
                { value: '10-50', label: '10 ~ 50대' },
                { value: '50+', label: '50대 이상' }
              ]}
            />

            <hr className="border-slate-100" />

            {/* 2. RHEL 버전 */}
            <ChoiceQuestion<Exclude<Version, ''>>
              icon={<History className="w-4 h-4 text-purple-500" />}
              label="가장 오래된 RHEL 서버의 메이저 버전은 무엇인가요?"
              hint="cat /etc/redhat-release 로 확인한 버전 기준 (CentOS 7 등 포함)"
              value={version}
              onChange={setVersion}
              options={[
                { value: 'v7', label: 'RHEL 7 이하' },
                { value: 'v8', label: 'RHEL 8' },
                { value: 'v9', label: 'RHEL 9 이상' }
              ]}
            />

            <hr className="border-slate-100" />

            {/* 3. 보유 Red Hat 제품 (복수 선택) */}
            <div>
              <QuestionLabel
                icon={<Package className="w-4 h-4 text-slate-500" />}
                label="이미 사용 중인 Red Hat 제품을 모두 선택해 주세요."
                hint="보유 제품은 신규 추천에서 제외돼요. 해당 없으면 '없음'을 눌러 주세요."
              />
              <div className="grid grid-cols-2 gap-2 mt-2">
                {OWN_OPTIONS.map((o) => (
                  <OptionButton key={o.key} selected={owns[o.key]} onClick={() => toggleOwn(o.key)}>
                    {o.label}
                  </OptionButton>
                ))}
                <OptionButton selected={ownsTouched && !hasAnyOwn} onClick={clearOwns}>
                  없음
                </OptionButton>
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* 4. 패치·보안 */}
            <div>
              <QuestionLabel
                icon={YES_NO_QUESTIONS[0].icon}
                label={YES_NO_QUESTIONS[0].label}
                hint={YES_NO_QUESTIONS[0].hint}
              />
              <div className="flex gap-2 w-full mt-2">
                <OptionButton selected={answers.patchSec === true} onClick={() => setAnswer('patchSec', true)}>{YES_NO_QUESTIONS[0].yes}</OptionButton>
                <OptionButton selected={answers.patchSec === false} onClick={() => setAnswer('patchSec', false)}>{YES_NO_QUESTIONS[0].no}</OptionButton>
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* 5. 자동화 현황 */}
            <ChoiceQuestion<Exclude<Automation, ''>>
              icon={<Repeat className="w-4 h-4 text-red-500" />}
              label="서버 설정·배포 같은 반복 작업은 어떻게 처리하고 있나요?"
              hint="'서버 생성만 자동화'는 Terraform, CloudFormation 등으로 서버·네트워크만 만들고, 서버 안쪽(패치·설정)은 별도로 관리하는 경우예요"
              value={automation}
              onChange={setAutomation}
              options={[
                { value: 'manual', label: '수작업·자체 스크립트' },
                { value: 'community', label: '커뮤니티 Ansible' },
                { value: 'provision', label: '서버 생성만 자동화' },
                { value: 'done', label: '서버 안쪽까지 자동화 (AAP 등)' }
              ]}
            />

            <hr className="border-slate-100" />

            {/* 6. 컨테이너 현황 */}
            <ChoiceQuestion<Exclude<Container, ''>>
              icon={<Cloud className="w-4 h-4 text-sky-500" />}
              label="컨테이너/쿠버네티스 현황과 계획은 어떤가요?"
              hint="OpenShift를 이미 쓰고 있다면 위에서 선택한 대로 추천에서 제외돼요"
              value={container}
              onChange={setContainer}
              options={[
                { value: 'none', label: '사용·계획 없음' },
                { value: 'plan', label: '이전 계획 있음' },
                { value: 'self', label: '자체·타사 K8s 운영 중' }
              ]}
            />

            {/* 7. 가상화 / 8. 갱신 */}
            {[YES_NO_QUESTIONS[1], YES_NO_QUESTIONS[2]].map((q) => (
              <div key={q.key}>
                <hr className="border-slate-100 mb-6" />
                <QuestionLabel icon={q.icon} label={q.label} hint={q.hint} />
                <div className="flex gap-2 w-full mt-2">
                  <OptionButton selected={answers[q.key] === true} onClick={() => setAnswer(q.key, true)}>{q.yes}</OptionButton>
                  <OptionButton selected={answers[q.key] === false} onClick={() => setAnswer(q.key, false)}>{q.no}</OptionButton>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right: Recommendations */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[600px]">
          <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-500" />
              <h2 className="font-bold text-lg text-slate-800">추천 솔루션 및 세일즈 스크립트</h2>
            </div>
            {recommendations.length > 0 && (
              <div className="flex gap-2 text-xs font-bold">
                <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-700">Cross-sell {crossCount}</span>
                <span className="px-2 py-1 rounded-md bg-purple-100 text-purple-700">Upsell {upCount}</span>
              </div>
            )}
          </div>

          <div className="p-6 flex-1 overflow-y-auto bg-slate-50/50">
            {answeredCount === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                <MessageSquare className="w-12 h-12 opacity-20" />
                <p className="text-center">좌측에서 고객 환경을 체크하시면<br />Upselling / Cross-selling 제품과 대본이 표시됩니다.</p>
              </div>
            ) : recommendations.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                <SearchX className="w-12 h-12 opacity-30" />
                <p className="text-center">
                  현재 체크한 조건에 해당하는 추천 제품이 없습니다.<br />
                  나머지 항목을 체크하면 추천이 업데이트됩니다. ({answeredCount}/{totalCount} 입력)
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {recommendations.map((rec) => (
                  <div key={rec.id} className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden">
                    <div className="p-4 bg-gradient-to-r from-blue-50 to-white border-b border-blue-50">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold mb-2 ${
                          rec.type === 'Upselling' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {rec.type}
                      </span>
                      <h3 className="font-bold text-lg text-slate-800">{rec.solution}</h3>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {rec.reasons.map((reason) => (
                          <span key={reason} className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="p-4 bg-white">
                      <div className="flex gap-3">
                        <ArrowRightCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                        <p className="text-slate-700 leading-relaxed text-[15px] font-medium">"{rec.script}"</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* RAG 어시스턴트: 체크리스트·추천 아래 전체 폭 */}
        <div className="lg:col-span-2">
          <RagAssistant />
        </div>
      </main>
    </div>
  );
}