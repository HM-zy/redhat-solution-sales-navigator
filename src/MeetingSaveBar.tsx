import { useEffect, useState } from 'react';
import {
  Building2,
  CalendarDays,
  FileSpreadsheet,
  FolderOpen,
  FilePlus2,
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Sheet,
  Link2,
  Copy,
  ExternalLink
} from 'lucide-react';
import scriptSource from '../apps-script/Code.gs?raw';
import {
  fileAccessSupported,
  loadSavedHandle,
  pickExistingFile,
  pickNewFile,
  rememberHandle,
  saveRecord,
  type MeetingRecord
} from './excelLog';
import {
  checkSheet,
  isSheetUrl,
  loadSaveTarget,
  loadSheetUrl,
  rememberSaveTarget,
  rememberSheetUrl,
  saveToSheet,
  hostedSheetInfo,
  saveHosted,
  type SaveTarget,
  type SheetInfo
} from './sheetLog';

interface Props {
  customer: string;
  onCustomerChange: (v: string) => void;
  meetingDate: string;
  onMeetingDateChange: (v: string) => void;
  memo: string;
  onMemoChange: (v: string) => void;
  answeredCount: number;
  buildRecord: () => MeetingRecord;
  saveButtonClass?: string; // 페이지(헬스체크·리뉴얼)마다 저장 버튼 색을 다르게
}

// npm run build:gas 로 만든 화면은 Apps Script 웹 앱이 직접 띄우고, 같은 구글 시트에 바로 저장한다.
const HOSTED = import.meta.env.MODE === 'gas';

type Status = { kind: 'ok' | 'error'; text: string } | null;

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

const inputClass =
  'w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white';

