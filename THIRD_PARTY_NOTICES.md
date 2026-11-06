# Third-party model notices

## adamsaidane/xG_model

The three pretrained open-play foot-shot XGBoost JSON models and the feature
engineering definitions are from:
https://github.com/adamsaidane/xG_model/tree/3dfa855294abe947e42c276a9b136e9ff05b9ca9

Copyright (c) 2025 adamsaidane. MIT License.
The full, unmodified notice is in `public/models/adamsaidane/LICENSE`; builds ship
it alongside the models. Model hashes and filenames are pinned in
`scripts/prepare-xg.mjs`. The browser uses the original weights without retraining.
The model adapter, visualisation, and numeric JSON tree evaluator are implemented
for TOUCHLINE. See `docs/xg.md` for differences from the upstream demo app.

Training data are credited by the upstream author to StatsBomb Open Data:
https://github.com/statsbomb/open-data
No raw match-event dataset is redistributed here. Dataset terms remain separate
from the upstream software license. This is not StatsBomb's official xG product.
