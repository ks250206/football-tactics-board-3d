/** Pure tactical tools. Scripted teaching approximations, never match simulation. */
import {
  ballPosition,
  squad,
  clamp,
  clone,
  distance,
  RAD,
  upsert,
  wrap,
  type DefencePlan,
  type Frame,
  type Pose,
  type Project,
  type Team,
} from "./core";
import { choreographPhase } from "./phaseChoreography";

export const FORMATIONS = [
  "4-3-3",
  "4-2-3-1",
  "4-4-2",
  "4-1-4-1",
  "4-4-1-1",
  "4-2-2-2",
  "4-3-2-1",
  "4-3-1-2",
  "4-1-2-1-2",
  "4-2-4",
  "3-5-2",
  "3-4-3",
  "3-4-2-1",
  "3-4-1-2",
  "3-1-4-2",
  "3-3-3-1",
  "3-2-4-1",
  "3-2-5",
  "2-3-5",
  "2-4-4",
  "2-3-2-3",
  "5-3-2",
  "5-4-1",
  "5-2-3",
  "5-2-2-1",
  "4-5-1",
  "3-6-1",
  "6-3-1",
  "6-2-2",
  "4-1-3-2",
  "4-2-1-3",
  "3-3-1-3",
  "3-3-4",
  "2-2-6",
  "3-1-6",
  "2-4-3-1",
] as const;
export type Third = "defensive" | "middle" | "attacking";
export interface ShapeSettings {
  formation: string;
  team: Team;
  third: Third;
  compactness: number;
  width: number;
  tilt: number;
  bias: number;
}
export const DEFAULT_SHAPE: ShapeSettings = {
  formation: "4-3-3",
  team: "home",
  third: "middle",
  compactness: 50,
  width: 52,
  tilt: 0,
  bias: 0,
};
export function formationLines(value: string): number[] {
  if (!/^([1-9]-){1,9}[1-9]$/.test(value))
    throw new Error("配置は2〜10列、各列1〜9人、合計10人で指定してください（例: 3-2-5）。");
  const lines = value.split("-").map(Number);
  if (lines.reduce((a, b) => a + b, 0) !== 10)
    throw new Error("フィールド選手は合計10人にしてください（例: 4-4-2）。");
  return lines;
}
export function shapePoses(project: Project, options: ShapeSettings): Record<string, Pose> {
  const lines = formationLines(options.formation),
    sign = options.team === "home" ? 1 : -1;
  const compactness = clamp(options.compactness, 0, 100);
  // Preserve the original midpoint, with a much tighter upper half of the control.
  const length = compactness <= 50 ? 52 - compactness * 0.3 : 37 - (compactness - 50) * 0.62;
  const width = clamp(options.width, 20, 62);
  const center = clamp(
    { defensive: -27, middle: 0, attacking: 27 }[options.third] + clamp(options.tilt, -20, 20),
    -50 + length / 2,
    50 - length / 2,
  );
  const { keeper, outfield } = squad(project.roster, options.team);
  const span = lines.some((n) => n >= 3) ? width : lines.some((n) => n === 2) ? width * 0.5 : 0;
  // Translate as a block, retaining every line's width and a 2 m touchline margin.
  const lateral = (clamp(options.bias, -100, 100) / 100) * (32 - span / 2);
  const poses: Record<string, Pose> = {
    [keeper.id]: {
      x: sign * clamp(center - 34, -49, -16) || 0,
      z: sign * lateral * 0.25 || 0,
      body: sign === 1 ? 0 : 180,
      head: 0,
      pitch: 0,
    },
  };
  let index = 0;
  lines.forEach((count, line) => {
    for (let n = 0; n < count; n++) {
      const player = outfield[index++];
      if (!player) continue;
      // Wide lines occupy the full width; two central players stay in the half spaces.
      const span = count === 2 ? width * 0.5 : count === 1 ? 0 : width;
      poses[player.id] = {
        x: sign * (center - length / 2 + (line * length) / (lines.length - 1)) || 0,
        z: sign * (lateral + (count === 1 ? 0 : -span / 2 + (n * span) / (count - 1))) || 0,
        body: sign === 1 ? 0 : 180,
        head: 0,
        pitch: 0,
      };
    }
  });
  return poses;
}
export function applyShape(
  project: Project,
  time: number,
  options: ShapeSettings,
  scope: "team" | "outfield" = "team",
): Project {
  const poses = shapePoses(project, options);
  // Keep the sampled keeper pose (including manual edits) when adjusting field height.
  if (scope === "outfield") delete poses[squad(project.roster, options.team).keeper.id];
  const next = upsert(project, time, (f) => Object.assign(f.players, poses));
  if (next.defence?.team === options.team) delete next.defence;
  return next;
}

