"""Independent native-XGBoost oracle. Loads JSON only, never pickle/joblib."""
import json
from pathlib import Path
import numpy as np
import xgboost as xgb

root = Path(__file__).resolve().parents[1]
rng = np.random.default_rng(314159)
cases = []
for path in sorted((root / 'public/models/adamsaidane').glob('*.json')):
    raw = json.loads(path.read_text())
    model = xgb.Booster(model_file=str(path))
    names = model.feature_names
    rows = []
    for _ in range(400):
        x, y = rng.uniform(65, 119.9), rng.uniform(0, 80)
        gx, gy = rng.uniform(102, 120), rng.uniform(30, 50)
        d = np.hypot(120-x, max(36-y, y-44, 0))
        a = np.degrees(abs(np.arctan2(8*(120-x), (120-x)**2+(y-40)**2-16)))
        f = dict(angle=a, distance=d, y=y, x_gk=gx, y_gk=gy,
                 DistanceShooterGk=np.hypot(x-gx,y-gy), DistanceGk=np.hypot(120-gx,max(36-gy,gy-44,0)),
                 minus=x-gx, num_opposing_players=float(rng.integers(0,12)))
        rows.append([float(f[n]) for n in names])
    # Missing branches and exact/adjacent float32 split thresholds.
    for j in range(len(names)):
        row = rows[0].copy(); row[j] = float('nan'); rows.append(row)
    rows.append([float('nan')]*len(names))
    for tree in raw['learner']['gradient_booster']['model']['trees'][:30]:
        for i, left in enumerate(tree['left_children']):
            if left < 0: continue
            value = np.float32(tree['split_conditions'][i])
            for v in (np.nextafter(value, np.float32(-np.inf)), value, np.nextafter(value, np.float32(np.inf))):
                row = rows[0].copy(); row[tree['split_indices'][i]] = float(v); rows.append(row)
            break
    matrix = np.asarray(rows, dtype=np.float32)
    predictions = model.predict(xgb.DMatrix(matrix, feature_names=names))
    cases.append(dict(file=path.name, names=names, rows=[[None if not np.isfinite(x) else float(x) for x in row] for row in matrix], expected=[float(x) for x in predictions]))
out = root / 'artifacts'; out.mkdir(exist_ok=True)
(out / 'xg-reference.json').write_text(json.dumps(dict(xgboost=xgb.__version__, cases=cases)))
print(f'Native XGBoost {xgb.__version__}: {sum(len(c["rows"]) for c in cases)} reference predictions')
