import { describe, expect, it } from 'vite-plus/test';
import { sample } from '../src/core';
import { authorSequence } from '../src/webmcp/sequence';
import { createTrossardReplay } from '../src/webmcp/replays';

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
    expect(sample(project, 2.5).ball.owner).toBe('away-10');
    expect(sample(project, 3.1).ball.owner).toBe('away-11');
    const goal = sample(project, 3.65).ball;
    expect(goal.x).toBeLessThan(-52.5);
    expect(Math.abs(goal.z)).toBeLessThan(3.66);
    expect(goal.y).toBeLessThan(2.44);
  });
});