/** Turn the torso only when a target exceeds the supported neck range. */
export function gazeAtBall(
  pose: Pose,
  ball: { x: number; z: number; y: number },
  eye = 1.72,
): Pose {
  const d = distance(pose, ball);
  if (d < 0.01) return { ...pose };
  const bearing = Math.atan2(ball.z - pose.z, ball.x - pose.x) / RAD;
  const relative = wrap(bearing - pose.body),
    head = clamp(relative, -110, 110);
  return {
    ...pose,
    body: wrap(bearing - head),
    head,
    pitch: clamp(Math.atan2(ball.y - eye, d) / RAD, -45, 45),
  };
}
/** Align both absolute body and face yaw to the ball; keep the neck centred. */
export function faceBall(pose: Pose, ball: { x: number; z: number; y: number }, eye = 1.72): Pose {
  const d = distance(pose, ball);
  if (d < 0.01) return { ...pose, head: 0 };
  return {
    ...pose,
    body: wrap(Math.atan2(ball.z - pose.z, ball.x - pose.x) / RAD),
    head: 0,
    pitch: clamp(Math.atan2(ball.y - eye, d) / RAD, -45, 45),
  };
}
export type LookTarget = "ball" | "goal";
export type LookAlignment = "gaze" | "body";
/** Orientation-only patches keep authored positions and ball flight data intact. */
export function orientPlayers(
  project: Project,
  frame: Frame,
  ids: readonly string[],
  target: LookTarget,
  alignment: LookAlignment,
  eye = 1.72,
): Record<string, Pick<Pose, "body" | "head" | "pitch">> {
  const chosen = new Set(ids),
    ball = ballPosition(frame),
    patches: Record<string, Pick<Pose, "body" | "head" | "pitch">> = {};
  for (const player of project.roster) {
    if (!chosen.has(player.id)) continue;
    const point =
      target === "ball" ? ball : { x: player.team === "home" ? 52.5 : -52.5, z: 0, y: 1.22 };
    const p =
      alignment === "body"
        ? faceBall(frame.players[player.id], point, eye)
        : gazeAtBall(frame.players[player.id], point, eye);
    patches[player.id] = { body: p.body, head: p.head, pitch: p.pitch };
  }
  return patches;
}
export function withBallGaze(frame: Frame, eye: number): Frame {
  const ball = ballPosition(frame),
    players = { ...frame.players };
  for (const [id, pose] of Object.entries(players)) {
    // A holder looks along their body rather than down at their own boots.
    if (id !== frame.ball.owner) players[id] = gazeAtBall(pose, ball, eye);
  }
  return { ...frame, players, ball };
}

