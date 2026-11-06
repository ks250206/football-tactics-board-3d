import type { Body, Snapshot } from './analysis';
export type BlockKind = 'clear' | 'defender' | 'keeper' | 'teammate';
export const LANE_COLORS: Record<BlockKind, string> = { clear: '#2dd4bf', defender: '#fb7185', keeper: '#fbbf24', teammate: '#c4b5fd' };
export interface GoalCell { z: number; y: number; width: number; height: number; kind: BlockKind }
export interface Lane { z0: number; z1: number; kind: BlockKind }
export interface ShotGeometry { shot: Snapshot['shot']; goalX: number; cells: GoalCell[]; lanes: Lane[]; openFraction: number }

/** Standing cylinders + ball radius, NOT interception/save/block probabilities. */
export function firstBlocker(from: Snapshot['shot'], to: { x: number; y: number; z: number }, bodies: Body[], shooter: string | null): BlockKind {
  const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y, a = dx * dx + dz * dz;
  if (a < 1e-10) return 'clear';
  let nearest = Infinity, kind: BlockKind = 'clear';
  for (const p of bodies) {
    if (p.id === shooter) continue;
    const radius = (p.keeper ? .55 : .35) + .11;
    const ox = from.x - p.x, oz = from.z - p.z;
    const b = 2 * (ox * dx + oz * dz), c = ox * ox + oz * oz - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) continue;
    let lo = Math.max(0, (-b - Math.sqrt(discriminant)) / (2 * a));
    let hi = Math.min(1, (-b + Math.sqrt(discriminant)) / (2 * a));
    if (Math.abs(dy) < 1e-10) { if (from.y < 0 || from.y > p.height + .11) continue; }
    else {
      const y0 = -from.y / dy, y1 = (p.height + .11 - from.y) / dy;
      lo = Math.max(lo, Math.min(y0, y1)); hi = Math.min(hi, Math.max(y0, y1));
    }
    if (hi >= lo && lo < 1 && lo < nearest) {
      nearest = lo; kind = !p.opponent ? 'teammate' : p.keeper ? 'keeper' : 'defender';
    }
  }
  return kind;
}
export function shotGeometry(s: Snapshot): ShotGeometry | null {
  if (![s.shot.x, s.shot.y, s.shot.z].every(Number.isFinite) || Math.abs(s.shot.x) >= 52.5 || Math.abs(s.shot.z) > 34 || s.shot.y > .5 || s.shot.y < 0) return null;
  const goalX = s.team === 'home' ? 52.5 : -52.5;
  const cells: GoalCell[] = [], lanes: Lane[] = [], width = 7.32 / 24, height = 2.44 / 8;
  for (let iz = 0; iz < 24; iz++) {
    const z = -3.66 + (iz + .5) * width;
    lanes.push({ z0: z - width / 2, z1: z + width / 2, kind: firstBlocker(s.shot, { x: goalX, y: .11, z }, s.bodies, s.shooter) });
    for (let iy = 0; iy < 8; iy++) {
      const y = (iy + .5) * height;
      cells.push({ z, y, width, height, kind: firstBlocker(s.shot, { x: goalX, y, z }, s.bodies, s.shooter) });
    }
  }
  return { shot: s.shot, goalX, cells, lanes, openFraction: cells.filter(c => c.kind === 'clear').length / cells.length };
}
