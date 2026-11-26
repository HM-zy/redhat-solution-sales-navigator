// 헬스체크·리뉴얼 페이지가 함께 쓰는 질문 버튼과 추천 카드
import React, { useState } from 'react';
import { ArrowRightCircle, BookOpen, ChevronDown, ExternalLink, Gauge, Lightbulb, MessageSquare, SearchX } from 'lucide-react';
import { BRIEFS } from './briefs';

export type SellType = 'Net-new' | 'Cross-selling' | 'Upselling';
export type YesNo = boolean | null;

export interface Recommendation {
  id: string;
  type: SellType;
  solution: string;
  reasons: string[];
  script: string;
}

export interface Option<T extends string> {
  value: T;
  label: string;
}

export const labelOf = <T extends string>(options: Option<T>[], value: T | '') =>
  options.find((o) => o.value === value)?.label ?? '';

export const yesNoText = (v: YesNo, yes: string, no: string) => (v === null ? '' : v ? yes : no);

/** Technical Fit 점수: 항목별 점수의 합 (100점 만점) */
export interface FitScore {
  total: number;
  grade: 'High' | 'Medium' | 'Low';
  complete: boolean;
  provisional: boolean; // 응답이 적어 등급을 확정하지 않음
  answered: number;
  of: number;
  multiplier: number; // 서버 규모 배율
  scaleAnswered: boolean;
  items: { label: string; points: number; max: number; answered: boolean; note?: string }[];
}

/** 한 페이지(헬스체크·리뉴얼)가 화면과 저장에 넘기는 것 */
export interface ChecklistPage {
  form: React.ReactNode;
  recommendations: Recommendation[];
  score?: FitScore; // 헬스체크만 점수를 매긴다
  answeredCount: number;
  totalCount: number;
  sheet: string;
  questionColumns: readonly string[];
  answers: () => Record<string, string>;
  reset: () => void;
}

