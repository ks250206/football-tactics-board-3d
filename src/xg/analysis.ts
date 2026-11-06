import { squad, distance, type Frame, type Project, type Team } from '../core';
import type { Booster } from './booster';
import { predictBooster } from './booster';

export type ModelId = 'near' | 'oneOnOne' | 'far';
export const MODEL_FILES: Record<ModelId, string> = {
  near: 'xG_foot_openplay_inside_not_1on1.json',
  oneOnOne: 'xG_foot_openplay_inside_1on1.json',
  far: 'xG_foot_openplay_outside.json',
};
export const FEATURES: Record<ModelId, string[]> = {
  near: ['angle', 'distance', 'y_gk', 'x_gk', 'DistanceGk', 'num_opposing_players'],
  oneOnOne: ['angle', 'distance', 'DistanceShooterGk', 'DistanceGk', 'num_opposing_players'],
  far: ['angle', 'y', 'DistanceShooterGk', 'distance', 'minus'],
};
export interface Point { x: number; z: number }
export interface Body extends Point { id: string; keeper: boolean; opponent: boolean; height: number }
export interface Snapshot {
  team: Team; time: number; shot: Point & { y: number }; shooter: string | null;
  oneOnOne: boolean; bodies: Body[];
}
export interface Prediction {
  value: number | null; model: ModelId | null; reason: string | null;
  distance: number; angle: number; opponentsInCone: number;
}
export interface HeatCell extends Point { width: number; depth: number; value: number }
export interface AnalysisResult { prediction: Prediction; heatmap: HeatCell[] }
export interface Request { key: string; snapshot: Snapshot; heatmap: boolean }
export interface Response extends AnalysisResult { key: string; team: Team; time: number }
export type ModelSet = Record<ModelId, Booster>;

/** Locking the camera also locks the attack direction, independent of edit selection. */
export function analysisTeam(project: Project, frame: Frame, focused: string, locked: boolean): Team {
  const viewer = project.roster.find(p => p.id === focused) ?? project.roster[0];
  const owner = project.roster.find(p => p.id === frame.ball.owner);
  return locked ? viewer.team : owner?.team ?? viewer.team;
}

/** Capture only analysis inputs: pose orientation and ball arc must not invalidate xG.
 * The resolved ball position is retained, including real movement when its owner turns. */
export function snapshot(project: Project, frame: Frame, team: Team, focused: string, oneOnOne: boolean): Snapshot {
  const keepers = new Set([squad(project.roster, 'home').keeper?.id, squad(project.roster, 'away').keeper?.id]);
  const owner = project.roster.find(p => p.id === frame.ball.owner);
  const viewer = project.roster.find(p => p.id === focused && p.team === team);
  // Never exempt the player being dragged. For a free ball, only a nearby
  // analysis subject can be its shooter; opponents and remote teammates block.
  const shooter = owner?.team === team ? owner.id : !owner && viewer &&
    distance(frame.players[viewer.id], frame.ball) <= 1 ? viewer.id : null;
  return {
    team, time: frame.t, shot: { x: frame.ball.x, z: frame.ball.z, y: frame.ball.y }, shooter, oneOnOne,
    bodies: project.roster.map(p => ({ id: p.id, x: frame.players[p.id].x, z: frame.players[p.id].z, height: p.height, keeper: keepers.has(p.id), opponent: p.team !== team })),
  };
}
function piecewise(value: number, source: readonly number[], target: readonly number[]) {
  let i = 0;
  while (i < source.length - 2 && value > source[i + 1]) i++;
  return target[i] + (value - source[i]) * (target[i + 1] - target[i]) / (source[i + 1] - source[i]);
}
/** Landmark-aware standardisation: goalposts, goal/penalty boxes and halfway line
 * agree exactly. A single 120/105 x 80/68 scale would distort the goal mouth. */
