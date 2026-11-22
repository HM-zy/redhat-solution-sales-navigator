import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { appendToXlsx, COLUMNS, LOG_SHEET, QUESTION_COLUMNS, type MeetingRecord } from './excelLog';

const answers = Object.fromEntries(QUESTION_COLUMNS.map((q) => [q, ''])) as MeetingRecord['answers'];
const REC: MeetingRecord = {
  customer: ' 테스트고객 ',
  meetingDate: '2026-11-20',
  memo: '',
  answers: { ...answers, 'RHEL 서버 규모': '50대 이상', '가장 오래된 RHEL 버전': 'RHEL 7 이하' },
  recommendations: [
    { type: 'Upselling', solution: 'RHEL ELS 애드온' },
    { type: 'Cross-selling', solution: 'Ansible Automation Platform' }
  ]
};
const NOW = new Date(2026, 10, 20, 9, 5);

async function rows(buffer: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet(LOG_SHEET) ?? wb.worksheets[0];
  const out: unknown[][] = [];
  ws.eachRow((row) => out.push((row.values as unknown[]).slice(1)));
  return out;
}

describe('appendToXlsx', () => {
  it('creates a workbook with headers when the file is empty', async () => {
    const { buffer, row } = await appendToXlsx(new ArrayBuffer(0), REC, NOW);
    const r = await rows(buffer);
    expect(row).toBe(2);
    expect(r[0]).toEqual(COLUMNS);
    const rec = Object.fromEntries(COLUMNS.map((c, i) => [c, r[1][i]]));
    expect(rec['저장 일시']).toBe('2026-11-20 09:05');
    expect(rec['고객사명']).toBe('테스트고객');
    expect(rec['RHEL 서버 규모']).toBe('50대 이상');
    expect(rec['Upsell 수']).toBe(1);
    expect(rec['Cross-sell 수']).toBe(1);
    expect(rec['추천 솔루션']).toContain('[Cross-selling] Ansible Automation Platform');
  });

  it('appends below existing rows', async () => {
    const first = await appendToXlsx(new ArrayBuffer(0), REC, NOW);
    const second = await appendToXlsx(first.buffer, { ...REC, customer: '두번째' }, NOW);
    expect(second.row).toBe(3);
    const r = await rows(second.buffer);
    expect(r.map((x) => x[1])).toEqual(['고객사명', '테스트고객', '두번째']);
  });

  it('keeps old rows and adds missing columns on the right', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(LOG_SHEET);
    ws.addRow(['저장 일시', '고객사명']);
    ws.addRow(['2026-01-01 10:00', '예전고객']);
    const old = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

    const { buffer } = await appendToXlsx(old, REC, NOW);
    const r = await rows(buffer);
    expect(r[0].slice(0, 2)).toEqual(['저장 일시', '고객사명']);
    expect(new Set(r[0])).toEqual(new Set(COLUMNS));
    expect(r[1][1]).toBe('예전고객');
    expect(r[2][1]).toBe('테스트고객');
  });

  it('stores formula-looking text as text', async () => {
    const { buffer } = await appendToXlsx(new ArrayBuffer(0), { ...REC, customer: '=1+1' }, NOW);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets[0].getCell(2, 2).value).toBe('=1+1');
  });

  it('requires a customer name', async () => {
    await expect(appendToXlsx(new ArrayBuffer(0), { ...REC, customer: '  ' }, NOW)).rejects.toThrow('고객사명');
  });

  it('rejects a file that is not xlsx', async () => {
    const junk = new TextEncoder().encode('not a spreadsheet').buffer as ArrayBuffer;
    await expect(appendToXlsx(junk, REC, NOW)).rejects.toThrow('읽지 못했습니다');
  });
});
