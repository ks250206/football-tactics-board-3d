/**
 * Skeleton and pose solver. Turns the model pose plus a planned gait state into bone transforms:
 * planted feet through two-bone leg IK, a pelvis that rides over them, counter-rotating shoulders,
 * swinging arms and a head that keeps the authored gaze. Uses Three.js maths only (no renderer).
 *
 * Everything is a kinematic approximation tuned by eye; it is not a biomechanical model.
 * Root space: metres at the 1.80 m reference scale, +x left, +y up, +z forward.
 */
import * as T from "three";
import { BODY, BONES, PARENTS, bindJoints, type BoneName } from "./anatomy";
import { RAD, type Pose } from "./core";
import type { MotionState } from "./motion";

export type Bones = Record<BoneName, T.Bone>;
export interface RigTraits {
  /** Height relative to the 1.80 m reference. */
  scale: number;
  keeper: boolean;
  /** 0..1, de-synchronises idle motion between athletes. */
  seed: number;
}

/** Bones in the bind pose, parented as in `PARENTS`. The caller adds `pelvis` to its root. */
export function createSkeleton(): Bones {
  const joints = bindJoints(),
    bones = {} as Bones;
  for (const name of BONES) {
    const bone = new T.Bone(),
      parent = PARENTS[name],
      at = joints[name],
      from = parent ? joints[parent] : [0, 0, 0];
    bone.name = name;
    bone.position.set(at[0] - from[0], at[1] - from[1], at[2] - from[2]);
    bones[name] = bone;
    if (parent) bones[parent].add(bone);
  }
  return bones;
}

/** Place an athlete's root at a model pose: yaw zero faces +x, and the body is scaled by height. */
export function placeRoot(root: T.Object3D, pose: Pose, scale: number): void {
  root.position.set(pose.x, 0, pose.z);
  root.rotation.set(0, Math.PI / 2 - pose.body * RAD, 0);
  root.scale.setScalar(scale);
}

const TAU = Math.PI * 2;
const X = new T.Vector3(1, 0, 0),
  Y = new T.Vector3(0, 1, 0),
  Z = new T.Vector3(0, 0, 1);
