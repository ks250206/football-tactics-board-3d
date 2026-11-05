import { describe, expect, it } from 'vite-plus/test';
import { angleLerp, analyse, ballPosition, createDemo, makePass, parseProject, removeKeyframe, sample, upsert, verticalFov, wrap } from '../src/core';

describe('timeline', () => {
  it('uses the shortest angle across ±180°', () => { expect(angleLerp(170,-170,.5)).toBe(-180); expect(wrap(540)).toBe(-180); });
  it('clamps both ends and retains exact poses at keyframes', () => {
    const p=createDemo(); expect(sample(p,-1).players).toEqual(p.frames[0].players);
    expect(sample(p,100).players).toEqual(p.frames.at(-1)!.players);
    for(const f of p.frames) expect(sample(p,f.t).players).toEqual(f.players);
  });
  it('inserts without mutating the original and replaces the same time', () => {
    const p=createDemo(), q=upsert(p,2,f=>{f.players['home-6'].x=1;});
    expect(p.frames.length).toBe(9); expect(q.frames.length).toBe(10);
    expect(sample(q,2).players['home-6'].x).toBe(1);
    expect(upsert(q,2,()=>{}).frames.length).toBe(10);
  });
  it('never deletes boundary keyframes', () => { const p=createDemo(); expect(removeKeyframe(p,0).frames.length).toBe(9); expect(removeKeyframe(p,1.2).frames.length).toBe(8); });
  it('keeps possession attached to an interpolated moving player', () => {
    const p=createDemo(); p.frames=p.frames.slice(0,2); p.frames[0].ball.owner='home-6'; p.frames[1].ball.owner='home-6';
    const f=sample(p,.6); expect(f.ball.x).toBeCloseTo(ballPosition(f).x); expect(f.ball.y).toBe(.11);
  });
  it('authors a pass across existing keyframes without introducing a discontinuity', () => {
    const p=makePass(createDemo(),.5,'home-3','home-7',3,2);
    expect(sample(p,.5).ball.owner).toBe('home-3'); expect(sample(p,3.5).ball.owner).toBe('home-7');
    expect(sample(p,2).ball.y).toBeCloseTo(2.11,5);
    for(const f of p.frames.filter(f=>f.t>.5&&f.t<3.5)) {
      expect(Math.abs(sample(p,f.t-.0001).ball.x-sample(p,f.t+.0001).ball.x)).toBeLessThan(.01);
    }
  });
  it('returns the same project when there is no time left for a pass', () => { const p=createDemo(); expect(makePass(p,12,'home-3','home-6')).toBe(p); });
});
describe('visibility', () => {
  it('converts horizontal FOV to aspect-correct vertical FOV', () => { expect(verticalFov(90,2)).toBeCloseTo(53.130102,5); });
  it('distinguishes behind-camera players from blockers and pass corridors', () => {
    const p=createDemo(), f=sample(p,0); f.players['home-6']={x:0,z:0,body:0,head:0,pitch:0}; f.players['home-7']={x:10,z:0,body:0,head:0,pitch:0};
    f.players['away-6']={x:5,z:0,body:0,head:0,pitch:0};
    const s=analyse(p,f,'home-6',90,1.72).find(s=>s.id==='home-7')!;
    expect(s.inView).toBe(true); expect(s.occluded).toBe(true); expect(s.clearPass).toBe(false);
    f.players['home-7'].x=-10; expect(analyse(p,f,'home-6',90,1.72).find(s=>s.id==='home-7')!.inView).toBe(false);
  });
});
describe('project validation', () => {
  it('round trips each bundled scenario', () => { for(const k of ['build','through','overlap']) {const p=createDemo(k); expect(parseProject(JSON.stringify(p))).toEqual(p);} });
  it('rejects malformed and oversized projects', () => { for(const x of ['null','{}','not json',' '.repeat(2_000_001)]) expect(()=>parseProject(x)).toThrow(); });
  it('rejects missing players, invalid owners and unsorted times', () => {
    const a=createDemo(); delete a.frames[0].players['home-6']; expect(()=>parseProject(JSON.stringify(a))).toThrow();
    const b=createDemo(); b.frames[0].ball.owner='unknown'; expect(()=>parseProject(JSON.stringify(b))).toThrow();
    const c=createDemo(); c.frames[1].t=0; expect(()=>parseProject(JSON.stringify(c))).toThrow();
  });
});
