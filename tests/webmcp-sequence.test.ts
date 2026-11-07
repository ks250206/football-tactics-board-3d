import { describe, expect, it } from 'vite-plus/test';
import { ballPosition, parseProject, sample } from '../src/core';
import { authorSequence } from '../src/webmcp/sequence';
import { createTrossardReplay, matchReplays } from '../src/webmcp/replays';

describe('WebMCP sequence authoring', () => {
  it('expands sparse updates and hands possession to the receiver', () => {
    const project = authorSequence({
      name: 'Pass', duration: 2, keyframes: [
        { t: 0, players: [{ id: 'home-6', x: 3, z: 4, body: 0 }], ball: { owner: 'home-6' } },
        { t: 1, players: [{ id: 'home-6', x: 5 }] },
        { t: 2, ball: { owner: 'home-9' } },
      ],
    });
    expect(project.roster).toHaveLength(22);
    expect(project.frames[0].players['home-6'].x).toBe(3);
    expect(project.frames[2].players['home-6']).toMatchObject({ x: 5, z: 4 });
    expect(sample(project, 1).ball).toMatchObject({ owner: 'home-6', x: 5.48, z: 4 });
    expect(sample(project, 1.5).ball.owner).toBeNull();
    expect(sample(project, 2).ball.owner).toBe('home-9');
  });

  it.each([
    { players: [{ id: '__proto__', x: 1 }] },
    { players: [{ id: 'away-10', x: 53 }] },
    { players: [{ id: 'away-10', x: Number.NaN }] },
    { players: [{ id: 'home-4' }, { id: 'home-4' }] },
    { ball: { owner: 'other' } },
    { ball: { x: 0 } },
    { ball: { x: 0, z: 0, arc: null } },
    { t: 1 },
  ])('rejects invalid keyframe %j before returning a project', (invalid) => {
    expect(() => authorSequence({
      name: 'Invalid', duration: 2, keyframes: [{ t: 0, ball: { x: 0, z: 0 } }, { t: 2, ...invalid }],
    })).toThrow();
  });

  it('sends the ball from the assister to Trossard and between the posts', () => {
    const project = createTrossardReplay();
    expect([0, 2.4, 5, 5.65, 8.25].map(t => sample(project, t).ball.owner))
      .toEqual(['away-2', 'away-10', 'away-2', 'away-10', 'away-11']);
    expect(sample(project, 0).ball.x).toBeGreaterThan(-20);
    expect(project.roster.find(player => player.id === 'away-2')?.number).toBe(41);
    const goal = sample(project, 8.8).ball;
    expect(goal.x).toBeLessThan(-52.5);
    expect(Math.abs(goal.z)).toBeLessThan(3.66);
    expect(goal.y).toBeLessThan(2.44);
  });
});

describe('historical match replays', () => {
  it.each(matchReplays.slice(1).map((entry, i) => [entry.info.id, entry, [10, 8, 20, 7, 10, 10][i]] as const))(
    '%s keeps the scorer selectable and the shot inside the goal mouth',
    (_id, replay, shirt) => {
      const project = replay.create();
      expect(parseProject(JSON.stringify(project))).toEqual(project);
      const scorer = project.roster.find(player => player.id === replay.focus)!;
      expect(scorer.number).toBe(shirt);
      const direction = scorer.team === 'home' ? 1 : -1;
      const goalIndex = project.frames.findIndex(frame => direction * frame.ball.x > 52.5);
      const release = project.frames[goalIndex - 1];
      const goal = project.frames[goalIndex];
      expect(release.t).toBeGreaterThan(8);
      const ball = ballPosition(release);
      expect(Math.hypot(ball.x - release.players[scorer.id].x, ball.z - release.players[scorer.id].z)).toBeLessThan(.6);
      const fraction = (52.5 - direction * ball.x) / (direction * (goal.ball.x - ball.x));
      const crossing = sample(project, release.t + fraction * (goal.t - release.t)).ball;
      expect(Math.abs(crossing.z)).toBeLessThan(3.66);
      expect(crossing.y).toBeLessThan(2.44);
    },
  );

  it('starts in Arsenal territory and sends Wilshere past Giroud on the attacking right', () => {
    const wilshere = matchReplays.find(replay => replay.info.id.endsWith('wilshere-18'))!.create();
    expect(sample(wilshere, 0).ball.x).toBeLessThan(-25);
    expect(sample(wilshere, 12.2).ball.x).toBeGreaterThan(0);
    expect([17.5, 17.85, 18.35].map(t => sample(wilshere, t).ball.owner))
      .toEqual(['home-9', 'home-10', 'home-9']);
    const release = sample(wilshere, 18.35);
    const volley = sample(wilshere, 19.4);
    expect(release.players['home-10'].z).toBeGreaterThan(release.players['home-9'].z);
    expect(volley.players['home-10'].z).toBeGreaterThan(volley.players['home-9'].z);
    expect(volley.players['home-10'].x).toBeGreaterThan(volley.players['home-9'].x);
    expect(volley.ball.y).toBeGreaterThan(.11);
  });
});
