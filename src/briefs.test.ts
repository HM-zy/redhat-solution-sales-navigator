import { describe, expect, it } from 'vitest';
import { BRIEFS } from './briefs';
import healthSrc from './healthCheck.tsx?raw';
import renewalSrc from './renewal.tsx?raw';

describe('1분 설명 자료', () => {
  const ids = [...(healthSrc + renewalSrc).matchAll(/id: '(rec-[a-z-]+)'/g)].map((m) => m[1]);

  it('모든 추천에 자료가 있다', () => {
    expect(ids.length).toBeGreaterThan(5);
    for (const id of ids) expect(BRIEFS[id], id).toBeDefined();
  });

  it('공감 → 문제 → 해결 → 다음 단계 순서이고 링크는 https', () => {
    for (const [id, b] of Object.entries(BRIEFS)) {
      expect(b.points.map((p) => p.label), id).toEqual(['공감', '문제', '해결', '다음 단계']);
      expect(b.links.length, id).toBeGreaterThan(0);
      for (const l of b.links) expect(l.url).toMatch(/^https:\/\/(www|access)\.redhat\.com\//);
    }
  });
});
