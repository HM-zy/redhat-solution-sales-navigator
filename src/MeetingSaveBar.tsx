import { useEffect, useState } from 'react';
import { Building2, CalendarDays, FileSpreadsheet, FolderOpen, FilePlus2, Save, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  fileAccessSupported,
  loadSavedHandle,
  pickExistingFile,
  pickNewFile,
  rememberHandle,
  saveRecord,
  type MeetingRecord
} from './excelLog';

interface Props {
  customer: string;
  onCustomerChange: (v: string) => void;
  meetingDate: string;
  onMeetingDateChange: (v: string) => void;
  memo: string;
  onMemoChange: (v: string) => void;
  answeredCount: number;
  buildRecord: () => MeetingRecord;
}

type Status = { kind: 'ok' | 'error'; text: string } | null;

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

const inputClass =
  'w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white';

export default function MeetingSaveBar(props: Props) {
  const { customer, meetingDate, memo, answeredCount } = props;
  const supported = fileAccessSupported();
  const [handle, setHandle] = useState<FileSystemFileHandle | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (supported) loadSavedHandle().then(setHandle);
  }, [supported]);

  const choose = async (pick: () => Promise<FileSystemFileHandle>) => {
    try {
      const h = await pick();
      setHandle(h);
      await rememberHandle(h);
      setStatus(null);
    } catch (e) {
      if (!isAbort(e)) setStatus({ kind: 'error', text: '파일을 열지 못했습니다.' });
    }
  };

  const save = async () => {
    if (!handle) return;
    setSaving(true);
    setStatus(null);
    try {
      const row = await saveRecord(handle, props.buildRecord());
      setStatus({ kind: 'ok', text: `${handle.name} ${row}행에 저장했습니다.` });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') {
        setHandle(null);
        await rememberHandle(null);
        setStatus({ kind: 'error', text: '엑셀 파일을 찾을 수 없습니다. 옮겼거나 지웠다면 파일을 다시 선택해 주세요.' });
      } else if (!isAbort(e)) {
        setStatus({ kind: 'error', text: e instanceof Error ? e.message : '저장에 실패했습니다.' });
      }
    } finally {
      setSaving(false);
    }
  };

  const canSave = !!handle && customer.trim() !== '' && answeredCount > 0 && !saving;
  const saveHint = !customer.trim() ? '고객사명을 입력해 주세요' : answeredCount === 0 ? '체크리스트를 먼저 입력해 주세요' : '';

  return (
    <section className="max-w-7xl w-full mx-auto px-4 md:px-6 pt-4 md:pt-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_3fr] gap-3">
          <label className="block">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1">
              <Building2 className="w-3.5 h-3.5" /> 고객사명 <span className="text-red-600">*</span>
            </span>
            <input
              value={customer}
              onChange={(e) => props.onCustomerChange(e.target.value)}
              placeholder="예: OO은행"
              maxLength={100}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1">
              <CalendarDays className="w-3.5 h-3.5" /> 미팅 날짜
            </span>
            <input type="date" value={meetingDate} onChange={(e) => props.onMeetingDateChange(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600 mb-1 block">메모</span>
            <input
              value={memo}
              onChange={(e) => props.onMemoChange(e.target.value)}
              placeholder="다음 액션, 참석자 등"
              maxLength={1000}
              className={inputClass}
            />
          </label>
        </div>

        {!supported ? (
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            엑셀 저장은 Chrome 또는 Edge에서만 사용할 수 있습니다.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {handle ? (
              <>
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> {handle.name}
                </span>
                <button onClick={() => choose(pickExistingFile)} className="text-xs text-slate-500 hover:text-slate-800 underline">
                  파일 변경
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-slate-500">저장할 엑셀 파일:</span>
                <button
                  onClick={() => choose(pickExistingFile)}
                  className="flex items-center gap-1.5 text-sm font-medium border-2 border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-lg"
                >
                  <FolderOpen className="w-4 h-4" /> 기존 파일 열기
                </button>
                <button
                  onClick={() => choose(pickNewFile)}
                  className="flex items-center gap-1.5 text-sm font-medium border-2 border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-lg"
                >
                  <FilePlus2 className="w-4 h-4" /> 새 파일 만들기
                </button>
              </>
            )}

            <button
              onClick={save}
              disabled={!canSave}
              title={saveHint}
              className="ml-auto flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              엑셀에 저장
            </button>
          </div>
        )}

        {status && (
          <p className={`text-sm flex items-center gap-1.5 ${status.kind === 'ok' ? 'text-emerald-700' : 'text-amber-700'}`}>
            {status.kind === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {status.text}
          </p>
        )}
        {supported && handle && (
          <p className="text-xs text-slate-400">엑셀에서 이 파일을 연 채로 저장하면, 엑셀에서 다시 저장할 때 새로 추가한 행이 덮어써질 수 있습니다. 파일을 닫고 저장해 주세요.</p>
        )}
      </div>
    </section>
  );
}