export default function MeetingSaveBar(props: Props) {
  const { customer, meetingDate, memo, answeredCount } = props;
  const supported = fileAccessSupported();
  const [target, setTarget] = useState<SaveTarget>(loadSaveTarget);
  const [handle, setHandle] = useState<FileSystemFileHandle | null>(null);
  const [sheetUrl, setSheetUrl] = useState(loadSheetUrl);
  const [sheetInfo, setSheetInfo] = useState<SheetInfo | null>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (supported) loadSavedHandle().then(setHandle);
  }, [supported]);

  useEffect(() => {
    if (HOSTED) hostedSheetInfo().then(setSheetInfo, () => setSheetInfo(null));
  }, []);

  useEffect(() => {
    if (HOSTED) return;
    if (sheetUrl) checkSheet(sheetUrl).then(setSheetInfo, () => setSheetInfo(null)); // 시트 이름 표시용, 실패해도 저장은 시도할 수 있다
  }, [sheetUrl]);

  const switchTarget = (t: SaveTarget) => {
    setTarget(t);
    rememberSaveTarget(t);
    setStatus(null);
  };

  const connectSheet = async () => {
    const url = urlDraft.trim();
    if (/docs\.google\.com\/spreadsheets/.test(url)) {
      setStatus({
        kind: 'error',
        text: '이건 시트 주소입니다. 시트의 [확장 프로그램 → Apps Script]에서 웹 앱으로 배포한 뒤 나오는 웹 앱 주소(…/exec)를 넣어 주세요.'
      });
      return;
    }
    if (!isSheetUrl(url)) {
      setStatus({ kind: 'error', text: '웹 앱 주소가 올바르지 않습니다. https://script.google.com/macros/s/.../exec 형태여야 합니다.' });
      return;
    }
    setConnecting(true);
    setStatus(null);
    try {
      const info = await checkSheet(url);
      setSheetInfo(info);
      setSheetUrl(url);
      rememberSheetUrl(url);
      setUrlDraft('');
      setStatus({ kind: 'ok', text: `'${info.name}' 시트에 연결했습니다.` });
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : '연결하지 못했습니다.' });
    } finally {
      setConnecting(false);
    }
  };

  const disconnectSheet = () => {
    setSheetUrl('');
    setSheetInfo(null);
    rememberSheetUrl(null);
    setStatus(null);
  };

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(scriptSource);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatus({ kind: 'error', text: '복사하지 못했습니다. 아래 코드를 직접 선택해서 복사해 주세요.' });
    }
  };

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

  const saveSheet = async () => {
    if (!HOSTED && !sheetUrl) return;
    setSaving(true);
    setStatus(null);
    try {
      const row = HOSTED ? await saveHosted(props.buildRecord()) : await saveToSheet(sheetUrl, props.buildRecord());
      setStatus({ kind: 'ok', text: `${sheetInfo?.name ?? '구글 시트'} ${row}행에 저장했습니다.` });
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : '저장에 실패했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  const saveExcel = async () => {
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

  const saveHint = !customer.trim() ? '고객사명을 입력해 주세요' : answeredCount === 0 ? '체크리스트를 먼저 입력해 주세요' : '';
  const ready = HOSTED || (target === 'sheet' ? !!sheetUrl : !!handle);
  const canSave = ready && customer.trim() !== '' && answeredCount > 0 && !saving;
  const saveButton = (
    <button
      onClick={HOSTED || target === 'sheet' ? saveSheet : saveExcel}
      disabled={!canSave}
      title={saveHint}
      className={`ml-auto flex items-center gap-2 ${props.saveButtonClass ?? 'bg-red-600 hover:bg-red-700'} disabled:bg-slate-300 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-colors`}
    >
      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      {HOSTED || target === 'sheet' ? '구글 시트에 저장' : '엑셀에 저장'}
    </button>
  );
  const tabClass = (t: SaveTarget) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      target === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800'
    }`;

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

        {HOSTED ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
              <Sheet className="w-4 h-4 text-emerald-600" /> {sheetInfo?.name ?? '구글 시트'}
            </span>
            {sheetInfo?.url && (
              <a href={sheetInfo.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 underline">
                시트 열기 <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {sheetInfo?.user && <span className="text-xs text-slate-500">작성자: {sheetInfo.user}</span>}
            {saveButton}
          </div>
        ) : (
          <>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">저장 위치</span>
          <div className="inline-flex bg-slate-100 rounded-xl p-1 gap-1">
            <button onClick={() => switchTarget('sheet')} className={tabClass('sheet')}>
              <Sheet className="w-4 h-4 text-emerald-600" /> 구글 시트
            </button>
            <button onClick={() => switchTarget('excel')} className={tabClass('excel')}>
              <FileSpreadsheet className="w-4 h-4 text-green-700" /> 엑셀 파일
            </button>
          </div>
        </div>

        {target === 'sheet' ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {sheetUrl ? (
                <>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                    <Sheet className="w-4 h-4 text-emerald-600" /> {sheetInfo?.name ?? '구글 시트 연결됨'}
                  </span>
                  {sheetInfo?.url && (
                    <a
                      href={sheetInfo.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 underline"
                    >
                      시트 열기 <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <button onClick={disconnectSheet} className="text-xs text-slate-500 hover:text-slate-800 underline">
                    연결 변경
                  </button>
                </>
              ) : (
                <>
                  <input
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && connectSheet()}
                    placeholder="웹 앱 주소 (https://script.google.com/macros/s/.../exec)"
                    className={`${inputClass} md:max-w-md`}
                  />
                  <button
                    onClick={connectSheet}
                    disabled={!urlDraft.trim() || connecting}
                    className="flex items-center gap-1.5 text-sm font-medium border-2 border-slate-200 hover:border-blue-300 disabled:opacity-50 px-3 py-1.5 rounded-lg"
                  >
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} 연결
                  </button>
                  <button onClick={() => setShowGuide((v) => !v)} className="text-xs text-slate-500 hover:text-slate-800 underline">
                    {showGuide ? '설정 방법 닫기' : '처음이라면: 설정 방법'}
                  </button>
                </>
              )}
              {saveButton}
            </div>

            {!sheetUrl && showGuide && (
              <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                <ol className="list-decimal pl-5 space-y-1">
                  <li>
                    <a href="https://sheets.new" target="_blank" rel="noreferrer" className="text-blue-600 underline">
                      sheets.new
                    </a>
                    에서 새 구글 시트를 만들고 이름을 정합니다 (예: Sales 미팅 기록).
                  </li>
                  <li>시트 메뉴 [확장 프로그램 → Apps Script]를 엽니다.</li>
                  <li>
                    편집기 내용을 지우고 아래 스크립트를 붙여넣은 뒤 저장합니다.{' '}
                    <button onClick={copyScript} className="inline-flex items-center gap-1 text-blue-600 underline">
                      <Copy className="w-3 h-3" /> {copied ? '복사했습니다' : '스크립트 복사'}
                    </button>
                  </li>
                  <li>
                    [배포 → 새 배포 → 유형: 웹 앱]에서 실행 사용자 <b>나</b>, 액세스 권한 <b>모든 사용자</b>로 배포하고 권한을 승인합니다.
                  </li>
                  <li>나온 웹 앱 주소(…/exec)를 위 칸에 붙여넣고 [연결]을 누릅니다.</li>
                </ol>
                <p className="text-xs text-slate-500">
                  웹 앱 주소를 아는 사람은 이 시트에 줄을 추가할 수 있습니다(시트 내용은 읽을 수 없습니다). 주소는 다른 사람과 공유하지 마세요.
                </p>
                <details>
                  <summary className="text-xs text-slate-500 cursor-pointer">스크립트 보기</summary>
                  <pre className="mt-2 text-xs bg-white border border-slate-200 rounded-lg p-2 overflow-auto max-h-60 select-all">{scriptSource}</pre>
                </details>
              </div>
            )}
          </div>
        ) : !supported ? (
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

            {saveButton}
          </div>
        )}

          </>
        )}

        {status && (
          <p className={`text-sm flex items-center gap-1.5 ${status.kind === 'ok' ? 'text-emerald-700' : 'text-amber-700'}`}>
            {status.kind === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {status.text}
          </p>
        )}
        {!HOSTED && target === 'excel' && supported && handle && (
          <p className="text-xs text-slate-400">엑셀에서 이 파일을 연 채로 저장하면, 엑셀에서 다시 저장할 때 새로 추가한 행이 덮어써질 수 있습니다. 파일을 닫고 저장해 주세요.</p>
        )}
      </div>
    </section>
  );
}
