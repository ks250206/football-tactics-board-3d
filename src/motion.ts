/**
 * Pure locomotion planning. A timeline is sampled once into per-player tracks; every pose is then
 * a deterministic function of time, so scrubbing, looping and recording always agree.
 *
 * The gait is a kinematic approximation driven by distance travelled: cadence, stride length and
 * ground-contact fractions come from hand-fitted tables, not from a biomechanical simulation or
 * motion capture. Feet are planted at fixed world positions between touchdown and lift-off.
 *
 * World space: metres, yaw in radians with zero facing +x and positive turning towards +z
 * (the athlete's right). Foot 0 is the left foot, foot 1 the right.
 */
import { RAD, type Ball, type Pose } from "./core";

export interface MotionFrame {
  players: Record<string, Pose>;
  ball: Ball;
}
export interface MotionInput {
  roster: { id: string; height: number }[];
  duration: number;
  /** Authored keyframes: a ball leaving its owner between two of them is a kick. */
  keys: { t: number; owner: string | null }[];
  frameAt: (t: number) => MotionFrame;
}
export interface FootState {
  /** Footprint reference: the ankle's ground projection when the foot is flat. */
  x: number;
  z: number;
  yaw: number;
  /** Ankle height above its standing height. */
  lift: number;
  /** Positive rolls onto the toes (heel up); negative raises the toes (heel strike). */
  pitch: number;
  /** 1 while the foot is planted on the ground. */
  plant: number;
  /** Swing progress 0..1; 0 while planted. */
  swing: number;
}
export interface KickState {
  foot: 0 | 1;
  /** Blend weight of the kicking motion. */
  weight: number;
  /** -1 start of the backswing, 0 ball contact, +1 end of the follow-through. */
  progress: number;
  /** 0 a soft pass … 1 a driven shot. */
  power: number;
  /** World direction of the ball after contact. */
  yaw: number;
  loft: number;
}
export interface MotionState {
  /** Smoothed ground speed, plus an allowance for turning on the spot. */
  speed: number;
  /** Smoothed velocity in the body frame: forwards and towards the athlete's left. */
  forward: number;
  left: number;
  accelForward: number;
  accelLeft: number;
  /** Gait cycles since the plan's origin; a foot touches down once per cycle. */
  phase: number;
  /** Fraction of a cycle each foot spends on the ground. */
  duty: number;
  /** 0 walking … 1 running (there is a flight phase). */
  run: number;
  feet: [FootState, FootState];
  kick: KickState | null;
}

