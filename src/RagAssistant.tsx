import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileSearch,
  Loader2,
  RotateCw,
  Send,
  ServerCrash,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

/**
 * Red Hat 공식문서 RAG 어시스턴트.
 * `python -m rag.server`(포트 8000)가 /api 로 프록시되어 답변·인용·가드레일 거절을 돌려줍니다.
 */

type AskStatus = 'answered' | 'refused' | 'unavailable' | 'invalid' | 'error';
type Tone = 'emerald' | 'amber' | 'red' | 'slate' | 'blue';

interface RagChunk {
  chunk_id: string;
  doc_id: string;
  title: string;
  url: string;
  heading: string;
  score: number;
}

interface RagSource {
  doc_id: string;
  title: string;
  url: string;
  cited: boolean;
}

interface RagResponse {
  ok: boolean;
  question?: string;
  status: AskStatus;
  reason: string | null;
  answer?: string;
  citations?: string[];
  top_score?: number;
  has_api_key?: boolean;
  corpus_ready?: boolean;
  sources?: RagSource[];
  retrieved?: RagChunk[];
  fabricated_citations?: string[];
  dropped_sentences?: string[];
  message?: string;
}

interface RagHealth {
  ok: boolean;
  corpus_ready: boolean;
  has_api_key: boolean;
  chunks: number;
  model: string;
  detail?: string;
}

const TONES: Record<Tone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
};

const STATUS_META: Record<AskStatus, { label: string; tone: Tone; Icon: typeof CheckCircle2 }> = {
  answered: { label: '근거 기반 답변', tone: 'emerald', Icon: CheckCircle2 },
  refused: { label: '가드레일 거절', tone: 'amber', Icon: ShieldAlert },
  unavailable: { label: '답변 준비 안 됨', tone: 'slate', Icon: AlertTriangle },
  invalid: { label: '질문을 확인해 주세요', tone: 'slate', Icon: AlertTriangle },
  error: { label: '오류', tone: 'red', Icon: ServerCrash },
};

const REASON_LABELS: Record<string, string> = {
  pricing: '가격·할인·견적은 답하지 않습니다. 해당 내용은 공식문서에 없고, 셀러가 임의 숫자를 말하면 안 되기 때문입니다.',
  off_domain: 'Red Hat 제품과 무관한 질문이라 답하지 않았습니다.',
  low_evidence: '공식문서에서 근거를 충분히 찾지 못해 답하지 않았습니다.',
  insufficient_context: '검색된 공식문서 발췌에 답이 없어 거절했습니다.',
  no_cited_sentences: '근거 [doc_id] 없는 문장뿐이어서 답변을 거절했습니다.',
  no_api_key: '검색과 가드레일은 동작했지만, 답변 문장을 만들려면 ANTHROPIC_API_KEY가 필요합니다.',
  corpus_missing: '코퍼스가 없습니다. python -m rag.build_corpus 로 공식문서를 먼저 수집하세요.',
  pipeline_error: '답변 생성 중 오류가 발생했습니다.',
  bad_request: '질문을 입력해 주세요.',
};

const EXAMPLES: { tag: string; tone: Tone; question: string }[] = [
  { tag: '답변', tone: 'emerald', question: 'RHEL 8, 9, 10의 기본 라이프사이클은 총 몇 년인가요?' },
  { tag: '답변', tone: 'emerald', question: 'RHEL EUS 리포지터리는 몇 개월 동안 유지되나요?' },
  { tag: '거절', tone: 'amber', question: 'RHEL Premium 서브스크립션 가격이 얼마예요?' },
];

const CITATION = /(\[[a-z0-9][a-z0-9-]*\])/gi;

