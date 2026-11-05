# Development notes

- Stack: Vite+, React, TypeScript, Tailwind CSS 4, direct Three.js WebGL renderer.
- Keep rendering independent from the pure model in `src/core.ts`.
- Coordinates: metres, x along pitch length [-52.5,52.5], z across [-34,34], y vertical. Angles are degrees in model data; yaw zero faces +x. Head yaw is relative to body. All camera FOV controls are horizontal.
- Never load external assets or upload tactic data without an explicit product decision.
- Validate imported projects before passing them to Three.js. Do not silently overwrite invalid user data.
- Preserve both endpoint poses and ball continuity when inserting a keyframe.
- Build with `npm run build`, run `npm test`, and run `npm run test:e2e` after installing Playwright Chromium. Do not call a build visually verified unless the actual browser test and screenshots were checked.
- Dispose all geometries, materials, textures, postprocessing passes and event listeners on engine teardown.
- Keep the repository's visibility unchanged. CI artifacts are not a publicly deployed site.
- Do not claim photorealistic human vision, predictive pass safety or real-world biomechanics. Document every approximation.
