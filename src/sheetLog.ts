// 미팅 기록을 구글 시트에 한 줄씩 추가한다. 시트에 붙인 Apps Script 웹 앱(apps-script/Code.gs)으로 보낸다.
// 서버를 따로 두지 않고, 파일(file://)로 연 HTML에서도 동작한다.
import { columnsFor, toCells, type MeetingRecord } from './excelLog';

const URL_RE = /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/;
export const isSheetUrl = (url: string) => URL_RE.test(url.trim());

export interface SheetInfo {
  name: string;
  url: string;
  user?: string; // Apps Script 웹 앱에서 저장할 때 '작성자'로 들어갈 이메일
}

type Fetch = typeof fetch;

const NETWORK_ERROR =
  '구글 시트에 연결하지 못했습니다. 인터넷 연결을 확인하고, 웹 앱 배포의 액세스 권한이 "모든 사용자"인지 확인해 주세요. 회사 방화벽이 Google을 막고 있을 수도 있습니다.';

async function call(url: string, init: RequestInit, fetchImpl: Fetch): Promise<Record<string, unknown>> {
  if (!isSheetUrl(url.replace(/\?api=1$/, ''))) throw new Error('웹 앱 주소가 올바르지 않습니다. https://script.google.com/macros/s/.../exec 형태여야 합니다.');
  let res: Response;
  try {
    res = await fetchImpl(url.trim(), { ...init, redirect: 'follow' });
  } catch {
    throw new Error(NETWORK_ERROR);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('구글 시트 응답을 읽지 못했습니다. 웹 앱 배포의 액세스 권한이 "모든 사용자"인지 확인해 주세요.');
  }
  if (!data || typeof data !== 'object') throw new Error('구글 시트 응답이 올바르지 않습니다.');
  const obj = data as Record<string, unknown>;
  if (obj.ok !== true) throw new Error(typeof obj.error === 'string' ? obj.error : '구글 시트 저장에 실패했습니다.');
  return obj;
}

/** 배포 주소가 우리 스크립트인지 확인하고 시트 이름과 주소를 돌려준다. */
export async function checkSheet(url: string, fetchImpl: Fetch = fetch): Promise<SheetInfo> {
  const data = await call(`${url.trim()}?api=1`, { method: 'GET' }, fetchImpl);
  if (data.app !== 'sales-navigator') throw new Error('Sales Navigator용 스크립트가 아닙니다. 붙여넣은 코드를 확인해 주세요.');
  return { name: String(data.name ?? '구글 시트'), url: String(data.url ?? '') };
}

export function sheetPayload(rec: MeetingRecord, now?: Date): string {
  return JSON.stringify({ sheet: rec.sheet, columns: columnsFor(rec.questionColumns), cells: toCells(rec, now) });
}

/** 기록을 추가하고 시트의 행 번호를 돌려준다. */
export async function saveToSheet(url: string, rec: MeetingRecord, fetchImpl: Fetch = fetch): Promise<number> {
  const body = sheetPayload(rec); // 고객사명이 비어 있으면 여기서 막는다
  // text/plain 이면 브라우저가 사전 요청(CORS preflight)을 보내지 않는다. Apps Script는 사전 요청을 받지 못한다.
  const data = await call(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body }, fetchImpl);
  return Number(data.row);
}

// --- Apps Script가 이 화면을 직접 띄운 경우 (npm run build:gas). google.script.run 으로 시트에 바로 쓴다 ---

interface ScriptRunner {
  withSuccessHandler(fn: (v: unknown) => void): ScriptRunner;
  withFailureHandler(fn: (e: Error) => void): ScriptRunner;
  saveRecord(body: unknown): void;
  getSheetInfo(): void;
}
const runner = (): ScriptRunner => (window as unknown as { google: { script: { run: ScriptRunner } } }).google.script.run;

function run<T>(call: (r: ScriptRunner) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      call(
        runner()
          .withSuccessHandler((v) => resolve(v as T))
          .withFailureHandler((e) => reject(new Error(e?.message || '구글 시트 저장에 실패했습니다.')))
      );
    } catch {
      reject(new Error('Apps Script 웹 앱 안에서만 저장할 수 있습니다.'));
    }
  });
}

export const hostedSheetInfo = () => run<SheetInfo>((r) => r.getSheetInfo());

export async function saveHosted(rec: MeetingRecord): Promise<number> {
  const body = JSON.parse(sheetPayload(rec));
  return Number(await run<number>((r) => r.saveRecord(body)));
}

// --- 설정 기억 (이 브라우저에만 저장) ---

const KEY_URL = 'sales-navigator.sheet-url';
const KEY_TARGET = 'sales-navigator.save-target';
export type SaveTarget = 'sheet' | 'excel';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 기억하지 못해도 이번에는 계속 쓸 수 있다
  }
}

export const loadSheetUrl = () => read(KEY_URL) ?? '';
export const rememberSheetUrl = (url: string | null) => write(KEY_URL, url);
export const loadSaveTarget = (): SaveTarget => (read(KEY_TARGET) === 'excel' ? 'excel' : 'sheet');
export const rememberSaveTarget = (t: SaveTarget) => write(KEY_TARGET, t);
