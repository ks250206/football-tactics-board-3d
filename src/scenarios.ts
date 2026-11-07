/** Human choreography on top of the pure model's baseline scenario layouts. */
import { createDemo as createBaseDemo } from './core';
import { choreographPhase } from './phaseChoreography';

const demoPatterns: Record<string, string> = { build: 'build-up', through: 'through', overlap: 'overload' };

export function createScenario(kind?: string) {
  const project = createBaseDemo(kind);
  if (kind && Object.hasOwn(demoPatterns, kind)) return choreographPhase(project, demoPatterns[kind], project.name, 'home');
  for (const frame of project.frames) {
    const midfielder = frame.players['home-6'];
    // The ball arrives from the +z side. Open the body and scan that shoulder.
    midfielder.body = Math.abs(midfielder.body);
    if (frame.t === 1.2 || frame.t === 2.4 || frame.t === 3.6) {
      midfielder.head = Math.abs(midfielder.head);
    }
  }
  return project;
}
