import { useState } from 'react';
import { CalendarClock, Layers, RefreshCw, Stethoscope } from 'lucide-react';
import MeetingSaveBar from './MeetingSaveBar';
import type { MeetingRecord } from './excelLog';
import { useHealthCheck } from './healthCheck';
import { useRenewal } from './renewal';
import RagAssistant from './RagAssistant';
import { RecommendationPanel } from './ui';

type Mode = 'health' | 'renewal';

// 탭마다 색을 달리해서 지금 어떤 미팅을 기록 중인지 헷갈리지 않게 한다 (헬스체크 = 초록, 리뉴얼 = 남색)
const MODES: {
  key: Mode;
  label: string;
  title: string;
  icon: React.ReactNode;
  header: string;
  tab: string;
  panel: string;
  save: string;
}[] = [
  {
    key: 'health',
    label: '헬스체크',
    title: '고객 환경 헬스체크',
    icon: <Stethoscope className="w-4 h-4" />,
    header: 'bg-emerald-700',
    tab: 'bg-emerald-600 text-white shadow-sm',
    panel: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    save: 'bg-emerald-600 hover:bg-emerald-700'
  },
  {
    key: 'renewal',
    label: '리뉴얼',
    title: '구독 리뉴얼 점검',
    icon: <CalendarClock className="w-4 h-4" />,
    header: 'bg-indigo-700',
    tab: 'bg-indigo-600 text-white shadow-sm',
    panel: 'bg-indigo-50 border-indigo-200 text-indigo-900',
    save: 'bg-indigo-600 hover:bg-indigo-700'
  }
];

const MODE_KEY = 'sales-navigator.mode';
const loadMode = (): Mode => {
  try {
    return localStorage.getItem(MODE_KEY) === 'renewal' ? 'renewal' : 'health';
  } catch {
    return 'health';
  }
};

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function RedHatSalesNavigator() {
  // 두 페이지의 입력은 따로 기억해서, 탭을 오가도 지워지지 않는다
  const health = useHealthCheck();
  const renewal = useRenewal();
  const [mode, setMode] = useState<Mode>(loadMode);
  const page = mode === 'health' ? health : renewal;
  const modeInfo = MODES.find((m) => m.key === mode)!;

  const [customer, setCustomer] = useState('');
  const [meetingDate, setMeetingDate] = useState(todayLocal);
  const [memo, setMemo] = useState('');

  const switchMode = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // 기억하지 못해도 괜찮다
    }
  };

  const buildRecord = (): MeetingRecord => ({
    sheet: page.sheet,
    questionColumns: page.questionColumns,
    customer,
    meetingDate,
    memo,
    answers: page.answers(),
    recommendations: page.recommendations.map((r) => ({ type: r.type, solution: r.solution }))
  });

  const handleReset = () => {
    setCustomer('');
    setMeetingDate(todayLocal());
    setMemo('');
    page.reset();
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className={`${modeInfo.header} text-white px-6 py-4 flex items-center justify-between shadow-md transition-colors`}>
        <div className="flex items-center gap-3">
          <Layers className="w-6 h-6" />
          <h1 className="text-xl font-bold">Red Hat 솔루션 영업 네비게이터</h1>
          <span className="text-xs font-semibold bg-white/20 px-2 py-0.5 rounded">v9</span>
          <span className="flex items-center gap-1.5 text-sm font-bold bg-white text-slate-800 px-3 py-1 rounded-full">
            {modeInfo.icon}
            {modeInfo.label}
          </span>
        </div>
        <button
          onClick={handleReset}
          title={`${modeInfo.label} 입력과 고객사명·메모를 지웁니다`}
          className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          초기화
        </button>
      </header>

      {/* 미팅 유형 선택 */}
      <nav className="max-w-7xl w-full mx-auto px-4 md:px-6 pt-4 md:pt-6">
        <div className="inline-flex bg-white border border-slate-200 rounded-2xl p-1 gap-1 shadow-sm">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => switchMode(m.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                mode === m.key ? m.tab : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>
      </nav>

      <MeetingSaveBar
        customer={customer}
        onCustomerChange={setCustomer}
        meetingDate={meetingDate}
        onMeetingDateChange={setMeetingDate}
        memo={memo}
        onMemoChange={setMemo}
        answeredCount={page.answeredCount}
        buildRecord={buildRecord}
        saveButtonClass={modeInfo.save}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: Discovery questions */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className={`${modeInfo.panel} p-4 border-b flex items-center justify-between`}>
            <div className="flex items-center gap-2">
              {modeInfo.icon}
              <h2 className="font-bold text-lg">{modeInfo.title} 체크리스트</h2>
            </div>
            <span className="text-xs font-semibold opacity-70">
              {page.answeredCount}/{page.totalCount}
            </span>
          </div>
          {/* 두 페이지를 모두 그려 두고 숨기기만 한다 (입력 유지) */}
          <div hidden={mode !== 'health'}>{health.form}</div>
          <div hidden={mode !== 'renewal'}>{renewal.form}</div>
        </section>

        {/* Right: Recommendations */}
        <RecommendationPanel page={page} />

        {/* RAG 어시스턴트: 체크리스트·추천 아래 전체 폭. 공식 문서만 근거로 답하고 출처 [doc_id]를 붙인다.
            Python API 서버가 있어야 하므로, 서버 없는 단일 HTML 파일(file)과 Apps Script 웹 앱(gas) 빌드에서는 숨긴다 */}
        {import.meta.env.MODE !== 'file' && import.meta.env.MODE !== 'gas' && (
          <div className="lg:col-span-2">
            <RagAssistant />
          </div>
        )}
      </main>
    </div>
  );
}
