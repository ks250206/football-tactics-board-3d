# Development notes

- Stack: Vite+, React, TypeScript, Tailwind CSS 4, direct Three.js WebGL renderer.
- Keep rendering independent from the pure model in `src/core.ts`.
- Coordinates: metres, x along pitch length [-52.5,52.5], z across [-34,34], y vertical. Angles are degrees in model data; yaw zero faces +x. Head yaw is relative to body. All camera FOV controls are horizontal.
- Never load external assets or upload tactic data without an explicit product decision.
- Validate imported projects before passing them to Three.js. Do not silently overwrite invalid user data.
- Preserve both endpoint poses and ball continuity when inserting a keyframe.
- Build with `pnpm run build`, run `pnpm test`, and run `pnpm run test:e2e` after installing Playwright Chromium. Do not call a build visually verified unless the actual browser test and screenshots were checked.
- Dispose all geometries, materials, textures, skeletons, postprocessing passes and event listeners on engine teardown.
- Athletes are generated procedurally in `src/anatomy.ts` (geometry, skin weights) and assembled in `src/athlete.ts`. Do not add model, texture or animation files.
- Athlete motion must stay a pure function of timeline time: plan gait in `src/motion.ts` (no Three.js) and solve bones in `src/rig.ts`. Never accumulate per-frame animation state in the renderer; scrubbing, looping and recording must show the same pose for the same time.
- A planted foot keeps one world position from touchdown to lift-off, and the head reproduces the model gaze (body + head yaw, pitch) exactly. `tests/motion.test.ts` enforces both.
- Keep the repository's visibility unchanged. CI artifacts are not a publicly deployed site.
- Do not claim photorealistic human vision, predictive pass safety or real-world biomechanics. Document every approximation.
