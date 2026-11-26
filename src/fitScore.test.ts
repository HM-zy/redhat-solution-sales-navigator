import { describe, expect, it } from 'vitest';
import { BRIEFS } from './briefs';
import { recommendHealth, scoreHealth, gradeText, type HealthAnswers } from './healthCheck';

const none = { satellite: false, aap: false, openshift: false, premium: false };
const all = { satellite: true, aap: true, openshift: true, premium: true };
const blank: HealthAnswers = { scale: '', version: '', owns: none, patch: '', automation: '', container: '', virt: '' };
const hot: HealthAnswers = { scale: '20+', version: 'v7', owns: none, patch: 'heavy', automation: 'manual', container: 'self', virt: 'plan' };

describe('Technical Fit 점수', () => {
  it('미응답이면 0점, 잠정', () => {
    expect(scoreHealth(blank)).toMatchObject({ total: 0, provisional: true, answered: 0, of: 6 });
  });

  it('여지가 가장 큰 대규모 고객은 100점 High 확정', () => {
    expect(scoreHealth(hot)).toMatchObject({ total: 100, grade: 'High', provisional: false, complete: true });
  });

  it('서버 5대 미만은 신호가 다 있어도 최대 60점 Medium', () => {
    const s = scoreHealth({ ...hot, scale: '<5' });
    expect(s).toMatchObject({ total: 60, grade: 'Medium' });
  });

  it('보유 제품은 점수를 바꾸지 않는다', () => {
    expect(scoreHealth({ ...hot, owns: all }).total).toBe(scoreHealth(hot).total);
  });

  it('OpenShift·AAP 보유 대형 VMware 전환 고객이 낮게 깔리지 않는다', () => {
    const s = scoreHealth({ scale: '20+', version: 'v9', owns: all, patch: 'none', automation: 'done', container: 'self', virt: 'plan' });
    // (5 + 2 + 25 + 20) / 100
    expect(s).toMatchObject({ total: 52, grade: 'Medium' });
  });

  it('답한 항목만으로 환산하고, 5개 미만이면 잠정', () => {
    const s = scoreHealth({ ...blank, scale: '20+', version: 'v7', virt: 'plan' });
    expect(s).toMatchObject({ total: 100, grade: 'High', provisional: true, answered: 3 });
    expect(gradeText(s)).toBe('High (우선 공략) · 잠정 (응답 3/6)');
  });

  it('패치·자동화 중 하나만 답하면 답한 쪽만 만점에 넣는다', () => {
    const s = scoreHealth({ ...blank, patch: 'heavy' });
    expect(s.items[1]).toMatchObject({ points: 12, max: 12, answered: true });
    expect(s.total).toBe(100);
  });

  it('3단계 답은 정도에 따라 점수를 나눈다', () => {
    const base: HealthAnswers = { ...hot, patch: 'some', virt: 'review' };
    const s = scoreHealth(base);
    expect(s.items[1].points).toBe(3 + 18);
    expect(s.items[3].points).toBe(10);
    expect(s.total).toBe(25 + 21 + 25 + 10);
  });

  it('Net-new: RHEL이 없으면 지금 쓰는 OS로 신규 도입 여지를 본다', () => {
    const base: HealthAnswers = { ...hot, version: 'none' };
    expect(scoreHealth(base).items[0]).toMatchObject({ label: 'RHEL 신규 도입 (Net-new)', answered: false });
    expect(scoreHealth(base).answered).toBe(5); // 현재 OS를 안 고르면 버전 질문은 미응답
    const centos = scoreHealth({ ...base, currentOs: 'rhel-like' });
    expect(centos.items[0].points).toBe(25);
    expect(centos).toMatchObject({ total: 100, grade: 'High', complete: true });
    expect(scoreHealth({ ...base, currentOs: 'other-linux' }).items[0].points).toBe(18);
    expect(scoreHealth({ ...base, currentOs: 'windows' }).items[0].points).toBe(6);
  });

  it('최신 RHEL·자동화 완료·컨테이너 계획 없음은 Low', () => {
    const s = scoreHealth({ scale: '5-20', version: 'v9', owns: none, patch: 'none', automation: 'done', container: 'none', virt: 'no' });
    expect(s).toMatchObject({ total: Math.round(7 * 0.85), grade: 'Low' });
  });
});

