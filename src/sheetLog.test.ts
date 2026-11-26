import scriptSource from '../apps-script/Code.gs?raw';
import { describe, expect, it, vi } from 'vitest';
import { columnsFor, type MeetingRecord } from './excelLog';
import { HEALTH_COLUMNS, HEALTH_SHEET } from './healthCheck';
import { checkSheet, isSheetUrl, saveToSheet, sheetPayload } from './sheetLog';

const COLUMNS = columnsFor(HEALTH_COLUMNS);
const answers: Record<string, string> = {};
const REC: MeetingRecord = {
  sheet: HEALTH_SHEET,
  questionColumns: HEALTH_COLUMNS,
  customer: '테스트고객',
  meetingDate: '2026-11-25',
  memo: '',
  answers: { ...answers, '가장 오래된 RHEL 버전': '없음' },
  recommendations: [{ type: 'Cross-selling', solution: 'Ansible Automation Platform' }]
};
const URL = 'https://script.google.com/macros/s/AKfycbx-abc_123/exec';

// --- Apps Script (apps-script/Code.gs) 를 가짜 SpreadsheetApp 위에서 돌린다 ---

function fakeSheet(initial: unknown[][] = []) {
  const grid = initial.map((r) => [...r]);
  const lastRow = () => grid.length;
  const lastCol = () => Math.max(0, ...grid.map((r) => r.length));
  const sheet = {
    grid,
    getLastRow: lastRow,
    getLastColumn: lastCol,
    getRange: (row: number, col: number, _nr: number, nc: number) => {
      const range = {
        col,
        getValues: () => [Array.from({ length: nc }, (_, i) => grid[row - 1]?.[col - 1 + i] ?? '')],
        setValues: (v: unknown[][]) => {
          while (grid.length < row) grid.push([]);
          v[0].forEach((x, i) => (grid[row - 1][col - 1 + i] = x));
          return range;
        },
        setFontWeight: () => range,
        setFontColor: () => range,
        setBackground: () => range
      };
      return range;
    },
    // Apps Script와 같이: from 열 하나를 dest(1부터, 그 앞) 위치로 옮긴다
    moveColumns: (range: { col: number }, dest: number) => {
      for (const row of grid) {
        while (row.length < lastCol()) row.push('');
        const [cell] = row.splice(range.col - 1, 1);
        row.splice(dest - 1 > range.col - 1 ? dest - 2 : dest - 1, 0, cell);
      }
    },
    setFrozenRows: () => {},
    setFrozenColumns: () => {}
  };
  return sheet;
}

function runScript(sheet: ReturnType<typeof fakeSheet> | null, body: string, email = 'me@example.com') {
  const sheets: Record<string, ReturnType<typeof fakeSheet>> = sheet ? { [HEALTH_SHEET]: sheet } : {};
  const created: ReturnType<typeof fakeSheet>[] = [];
  const ss = {
    getName: () => '미팅 기록 시트',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/x',
    getSheetByName: (name: string) => sheets[name] ?? null,
    insertSheet: (name: string) => {
      const s = fakeSheet();
      sheets[name] = s;
      created.push(s);
      return s;
    }
  };
  const ctx: Record<string, unknown> = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    Session: { getActiveUser: () => ({ getEmail: () => email }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text: string) => ({ text, setMimeType: () => ({ text }) })
    }
  };
  const fns = new Function(...Object.keys(ctx), `${scriptSource}\nreturn { doPost, saveRecord };`)(...Object.values(ctx));
  const out = (fns.doPost as (e: unknown) => { text: string })({ postData: { contents: body } });
  return { res: JSON.parse(out.text), sheet: sheet ?? created[0], sheets, saveRecord: fns.saveRecord as (b: unknown) => number };
}

describe('Apps Script doPost', () => {
  it('creates the sheet with headers on first save', () => {
    const { res, sheet } = runScript(null, sheetPayload(REC));
    expect(res).toEqual({ ok: true, row: 2 });
    expect(sheet.grid[0]).toEqual([...COLUMNS, '작성자']);
    const row = Object.fromEntries(sheet.grid[0].map((c, i) => [c, sheet.grid[1][i]]));
    expect(row['작성자']).toBe('me@example.com');
    expect(row['고객사명']).toBe('테스트고객');
    expect(row['가장 오래된 RHEL 버전']).toBe('없음');
    expect(row['Cross-sell 수']).toBe(1);
  });

  it('keeps old columns and adds missing ones on the right', () => {
    const sheet = fakeSheet([['저장 일시', '고객사명', '내가 만든 열'], ['2026-01-01', '예전고객', '메모']]);
    const { res } = runScript(sheet, sheetPayload(REC));
    expect(res.row).toBe(3);
    expect(sheet.grid[0].slice(0, 3)).toEqual(['저장 일시', '고객사명', '내가 만든 열']);
    expect(new Set(sheet.grid[0])).toEqual(new Set([...COLUMNS, '작성자', '내가 만든 열']));
    expect(sheet.grid[1][1]).toBe('예전고객');
    expect(sheet.grid[2][1]).toBe('테스트고객');
    expect(sheet.grid[2][2]).toBe('');
  });

  it('stores formula-looking text as text', () => {
    const { sheet } = runScript(null, sheetPayload({ ...REC, customer: '=IMPORTXML("x")' }));
    expect(sheet.grid[1][1]).toBe('\'=IMPORTXML("x")');
  });

  it('rejects a missing customer and bad bodies', () => {
    const cells = JSON.parse(sheetPayload(REC));
    cells.cells['고객사명'] = ' ';
    expect(runScript(null, JSON.stringify(cells)).res).toEqual({ ok: false, error: '고객사명을 입력해 주세요.' });
    expect(runScript(null, 'not json').res.ok).toBe(false);
    expect(runScript(null, '{}').res).toEqual({ ok: false, error: '잘못된 요청입니다.' });
  });
});

