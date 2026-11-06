"""Native XGBoost oracle for production-worker Chromium tests; no JS-derived labels.

Run after models:prepare. --check validates the committed fixture against the
native library without rewriting it. Coordinate/feature extraction is implemented
independently here so the browser test covers that part of the pipeline as well.
"""
import argparse
import copy
import json
import math
from pathlib import Path

import numpy as np
import xgboost as xgb

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "near": "xG_foot_openplay_inside_not_1on1.json",
    "oneOnOne": "xG_foot_openplay_inside_1on1.json",
    "far": "xG_foot_openplay_outside.json",
}
FIXTURE = ROOT / "tests/fixtures/xg-browser-reference.json"


def standardize(p, team):
    """Map landmarks to StatsBomb coordinates independently of TypeScript."""
    sign = 1 if team == "home" else -1
    x = np.interp(sign*p["x"]+52.5,
                  [0, 5.5, 11, 16.5, 52.5, 88.5, 94, 99.5, 105],
                  [0, 6, 12, 18, 60, 102, 108, 114, 120])
    y = np.interp(sign*p["z"],
                  [-34, -20.16, -9.16, -3.66, 0, 3.66, 9.16, 20.16, 34],
                  [0, 18, 30, 36, 40, 44, 50, 62, 80])
    return float(x), float(y)


def distance(p):
    """Distance to the goal segment, not its centre, in model coordinates."""
    return math.hypot(120-p[0], max(36-p[1], p[1]-44, 0))


def features(s):
    """Reproduce published degrees, distances and cone count including GK."""
    x, y = standardize(s["shot"], s["team"])
    opponents = [b for b in s["bodies"] if b["opponent"]]
    gx, gy = standardize(next(b for b in opponents if b["keeper"]), s["team"])
    count = 0
    for body in opponents:
        bx, by = standardize(body, s["team"])
        t = (bx-x)/(120-x)
        count += 0 <= t <= 1 and y+(36-y)*t-1e-9 <= by <= y+(44-y)*t+1e-9
    return dict(angle=abs(math.degrees(math.atan2(8*(120-x), (120-x)**2+(y-40)**2-16))),
                distance=distance((x, y)), y=y, x_gk=gx, y_gk=gy,
                DistanceGk=distance((gx, gy)), DistanceShooterGk=math.hypot(x-gx, y-gy),
                minus=x-gx, num_opposing_players=count)


def scenarios():
    """Cover all three models, lateral inputs and rotated AWAY attacks."""
    base = dict(team="home", time=0, shot=dict(x=40, z=0, y=.11), shooter="home-9",
                oneOnOne=False, bodies=[
                    dict(id="away-1", x=51, z=0, height=1.9, keeper=True, opponent=True),
                    dict(id="away-2", x=44, z=0, height=1.8, keeper=False, opponent=True),
                    dict(id="home-9", x=39.52, z=0, height=1.8, keeper=False, opponent=False)])
    scenes = []
    for name, x, z, defender_z, keeper_z, one in [
        ("near-blocked", 40, 0, 0, 0, False),
        ("near-open-lane", 40, 0, 8, 0, False),
        ("near-displaced-gk", 40, 0, 8, 5, False),
        ("near-one-on-one", 40, 0, 8, 0, True),
        ("far-central", 15, 0, 0, 0, False),
        ("far-wide", 30, 24, 8, 3, False),
        ("near-wide", 46, -9.16, 0, -2, False),
    ]:
        s = copy.deepcopy(base)
        s["shot"].update(x=x, z=z); s["oneOnOne"] = one
        s["bodies"][0]["z"] = keeper_z; s["bodies"][1]["z"] = defender_z
        s["bodies"][2].update(x=x-.48, z=z)
        scenes.append((name, s))
        rotated = copy.deepcopy(s); rotated["team"] = "away"
        for p in [rotated["shot"], *rotated["bodies"]]:
            p["x"] *= -1; p["z"] *= -1
        scenes.append((name+"-rotated", rotated))
    return scenes


def main():
    """Generate native predictions or verify the versioned reference fixture."""
    parser = argparse.ArgumentParser(); parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    models = {key: xgb.Booster(model_file=str(ROOT/"public/models/adamsaidane"/file))
              for key, file in FILES.items()}
    cases = []
    for name, s in scenarios():
        f = features(s)
        model_id = "far" if f["distance"] > 20 else "oneOnOne" if s["oneOnOne"] else "near"
        m = models[model_id]
        matrix = xgb.DMatrix(np.asarray([[f[n] for n in m.feature_names]], dtype=np.float32), feature_names=m.feature_names)
        cases.append(dict(name=name, snapshot=s, model=model_id, features=f, expected=float(m.predict(matrix)[0])))
    output = dict(native_xgboost=xgb.__version__, upstream="3dfa855294abe947e42c276a9b136e9ff05b9ca9", cases=cases)
    if args.check:
        saved = json.loads(FIXTURE.read_text())
        assert saved["upstream"] == output["upstream"]
        assert len(saved["cases"]) == len(cases)
        for actual, reference in zip(cases, saved["cases"]):
            for key in ("name", "snapshot", "model", "features"):
                assert actual[key] == reference[key], (actual["name"], key)
            assert abs(actual["expected"]-reference["expected"]) < 3e-6, actual["name"]
        print(f"Verified {len(cases)} committed browser oracle cases with native XGBoost {xgb.__version__}")
    else:
        FIXTURE.parent.mkdir(exist_ok=True)
        FIXTURE.write_text(json.dumps(output, separators=(",", ":"))+"\n")
        print(f"Wrote {len(cases)} cases from native XGBoost {xgb.__version__} to {FIXTURE}")


if __name__ == "__main__":
    main()