describe('Net-new 추천 분류', () => {
  const none = { satellite: false, aap: false, openshift: false, premium: false };
  const netNew: HealthAnswers = {
    scale: '<5', version: 'none', currentOs: 'other-linux', owns: none,
    patch: 'some', automation: 'manual', container: 'plan', virt: 'review'
  };

  it('Red Hat 제품이 전혀 없으면 모든 추천이 Net-new', () => {
    const recs = recommendHealth({ ...netNew, scale: '20+' });
    expect(recs.length).toBeGreaterThan(2);
    expect(new Set(recs.map((r) => r.type))).toEqual(new Set(['Net-new']));
  });

  it('RHEL이 없으면 Smart Management를 따로 내지 않고 RHEL 도입에 묶는다', () => {
    const recs = recommendHealth(netNew);
    expect(recs.find((r) => r.id === 'rec-smart-mgmt')).toBeUndefined();
    const rhel = recs.find((r) => r.id === 'rec-netnew-other')!;
    expect(rhel.solution).toBe('RHEL 신규 도입 + Smart Management (Satellite)');
    expect(rhel.reasons).toContain('리눅스 5대 미만 운영');
    expect(rhel.script).not.toContain('현재 RHEL 구독');
  });

  it('RHEL은 없어도 OpenShift를 쓰는 기존 고객이면 Cross-sell 그대로', () => {
    const recs = recommendHealth({ ...netNew, scale: '20+', owns: { ...none, openshift: true } });
    expect(recs.find((r) => r.id === 'rec-aap')?.type).toBe('Cross-selling');
    expect(recs.find((r) => r.id === 'rec-netnew-other')?.type).toBe('Net-new');
  });
});

describe('패치 부담 크다', () => {
  const none = { satellite: false, aap: false, openshift: false, premium: false };
  const a: HealthAnswers = { scale: '20+', version: 'v8', owns: none, patch: 'heavy', automation: 'done', container: 'none', virt: 'no' };

  it('일부 있음과 점수 차이가 9점', () => {
    expect(scoreHealth(a).items[1].points - scoreHealth({ ...a, patch: 'some' }).items[1].points).toBe(9);
  });

  it('대본과 이유가 감사 지적·장애 경험을 짚는다', () => {
    const heavy = recommendHealth(a).find((r) => r.id === 'rec-smart-mgmt')!;
    const some = recommendHealth({ ...a, patch: 'some' }).find((r) => r.id === 'rec-smart-mgmt')!;
    expect(heavy.script).toContain('감사 지적이나 패치 누락');
    expect(heavy.reasons[0]).toContain('감사 지적·장애 경험');
    expect(some.script).not.toBe(heavy.script);
  });
});

describe('Net-new 1분 설명 자료', () => {
  const none = { satellite: false, aap: false, openshift: false, premium: false };
  const a: HealthAnswers = { scale: '20+', version: 'none', owns: none, patch: 'none', automation: 'done', container: 'none', virt: 'no' };

  it('CentOS 계열과 다른 리눅스는 다른 자료를 쓴다', () => {
    const centos = recommendHealth({ ...a, currentOs: 'rhel-like' })[0];
    const other = recommendHealth({ ...a, currentOs: 'other-linux' })[0];
    expect(centos.id).toBe('rec-netnew-rhel');
    expect(other.id).toBe('rec-netnew-other');
    expect(BRIEFS[centos.id].points[2].text).toContain('Convert2RHEL');
    expect(BRIEFS[other.id].points[2].text).not.toContain('Convert2RHEL');
  });
});

describe('Net-new 수작업 운영', () => {
  const none = { satellite: false, aap: false, openshift: false, premium: false };
  const a: HealthAnswers = { scale: '<5', version: 'none', currentOs: 'other-linux', owns: none, patch: 'none', automation: 'manual', container: 'none', virt: 'no' };

  it('패치 부담이 없어도 설정·패치를 손으로 하면 Satellite를 묶어 제안한다', () => {
    const rec = recommendHealth(a)[0];
    expect(rec.solution).toBe('RHEL 신규 도입 + Smart Management (Satellite)');
    expect(rec.script).toContain('Satellite');
    expect(rec.reasons).toContain('서버 설정·패치를 수작업으로 운영 → Satellite로 일괄 관리');
  });

  it('이미 자동화가 끝났고 패치 부담도 없으면 RHEL 전환만', () => {
    expect(recommendHealth({ ...a, automation: 'done' })[0].solution).toBe('RHEL 신규 도입 (기존 리눅스 전환)');
  });
});
