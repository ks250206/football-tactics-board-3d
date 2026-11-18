import { describe, expect, it } from "vite-plus/test";
import * as T from "three";
import { createDemo, RAD, sample, type Ball, type Pose } from "../src/core";
import { planMotion, runBlend, strideLength, type MotionPlan } from "../src/motion";
import { createRig, createSkeleton, placeRoot } from "../src/rig";

const ID = "home-6";
const BALL: Ball = { x: 40, z: 20, y: 0.11, owner: null, arc: 0 };
/** One player following `path`; `body` is constant unless the path sets it. */
function plan(path: (t: number) => Partial<Pose>, duration = 12, height = 1.8, keys = [{ t: 0, owner: null as string | null }, { t: duration, owner: null }], ball: (t: number) => Ball = () => BALL) {
  const pose = (t: number): Pose => ({ x: 0, z: 0, body: 0, head: 0, pitch: 0, ...path(t) });
  return {
    pose,
    motion: planMotion({ roster: [{ id: ID, height }], duration, keys, frameAt: (t) => ({ players: { [ID]: pose(t) }, ball: ball(t) }) }),
  };
}
const times = (from: number, to: number, step = 1 / 120) => Array.from({ length: Math.round((to - from) / step) }, (_, i) => from + i * step);
/** Body-frame offset (forwards, to the left) of a world point from a pose. */
function local(pose: Pose, x: number, z: number) {
  const yaw = pose.body * RAD,
    dx = x - pose.x,
    dz = z - pose.z;
  return { forward: dx * Math.cos(yaw) + dz * Math.sin(yaw), left: dx * Math.sin(yaw) - dz * Math.cos(yaw) };
}