interface Step {
  x: number;
  z: number;
  yaw: number;
  duty: number;
}
interface Kick {
  t: number;
  before: number;
  after: number;
  foot: 0 | 1;
  power: number;
  yaw: number;
  loft: number;
}
interface Track {
  scale: number;
  x: Float64Array;
  z: Float64Array;
  yaw: Float64Array;
  vx: Float64Array;
  vz: Float64Array;
  ax: Float64Array;
  az: Float64Array;
  speed: Float64Array;
  phase: Float64Array;
  /** Per foot: steps indexed from `first[foot]`, one per cycle. */
  steps: [Step[], Step[]];
  first: [number, number];
  kicks: Kick[];
}
export interface MotionPlan {
  duration: number;
  sample: (id: string, t: number) => MotionState;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (lo: number, hi: number, x: number) => {
  const t = clamp((x - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};
const table = (xs: number[], ys: number[]) => (x: number) => {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return mix(ys[i - 1], ys[i], (x - xs[i - 1]) / (xs[i] - xs[i - 1]));
  return ys[ys.length - 1];
};

/** Distance covered by one full cycle (two steps) of a 1.80 m athlete moving forwards. */
const STRIDE = table([0, 0.5, 1, 1.5, 2.2, 3.5, 5, 7, 9], [0.36, 0.72, 1.18, 1.5, 1.9, 2.5, 3.3, 4, 4.4]);
const MAX_CADENCE = 9 / 4.4;
const DUTY = table([0, 0.3, 0.8, 1.4, 2, 2.6, 3.5, 5, 7, 9], [0.8, 0.78, 0.7, 0.62, 0.56, 0.4, 0.35, 0.3, 0.265, 0.235]);
/** Extra "speed" per rad/s so a player turning on the spot still takes steps. */
const TURN_RADIUS = 0.22;
const SAMPLE_RATE = 30;
const MAX_SAMPLES = 3000;
const TOE_OUT = 7 * RAD;

export const runBlend = (speed: number) => smooth(1.9, 2.7, speed);
/** Stride length for a speed and the fraction of it directed forwards (-1 backwards … 1). */
export function strideLength(speed: number, forwardness: number, scale = 1): number {
  const forwards = speed > 9 ? speed / MAX_CADENCE : STRIDE(speed);
  // Side steps are well under half a forward stride; backpedalling is roughly three quarters.
  const direction = 0.4 + (forwardness > 0 ? 0.6 : 0.32) * forwardness * forwardness;
  return Math.max(0.3, forwards * direction) * scale;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/** Triangular moving average; the window is clipped at both ends of the timeline. */
function smoothed(values: Float64Array, radius: number): Float64Array {
  if (radius < 1) return values.slice();
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0,
      weight = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j < 0 || j >= values.length) continue;
      const w = radius + 1 - Math.abs(k);
      sum += values[j] * w;
      weight += w;
    }
    out[i] = sum / weight;
  }
  return out;
}

export function planMotion(input: MotionInput): MotionPlan {
  const duration = Math.max(input.duration, 1e-3),
    n = clamp(Math.ceil(duration * SAMPLE_RATE), 2, MAX_SAMPLES),
    dt = duration / n,
    frames = Array.from({ length: n + 1 }, (_, i) => input.frameAt(Math.min(duration, i * dt)));
  const at = (values: Float64Array, t: number) => {
    const u = clamp(t / dt, 0, n),
      i = Math.min(n - 1, Math.floor(u));
    return mix(values[i], values[i + 1], u - i);
  };
  const tracks = new Map<string, Track>();

  for (const player of input.roster) {
    const x = new Float64Array(n + 1),
      z = new Float64Array(n + 1),
      yaw = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const pose = frames[i].players[player.id];
      x[i] = pose.x;
      z[i] = pose.z;
      const angle = pose.body * RAD;
      // Unwrap so interpolation never spins the long way round.
      yaw[i] = i ? yaw[i - 1] + Math.atan2(Math.sin(angle - yaw[i - 1]), Math.cos(angle - yaw[i - 1])) : angle;
    }
    const derivative = (values: Float64Array) => {
      const out = new Float64Array(n + 1);
      for (let i = 0; i <= n; i++) out[i] = (values[Math.min(n, i + 1)] - values[Math.max(0, i - 1)]) / ((Math.min(n, i + 1) - Math.max(0, i - 1)) * dt);
      return out;
    };
    // Keyframes are joined by straight lines, so raw velocity steps. Smooth what drives the body.
    const radius = Math.round(0.24 / dt),
      vx = smoothed(derivative(x), radius),
      vz = smoothed(derivative(z), radius),
      omega = smoothed(derivative(yaw), radius),
      ax = smoothed(derivative(vx), radius),
      az = smoothed(derivative(vz), radius);
    const scale = player.height / 1.8,
      speed = new Float64Array(n + 1),
      cadence = new Float64Array(n + 1),
      phase = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const ground = Math.hypot(vx[i], vz[i]);
      speed[i] = ground + TURN_RADIUS * Math.abs(omega[i]);
      const forwardness = ground > 0.05 ? (vx[i] * Math.cos(yaw[i]) + vz[i] * Math.sin(yaw[i])) / ground : 1;
      cadence[i] = speed[i] / strideLength(speed[i] / scale, forwardness, scale);
    }
    phase[0] = hash(player.id);
    for (let i = 1; i <= n; i++) phase[i] = phase[i - 1] + 0.5 * (cadence[i - 1] + cadence[i]) * dt;