const LEG = BODY.thigh + BODY.shin;
/** Hip height when standing with the knees just off full extension. */
const STAND = BODY.ankleY + LEG * 0.992;
/** The pelvis bone sits this far above the line through both hip joints. */
const HIP_DROP = bindJoints().pelvis[1] - BODY.hipY;
const ARM_AXIS = [1, -1].map((side) => new T.Vector3(side * Math.sin(BODY.armRest), -Math.cos(BODY.armRest), 0));

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (lo: number, hi: number, x: number) => {
  const t = clamp((x - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};
const softMin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface Rig {
  /** Pose the bones. `time` only drives breathing and idle sway. */
  solve: (pose: Pose, motion: MotionState, time: number) => void;
  /** Ankle targets of the last solve in root space (left, right), for tests and diagnostics. */
  ankles: [T.Vector3, T.Vector3];
}

export function createRig(bones: Bones, traits: RigTraits): Rig {
  // Scratch objects: a solve allocates nothing.
  const qPelvis = new T.Quaternion(),
    qSpine = new T.Quaternion(),
    qChest = new T.Quaternion(),
    qTrunk = new T.Quaternion(),
    qThigh = new T.Quaternion(),
    qShin = new T.Quaternion(),
    qFoot = new T.Quaternion(),
    qA = new T.Quaternion(),
    qB = new T.Quaternion(),
    qC = new T.Quaternion(),
    identity = new T.Quaternion(),
    basis = new T.Matrix4(),
    pelvis = new T.Vector3(),
    hip = new T.Vector3(),
    knee = new T.Vector3(),
    reach = new T.Vector3(),
    pole = new T.Vector3(),
    hinge = new T.Vector3(),
    along = new T.Vector3(),
    forward = new T.Vector3(),
    up = new T.Vector3(),
    ankles: [T.Vector3, T.Vector3] = [new T.Vector3(), new T.Vector3()],
    headings = [0, 0],
    pitches = [0, 0];
  const euler = (out: T.Quaternion, yaw: number, roll: number, pitch: number) =>
    out.setFromAxisAngle(Y, yaw).multiply(qA.setFromAxisAngle(Z, roll)).multiply(qB.setFromAxisAngle(X, pitch));
  /** Orientation whose -y axis points along `direction` and whose x axis is the joint hinge. */
  const aim = (out: T.Quaternion, direction: T.Vector3) => {
    up.copy(direction).negate();
    forward.crossVectors(hinge, up);
    return out.setFromRotationMatrix(basis.makeBasis(hinge, up, forward));
  };

  function solve(pose: Pose, m: MotionState, time: number): void {
    const s = traits.scale,
      yaw = pose.body * RAD,
      cos = Math.cos(yaw),
      sin = Math.sin(yaw),
      pace = m.speed / s,
      moving = smooth(0.05, 0.5, pace),
      run = m.run * moving,
      sprint = smooth(3.5, 8.5, pace),
      ground = Math.hypot(m.forward, m.left),
      forwardness = ground > 0.05 ? m.forward / ground : 1,
      sideways = ground > 0.05 ? m.left / ground : 0,
      ahead = Math.max(0, forwardness),
      // +1 at left touchdown / left mid-stance, -1 for the right foot.
      stride = Math.cos(TAU * m.phase),
      stance = Math.cos(TAU * (m.phase - m.duty / 2)),
      ready = traits.keeper ? 1 - smooth(1.2, 3, pace) : 0,
      idle = Math.sin(TAU * 0.11 * time + traits.seed * TAU) * (1 - moving),
      breath = Math.sin(TAU * (0.24 + 0.3 * run) * time + traits.seed * 9) * (0.012 + 0.01 * run);

    const kick = m.kick && m.kick.weight > 1e-3 ? m.kick : null,
      kickSide = kick ? (kick.foot ? -1 : 1) : 0,
      // -1 through the backswing, 0 at contact, +1 through the follow-through.
      swingThrough = kick ? (kick.progress < 0 ? smooth(-0.4, 0, kick.progress) - 1 : smooth(0, 0.4, kick.progress)) : 0,
      kicking = kick ? kick.weight : 0;

    // Trunk lean: into the run, into accelerations (which include turning), away from a kicking leg.
    const leanForward = clamp(
        (0.02 + 0.07 * run + 0.09 * sprint) * (0.55 + 0.45 * forwardness) * moving + Math.atan(m.accelForward / 9.81) * 0.45 + 0.12 * ready - kicking * (0.04 + 0.1 * (kick?.power ?? 0)),
        -0.22,
        0.42,
      ),
      leanLeft = clamp(Math.atan(m.accelLeft / 9.81) * 0.5 + 0.04 * sideways * moving - kickSide * 0.12 * kicking, -0.3, 0.3),
      pelvisTwist = -(5 + 3 * run) * RAD * stride * moving * forwardness + kickSide * -0.25 * swingThrough * kicking,
      list = (4 + run) * RAD * stance * moving,
      chestTwist = (4 + 5 * run + 3 * sprint) * RAD * stride * moving * forwardness - pelvisTwist;
    euler(qPelvis, pelvisTwist, list - 0.3 * leanLeft, 0.3 * leanForward + 0.05 * run);
    euler(qSpine, 0.4 * chestTwist, -0.35 * leanLeft - 0.5 * list, 0.35 * leanForward);
    euler(qChest, 0.6 * chestTwist, -0.35 * leanLeft - 0.3 * list + 0.004 * idle, 0.35 * leanForward + breath);

    // Ankle targets from the planted footprints, rolled about the heel or the ball of the foot.
    for (let f = 0; f < 2; f++) {
      const foot = m.feet[f],
        dx = foot.x - pose.x,
        dz = foot.z - pose.z;
      let lx = (dx * sin - dz * cos) / s,
        lz = (dx * cos + dz * sin) / s;
      // Impossible speeds would stretch the leg flat; let the foot slide instead.
      const far = Math.hypot(lx, lz);
      if (far > 0.78) {
        lx *= 0.78 / far;
        lz *= 0.78 / far;
      }
      const heading = wrapAngle(yaw - foot.yaw),
        fx = Math.sin(heading),
        fz = Math.cos(heading),
        psi = foot.pitch,
        angle = Math.abs(psi),
        // Heel-up pivots about the ball of the foot, toes-up about the heel.
        arm = psi >= 0 ? BODY.ball : -BODY.heel,
        shift = arm - arm * Math.cos(angle) + (psi >= 0 ? 1 : -1) * BODY.ankleY * Math.sin(angle);
      ankles[f].set(lx + fx * shift, Math.abs(arm) * Math.sin(angle) + BODY.ankleY * Math.cos(angle) + foot.lift / s, lz + fz * shift);
      headings[f] = heading;
      pitches[f] = psi;
    }
    if (kick) {
      // Swing the kicking foot back, through the ball (0.48 m ahead of the body) and on along its path.
      const f = kick.foot,
        direction = wrapAngle(yaw - kick.yaw),
        dx = Math.sin(direction),
        dz = Math.cos(direction),
        power = kick.power,
        ballZ = 0.48 / s,
        back = 0.22 + 0.22 * power,
        through = 0.12 + 0.3 * power,
        t = kick.progress < 0 ? Math.pow(smooth(-0.45, 0, kick.progress), 1.6) - 1 : 1 - Math.pow(1 - Math.min(1, kick.progress / 0.55), 2);
      // t: -1 top of the backswing, 0 contact, +1 end of the follow-through.
      const from = t < 0 ? -t : 0,
        to = t > 0 ? t : 0,
        cx = -dx * 0.17,
        cz = ballZ - dz * 0.17;
      reach.set(
        mix(mix(cx, kickSide * BODY.hipX - dx * back, from), dx * through, to),
        mix(mix(0.125, 0.3 + 0.25 * power, from), 0.3 + 0.4 * power + 0.2 * kick.loft, to),
        mix(mix(cz, -dz * back, from), ballZ + dz * through, to),
      );
      ankles[f].lerp(reach, kicking);
      // A pass is struck with the inside of the foot turned out; a shot with the laces, toes down.
      headings[f] = headings[f] + wrapAngle(direction + kickSide * mix(1.2, 0.2, power) - headings[f]) * kicking;
      pitches[f] = mix(pitches[f], mix(0.05, 0.7, power), kicking);
    }

    // Pelvis: sway over the standing foot, bounce through each running stride, and never ride so
    // high that a planted (or landing) foot is out of reach.
    const crouch = traits.keeper ? 0.006 + 0.05 * ready : 0.006,
      walkHeight = STAND - crouch,
      runHeight = STAND - crouch - 0.04 - (0.034 - 0.008 * sprint) * Math.cos(2 * TAU * (m.phase - m.duty / 2));
    // Defensive footwork (backwards, sideways) sits lower.
    let hipHeight = mix(walkHeight, runHeight, run) - 0.02 * kicking - 0.045 * (1 - ahead) * moving;
    const swayX = (0.02 - 0.012 * run) * stance * moving + 0.006 * idle,
      hipSpread = Math.cos(pelvisTwist) * BODY.hipX;
    for (let f = 0; f < 2; f++) {
      const foot = m.feet[f],
        side = f ? -1 : 1,
        distance = Math.hypot(ankles[f].x - (swayX + side * hipSpread), ankles[f].z + side * Math.sin(pelvisTwist) * BODY.hipX),
        ceiling = ankles[f].y + Math.sqrt(Math.max((LEG * 0.998) ** 2 - distance * distance, 0.04)),
        weight = (foot.plant ? 1 : smooth(0.55, 1, foot.swing)) * (kick && kick.foot === f ? 1 - kicking : 1);
      hipHeight = softMin(hipHeight, mix(hipHeight + 0.2, ceiling, weight), 0.02);
    }
    // Out-of-reach targets (authored teleports) are left unreached rather than squatted towards.
    hipHeight = Math.max(hipHeight, 0.8);
    pelvis.set(0, HIP_DROP, 0).applyQuaternion(qPelvis).add(reach.set(swayX, hipHeight, 0));
    bones.pelvis.position.copy(pelvis);
    bones.pelvis.quaternion.copy(qPelvis);
    bones.spine.quaternion.copy(qSpine);
    bones.chest.quaternion.copy(qChest);
    qTrunk.copy(qPelvis).multiply(qSpine).multiply(qChest);

    // Head: keep exactly the authored gaze, whatever the trunk is doing underneath.
    qA.setFromAxisAngle(Y, -pose.head * RAD).multiply(qB.setFromAxisAngle(X, -pose.pitch * RAD));
    qC.copy(qTrunk).invert().multiply(qA);
    bones.neck.quaternion.copy(identity).slerp(qC, 0.4);
    bones.head.quaternion.copy(bones.neck.quaternion).invert().multiply(qC);

    for (let f = 0; f < 2; f++) {
      const side = f ? -1 : 1,
        L = f === 0,
        heading = headings[f],
        planted = m.feet[f].plant && !(kick && kick.foot === f);
      hip.set(side * BODY.hipX, -HIP_DROP, 0).applyQuaternion(qPelvis).add(pelvis);
      reach.copy(ankles[f]).sub(hip);
      const length = clamp(reach.length(), 0.3, LEG * 0.9995);
      along.copy(reach).normalize();
      // The knee points where the foot points, biased forwards and slightly outwards.
      pole.set(Math.sin(heading) * 0.7 + side * 0.07, 0, Math.cos(heading) * 0.7 + 0.5).applyQuaternion(qPelvis);
      pole.addScaledVector(along, -pole.dot(along));
      if (pole.lengthSq() < 1e-6) pole.copy(Z);
      hinge.crossVectors(pole.normalize(), along).normalize();
      const bend = Math.acos(clamp((BODY.thigh ** 2 + length ** 2 - BODY.shin ** 2) / (2 * BODY.thigh * length), -1, 1));
      along.applyQuaternion(qA.setFromAxisAngle(hinge, -bend));
      knee.copy(hip).addScaledVector(along, BODY.thigh);
      aim(qThigh, along);
      // Aim the shin at the reachable point on the hip-to-ankle line (the ankle itself when in reach).
      reach.setLength(length).add(hip).sub(knee).normalize();
      aim(qShin, reach);
      qFoot.setFromAxisAngle(Y, heading).multiply(qA.setFromAxisAngle(X, pitches[f]));
      bones[L ? "thighL" : "thighR"].quaternion.copy(qPelvis).invert().multiply(qThigh);
      bones[L ? "shinL" : "shinR"].quaternion.copy(qThigh).invert().multiply(qShin);
      bones[L ? "footL" : "footR"].quaternion.copy(qShin).invert().multiply(qFoot);
      // Toes stay flat on the turf while the heel rises, and relax once the foot leaves it.
      const flat = planted ? 1 : 0.35 + 0.65 * (1 - smooth(0, 0.25, m.feet[f].swing)) * (kick && kick.foot === f ? 0 : 1);
      bones[L ? "toeL" : "toeR"].quaternion.setFromAxisAngle(X, -Math.max(0, pitches[f]) * flat);

      // Arms swing against the legs: the left arm is furthest forward at right touchdown.
      const swing = -side * Math.cos(TAU * (m.phase - 0.04)),
        amplitude = mix(0.3 * Math.min(1, pace / 1.4), 0.62 + 0.3 * sprint, run) * moving * (0.3 + 0.7 * ahead),
        guard = (1 - ahead) * moving,
        opposite = kickSide === -side ? kicking : 0,
        same = kickSide === side ? kicking : 0;
      let flex = amplitude * swing + mix(0.03, -0.12, run) + 0.02 * idle * side,
        elbow = mix(0.24 + 0.14 * Math.max(0, swing) * moving, 1.42 + 0.32 * swing, run),
        abduct = 0.05 + 0.1 * run + 0.12 * guard,
        twist = 0.12 + 0.3 * run;
      // Backpedalling and side-stepping carry the arms low and wide for balance.
      elbow = mix(elbow, 0.75, guard);
      flex = mix(flex, 0.22, ready) + 0.55 * opposite * (0.4 + swingThrough * 0.6) - 0.5 * same * (0.3 + swingThrough * 0.7);
      elbow = mix(elbow, 1.0, ready) * (1 - 0.4 * opposite);
      abduct += 0.3 * ready + 0.6 * opposite + 0.25 * same;
      bones[L ? "upperArmL" : "upperArmR"].quaternion
        .setFromAxisAngle(X, -flex)
        .multiply(qA.setFromAxisAngle(Z, side * abduct))
        .multiply(qB.setFromAxisAngle(ARM_AXIS[f], side * twist));
      bones[L ? "forearmL" : "forearmR"].quaternion.setFromAxisAngle(X, -elbow);
      bones[L ? "handL" : "handR"].quaternion.setFromAxisAngle(X, -0.06);
    }
  }
  return { solve, ankles };
}
