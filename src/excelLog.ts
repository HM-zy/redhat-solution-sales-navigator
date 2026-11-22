// 미팅 기록을 엑셀 파일 한 개에 한 줄씩 추가한다. 서버 없이 브라우저에서만 동작한다.
// 파일 접근은 File System Access API (Chrome·Edge 전용), 엑셀 읽기·쓰기는 exceljs.
import type { Workbook, Worksheet } from 'exceljs';

export const LOG_SHEET = '미팅 기록';

// 체크리스트 질문 열 (네비게이터 질문 순서). 값은 화면에 보이는 버튼 문구 그대로 저장한다.
export const QUESTION_COLUMNS = [
  'RHEL 서버 규모',
  '가장 오래된 RHEL 버전',
  '보유 Red Hat 제품',
  '패치·보안 수작업 부담',
  '반복 작업 처리 방식',
  '컨테이너/K8s 현황',
  '상용 가상화 대안 검토',
  '구독 갱신 12개월 이내'
] as const;
export type QuestionColumn = (typeof QUESTION_COLUMNS)[number];

export const COLUMNS = [
  '저장 일시',
  '고객사명',
  '미팅 날짜',
  ...QUESTION_COLUMNS,
  '추천 솔루션',
  'Upsell 수',
  'Cross-sell 수',
  '메모'
];
const WIDTHS: Record<string, number> = { '저장 일시': 18, 고객사명: 22, '미팅 날짜': 12, '추천 솔루션': 60, 메모: 40 };
const WRAP = new Set(['추천 솔루션', '메모']);

export interface MeetingRecord {
  customer: string;
  meetingDate: string;
  memo: string;
  answers: Record<QuestionColumn, string>;
  recommendations: { type: 'Upselling' | 'Cross-selling'; solution: string }[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function toCells(rec: MeetingRecord, now: Date = new Date()): Record<string, string | number> {
  const customer = rec.customer.trim();
  if (!customer) throw new Error('고객사명을 입력해 주세요.');
  return {
    '저장 일시': stamp(now),
    고객사명: customer,
    '미팅 날짜': rec.meetingDate,
    ...rec.answers,
    '추천 솔루션': rec.recommendations.map((r) => `[${r.type}] ${r.solution}`).join('\n'),
    'Upsell 수': rec.recommendations.filter((r) => r.type === 'Upselling').length,
    'Cross-sell 수': rec.recommendations.filter((r) => r.type === 'Cross-selling').length,
    메모: rec.memo.trim()
  };
}

function styleHeader(ws: Worksheet, header: string[]) {
  header.forEach((name, i) => {
    const cell = ws.getCell(1, i + 1);
    cell.value = name;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCC0000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    const col = ws.getColumn(i + 1);
    if (!col.width) col.width = WIDTHS[name] ?? 16;
  });
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }]; // 머리글과 저장 일시·고객사명 고정
}

/** 시트를 찾거나 만들고, 머리글에 없는 열은 오른쪽에 붙인 뒤 한 줄을 추가한다. 추가한 행 번호를 돌려준다. */
export function appendRecord(wb: Workbook, cells: Record<string, string | number>): number {
  const ws = wb.getWorksheet(LOG_SHEET) ?? wb.worksheets[0] ?? wb.addWorksheet(LOG_SHEET);

  const header: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    header[col - 1] = cell.value == null ? '' : String(cell.value);
  });
  for (const name of COLUMNS) if (!header.includes(name)) header.push(name);
  styleHeader(ws, header);

  let last = 1;
  ws.eachRow((_, n) => (last = Math.max(last, n))); // 값이 있는 마지막 행
  const r = last + 1;
  header.forEach((name, i) => {
    if (!(name in cells)) return;
    const cell = ws.getCell(r, i + 1);
    cell.value = cells[name];
    cell.alignment = { vertical: 'top', wrapText: WRAP.has(name) };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };
  return r;
}

async function loadExcelJS() {
  return (await import('exceljs')).default; // 저장할 때만 불러온다 (번들이 크다)
}

/** 엑셀 파일 내용(비어 있으면 새 통합 문서)에 기록을 추가하고, 새 파일 내용과 행 번호를 돌려준다. */
export async function appendToXlsx(
  data: ArrayBuffer,
  rec: MeetingRecord,
  now?: Date
): Promise<{ buffer: ArrayBuffer; row: number }> {
  const cells = toCells(rec, now);
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  if (data.byteLength > 0) {
    try {
      await wb.xlsx.load(data);
    } catch {
      throw new Error('엑셀 파일(.xlsx)을 읽지 못했습니다. 다른 파일을 선택해 주세요.');
    }
  }
  const row = appendRecord(wb, cells);
  const out = await wb.xlsx.writeBuffer();
  return { buffer: out as ArrayBuffer, row };
}

// --- 파일 핸들: 한 번 고른 파일을 IndexedDB에 기억해 다음에도 같은 파일에 쓴다 ---

interface PermissionHandle extends FileSystemFileHandle {
  queryPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>;
}
interface PickerWindow extends Window {
  showOpenFilePicker(opts: object): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(opts: object): Promise<FileSystemFileHandle>;
}

export const fileAccessSupported = () => typeof window !== 'undefined' && 'showSaveFilePicker' in window;

const XLSX_TYPES = [
  {
    description: '엑셀 파일',
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
  }
];

export async function pickExistingFile(): Promise<FileSystemFileHandle> {
  const [handle] = await (window as unknown as PickerWindow).showOpenFilePicker({ types: XLSX_TYPES, multiple: false });
  return handle;
}

export async function pickNewFile(): Promise<FileSystemFileHandle> {
  return (window as unknown as PickerWindow).showSaveFilePicker({ types: XLSX_TYPES, suggestedName: 'sales-log.xlsx' });
}

const DB = 'sales-navigator';
const STORE = 'handles';
const KEY = 'excel-log';

function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

export async function loadSavedHandle(): Promise<FileSystemFileHandle | null> {
  try {
    return (await withStore<FileSystemFileHandle | undefined>('readonly', (s) => s.get(KEY))) ?? null;
  } catch {
    return null;
  }
}

export async function rememberHandle(handle: FileSystemFileHandle | null): Promise<void> {
  try {
    await withStore<unknown>('readwrite', (s) => (handle ? s.put(handle, KEY) : s.delete(KEY)) as IDBRequest<unknown>);
  } catch {
    // 기억하지 못해도 이번 세션에서는 계속 쓸 수 있다
  }
}

/** 버튼 클릭 안에서 호출해야 한다 (권한 요청은 사용자 동작이 필요). */
export async function saveRecord(handle: FileSystemFileHandle, rec: MeetingRecord): Promise<number> {
  const h = handle as PermissionHandle;
  if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') {
    throw new Error('엑셀 파일에 쓸 권한이 없습니다. 권한을 허용해 주세요.');
  }
  const file = await handle.getFile();
  const { buffer, row } = await appendToXlsx(await file.arrayBuffer(), rec);
  const writable = await handle.createWritable();
  await writable.write(buffer);
  await writable.close(); // 임시 파일에 쓴 뒤 닫을 때 원본과 바꿔 끼운다
  return row;
}