describe("gait planning", () => {
  it("keeps a planted foot at one world position until it lifts off", () => {
    for (const speed of [0.3, 1.4, 3.5, 8]) {
      const { motion } = plan((t) => ({ x: -40 + speed * t }));
      let previous = motion.sample(ID, 3);
      for (const t of times(3, 9)) {
        const state = motion.sample(ID, t);
        state.feet.forEach((foot, i) => {
          const before = previous.feet[i];
          // Two consecutive planted samples belong to the same step unless a whole swing fitted between them.
          if (foot.plant && before.plant && Math.hypot(foot.x - before.x, foot.z - before.z) < 0.2) {
            expect(foot.x).toBe(before.x);
            expect(foot.z).toBe(before.z);
          }
        });
        previous = state;
      }
    }
  });

  it("moves each foot continuously and never beyond a leg's reach at human speeds", () => {
    for (const speed of [0.3, 1.4, 2.4, 3.5, 6, 9]) {
      const { motion, pose } = plan((t) => ({ x: -50 + speed * t }), 10);
      let previous = motion.sample(ID, 2);
      for (const t of times(2, 8)) {
        const state = motion.sample(ID, t),
          at = pose(t);
        state.feet.forEach((foot, i) => {
          // A swinging foot peaks at two to three times the body's speed; slow shuffles take quick short steps.
          expect(Math.hypot(foot.x - previous.feet[i].x, foot.z - previous.feet[i].z)).toBeLessThan((speed * 3.2 + 1.5) / 120);
          expect(Math.hypot(foot.x - at.x, foot.z - at.z)).toBeLessThan(0.86);
          expect(foot.lift).toBeGreaterThanOrEqual(0);
        });
        previous = state;
      }
    }
  });

  it("walks with double support and runs with a flight phase", () => {
    const airborne = (speed: number) => {
      const { motion } = plan((t) => ({ x: -40 + speed * t }));
      return times(3, 8).map((t) => motion.sample(ID, t).feet.filter((f) => f.plant).length);
    };
    expect(Math.min(...airborne(1.4))).toBe(1);
    expect(Math.max(...airborne(1.4))).toBe(2);
    expect(Math.min(...airborne(5))).toBe(0);
    expect(Math.max(...airborne(5))).toBe(1);
    expect(runBlend(1.4)).toBe(0);
    expect(runBlend(4)).toBe(1);
  });

  it("advances the cycle by distance, at a human cadence even for impossible speeds", () => {
    for (const speed of [1.4, 3.5, 8, 60]) {
      const { motion } = plan((t) => ({ x: -52 + Math.min(104, speed * t) }), 10);
      const cycles = motion.sample(ID, 1.5).phase - motion.sample(ID, 0.5).phase;
      expect(cycles).toBeGreaterThan(0);
      expect(cycles).toBeLessThanOrEqual(2.05);
      if (speed <= 8) expect(cycles).toBeCloseTo(speed / strideLength(speed, 1), 1);
    }
    const { motion } = plan((t) => ({ x: t }));
    let last = -Infinity;
    for (const t of times(0, 12, 0.05)) {
      const phase = motion.sample(ID, t).phase;
      expect(phase).toBeGreaterThanOrEqual(last);
      last = phase;
    }
  });

  it("stands still on two planted feet under the hips", () => {
    const { motion, pose } = plan(() => ({ x: 3, z: -4, body: 30 }));
    const a = motion.sample(ID, 2),
      b = motion.sample(ID, 9);
    expect(a.speed).toBe(0);
    expect(b.phase).toBe(a.phase);
    a.feet.forEach((foot, i) => {
      const offset = local(pose(2), foot.x, foot.z);
      expect(foot.plant).toBe(1);
      expect(foot.lift).toBe(0);
      expect(foot.pitch).toBeCloseTo(0, 6);
      expect(Math.abs(offset.forward)).toBeLessThan(0.02);
      expect(offset.left * (i ? -1 : 1)).toBeGreaterThan(0.05);
      expect(Math.abs(offset.left)).toBeLessThan(0.16);
    });
  });

  it("side-steps without crossing the feet and backpedals with low feet", () => {
    // Facing +x while travelling towards +z is a step to the athlete's right.
    const side = plan((t) => ({ z: -15 + 2.5 * t }));
    for (const t of times(3, 8)) {
      const state = side.motion.sample(ID, t),
        [left, right] = state.feet.map((foot) => local(side.pose(t), foot.x, foot.z).left);
      expect(left).toBeGreaterThan(right);
      expect(state.forward).toBeCloseTo(0, 6);
      expect(state.left).toBeCloseTo(-2.5, 3);
    }
    const lift = (direction: number) => {
      const { motion } = plan((t) => ({ x: direction * (-20 + 3 * t) }));
      return Math.max(...times(3, 8).flatMap((t) => motion.sample(ID, t).feet.map((f) => f.lift)));
    };
    expect(lift(-1)).toBeLessThan(lift(1) * 0.4);
  });

  it("steps round when turning on the spot", () => {
    const { motion } = plan((t) => ({ body: -180 + Math.min(360, t * 90) }));
    expect(motion.sample(ID, 3).phase - motion.sample(ID, 1).phase).toBeGreaterThan(0.5);
    expect(motion.sample(ID, 11).phase).toBe(motion.sample(ID, 8).phase);
  });

  it("is a pure function of time and scales stride with height", () => {
    const { motion } = plan((t) => ({ x: -30 + 4 * t, z: Math.sin(t) * 3 }));
    const first = motion.sample(ID, 4.321);
    for (const t of [9, 0, 11.9, 2]) motion.sample(ID, t);
    expect(motion.sample(ID, 4.321)).toEqual(first);
    expect(motion.sample(ID, -5)).toEqual(motion.sample(ID, 0));
    expect(motion.sample(ID, 99)).toEqual(motion.sample(ID, 12));
    const cycles = (height: number) => {
      const m = plan((t) => ({ x: -30 + 4 * t }), 12, height).motion;
      return m.sample(ID, 8).phase - m.sample(ID, 4).phase;
    };
    expect(cycles(1.6)).toBeGreaterThan(cycles(2.0));
  });

  it("turns a ball leaving its owner into a kick with the far foot", () => {
    const kick = (angle: number, speed: number, owner: string | null = null) => {
      const keys = [{ t: 0, owner: ID as string | null }, { t: 2, owner: ID }, { t: 4, owner }];
      const ball = (t: number) =>
        t <= 2 ? { x: 0.48, z: 0, y: 0.11, owner: ID, arc: 0 } : { x: 0.48 + Math.cos(angle * RAD) * speed * (t - 2), z: Math.sin(angle * RAD) * speed * (t - 2), y: 0.11, owner: null, arc: 0 };
      return plan(() => ({}), 6, 1.8, keys, ball).motion;
    };
    const pass = kick(-40, 10);
    expect(pass.sample(ID, 1)).toMatchObject({ kick: null });
    const contact = pass.sample(ID, 2).kick!;
    expect(contact.progress).toBeCloseTo(0, 6);
    expect(contact.weight).toBe(1);
    // A pass to the athlete's left (-z when facing +x) is struck with the right foot.
    expect(contact.foot).toBe(1);
    expect(contact.yaw).toBeCloseTo(-40 * RAD, 3);
    expect(kick(40, 10).sample(ID, 2).kick!.foot).toBe(0);
    expect(kick(0, 28).sample(ID, 2).kick!.power).toBeGreaterThan(contact.power);
    expect(pass.sample(ID, 1.8).kick!.progress).toBeLessThan(0);
    expect(pass.sample(ID, 2.2).kick!.progress).toBeGreaterThan(0);
    expect(pass.sample(ID, 3)).toMatchObject({ kick: null });
    // Keeping the ball is not a kick.
    expect(kick(0, 0, ID).sample(ID, 2).kick).toBeNull();
  });

  it("plans every player of a full project quickly", () => {
    const project = createDemo("through");
    const started = performance.now();
    const motion = planMotion({ roster: project.roster, duration: project.duration, keys: project.frames.map((f) => ({ t: f.t, owner: f.ball.owner })), frameAt: (t) => sample(project, t) });
    expect(performance.now() - started).toBeLessThan(1500);
    for (const player of project.roster)
      for (const t of [0, 3.3, 7.5, 12]) {
        const state = motion.sample(player.id, t);
        for (const value of [state.speed, state.phase, state.forward, state.left, ...state.feet.flatMap((f) => [f.x, f.z, f.yaw, f.lift, f.pitch])]) expect(Number.isFinite(value)).toBe(true);
      }
    expect(project.roster.some((p) => times(0, 12, 0.05).some((t) => motion.sample(p.id, t).kick))).toBe(true);
  });
});

