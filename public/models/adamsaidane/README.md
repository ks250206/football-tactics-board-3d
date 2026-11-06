# Verified local model assets

`pnpm models:prepare` retrieves three immutable XGBoost JSON files from
adamsaidane/xG_model, commit 3dfa855294abe947e42c276a9b136e9ff05b9ca9,
and verifies their Git blob hashes. The MIT notice in LICENSE must remain with
these models in every deployed build. JSON files are cached here and ignored by
Git; Vite copies them into dist/models/adamsaidane/.

No training data or executable pickle is downloaded. See ../../../docs/xg.md
and ../../../THIRD_PARTY_NOTICES.md for provenance and limitations.
