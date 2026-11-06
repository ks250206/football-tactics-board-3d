# Position-aware xG and shot-lane analysis

## Model provenance and scope

TOUCHLINE uses the three **open-play foot-shot** XGBoost models from
[adamsaidane/xG_model](https://github.com/adamsaidane/xG_model/tree/3dfa855294abe947e42c276a9b136e9ff05b9ca9),
pinned to commit `3dfa855294abe947e42c276a9b136e9ff05b9ca9`.
The upstream MIT notice is retained in `public/models/adamsaidane/LICENSE` and
linked from the UI. Training-data source: [StatsBomb Open Data](https://github.com/statsbomb/open-data).
This is **not StatsBomb's official xG model**. No match-event dataset or pickle
file is included. The upstream data's terms are separate from the software license.

The three model files total 4,053,581 bytes. `scripts/prepare-xg.mjs` downloads them
at **development/build/test time**, verifies the pinned Git blob hashes, and caches
them in `public/models/adamsaidane/`. It verifies existing files before reuse;
modified or missing assets are fetched again, or fail clearly without a heuristic
fallback. `pnpm dev`, `pnpm build`, and `pnpm test` run this preparation automatically.
The first preparation needs access to `raw.githubusercontent.com`. Subsequent
preparation works offline with the verified cache. `node scripts/prepare-xg.mjs --check`
performs an offline integrity check. Deploy the entire `dist/`, including `models/`.

At runtime, a Web Worker fetches **same-origin local assets only**. No Python,
ONNX service, API key, model-provider request, or upload of tactics is required.
The model files are deliberately not bundled into the main JavaScript chunk.

## Controls

Enable **学習済みxG**, **xGヒートマップ**, or **シュートコース** below the board.
The overlays are independent. The attacking team is the ball owner's team; for
a free ball it is the selected player's team, matching the previous UI convention.
A locked 3D camera remains independent of the edited player.

The **1対1を仮定** checkbox is an explicit scenario assumption, default OFF.
It does not pretend that a StatsBomb event annotation can be recovered exactly
from static coordinates. A far-distance 1v1 is outside these models' training
subsets and returns no score; the corresponding heatmap cells are omitted.

The score is conditional on taking a shot now, not possession value, pass success,
xT or EPV. Headers, penalties, airborne volleys, shot speed, spin, handedness,
player skill, body orientation and moving-goalkeeper reactions are not modelled.
Unsupported shots show a reason instead of a fabricated probability. The heatmap
can still show hypothetical **ground** shots when the current ball is airborne.

## Feature contract (do not replace with intuitive alternatives)

The authoritative sources are the pinned training notebooks and exported model
feature names, not the Streamlit demo's inconsistent routing condition.

| Feature / rule | Implementation |
| --- | --- |
| Coordinates | Attack always towards StatsBomb x=120; goalposts (120,36), (120,44). |
| Standardisation | Piecewise-linear landmark mapping: halfway line, goal line, goal/penalty areas and posts match exactly. Away attacks rotate both axes. |
| `angle` | Angle subtended by both posts in **degrees**. |
| `distance`, `DistanceGk` | Distance to the **goal segment**, not the centre, in model coordinates (not physical metres). |
| `DistanceShooterGk` | Euclidean distance in the same standardised coordinates. |
| `num_opposing_players` | Opponents whose centres lie in the shooter–posts triangle, **including GK**, excluding teammates. |
| Near/far routing | Model distance <=20 / >20, not a geometric penalty-area test. |
| 1v1 routing | Explicit checkbox, near shots only. |
| Far model | No defender-count feature. Moving only a DF need not change far-shot xG. |
| Inference | All saved trees, matching native `Booster.predict`; not sklearn best-iteration truncation. |

The displayed physical distance in metres is calculated separately to the real
goal centre. Do not compare it directly with the model-distance threshold.

The numeric-only tree evaluator rejects unsupported objectives, categorical
splits, mismatched feature lists and invalid child indices. Float32 feature
comparison and accumulation reproduce the native model. No `eval` or pickle loading
is used. Models are not retrained, smoothed or manually corrected to force an
intuitive response. Tree predictions can be discontinuous or non-monotonic.

## Heatmap and freshness

A 26 x 34 grid (884 cells; approximately 2 m spacing) covers the attacking half.
Every cell evaluates a hypothetical ground shot, holding all opponents and the
keeper fixed. Colours use a fixed 0–1 scale, not per-frame auto-normalisation.
Each cell's keeper distance and cone count are recomputed. Teammates do not enter
this xG model. It is a counterfactual visualisation; extreme synthetic layouts
and long-range positions may be out of distribution. We have not established
calibration on user-authored tactical-board positions.

A Worker receives at most one in-flight job and one latest snapshot, paced at
120 ms. Rendering does not wait for a heatmap. During edits/playback, the last
completed result is explicitly marked **配置を再計算中（前の結果）** with its
analysed timeline time. The opposite team's results are never shown after a
team switch. Worker failures show an error and a retry button; no old illustrative
xG is silently substituted. Disabling all model features terminates the Worker.

## Shot lanes: separate geometry, NOT another trained probability

The 2D fan samples 24 ground-level lanes. The 3D goal face samples 24 x 8 cells
across the physical 7.32 x 2.44 m goal, with a sparse set of straight rays.
Teal means clear; coral means an opposing outfielder; amber means the goalkeeper;
lavender means a teammate. The shooter is excluded. Bodies behind the shooter
or beyond the target are ignored. Overlapping occluders are not double-counted.

Bodies are **standing finite cylinders**, radius 0.35 m for outfielders and
0.55 m for goalkeepers, height from the player metadata; a 0.11 m ball radius is
included in the intersection approximation. The closest intersecting body
classifies each ray. Goalkeeper reach, diving, attention, velocity and reaction
time are not inferred. The open-goal-area percentage is a geometric fraction,
not a goal, block or save probability, and it does not multiply/correct model xG.

Three.js meshes/materials persist across updates; replaced geometries are disposed.
The engine's existing traversal disposes the final geometries/materials on teardown.

## Verification

- `pnpm run typecheck`, `pnpm test`, `pnpm run build`, `pnpm run test:e2e`.
- Unit coverage: coordinate landmarks/rotation, upstream feature semantics,
  model routing, GK/DF sensitivity, unsupported inputs, missing GK, fixed heatmaps,
  finite-cylinder intersections, overlapping blockers and model-schema rejection.
- Chromium integration coverage: actual Worker/model assets, real dragging,
  updated 2D/3D overlays, camera retention, mobile overflow, timeline playback,
  independent toggles, model-fetch failure/retry, and no external runtime requests.
- `.github/workflows/xg-model-parity.yml` independently compares the TypeScript
  evaluator with native **XGBoost 3.1.1** over 1,489 feature vectors, including
  missing inputs and exact/adjacent Float32 split thresholds. Pinned-model first
  verification: maximum absolute difference **6.520842749102584e-8**, tolerance 3e-6.
  Every run uploads its own JSON report and reference vectors.

For the native check locally (optional; not a browser/runtime dependency):

```sh
pnpm models:prepare
python -m pip install xgboost==3.1.1 numpy==2.3.4
python scripts/xg-reference.py
node --experimental-strip-types scripts/xg-parity.mjs
```

Numerical equivalence checks implementation fidelity, **not predictive accuracy**.
An external test set/calibration study is needed before interpreting these scores
as validated probabilities for synthetic tactical scenarios.
