import { describe, expect, it } from 'vite-plus/test';
import { ballPosition, parseProject, RAD, wrap } from '../src/core';
import { createScenario } from '../src/scenarios';

describe('scenario choreography', () => {
  it('scans toward the incoming ball before receiving', () => {
    const project = createScenario();
    for (const time of [1.2, 2.4]) {
      const frame = project.frames.find(f => f.t === time)!;
      const player = frame.players['home-6'], ball = ballPosition(frame);
      const bearing = Math.atan2(ball.z-player.z,ball.x-player.x)/RAD;
      expect(Math.abs(wrap(bearing-player.body-player.head))).toBeLessThan(45);
    }
  });
  it('round trips all user-facing presets', () => {
    for (const kind of ['build','through','overlap']) {
      const project=createScenario(kind);
      expect(parseProject(JSON.stringify(project))).toEqual(project);
    }
  });
});