/** A posed skeleton under a root, as the renderer builds it. */
function posed(motion: MotionPlan, pose: Pose, t: number, height = 1.8, keeper = false) {
  const bones = createSkeleton(),
    root = new T.Group(),
    rig = createRig(bones, { scale: height / 1.8, keeper, seed: 0.3 });
  root.add(bones.pelvis);
  placeRoot(root, pose, height / 1.8);
  rig.solve(pose, motion.sample(ID, t), t);
  root.updateMatrixWorld(true);
  return { bones, root, rig };
}
const world = (bone: T.Object3D) => new T.Vector3().setFromMatrixPosition(bone.matrixWorld);

describe("pose solver", () => {
  it("puts a flat planted foot exactly on its footprint in world space", () => {
    for (const [speed, height] of [
      [1.4, 1.8],
      [3.5, 1.95],
      [0.4, 1.62],
    ]) {
      const { motion, pose } = plan((t) => ({ x: -30 + speed * t, body: 20 }), 12, height);
      let checked = 0;
      for (const t of times(3, 8, 1 / 60)) {
        const state = motion.sample(ID, t),
          { bones } = posed(motion, pose(t), t, height);
        state.feet.forEach((foot, i) => {
          if (!foot.plant || Math.abs(foot.pitch) > 0.01) return;
          const ankle = world(i ? bones.footR : bones.footL);
          expect(Math.hypot(ankle.x - foot.x, ankle.z - foot.z)).toBeLessThan(0.004);
          expect(ankle.y).toBeCloseTo(0.095 * (height / 1.8), 2);
          checked++;
        });
      }
      expect(checked).toBeGreaterThan(20);
    }
  });

  it("keeps the authored gaze whatever the body does", () => {
    const { motion, pose } = plan((t) => ({ x: -40 + 7 * t, z: Math.sin(t * 2) * 4, body: 35, head: -70, pitch: 18 }));
    for (const t of [0.4, 2, 3.37, 5.1, 9.9]) {
      const { bones } = posed(motion, pose(t), t),
        gaze = new T.Vector3(0, 0, 1).transformDirection(bones.head.matrixWorld),
        yaw = (35 - 70) * RAD,
        pitch = 18 * RAD;
      expect(gaze.x).toBeCloseTo(Math.cos(yaw) * Math.cos(pitch), 5);
      expect(gaze.y).toBeCloseTo(Math.sin(pitch), 5);
      expect(gaze.z).toBeCloseTo(Math.sin(yaw) * Math.cos(pitch), 5);
    }
  });

  it("never bends a knee backwards or produces invalid transforms", () => {
    const paths: [(t: number) => Partial<Pose>, boolean][] = [
      [(t) => ({ x: -50 + 9 * t }), false],
      [(t) => ({ x: t < 5 ? -40 : 45 }), false], // an authored teleport
      [(t) => ({ x: Math.sin(t * 3) * 6, z: Math.cos(t * 2) * 6, body: t * 200 }), true],
      [() => ({}), true],
    ];
    for (const [path, keeper] of paths) {
      const { motion, pose } = plan(path, 10);
      for (const t of times(0, 10, 1 / 30)) {
        const { bones } = posed(motion, pose(t), t, 1.8, keeper);
        for (const bone of Object.values(bones)) for (const value of [...bone.quaternion.toArray(), ...bone.position.toArray()]) expect(Number.isFinite(value)).toBe(true);
        for (const shin of [bones.shinL, bones.shinR]) {
          // The knee is a hinge about the thigh's x axis; flexion is a positive turn.
          const angle = 2 * Math.atan2(shin.quaternion.x, shin.quaternion.w);
          expect(Math.atan2(Math.sin(angle), Math.cos(angle))).toBeGreaterThan(-1e-3);
          expect(Math.abs(shin.quaternion.y) + Math.abs(shin.quaternion.z)).toBeLessThan(1e-3);
        }
        expect(world(bones.pelvis).y).toBeGreaterThan(0.8);
        expect(world(bones.head).y).toBeGreaterThan(1.2);
      }
    }
  });

  it("drives the kicking foot through the ball", () => {
    const keys = [{ t: 0, owner: ID as string | null }, { t: 2, owner: ID }, { t: 4, owner: null }];
    const ball = (t: number) => (t <= 2 ? { x: 0.48, z: 0, y: 0.11, owner: ID, arc: 0 } : { x: 0.48 + 14 * (t - 2), z: 0, y: 0.11, owner: null, arc: 0 });
    const { motion, pose } = plan(() => ({}), 6, 1.8, keys, ball);
    const foot = (t: number) => {
      const state = motion.sample(ID, t).kick!,
        { bones } = posed(motion, pose(t), t);
      return { ankle: world(state.foot ? bones.footR : bones.footL), support: world(state.foot ? bones.footL : bones.footR) };
    };
    const back = foot(1.78),
      contact = foot(2),
      through = foot(2.18);
    expect(back.ankle.x).toBeLessThan(-0.1);
    expect(back.ankle.y).toBeGreaterThan(0.25);
    // At contact the ankle is just behind the ball, a boot's width off the turf.
    expect(contact.ankle.x).toBeGreaterThan(0.2);
    expect(contact.ankle.x).toBeLessThan(0.48);
    expect(contact.ankle.y).toBeLessThan(0.2);
    expect(through.ankle.x).toBeGreaterThan(0.5);
    for (const sample of [back, contact, through]) {
      expect(sample.support.y).toBeCloseTo(0.095, 2);
      expect(Math.abs(sample.support.x)).toBeLessThan(0.05);
    }
  });
});
