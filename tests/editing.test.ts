import { describe, expect, it } from 'vite-plus/test';
import { createDemo, makePass, parseProject, sample, upsert } from '../src/core';

describe('editing invariants', () => {
  it('preserves an airborne ball path when inserting a pose keyframe', () => {
    const p = makePass(createDemo(), .5, 'home-3', 'home-7', 3, 2);
    const q = upsert(p, 1.7, f => { f.players['away-3'].z += 1; });
    expect(q.roster).toBe(p.roster);
    for (let t = .5; t <= 3.5; t += .03) {
      const a = sample(p, t).ball, b = sample(q, t).ball;
      expect(b.x).toBeCloseTo(a.x, 8);
      expect(b.z).toBeCloseTo(a.z, 8);
      expect(b.y).toBeCloseTo(a.y, 8);
    }
  });
  it('does not move endpoints when editing close to them', () => {
    const p = upsert(createDemo(), .01, f => { f.players['home-6'].head = 20; });
    expect(p.frames[0].t).toBe(0);
    const q = upsert(p, 11.99, f => { f.players['home-6'].head = 30; });
    expect(q.frames.at(-1)!.t).toBe(12);
    expect(() => parseProject(JSON.stringify(q))).not.toThrow();
  });
  it('rejects fractional skin and uniform indices', () => {
    const p=createDemo(); p.roster[0].skin=.5;
    expect(() => parseProject(JSON.stringify(p))).toThrow();
    p.roster[0].skin=1; p.roster[0].number=1.5;
    expect(() => parseProject(JSON.stringify(p))).toThrow();
  });
});