describe('Apps Script author column', () => {
  it('moves an existing author column, with its data, to the end', () => {
    const sheet = fakeSheet([
      ['저장 일시', '작성자', '고객사명'],
      ['2026-11-25 21:40', 'old@example.com', '예전고객']
    ]);
    runScript(sheet, sheetPayload(REC), 'new@example.com');
    const head = sheet.grid[0];
    expect(head[head.length - 1]).toBe('작성자');
    expect(head.slice(0, 2)).toEqual(['저장 일시', '고객사명']);
    expect(sheet.grid[1][1]).toBe('예전고객');
    expect(sheet.grid[1][head.length - 1]).toBe('old@example.com');
    expect(sheet.grid[2][head.length - 1]).toBe('new@example.com');
    expect(sheet.grid[2][1]).toBe('테스트고객');
  });
});

describe('Apps Script sheet tabs', () => {
  it('writes each page to its own tab and ignores unknown tab names', () => {
    const renewal = JSON.parse(sheetPayload(REC));
    renewal.sheet = '리뉴얼';
    const { sheets } = runScript(null, JSON.stringify(renewal));
    expect(Object.keys(sheets)).toEqual(['리뉴얼']);

    const evil = JSON.parse(sheetPayload(REC));
    evil.sheet = '급여 명세';
    expect(Object.keys(runScript(null, JSON.stringify(evil)).sheets)).toEqual([HEALTH_SHEET]);
  });
});

describe('Apps Script saveRecord (hosted page)', () => {
  it('fills the author from the Google account, not from the request', () => {
    const body = JSON.parse(sheetPayload(REC));
    body.cells['작성자'] = 'fake@example.com';
    const { sheet } = runScript(null, JSON.stringify(body), 'teammate@example.com');
    expect(sheet.grid[1][sheet.grid[0].indexOf('작성자')]).toBe('teammate@example.com');
  });

  it('appends a row and returns its number, and throws on a missing customer', () => {
    const sheet = fakeSheet();
    const { saveRecord } = runScript(sheet, sheetPayload(REC)); // doPost already wrote row 2
    expect(saveRecord(JSON.parse(sheetPayload({ ...REC, customer: '두번째' })))).toBe(3);
    expect(sheet.grid[2][1]).toBe('두번째');
    expect(() => saveRecord(JSON.parse(sheetPayload(REC).replace('테스트고객', ' ')))).toThrow('고객사명');
  });
});

// --- 브라우저 쪽 ---

const reply = (data: unknown) => vi.fn(async () => new Response(JSON.stringify(data)));

describe('sheetLog client', () => {
  it('accepts only Apps Script web app URLs', () => {
    expect(isSheetUrl(URL)).toBe(true);
    expect(isSheetUrl(' https://script.google.com/a/macros/corp.com/s/AKfy/exec ')).toBe(true);
    expect(isSheetUrl('https://script.google.com/macros/s/AKfy/dev')).toBe(false);
    expect(isSheetUrl('https://evil.example.com/macros/s/AKfy/exec')).toBe(false);
  });

  it('posts the record as text/plain and returns the row', async () => {
    const f = reply({ ok: true, row: 7 });
    expect(await saveToSheet(URL, REC, f)).toBe(7);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toMatch(/^text\/plain/);
    expect(JSON.parse(init.body as string).cells['고객사명']).toBe('테스트고객');
  });

  it('surfaces script errors, network errors and non-JSON replies', async () => {
    await expect(saveToSheet(URL, REC, reply({ ok: false, error: '고객사명을 입력해 주세요.' }))).rejects.toThrow('고객사명');
    await expect(saveToSheet(URL, REC, vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))).rejects.toThrow(
      '연결하지 못했습니다'
    );
    await expect(saveToSheet(URL, REC, vi.fn(async () => new Response('<html>login</html>')))).rejects.toThrow('응답을 읽지 못했습니다');
    await expect(saveToSheet(URL, { ...REC, customer: '' }, reply({ ok: true, row: 2 }))).rejects.toThrow('고객사명');
  });

  it('checkSheet confirms it is our script', async () => {
    const ok = reply({ ok: true, app: 'sales-navigator', name: 'S', url: 'u' });
    await checkSheet(URL, ok);
    expect((ok.mock.calls[0] as unknown as [string])[0]).toBe(`${URL}?api=1`);
    expect(await checkSheet(URL, reply({ ok: true, app: 'sales-navigator', name: 'S', url: 'u' }))).toEqual({ name: 'S', url: 'u' });
    await expect(checkSheet(URL, reply({ ok: true }))).rejects.toThrow('Sales Navigator용');
  });
});
