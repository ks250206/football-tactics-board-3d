import { describe, expect, it } from "vite-plus/test";
import { ballPosition, clone, createDemo, parseProject, RAD, sample, wrap } from "../src/core";
import {
  applyFpsInput,
  applyShape,
  BIELSA_ZONES,
  DEFAULT_SHAPE,
  defencePlan,
  formationLines,
  FORMATIONS,
  faceBall,
  fpsLook,
  fpsStep,
  fpsPose,
  gazeAtBall,
  illustrativeXg,
  orientPlayers,
  PHASES,
  phaseProject,
  resolveDefence,
  shapePoses,
  withBallGaze,
} from "../src/tactics";

describe("formations", () => {
  it("covers every catalogue formation, third and attack direction, including extreme sliders", () => {
    const base = createDemo();
    for (const formation of FORMATIONS)
      for (const team of ["home", "away"] as const)
        for (const third of ["defensive", "middle", "attacking"] as const)
          for (const compactness of [0, 100])
            for (const tilt of [-20, 20]) {
              const options = {
                ...DEFAULT_SHAPE,
                formation,
                team,
                third,
                compactness,
                tilt,
                width: 62,
              };
              const poses = shapePoses(base, options);
              expect(Object.keys(poses)).toHaveLength(11);
              expect(new Set(Object.values(poses).map((p) => `${p.x},${p.z}`)).size).toBe(11);
              for (const p of Object.values(poses)) {
                expect(Math.abs(p.x)).toBeLessThanOrEqual(52.5);
                expect(Math.abs(p.z)).toBeLessThanOrEqual(34);
              }
              expect(() =>
                parseProject(JSON.stringify(applyShape(base, 2, options))),
              ).not.toThrow();
            }
  });
  it("mirrors away shapes and preserves the other team, ball and endpoint keys", () => {
    const base = createDemo(),
      before = clone(base),
      home = shapePoses(base, DEFAULT_SHAPE),
      away = shapePoses(base, { ...DEFAULT_SHAPE, team: "away" });
    for (let n = 1; n <= 11; n++) {
      expect(away[`away-${n}`].x).toBeCloseTo(-home[`home-${n}`].x);
      expect(away[`away-${n}`].z).toBeCloseTo(-home[`home-${n}`].z);
    }
    const next = applyShape(base, 2, { ...DEFAULT_SHAPE, formation: "3-2-5" });
    expect(base).toEqual(before);
    expect(next.frames[0]).toEqual(base.frames[0]);
    expect(next.frames.at(-1)).toEqual(base.frames.at(-1));
    for (let n = 1; n <= 11; n++)
      expect(sample(next, 2).players[`away-${n}`]).toEqual(sample(base, 2).players[`away-${n}`]);
    for (const t of [1.3, 1.9, 2, 2.1, 2.3])
      for (const key of ["x", "z", "y", "arc"] as const)
        expect(sample(next, t).ball[key]).toBeCloseTo(sample(base, t).ball[key], 10);
  });
  it("can compress the outfield depth to 6 m while retaining the midpoint and selected width", () => {
    const project = createDemo();
    const extent = (compactness: number) => {
      const poses = shapePoses(project, { ...DEFAULT_SHAPE, compactness });
      const values = Object.entries(poses)
        .filter(([id]) => id !== "home-1")
        .map(([, p]) => p);
      return {
        depth: Math.max(...values.map((p) => p.x)) - Math.min(...values.map((p) => p.x)),
        width: Math.max(...values.map((p) => p.z)) - Math.min(...values.map((p) => p.z)),
      };
    };
    expect(extent(0).depth).toBeCloseTo(52);
    expect(extent(50).depth).toBeCloseTo(37);
    expect(extent(100).depth).toBeCloseTo(6);
    expect(extent(100).width).toBeCloseTo(DEFAULT_SHAPE.width);
  });
  it("reverses attacking/defensive thirds and positive field-height movement for away", () => {
    const project = createDemo();
    for (const team of ["home", "away"] as const) {
      const x = (third: "defensive" | "middle" | "attacking", tilt = 0) =>
        shapePoses(project, { ...DEFAULT_SHAPE, team, third, tilt })[`${team}-2`].x;
      const sign = team === "home" ? 1 : -1;
      expect((x("attacking") - x("middle")) * sign).toBeGreaterThan(0);
      expect((x("defensive") - x("middle")) * sign).toBeLessThan(0);
      expect((x("middle", 20) - x("middle", -20)) * sign).toBeCloseTo(40);
    }
  });
  it("retains a manually positioned keeper when changing field height at an intermediate key", () => {
    for (const team of ["home", "away"] as const) {
      const project = createDemo(),
        id = `${team}-1`;
      for (const frame of project.frames)
        frame.players[id] = { x: team === "home" ? -45 : 45, z: 4, body: 30, head: -20, pitch: 5 };
      const before = sample(project, 2),
        next = applyShape(project, 2, { ...DEFAULT_SHAPE, team, tilt: 20 }, "outfield");
      expect(sample(next, 2).players[id]).toEqual(before.players[id]);
      expect(sample(next, 2).players[`${team}-2`].x).not.toBe(before.players[`${team}-2`].x);
      expect(next.frames[0]).toEqual(project.frames[0]);
      expect(next.frames.at(-1)).toEqual(project.frames.at(-1));
    }
  });
  it("shifts left and right in attack-relative coordinates without changing the shape width", () => {
    const project = createDemo();
    for (const team of ["home", "away"] as const)
      for (const formation of FORMATIONS)
        for (const width of [20, 62]) {
          const middle = shapePoses(project, { ...DEFAULT_SHAPE, team, formation, width });
          for (const bias of [-100, 100]) {
            const shifted = shapePoses(project, { ...DEFAULT_SHAPE, team, formation, width, bias });
            const dz = shifted[`${team}-2`].z - middle[`${team}-2`].z;
            expect(Math.sign(dz)).toBe(Math.sign(bias) * (team === "home" ? 1 : -1));
            for (let n = 2; n <= 11; n++) {
              const id = `${team}-${n}`;
              expect(shifted[id].z - middle[id].z).toBeCloseTo(dz);
              expect(Math.abs(shifted[id].z)).toBeLessThanOrEqual(32);
            }
          }
        }
  });
  it("supports custom 11-a-side shapes and rejects incomplete/invalid configurations", () => {
    expect(formationLines("3-3-1-3")).toEqual([3, 3, 1, 3]);
    for (const invalid of ["4-2-2", "3-5-3", "10", "0-5-5", "foo", "4--4-2"])
      expect(() => formationLines(invalid)).toThrow();
  });
});
describe("live defence", () => {
  it("slides a rigid zone block with a ball holder and leaves the keeper and opponents intact", () => {
    const project = createDemo(),
      frame = sample(project, 0);
    project.defence = defencePlan(project, frame, "away", "zone");
    const start = resolveDefence(project, frame);
    frame.players[frame.ball.owner!].z += 10;
    const moved = resolveDefence(project, frame);
    expect(moved.players["away-2"].z - start.players["away-2"].z).toBeCloseTo(6.5);
    expect(moved.players["away-3"].z - start.players["away-3"].z).toBeCloseTo(6.5);
    expect(moved.players["away-1"]).toEqual(frame.players["away-1"]);
    expect(moved.players["home-3"]).toEqual(frame.players["home-3"]);
  });
  it("clamps the entire block together on both touchlines", () => {
    const project = createDemo(),
      frame = sample(project, 0);
    project.defence = defencePlan(project, frame, "home", "zone");
    frame.ball = { x: 60, z: 42, y: 0.11, owner: null, arc: 0 };
    const resolved = resolveDefence(project, frame);
    for (const p of Object.values(resolved.players)) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(52.5);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(34);
    }
    expect(resolved.players["home-3"].z - resolved.players["home-4"].z).toBeCloseTo(
      frame.players["home-3"].z - frame.players["home-4"].z,
    );
  });
  it("keeps unique man assignments goal-side and follows target movement", () => {
    const project = createDemo(),
      frame = sample(project, 0);
    project.defence = defencePlan(project, frame, "away", "man");
    expect(new Set(Object.values(project.defence.marks)).size).toBe(10);
    const target = project.defence.marks["away-2"];
    const first = resolveDefence(project, frame).players["away-2"];
    expect(first.x).toBeGreaterThan(frame.players[target].x);
    frame.players[target].z += 5;
    expect(resolveDefence(project, frame).players["away-2"].z).toBeGreaterThan(first.z + 4);
    expect(parseProject(JSON.stringify(project))).toEqual(project);
    project.defence.marks["away-2"] = "away-3";
    expect(() => parseProject(JSON.stringify(project))).toThrow();
  });
  it("rejects missing anchors, nonfinite references and duplicate marking assignments", () => {
    const project = createDemo();
    project.defence = defencePlan(project, sample(project, 0), "home", "man");
    const a = clone(project);
    delete a.defence!.anchors["home-2"];
    expect(() => parseProject(JSON.stringify(a))).toThrow();
    const b = clone(project);
    b.defence!.reference.x = Infinity;
    expect(() => parseProject(JSON.stringify(b))).toThrow();
    const c = clone(project);
    c.defence!.marks["home-2"] = c.defence!.marks["home-3"];
    expect(() => parseProject(JSON.stringify(c))).toThrow();
  });
});
describe("phases and viewing", () => {
  it("generates every phase in both team perspectives with valid, editable endpoints", () => {
    for (const phase of PHASES)
      for (const team of ["home", "away"] as const) {
        const project = phaseProject(createDemo(), phase, team);
        expect(project.frames[0].t).toBe(0);
        expect(project.frames.at(-1)!.t).toBe(12);
        expect(parseProject(JSON.stringify(project))).toEqual(project);
        for (const t of [0, 1.5, 3, 6, 9, 12]) {
          const f = resolveDefence(project, sample(project, t));
          expect(Object.keys(f.players)).toHaveLength(22);
          expect(Number.isFinite(f.ball.x)).toBe(true);
        }
        for (const { t } of project.frames.slice(1, -1))
          expect(
            Math.abs(sample(project, t - 0.00001).ball.x - sample(project, t + 0.00001).ball.x),
          ).toBeLessThan(0.001);
      }
  });
  it("keeps presets usable when imported role labels have no unique GK", () => {
    for (const role of ["CM", "GK"]) {
      const base = createDemo();
      base.roster.forEach((p) => (p.role = role));
      for (const phase of PHASES)
        expect(() => parseProject(JSON.stringify(phaseProject(base, phase, "home")))).not.toThrow();
      base.defence = defencePlan(base, sample(base, 0), "home", "man");
      expect(Object.keys(base.defence.marks)).toHaveLength(10);
      expect(parseProject(JSON.stringify(base))).toEqual(base);
    }
  });
  it("choreographs a backward cutback, triangular overload and retreat toward own goal", () => {
    const base = createDemo(),
      phase = (id: string) =>
        phaseProject(
          base,
          PHASES.find((p) => p.id === id)!,
          "home",
        );
    const attack = phase("final-third");
    expect(sample(attack, 10).ball.x).toBeLessThan(sample(attack, 8.8).ball.x);
    const buildup = phase("build-up");
    expect(sample(buildup, 1).ball.owner).toBe("home-1");
    expect(sample(buildup, 1.9).ball.owner).toBeNull();
    expect(sample(buildup, 2).ball.owner).toBe("home-3");
    expect(sample(phase("counter"), 0).ball.owner).toBe("away-6");
    expect(sample(phase("counter"), 1).ball.owner).toBe("home-6");
    const overload = phase("overload").frames[0].players,
      [a, b, c] = ["home-2", "home-7", "home-8"].map((id) => overload[id]);
    expect(Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z))).toBeGreaterThan(1);
    const retreat = phase("recovery");
    expect(retreat.frames.at(-1)!.players["home-6"].x).toBeLessThan(
      retreat.frames[0].players["home-6"].x - 10,
    );
  });
  it("looks exactly at balls behind the torso without exceeding neck constraints", () => {
    const pose = { x: 0, z: 0, body: 0, head: 0, pitch: 0 },
      ball = { x: -20, z: 0, y: 0.11 };
    const gaze = gazeAtBall(pose, ball);
    expect(Math.abs(gaze.head)).toBeLessThanOrEqual(110);
    expect(wrap(gaze.body + gaze.head)).toBe(-180);
    expect(gaze.pitch).toBeLessThan(0);
    const f = sample(createDemo(), 0),
      ballBefore = ballPosition(f);
    expect(withBallGaze(f, 1.72).ball).toEqual(ballBefore);
  });
  it("aligns both body and face to a ball behind the player and centres the neck", () => {
    const pose = { x: 0, z: 0, body: 0, head: 70, pitch: 10 },
      ball = { x: -20, z: 5, y: 0.11 };
    const faced = faceBall(pose, ball);
    expect(faced.head).toBe(0);
    expect(faced.body).toBeCloseTo(Math.atan2(5, -20) / RAD);
    expect(faced.pitch).toBeLessThan(0);
    expect(faced.x).toBe(0);
    expect(faced.z).toBe(0);
    expect(pose.head).toBe(70);
    expect(faceBall(pose, { x: 0, z: 0, y: 0.11 })).toEqual({ ...pose, head: 0 });
  });
  it("orients a selected subset without changing positions or the source frame", () => {
    const project = createDemo(),
      frame = sample(project, 0),
      before = clone(frame);
    const patches = orientPlayers(project, frame, ["away-2"], "goal", "body");
    expect(Object.keys(patches)).toEqual(["away-2"]);
    expect(Object.keys(patches["away-2"]).sort()).toEqual(["body", "head", "pitch"]);
    const p = frame.players["away-2"];
    expect(patches["away-2"].body).toBeCloseTo(Math.atan2(-p.z, -52.5 - p.x) / RAD);
    expect(patches["away-2"].head).toBe(0);
    expect(frame).toEqual(before);
  });
  it("directs all 22 players to the shared ball or their own opposing goal", () => {
    const project = createDemo(),
      frame = sample(project, 0),
      ids = project.roster.map((p) => p.id),
      ball = ballPosition(frame);
    for (const target of ["ball", "goal"] as const)
      for (const alignment of ["gaze", "body"] as const) {
        const patches = orientPlayers(project, frame, ids, target, alignment);
        expect(Object.keys(patches)).toHaveLength(22);
        for (const player of project.roster) {
          const p = frame.players[player.id],
            q = target === "ball" ? ball : { x: player.team === "home" ? 52.5 : -52.5, z: 0 };
          const yaw = Math.atan2(q.z - p.z, q.x - p.x) / RAD;
          expect(wrap(patches[player.id].body + patches[player.id].head - yaw)).toBeCloseTo(0);
          expect(Math.abs(patches[player.id].head)).toBeLessThanOrEqual(110);
          if (alignment === "body") expect(patches[player.id].head).toBe(0);
        }
      }
  });
  it("normalises diagonal FPS speed, respects yaw, sensitivity and pitch limits", () => {
    const p = { x: 0, z: 0, body: 90, head: 0, pitch: 0 };
    const straight = fpsPose(p, 1, 0, 0.05),
      diagonal = fpsPose(p, 1, 1, 0.05);
    expect(Math.hypot(straight.x, straight.z)).toBeCloseTo(0.25);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(0.25);
    expect(straight.z).toBeCloseTo(0.25);
    expect(fpsLook(p, 100, 1000, 0.2)).toMatchObject({ body: 110, head: 0, pitch: -45 });
    expect(fpsPose({ ...p, z: 34 }, 1, 0, 0.05).z).toBe(34);
  });
  it("combines movement and look, retaining both across commits before another render", () => {
    const start = { x: 0, z: 0, body: 0, head: 0, pitch: 0 };
    const input = { forward: 1, right: 0, seconds: 0.05, dx: 100, dy: 25, sensitivity: 0.2 };
    const step = fpsStep(start, input);
    expect(step.body).toBeCloseTo(20);
    expect(step.pitch).toBeCloseTo(-5);
    expect(step.x).toBeCloseTo(0.25 * Math.cos(20 * RAD));
    expect(step.z).toBeCloseTo(0.25 * Math.sin(20 * RAD));
    const project = createDemo();
    project.frames[0].players["home-6"] = start;
    const turned = applyFpsInput(project, 0, "home-6", input);
    const moved = applyFpsInput(turned, 0, "home-6", { ...input, dx: 0, dy: 0 });
    expect(moved.frames[0].players["home-6"]).toMatchObject({ body: 20, pitch: -5, head: 0 });
    expect(moved.frames[0].players["home-6"].x).toBeCloseTo(step.x * 2);
    expect(moved.frames[0].players["home-6"].z).toBeCloseTo(step.z * 2);
    expect(project.frames[0].players["home-6"]).toEqual(start);
  });
  it("extends the goal-post diagonals to the penalty-area corners on both ends", () => {
    expect(BIELSA_ZONES[1].points).toEqual([
      [36, -20.16],
      [52.5, -3.66],
      [52.5, 3.66],
      [36, 20.16],
    ]);
    expect(BIELSA_ZONES[0].points).toEqual(BIELSA_ZONES[1].points.map(([x, z]) => [-x, z]));
    const [corner, post] = BIELSA_ZONES[1].points;
    const atGoalArea = (47 - corner[0]) / (post[0] - corner[0]);
    expect(corner[1] + (post[1] - corner[1]) * atGoalArea).toBeCloseTo(-9.16);
  });
  it("shows only a distance/angle illustration for eligible ground shots and mirrors teams", () => {
    const near = illustrativeXg({ x: 41, z: 0, y: 0.11 }, "home"),
      far = illustrativeXg({ x: 20, z: 0, y: 0.11 }, "home"),
      wide = illustrativeXg({ x: 41, z: 20, y: 0.11 }, "home");
    expect(near.value!).toBeGreaterThan(far.value!);
    expect(near.value!).toBeGreaterThan(wide.value!);
    expect(near).toEqual(illustrativeXg({ x: -41, z: 0, y: 0.11 }, "away"));
    expect(near.angle * RAD).toBeGreaterThan(0);
    expect(illustrativeXg({ x: 52.5, z: 0, y: 0.11 }, "home").value).toBe(null);
    expect(illustrativeXg({ x: -53, z: 0, y: 0.11 }, "home").value).toBe(null);
    expect(illustrativeXg({ x: 53, z: 0, y: 0.11 }, "away").value).toBe(null);
    expect(illustrativeXg({ x: 41, z: 0, y: 2 }, "home").value).toBe(null);
  });
});
