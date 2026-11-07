import { describe, expect, it } from 'vite-plus/test';
import { createDemo, sample, type Team } from '../src/core';
import { analysisTeam, snapshot } from '../src/xg/analysis';
import { shotGeometry } from '../src/xg/geometry';
import { XgOverlay3D } from '../src/xg/Overlay3D';
import { Mesh } from 'three';

function fixture(team: Team) {
  const project = createDemo(), frame = structuredClone(project.frames[0]);
  const sign = team === 'home' ? 1 : -1, opponent = team === 'home' ? 'away' : 'home';
  for (const [i, p] of project.roster.entries()) frame.players[p.id] = { x: sign * 10, z: -28 + i % 11 * 5, body: 0, head: 0, pitch: 0 };
  frame.players[`${team}-6`] = { x: sign * 40, z: 0, body: 0, head: 0, pitch: 0 };
  frame.players[`${opponent}-1`] = { x: sign * 51, z: 0, body: 0, head: 0, pitch: 0 };
  frame.players[`${opponent}-2`] = { x: sign * 45, z: .5, body: 0, head: 0, pitch: 0 };
  frame.ball = { x: sign * 40.48, z: 0, y: .11, owner: null, arc: 0 };
  return { project, frame, sign, opponent, focused: `${team}-6` };
}
it('keeps the last possession team across free-ball keys and scrubbing until possession changes', () => {
  const project = createDemo();
  const first = project.frames[0];
  project.frames = [
    { ...first, t: 0, ball: { ...first.ball, owner: null } },
    { ...first, t: 2, ball: { ...first.ball, owner: 'away-6' } },
    { ...first, t: 4, ball: { ...first.ball, owner: null } },
    { ...first, t: 6, ball: { ...first.ball, owner: 'away-7' } },
    { ...first, t: 12, ball: { ...first.ball, owner: 'home-8' } },
  ];
  const attack = (t: number, locked = false) => analysisTeam(project, sample(project, t), 'home-6', locked);
  expect(attack(0)).toBe('home');
  expect(attack(3)).toBe('away');
  expect(attack(4)).toBe('away');
  expect(attack(5)).toBe('away');
  expect(attack(11)).toBe('away');
  expect(attack(12)).toBe('home');
  expect(attack(5)).toBe('away');
  expect(attack(5, true)).toBe('home');
});

describe.each(['home', 'away'] as const)('locked %s analysis subject', team => {
  it('locks direction for free balls and even when an opponent owns the ball', () => {
    const f = fixture(team);
    expect(analysisTeam(f.project, f.frame, f.focused, true)).toBe(team);
    f.frame.ball.owner = `${f.opponent}-2`;
    expect(analysisTeam(f.project, f.frame, f.focused, true)).toBe(team);
    expect(analysisTeam(f.project, f.frame, f.focused, false)).toBe(f.opponent);
    expect(snapshot(f.project, f.frame, team, f.focused, false).shooter).toBeNull();
  });
  it('exempts only the anchored nearby shooter, never the edited defender or teammate', () => {
    const f = fixture(team), take = () => snapshot(f.project, f.frame, team, f.focused, false);
    const before = take();
    expect(before.shooter).toBe(f.focused);
    const blocked = shotGeometry(before)!;
    f.frame.players[`${f.opponent}-2`].z = 14;
    const open = shotGeometry(take())!;
    expect(open.goalX).toBe(f.sign * 52.5);
    expect(open.openFraction).toBeGreaterThan(blocked.openFraction);
    f.frame.players[`${team}-7`] = { x: f.sign * 45, z: 0, body: 0, head: 0, pitch: 0 };
    const teammate = shotGeometry(take())!;
    expect(teammate.cells.some(c => c.kind === 'teammate')).toBe(true);
    expect(teammate.openFraction).toBeLessThan(open.openFraction);
    expect(take().shooter).toBe(f.focused);
    f.frame.players[`${team}-7`].z = 12;
    f.frame.players[`${f.opponent}-1`].z = 8;
    expect(shotGeometry(take())!.openFraction).toBe(1);
  });
  it('replaces actual goal mesh colors and disposes old buffers after blocker edits', () => {
    const f = fixture(team), overlay = new XgOverlay3D();
    const update = () => overlay.update({ heatmap: [], geometry: shotGeometry(snapshot(f.project, f.frame, team, f.focused, false)) });
    update();
    const mouth = overlay.root.getObjectByName('xg-goal-mouth') as Mesh;
    expect(mouth.visible).toBe(true);
    const old = mouth.geometry, colors = Array.from(old.getAttribute('color').array), signature = overlay.goalColorSignature;
    let disposed = false; old.addEventListener('dispose', () => { disposed = true; });
    f.frame.players[`${f.opponent}-2`].z = 14; update();
    expect(disposed).toBe(true);
    expect(mouth.geometry).not.toBe(old);
    expect(Array.from(mouth.geometry.getAttribute('color').array)).not.toEqual(colors);
    expect(overlay.goalColorSignature).not.toBe(signature);
    overlay.update({ heatmap: [], geometry: null });
    expect(mouth.visible).toBe(false); expect(overlay.goalColorSignature).toBe('');
    overlay.root.traverse(o => { if (o instanceof Mesh) { o.geometry.dispose(); const m = o.material; (Array.isArray(m) ? m : [m]).forEach(v => v.dispose()); } });
  });
});
