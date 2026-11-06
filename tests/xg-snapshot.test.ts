import { describe, expect, it } from 'vite-plus/test';
import { ballPosition, createDemo } from '../src/core';
import { snapshot } from '../src/xg/analysis';

describe('xG snapshot invalidation', () => {
  it('ignores pose orientation, display gaze and ball arc with unchanged spatial inputs', () => {
    const project = createDemo(), frame = structuredClone(project.frames[0]);
    const before = snapshot(project, frame, 'home', 'home-6', false);
    for (const pose of Object.values(frame.players)) {
      pose.body += 15; pose.head += 10; pose.pitch += 5;
    }
    frame.ball.arc = 4;
    expect(snapshot(project, frame, 'home', 'home-6', false)).toEqual(before);
    expect(Object.keys(before.shot).sort()).toEqual(['x', 'y', 'z']);
    expect(before.bodies.every(b => !('body' in b) && !('head' in b) && !('pitch' in b))).toBe(true);
  });
  it('retains genuine spatial changes, including the ball moving when its owner turns', () => {
    const project = createDemo(), frame = structuredClone(project.frames[0]);
    frame.ball.owner = 'home-6'; frame.ball = ballPosition(frame);
    const before = snapshot(project, frame, 'home', 'home-6', false);
    frame.players['home-6'].body += 90;
    frame.ball = ballPosition(frame);
    expect(snapshot(project, frame, 'home', 'home-6', false).shot).not.toEqual(before.shot);
    const spatial = snapshot(project, frame, 'home', 'home-6', false);
    frame.players['away-2'].z += 1;
    expect(snapshot(project, frame, 'home', 'home-6', false)).not.toEqual(spatial);
  });
});