export function defencePlan(
  project: Project,
  frame: Frame,
  team: Team,
  mode: DefencePlan["mode"],
): DefencePlan {
  const anchors: DefencePlan["anchors"] = {},
    marks: Record<string, string> = {};
  const available = squad(project.roster, team === "home" ? "away" : "home").outfield.map(
    (p) => p.id,
  );
  for (const p of project.roster.filter((p) => p.team === team)) {
    const pose = frame.players[p.id];
    anchors[p.id] = { x: pose.x, z: pose.z };
    if (p.id === squad(project.roster, team).keeper.id || mode === "zone") continue;
    available.sort((a, b) => distance(pose, frame.players[a]) - distance(pose, frame.players[b]));
    const target = available.shift();
    if (target) marks[p.id] = target;
  }
  const ball = ballPosition(frame);
  return { team, mode, anchors, marks, reference: { x: ball.x, z: ball.z } };
}
/** A ball-oriented block translation or persistent, unique goal-side man assignments. */
export function resolveDefence(project: Project, frame: Frame): Frame {
  const plan = project.defence;
  if (!plan) return frame;
  const players = clone(frame.players),
    ball = ballPosition(frame),
    sign = plan.team === "home" ? 1 : -1;
  const block = squad(project.roster, plan.team).outfield;
  const xs = block.map((p) => plan.anchors[p.id].x),
    zs = block.map((p) => plan.anchors[p.id].z);
  const dx = clamp((ball.x - plan.reference.x) * 0.4, -51 - Math.min(...xs), 51 - Math.max(...xs));
  const dz = clamp((ball.z - plan.reference.z) * 0.65, -32 - Math.min(...zs), 32 - Math.max(...zs));
  for (const p of block) {
    const a = plan.anchors[p.id],
      target = frame.players[plan.marks[p.id]];
    if (plan.mode === "man" && target) {
      const goal = { x: -sign * 52.5, z: 0 },
        d = Math.max(0.01, distance(target, goal));
      players[p.id] = {
        ...players[p.id],
        x: clamp(target.x + ((goal.x - target.x) / d) * 1.6, -51, 51),
        z: clamp(target.z + ((goal.z - target.z) / d) * 1.6, -32, 32),
      };
    } else players[p.id] = { ...players[p.id], x: a.x + dx, z: a.z + dz };
    players[p.id] = gazeAtBall(players[p.id], ball);
  }
  const result = { ...frame, players };
  return { ...result, ball: ballPosition(result) };
}

/** Bake evaluated defensive positions before disabling/editing a live plan. */
export function bakeDefence(project: Project): Project {
  if (!project.defence) return project;
  const frames = project.frames.map((f) => resolveDefence(project, f));
  const { defence: _, ...rest } = project;
  return { ...rest, frames };
}

export interface Phase {
  id: string;
  name: string;
  defending?: boolean;
  note: string;
}
export const PHASES: Phase[] = [
  {
    id: "build-up",
    name: "保持 / 自陣ビルドアップ",
    note: "GKと後方3枚でプレスを引きつけ、ボランチ経由で右サイドへ",
  },
  {
    id: "progression",
    name: "保持 / ミドルサード前進",
    note: "縦パスと3人目のサポート",
  },
  {
    id: "final-third",
    name: "保持 / アタッキングサード崩し",
    note: "ハーフスペースからカットバック",
  },
  {
    id: "switch",
    name: "保持 / サイドチェンジ",
    note: "片側に寄せて逆サイドへ展開",
  },
  {
    id: "overload",
    name: "保持 / サイドの数的優位",
    note: "ウイング・IH・SBの三角形",
  },
  {
    id: "counter",
    name: "攻撃移行 / カウンター",
    note: "奪取地点から前線へ進出",
  },
  {
    id: "rest-defence",
    name: "保持 / レストディフェンス",
    note: "攻撃後方に3+2を残す",
  },
  {
    id: "high-press",
    name: "非保持 / 敵陣ハイプレス",
    defending: true,
    note: "相手の自陣保持に対する高い守備ブロック",
  },
  {
    id: "mid-block",
    name: "非保持 / ミドルブロック",
    defending: true,
    note: "相手の中盤保持に対する横スライド",
  },
  {
    id: "low-block",
    name: "非保持 / 自陣ローブロック",
    defending: true,
    note: "相手の崩しに対して中央を閉じる",
  },
  {
    id: "counterpress",
    name: "守備移行 / 即時奪回",
    defending: true,
    note: "ロスト直後、ボール近傍を圧縮",
  },
  {
    id: "recovery",
    name: "守備移行 / リトリート",
    defending: true,
    note: "中盤から自陣へブロックを戻す",
  },
];

