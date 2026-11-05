/** Human choreography on top of the pure model's baseline scenario layouts. */
import { createDemo as createBaseDemo } from './core';

export function createScenario(kind = 'build') {
  const project = createBaseDemo(kind);
  if (kind === 'build') {
    for (const frame of project.frames) {
      const midfielder = frame.players['home-6'];
      // The ball arrives from the +z side. Open the body and scan that shoulder.
      midfielder.body = Math.abs(midfielder.body);
      if (frame.t === 1.2 || frame.t === 2.4 || frame.t === 3.6) {
        midfielder.head = Math.abs(midfielder.head);
      }
    }
  }
  return project;
}