function AnswerText({ text }: { text: string }) {
  return (
    <p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
      {text.split(CITATION).map((part, i) =>
        /^\[[a-z0-9][a-z0-9-]*\]$/i.test(part) ? (
          <span
            key={i}
            className="mx-0.5 inline-block rounded bg-blue-50 px-1.5 py-0.5 align-middle text-[11px] font-bold text-blue-700"
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

function ChunkList({ chunks }: { chunks: RagChunk[] }) {
  if (chunks.length === 0) return null;
  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50/70">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-600">
        <span className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-slate-400" />
          검색된 청크 {chunks.length}개 (BM25 점수)
        </span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="space-y-2 border-t border-slate-200 p-3">
        {chunks.map((c) => (
          <li key={c.chunk_id} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                  {c.doc_id}
                </span>
                <span className="truncate font-medium text-slate-700">{c.title}</span>
              </span>
              <span className="shrink-0 font-mono text-[11px] text-slate-400">{c.score.toFixed(2)}</span>
            </div>
            {c.heading && <p className="mt-1 truncate text-[11px] text-slate-400">{c.heading}</p>}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function RagAssistant() {
  const [health, setHealth] = useState<RagHealth | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [checking, setChecking] = useState(true);
  const [question, setQuestion] = useState('');
  const [askedQuestion, setAskedQuestion] = useState<string | null>(null);
  const [result, setResult] = useState<RagResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const checkHealth = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as RagHealth;
      setHealth(data);
      setHealthError(false);
    } catch {
      setHealth(null);
      setHealthError(true);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  const ask = async (raw: string) => {
    const q = raw.trim();
    if (!q || loading) return;
    setLoading(true);
    setRequestError(null);
    setAskedQuestion(q);
    setResult(null);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json()) as RagResponse;
      setResult(data);
      if (data.status === 'unavailable' || data.status === 'error') void checkHealth();
    } catch {
      setRequestError('API 서버에 연결할 수 없습니다. `python -m rag.server`가 실행 중인지 확인하세요.');
      void checkHealth();
    } finally {
      setLoading(false);
    }
  };

  const ready = !!health && health.corpus_ready;
  const badge: { text: string; tone: Tone } = checking
    ? { text: '서버 확인 중…', tone: 'slate' }
    : healthError
      ? { text: 'API 서버 미실행', tone: 'red' }
      : !health?.corpus_ready
        ? { text: '코퍼스 없음', tone: 'red' }
        : !health.has_api_key
          ? { text: 'API 키 미설정', tone: 'amber' }
          : { text: `준비 완료 · ${health.chunks}청크`, tone: 'emerald' };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-red-600" />
          <h2 className="text-lg font-bold text-slate-800">Red Hat 공식문서 RAG 어시스턴트</h2>
          <span className="hidden rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 sm:inline">
            근거 인용 · 가드레일
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-md border px-2 py-1 text-xs font-bold ${TONES[badge.tone]}`}>{badge.text}</span>
          <button
            onClick={() => void checkHealth()}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
            title="서버 상태 다시 확인"
            aria-label="서버 상태 다시 확인"
          >
            <RotateCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4 md:p-6">
        {/* 서버·키 상태 안내 */}
        {healthError && (
          <div className={`rounded-xl border p-4 text-sm ${TONES.red}`}>
            <p className="flex items-center gap-2 font-bold">
              <ServerCrash className="h-4 w-4" />
              RAG API 서버에 연결할 수 없습니다
            </p>
            <p className="mt-1 text-red-700/90">
              웹은 떠 있지만 백엔드가 꺼져 있습니다. 터미널에서 아래를 실행한 뒤 새로고침하세요.
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-white/70 px-3 py-2 font-mono text-[12px] text-slate-700">
              {'.venv/bin/python -m rag.server   # http://localhost:8000'}
            </pre>
          </div>
        )}

        {!healthError && health && !health.corpus_ready && (
          <div className={`rounded-xl border p-4 text-sm ${TONES.red}`}>
            <p className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4" />
              코퍼스가 없습니다
            </p>
            <p className="mt-1">공식문서를 먼저 수집해야 검색이 됩니다.</p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-white/70 px-3 py-2 font-mono text-[12px] text-slate-700">
              {'.venv/bin/python -m rag.build_corpus'}
            </pre>
            {health.detail && <p className="mt-2 text-[11px] opacity-70">{health.detail}</p>}
          </div>
        )}

        {!healthError && health && health.corpus_ready && !health.has_api_key && (
          <div className={`rounded-xl border p-4 text-sm ${TONES.amber}`}>
            <p className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4" />
              ANTHROPIC_API_KEY가 없습니다
            </p>
            <p className="mt-1">
              검색과 가드레일 거절은 그대로 동작하지만, 답변 문장을 생성하려면 키가 필요합니다. 키를 넣고 서버를 다시
              띄우세요.
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-white/70 px-3 py-2 font-mono text-[12px] text-slate-700">
              {'export ANTHROPIC_API_KEY=sk-ant-...\n.venv/bin/python -m rag.server'}
            </pre>
          </div>
        )}

        {/* 질문 입력 */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
          className="space-y-2"
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <textarea
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void ask(question);
                }
              }}
              rows={2}
              placeholder="예) RHEL 8 지원 종료는 언제인가요?  (Enter로 질문, Shift+Enter로 줄바꿈)"
              className="min-h-[52px] flex-1 resize-y rounded-xl border-2 border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-red-400"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {loading ? '검색·생성 중' : '질문'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
              <Sparkles className="h-3.5 w-3.5" />
              예시
            </span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.question}
                type="button"
                onClick={() => {
                  setQuestion(ex.question);
                  inputRef.current?.focus();
                  void ask(ex.question);
                }}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <span className={`rounded px-1 text-[10px] font-bold ${TONES[ex.tone]}`}>{ex.tag}</span>
                {ex.question}
              </button>
            ))}
          </div>
        </form>

        {requestError && (
          <div className={`rounded-xl border p-3 text-sm ${TONES.red}`}>{requestError}</div>
        )}

        {/* 결과 */}
        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const meta = STATUS_META[result.status] ?? STATUS_META.error;
                const Icon = meta.Icon;
                return (
                  <span className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${TONES[meta.tone]}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </span>
                );
              })()}
              {result.reason && (
                <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-500">
                  {result.reason}
                </span>
              )}
              {typeof result.top_score === 'number' && result.top_score > 0 && (
                <span className="text-[11px] text-slate-400">최고 검색점수 {result.top_score.toFixed(2)}</span>
              )}
            </div>

            {askedQuestion && <p className="text-sm font-semibold text-slate-700">Q. {askedQuestion}</p>}

            {result.status === 'answered' && result.answer && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                <AnswerText text={result.answer} />
              </div>
            )}

            {result.status !== 'answered' && (result.reason || result.message) && (
              <div className={`rounded-xl border p-4 text-sm ${TONES[STATUS_META[result.status]?.tone ?? 'red']}`}>
                <p>{REASON_LABELS[result.reason ?? ''] ?? result.message ?? REASON_LABELS.bad_request}</p>
                {result.reason && REASON_LABELS[result.reason] && result.message && result.message !== REASON_LABELS[result.reason] && (
                  <p className="mt-2 text-[12px] opacity-80">{result.message}</p>
                )}
              </div>
            )}

            {/* 인용된 출처 */}
            {(result.sources ?? []).filter((s) => s.cited).length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500">인용 출처</span>
                {(result.sources ?? [])
                  .filter((s) => s.cited)
                  .map((s) => (
                    <a
                      key={s.doc_id}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      <span className="font-mono">[{s.doc_id}]</span>
                      <span className="max-w-[16rem] truncate">{s.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ))}
              </div>
            )}

            {(result.fabricated_citations?.length ?? 0) > 0 && (
              <p className="text-[12px] text-amber-700">
                근거에 없는 인용 {result.fabricated_citations?.join(', ')} 은(는) 답변에서 제거했습니다.
              </p>
            )}

            <ChunkList chunks={result.retrieved ?? []} />
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-slate-400">
          Red Hat 공식문서(access.redhat.com, redhat.com) 14개 페이지만 근거로 답합니다. 모든 문장에 출처{' '}
          <span className="font-mono">[doc_id]</span>가 붙고, 가격·견적·특정 고객 계약은 답하지 않습니다. 최종 판단은
          공식 자료와 담당 조직의 검토를 거쳐 주세요.
        </p>

        {!ready && !healthError && !checking && (
          <p className="text-[11px] text-slate-400">서버 상태를 확인한 뒤 다시 질문해 주세요.</p>
        )}
      </div>
    </section>
  );
}