/** Build a complete editable choreography in the requested team's perspective. */
export function phaseProject(base: Project, phase: Phase, team: Team): Project {
  const other: Team = team === "home" ? "away" : "home";
  return choreographPhase(base, phase.id, phase.name, phase.defending ? other : team);
}

export interface FpsInput {
  forward: number;
  right: number;
  seconds: number;
  dx: number;
  dy: number;
  sensitivity: number;
}
/** One atomic movement/look update, applied to the latest authored pose. */
export function fpsStep(pose: Pose, input: FpsInput): Pose {
  return fpsPose(
    fpsLook(pose, input.dx, input.dy, input.sensitivity),
    input.forward,
    input.right,
    input.seconds,
  );
}
export function applyFpsInput(
  project: Project,
  time: number,
  id: string,
  input: FpsInput,
): Project {
  const team = project.roster.find((p) => p.id === id)?.team;
  if (!team) return project;
  const base = project.defence?.team === team ? bakeDefence(project) : project;
  return upsert(base, time, (f) => {
    f.players[id] = fpsStep(f.players[id], input);
  });
}

export function fpsPose(pose: Pose, forward: number, right: number, seconds: number): Pose {
  const length = Math.hypot(forward, right) || 1,
    yaw = (pose.body + pose.head) * RAD,
    step = (5 * clamp(seconds, 0, 0.05)) / length;
  return {
    ...pose,
    x: clamp(pose.x + (Math.cos(yaw) * forward - Math.sin(yaw) * right) * step, -52.5, 52.5),
    z: clamp(pose.z + (Math.sin(yaw) * forward + Math.cos(yaw) * right) * step, -34, 34),
  };
}
export function fpsLook(pose: Pose, dx: number, dy: number, sensitivity: number): Pose {
  return {
    ...pose,
    body: wrap(pose.body + pose.head + dx * sensitivity),
    head: 0,
    pitch: clamp(pose.pitch - dy * sensitivity, -45, 45),
  };
}

/** Untrained illustrative logistic score. NOT an empirical probability or possession value. */
export function illustrativeXg(ball: { x: number; z: number; y: number }, team: Team) {
  const forward = 52.5 - (team === "home" ? ball.x : -ball.x),
    d = Math.hypot(forward, ball.z);
  const angle =
    forward <= 0
      ? 0
      : Math.atan2(7.32 * forward, forward * forward + ball.z * ball.z - 3.66 * 3.66);
  const value =
    Math.abs(ball.x) >= 52.5 || Math.abs(ball.z) > 34 || ball.y > 0.5
      ? null
      : 1 / (1 + Math.exp(-(-1.5 - 0.08 * d + 0.9 * angle)));
  return { value, distance: d, angle: angle / RAD };
}

export interface PitchZone {
  x: number;
  z: number;
  length: number;
  width: number;
  color: string;
  label: string;
}
export const LANE_ZONES: PitchZone[] = [-34, -20.16, -9.16, 9.16, 20.16].map((z, i) => ({
  x: -52.5,
  z,
  length: 105,
  width: [-20.16, -9.16, 9.16, 20.16, 34][i] - z,
  color: ["#246da8", "#65509b", "#28766f", "#65509b", "#246da8"][i],
  label: ["左ワイド", "左ハーフスペース", "中央", "右ハーフスペース", "右ワイド"][i],
}));
/** Full trapezoid from the goal posts to the penalty-area front corners.
 * The diagonals continue through the front goal-area corners. No scoring percentages. */
export const BIELSA_ZONES = [-1, 1].map((sign) => ({
  points: [
    [sign * 36, -20.16],
    [sign * 52.5, -3.66],
    [sign * 52.5, 3.66],
    [sign * 36, 20.16],
  ],
  color: "#f43f78",
}));