interface OptionButtonProps {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

export const OptionButton = ({ selected, onClick, children }: OptionButtonProps) => (
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

export const QuestionLabel = ({ icon, label, hint }: QuestionLabelProps) => (
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
  onChange: (v: T | '') => void; // 이미 고른 답을 다시 누르면 ''(미응답)
}

export function ChoiceQuestion<T extends string>({ icon, label, hint, value, options, onChange }: ChoiceQuestionProps<T>) {
  return (
    <div>
      <QuestionLabel icon={icon} label={label} hint={hint} />
      <div className={options.length >= 4 ? 'grid grid-cols-2 gap-2 w-full mt-2' : 'flex gap-2 w-full mt-2'}>
        {options.map((o) => (
          <OptionButton key={o.value} selected={value === o.value} onClick={() => onChange(value === o.value ? '' : o.value)}>
            {o.label}
          </OptionButton>
        ))}
      </div>
    </div>
  );
}

interface YesNoQuestionProps {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  yes: string;
  no: string;
  value: YesNo;
  onChange: (v: YesNo) => void; // 이미 고른 답을 다시 누르면 null(미응답)
}

export const YesNoQuestion = ({ icon, label, hint, yes, no, value, onChange }: YesNoQuestionProps) => (
  <div>
    <QuestionLabel icon={icon} label={label} hint={hint} />
    <div className="flex gap-2 w-full mt-2">
      <OptionButton selected={value === true} onClick={() => onChange(value === true ? null : true)}>
        {yes}
      </OptionButton>
      <OptionButton selected={value === false} onClick={() => onChange(value === false ? null : false)}>
        {no}
      </OptionButton>
    </div>
  </div>
);

interface MultiSelectQuestionProps<K extends string> {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  options: { key: K; label: string }[];
  selected: Record<K, boolean>;
  touched: boolean;
  onToggle: (key: K) => void;
  onNone: (on: boolean) => void; // '없음'을 다시 누르면 false(미응답)
}

export function MultiSelectQuestion<K extends string>(props: MultiSelectQuestionProps<K>) {
  const { options, selected, touched } = props;
  const any = options.some((o) => selected[o.key]);
  return (
    <div>
      <QuestionLabel icon={props.icon} label={props.label} hint={props.hint} />
      <div className="grid grid-cols-2 gap-2 mt-2">
        {options.map((o) => (
          <OptionButton key={o.key} selected={selected[o.key]} onClick={() => props.onToggle(o.key)}>
            {o.label}
          </OptionButton>
        ))}
        <OptionButton selected={touched && !any} onClick={() => props.onNone(!(touched && !any))}>
          없음
        </OptionButton>
      </div>
    </div>
  );
}

export const multiSelectText = <K extends string>(options: { key: K; label: string }[], selected: Record<K, boolean>, touched: boolean) => {
  if (!touched) return '';
  const picked = options.filter((o) => selected[o.key]).map((o) => o.label);
  return picked.length ? picked.join(', ') : '없음';
};

/** 질문 사이 구분선을 넣어 세로로 쌓는다 */
export const QuestionList = ({ children }: { children: React.ReactNode[] }) => (
  <div className="p-6 space-y-6">
    {children.map((child, i) => (
      <React.Fragment key={i}>
        {i > 0 && <hr className="border-slate-100" />}
        {child}
      </React.Fragment>
    ))}
  </div>
);

const GRADE_STYLE: Record<FitScore['grade'], { badge: string; bar: string; text: string }> = {
  High: { badge: 'bg-emerald-600 text-white', bar: 'bg-emerald-500', text: '우선 공략' },
  Medium: { badge: 'bg-amber-500 text-white', bar: 'bg-amber-400', text: '육성' },
  Low: { badge: 'bg-slate-400 text-white', bar: 'bg-slate-400', text: '관망' }
};

export function FitScoreCard({ score }: { score: FitScore }) {
  const g = GRADE_STYLE[score.grade];
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="w-5 h-5 text-slate-600" />
          <h3 className="font-bold text-slate-800">Technical Fit Score</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-3xl font-extrabold text-slate-800 tabular-nums">{score.total}</span>
          <span className="text-sm text-slate-400">/ 100</span>
          <span
            className={`px-2.5 py-1 rounded-md text-xs font-bold ${
              score.provisional ? 'bg-white border border-dashed border-slate-300 text-slate-500' : g.badge
            }`}
          >
            {score.grade} · {g.text}
            {score.provisional && ' (잠정)'}
          </span>
        </div>
      </div>
      <div className="h-2 bg-slate-100 rounded-full mt-3 overflow-hidden">
        <div
          className={`h-full ${g.bar} transition-all ${score.provisional ? 'opacity-40' : ''}`}
          style={{ width: `${score.total}%` }}
        />
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {score.items.map((i) => (
          <li key={i.label} className="flex items-center justify-between gap-2">
            <span className={i.answered ? 'text-slate-600' : 'text-slate-300'} title={i.note}>
              {i.label}
              {i.note && <span className="text-slate-400"> ({i.note})</span>}
            </span>
            <span className={`tabular-nums font-semibold ${i.answered ? 'text-slate-700' : 'text-slate-300'}`}>
              {i.answered ? i.points : '-'}/{i.max}
            </span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-2">
          <span className={score.scaleAnswered ? 'text-slate-600' : 'text-slate-300'}>서버 규모 배율</span>
          <span className={`tabular-nums font-semibold ${score.scaleAnswered ? 'text-slate-700' : 'text-slate-300'}`}>
            {score.scaleAnswered ? `×${score.multiplier}` : '-'}
          </span>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span className="text-slate-600">신뢰도</span>
          <span className="tabular-nums font-semibold text-slate-700">
            응답 {score.answered}/{score.of}
          </span>
        </li>
      </ul>
      <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
        답한 항목만으로 100점 환산 × 서버 규모 배율 (5대 미만 ×0.6 · 5~20대 ×0.85 · 20대 이상 ×1). 70 이상 High · 40~69
        Medium · 40 미만 Low. 보유 제품은 점수에 넣지 않음.
        {score.provisional && ' 5개 이상 답하면 등급이 확정됩니다.'}
      </p>
    </div>
  );
}

const POINT_STYLE: Record<string, string> = {
  공감: 'bg-sky-100 text-sky-700',
  문제: 'bg-rose-100 text-rose-700',
  해결: 'bg-emerald-100 text-emerald-700',
  '다음 단계': 'bg-amber-100 text-amber-700'
};

/** 대본 다음에 1분 정도 더 풀어 말할 흐름과 공식 자료 링크 (펼쳐서 보기) */
function BriefSection({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const brief = BRIEFS[id];
  if (!brief) return null;
  return (
    <div className="border-t border-slate-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
      >
        <span className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-500" />
          1분 설명 자료 · 공식 링크 {brief.links.length}개
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2.5">
          {brief.points.map((p) => (
            <div key={p.label} className="flex gap-2.5 items-start">
              <span className={`shrink-0 w-16 text-center text-[11px] font-bold py-0.5 rounded ${POINT_STYLE[p.label]}`}>{p.label}</span>
              <p className="text-sm text-slate-700 leading-relaxed">{p.text}</p>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            {brief.links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-2.5 py-1 rounded-md"
              >
                {l.label}
                <ExternalLink className="w-3 h-3" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function RecommendationPanel({ page }: { page: ChecklistPage }) {
  const { recommendations, answeredCount, totalCount } = page;
  const crossCount = recommendations.filter((r) => r.type === 'Cross-selling').length;
  const upCount = recommendations.filter((r) => r.type === 'Upselling').length;
  const newCount = recommendations.filter((r) => r.type === 'Net-new').length;
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[600px]">
      <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          <h2 className="font-bold text-lg text-slate-800">추천 솔루션 및 세일즈 스크립트</h2>
        </div>
        {recommendations.length > 0 && (
          <div className="flex gap-2 text-xs font-bold">
            {newCount > 0 && <span className="px-2 py-1 rounded-md bg-pink-100 text-pink-700">Net-new {newCount}</span>}
            <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-700">Cross-sell {crossCount}</span>
            <span className="px-2 py-1 rounded-md bg-purple-100 text-purple-700">Upsell {upCount}</span>
          </div>
        )}
      </div>

      <div className="p-6 flex-1 overflow-y-auto bg-slate-50/50 flex flex-col">
        {page.score && answeredCount > 0 && <FitScoreCard score={page.score} />}
        {answeredCount === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
            <MessageSquare className="w-12 h-12 opacity-20" />
            <p className="text-center">
              좌측에서 고객 환경을 체크하시면
              <br />
              Upselling / Cross-selling 제품과 대본이 표시됩니다.
            </p>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
            <SearchX className="w-12 h-12 opacity-30" />
            <p className="text-center">
              현재 체크한 조건에 해당하는 추천 제품이 없습니다.
              <br />
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
                      rec.type === 'Upselling'
                        ? 'bg-purple-100 text-purple-700'
                        : rec.type === 'Net-new'
                          ? 'bg-pink-100 text-pink-700'
                          : 'bg-emerald-100 text-emerald-700'
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
                <BriefSection id={rec.id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