    /** First time the phase reaches a value (it never decreases). */
    const timeAt = (value: number) => {
      if (value <= phase[0]) return 0;
      if (value >= phase[n]) return duration;
      let lo = 0,
        hi = n;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (phase[mid] < value) lo = mid;
        else hi = mid;
      }
      return (lo + (value - phase[lo]) / (phase[hi] - phase[lo] || 1)) * dt;
    };
    const steps: [Step[], Step[]] = [[], []],
      first: [number, number] = [0, 0];
    for (const foot of [0, 1] as const) {
      const offset = foot * 0.5,
        side = foot ? -1 : 1;
      first[foot] = Math.floor(phase[0] - offset) - 1;
      const last = Math.ceil(phase[n] - offset) + 1;
      for (let k = first[foot]; k <= last; k++) {
        const touchdown = k + offset,
          landing = timeAt(touchdown),
          duty = DUTY(at(speed, landing) / scale),
          // Plant where the pelvis will be half-way through the stance, so the foot passes under the hip.
          t = timeAt(touchdown + duty * 0.5),
          heading = at(yaw, t),
          velocityX = at(vx, t),
          velocityZ = at(vz, t),
          ground = Math.hypot(velocityX, velocityZ),
          pace = at(speed, t) / scale,
          run = runBlend(pace),
          forwards = ground > 0.05 ? (velocityX * Math.cos(heading) + velocityZ * Math.sin(heading)) / ground : 1,
          sideways = Math.sqrt(Math.max(0, 1 - forwards * forwards)) * smooth(0.1, 0.6, pace),
          narrow = mix(0.1, 0.058, run) * scale,
          // A side-step keeps the feet from crossing: stand wider than half the ground each foot covers.
          width = mix(narrow, Math.max(narrow, 0.5 * duty * strideLength(pace, forwards, scale) + 0.04 * scale), sideways),
          // Touchdown happens closer to the body than toe-off; shift the print back along the travel.
          back = ground > 0.05 ? (mix(0.075, 0.17 + 0.05 * smooth(3.5, 8.5, pace), run) * smooth(0.3, 1.2, pace) * scale) / ground : 0;
        steps[foot].push({
          x: at(x, t) + Math.sin(heading) * side * width - velocityX * back,
          z: at(z, t) - Math.cos(heading) * side * width - velocityZ * back,
          yaw: heading - side * TOE_OUT,
          duty,
        });
      }
    }

    const kicks: Kick[] = [];
    input.keys.forEach((key, i) => {
      const next = input.keys[i + 1];
      if (!next || key.owner !== player.id || next.owner === player.id) return;
      const span = Math.min(0.12, next.t - key.t);
      if (span <= 0) return;
      const from = input.frameAt(key.t).ball,
        to = input.frameAt(key.t + span).ball,
        travelled = Math.hypot(to.x - from.x, to.z - from.z);
      if (travelled < 1e-3) return;
      const ballSpeed = travelled / span,
        direction = Math.atan2(to.z - from.z, to.x - from.x),
        heading = at(yaw, key.t),
        power = smooth(6, 24, ballSpeed),
        // Positive when the ball leaves towards the athlete's left.
        leftwards = Math.sin(heading - direction),
        cycle = phase[Math.round(clamp(key.t / dt, 0, n))],
        late = (foot: number) => (((cycle - foot * 0.5) % 1) + 1) % 1;
      let foot: 0 | 1;
      // A moving player strikes with the leg that is already swinging through.
      if (at(speed, key.t) > 0.7) foot = late(0) > late(1) ? 0 : 1;
      else if (Math.abs(leftwards) > 0.25) foot = leftwards > 0 ? 1 : 0;
      else foot = hash(`${player.id}:foot`) < 0.22 ? 0 : 1;
      kicks.push({
        t: key.t,
        before: 0.34 + 0.16 * power,
        after: 0.34 + 0.22 * power,
        foot,
        power,
        yaw: direction,
        loft: clamp((to.y - from.y) / travelled, 0, 1),
      });
    });
    tracks.set(player.id, { scale, x, z, yaw, vx, vz, ax, az, speed, phase, steps, first, kicks });
  }

  const angleMix = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
  function sample(id: string, time: number): MotionState {
    const track = tracks.get(id);
    if (!track) throw new Error(`No motion track for ${id}`);
    const t = clamp(time, 0, duration),
      heading = at(track.yaw, t),
      cos = Math.cos(heading),
      sin = Math.sin(heading),
      vx = at(track.vx, t),
      vz = at(track.vz, t),
      ax = at(track.ax, t),
      az = at(track.az, t),
      speed = at(track.speed, t),
      pace = speed / track.scale,
      phase = at(track.phase, t),
      run = runBlend(pace),
      ground = Math.hypot(vx, vz),
      forward = vx * cos + vz * sin,
      left = vx * sin - vz * cos,
      forwardness = ground > 0.05 ? forward / ground : 1,
      moving = smooth(0.02, 0.3, pace),
      stepping = smooth(0.1, 1.2, pace),
      sprint = smooth(3.5, 8.5, pace);
    // Heel strike and toe-off angles; reversed and halved when backpedalling, flat when side-stepping.
    const strike = mix(-0.26, -0.1, run) * stepping,
      toeOff = mix(0.95, 1.12, run) * stepping,
      // Walking barely clears the turf; running folds the heel up towards the hip.
      // Backpedalling and side-stepping keep the feet low and quick.
      ahead = Math.max(0, forwardness),
      height = (0.03 + 0.012 * (1 - run) + run * (0.26 + 0.3 * sprint) * (0.15 + 0.85 * ahead * ahead)) * moving * track.scale;
    const rolling = (q: number) => {
      const forwards = strike * (1 - smooth(0, 0.18, q)) + toeOff * Math.pow(smooth(0.5, 1, q), 1.3);
      if (forwardness >= 0) return forwards * forwardness;
      const mirrored = strike * (1 - smooth(0, 0.18, 1 - q)) + toeOff * Math.pow(smooth(0.5, 1, 1 - q), 1.3);
      return mirrored * -forwardness * 0.5;
    };
    const feet = [0, 1].map((foot): FootState => {
      const offset = foot * 0.5,
        k = Math.floor(phase - offset),
        list = track.steps[foot],
        index = clamp(k - track.first[foot], 0, list.length - 2),
        current = list[index],
        next = list[index + 1],
        local = clamp(phase - offset - k, 0, 1);
      if (local < current.duty)
        return { x: current.x, z: current.z, yaw: current.yaw, lift: 0, pitch: rolling(local / current.duty), plant: 1, swing: 0 };
      const u = (local - current.duty) / (1 - current.duty),
        // A runner's foot leaves the ground already moving; a walker's accelerates from rest.
        e = mix(u * u * (3 - 2 * u), 1 - (1 - u) * (1 - u), (0.35 - 0.17 * sprint) * run),
        side = foot ? -1 : 1,
        // The swinging foot arcs slightly outwards so it clears the standing leg.
        clear = 0.03 * run * Math.sin(Math.PI * u) * side * track.scale,
        yaw = angleMix(current.yaw, next.yaw, e);
      const x = mix(current.x, next.x, e) + sin * clear,
        z = mix(current.z, next.z, e) - cos * clear;
      // A player who stopped mid-step simply stands on that foot where it is.
      if (pace < 0.02) return { x, z, yaw, lift: 0, pitch: 0, plant: 1, swing: 0 };
      return {
        x,
        z,
        yaw,
        lift: height * Math.sin(Math.PI * Math.pow(u, mix(0.85, 0.55, run))),
        pitch: mix(rolling(1), rolling(0), smooth(0.05, 0.85, u)),
        plant: 0,
        swing: u,
      };
    }) as [FootState, FootState];

    let kick: KickState | null = null;
    for (const k of track.kicks) {
      if (t < k.t - k.before || t > k.t + k.after) continue;
      const progress = t < k.t ? (t - k.t) / k.before : (t - k.t) / k.after;
      kick = {
        foot: k.foot,
        weight: smooth(-1, -0.7, progress) * (1 - smooth(0.6, 1, progress)),
        progress,
        power: k.power,
        yaw: k.yaw,
        loft: k.loft,
      };
      break;
    }
    return {
      speed,
      forward,
      left,
      accelForward: ax * cos + az * sin,
      accelLeft: ax * sin - az * cos,
      phase,
      duty: DUTY(pace),
      run,
      feet,
      kick,
    };
  }
  return { duration, sample };
}