export function toStatsBomb(point: Point, team: Team): { x: number; y: number } {
  const sign = team === 'home' ? 1 : -1;
  return {
    x: piecewise(sign * point.x + 52.5, [0, 5.5, 11, 16.5, 52.5, 88.5, 94, 99.5, 105], [0, 6, 12, 18, 60, 102, 108, 114, 120]),
    y: piecewise(sign * point.z, [-34, -20.16, -9.16, -3.66, 0, 3.66, 9.16, 20.16, 34], [0, 18, 30, 36, 40, 44, 50, 62, 80]),
  };
}
export function goalDistance(p: { x: number; y: number }) {
  return Math.hypot(120 - p.x, Math.max(36 - p.y, p.y - 44, 0));
}
function insideCone(p: { x: number; y: number }, shot: { x: number; y: number }) {
  const dx = 120 - shot.x;
  if (dx <= 0 || p.x < shot.x || p.x > 120) return false;
  const t = (p.x - shot.x) / dx;
  return p.y >= shot.y + (36 - shot.y) * t - 1e-9 && p.y <= shot.y + (44 - shot.y) * t + 1e-9;
}
export function extractFeatures(s: Snapshot) {
  const p = toStatsBomb(s.shot, s.team);
  const opponents = s.bodies.filter(b => b.opponent);
  const keeper = opponents.find(b => b.keeper);
  const g = keeper ? toStatsBomb(keeper, s.team) : null;
  const dx = 120 - p.x;
  const angle = Math.abs(Math.atan2(8 * dx, dx * dx + (p.y - 40) ** 2 - 16)) * 180 / Math.PI;
  const f: Record<string, number> = {
    angle, distance: goalDistance(p), y: p.y, x_gk: g?.x ?? NaN, y_gk: g?.y ?? NaN,
    DistanceGk: g ? goalDistance(g) : NaN,
    DistanceShooterGk: g ? Math.hypot(p.x - g.x, p.y - g.y) : NaN,
    minus: g ? p.x - g.x : NaN,
    // Upstream counts EVERY opponent in the triangle, including the keeper.
    num_opposing_players: opponents.filter(b => insideCone(toStatsBomb(b, s.team), p)).length,
  };
  return { f, hasKeeper: !!g };
}
export function predictShot(models: ModelSet, s: Snapshot): Prediction {
  const { f, hasKeeper } = extractFeatures(s);
  const result: Prediction = { value: null, model: null, reason: null, distance: Math.hypot((s.team === 'home' ? 52.5 : -52.5) - s.shot.x, s.shot.z), angle: f.angle, opponentsInCone: f.num_opposing_players };
  if (![s.shot.x, s.shot.y, s.shot.z].every(Number.isFinite) || Math.abs(s.shot.x) >= 52.5 || Math.abs(s.shot.z) > 34 || s.shot.y < 0 || s.shot.y > .5) return { ...result, reason: '地上シュートのみ：高さ0–0.5 m・ピッチ内が対象です。' };
  if (!hasKeeper) return { ...result, reason: '相手GKの位置を設定してください。' };
  if (f.distance > 20 && s.oneOnOne) return { ...result, reason: '遠距離の1対1は、この学習済みモデルの対象外です。' };
  const id: ModelId = f.distance > 20 ? 'far' : s.oneOnOne ? 'oneOnOne' : 'near';
  return { ...result, model: id, value: predictBooster(models[id], FEATURES[id].map(n => f[n])) };
}
export function analyseXg(models: ModelSet, s: Snapshot, heatmap: boolean): AnalysisResult {
  const cells: HeatCell[] = [], nx = 26, nz = 34, width = 52.5 / nx, depth = 68 / nz;
  if (heatmap) for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
    const x = (s.team === 'home' ? 1 : -1) * (ix + .5) * width;
    const z = -34 + (iz + .5) * depth;
    const p = predictShot(models, { ...s, shot: { x, z, y: .11 } });
    if (p.value !== null) cells.push({ x, z, width, depth, value: p.value });
  }
  return { prediction: predictShot(models, s), heatmap: cells };
}
export function probabilityColor(value: number) {
  const stops = [[0, 38, 69, 137], [.1, 20, 160, 163], [.3, 234, 193, 74], [.6, 240, 104, 66], [1, 172, 39, 81]];
  const v = Math.max(0, Math.min(1, value));
  let i = 0; while (i < stops.length - 2 && v > stops[i + 1][0]) i++;
  const a = stops[i], b = stops[i + 1], t = (v - a[0]) / (b[0] - a[0]);
  return `rgb(${[1, 2, 3].map(j => Math.round(a[j] + (b[j] - a[j]) * t)).join(',')})`;
}
