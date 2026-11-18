/**
 * Procedural athlete anatomy. Muscles and bones are signed-distance primitives; every body part
 * is sampled into a skinned loft by casting rays from its bone axis. Original geometry: no scans,
 * no external assets. Proportions follow a 1.80 m reference; they are an artistic approximation.
 *
 * Model space: metres, +x is the athlete's left, +y up, +z forward (the facing direction).
 */
import * as T from "three";

export type V3 = readonly [number, number, number];

export const BONES = [
  "pelvis",
  "spine",
  "chest",
  "neck",
  "head",
  "upperArmL",
  "forearmL",
  "handL",
  "upperArmR",
  "forearmR",
  "handR",
  "thighL",
  "shinL",
  "footL",
  "toeL",
  "thighR",
  "shinR",
  "footR",
  "toeR",
] as const;
export type BoneName = (typeof BONES)[number];
const B = Object.fromEntries(BONES.map((name, i) => [name, i])) as Record<BoneName, number>;

export const PARENTS: Record<BoneName, BoneName | null> = {
  pelvis: null,
  spine: "pelvis",
  chest: "spine",
  neck: "chest",
  head: "neck",
  upperArmL: "chest",
  forearmL: "upperArmL",
  handL: "forearmL",
  upperArmR: "chest",
  forearmR: "upperArmR",
  handR: "forearmR",
  thighL: "pelvis",
  shinL: "thighL",
  footL: "shinL",
  toeL: "footL",
  thighR: "pelvis",
  shinR: "thighR",
  footR: "shinR",
  toeR: "footR",
};

/** Segment lengths and joint offsets shared by the mesh, the skeleton and the IK solver. */
export const BODY = {
  height: 1.8,
  hipX: 0.092,
  hipY: 0.945,
  thigh: 0.44,
  shin: 0.41,
  ankleY: 0.095,
  /** Ball of the foot / heel, measured along the foot from the ankle. */
  ball: 0.135,
  heel: 0.06,
  toeY: 0.03,
  shoulderX: 0.185,
  shoulderY: 1.43,
  shoulderZ: -0.012,
  /** Arms are modelled hanging 9° away from the body; the rig measures abduction from vertical. */
  armRest: (9 * Math.PI) / 180,
  upperArm: 0.3,
  forearm: 0.265,
  eyeY: 1.696,
} as const;
const ARM_DIR: V3 = [Math.sin(BODY.armRest), -Math.cos(BODY.armRest), 0];
const HEAD_CENTRE: V3 = [0, 1.69, 0.012];
/** Head and hair meshes are rigid children of the head bone; this is their origin in bone space. */
export const HEAD_OFFSET: V3 = [0, HEAD_CENTRE[1] - 1.585, HEAD_CENTRE[2]];

/** Bind-pose joint centres. `side` is +1 for the left limb and -1 for the right. */
export function bindJoints(): Record<BoneName, V3> {
  const arm = (side: number, length: number): V3 => [
    side * (BODY.shoulderX + ARM_DIR[0] * length),
    BODY.shoulderY + ARM_DIR[1] * length,
    BODY.shoulderZ,
  ];
  const kneeY = BODY.hipY - BODY.thigh;
  const leg = (side: number) => ({
    thigh: [side * BODY.hipX, BODY.hipY, 0] as V3,
    shin: [side * BODY.hipX, kneeY, 0] as V3,
    foot: [side * BODY.hipX, BODY.ankleY, 0] as V3,
    toe: [side * BODY.hipX, BODY.toeY, BODY.ball] as V3,
  });
  const l = leg(1),
    r = leg(-1);
  return {
    pelvis: [0, 0.985, 0],
    spine: [0, 1.085, -0.006],
    chest: [0, 1.245, -0.012],
    neck: [0, 1.49, -0.018],
    head: [0, 1.585, 0],
    upperArmL: arm(1, 0),
    forearmL: arm(1, BODY.upperArm),
    handL: arm(1, BODY.upperArm + BODY.forearm),
    upperArmR: arm(-1, 0),
    forearmR: arm(-1, BODY.upperArm),
    handR: arm(-1, BODY.upperArm + BODY.forearm),
    thighL: l.thigh,
    shinL: l.shin,
    footL: l.foot,
    toeL: l.toe,
    thighR: r.thigh,
    shinR: r.shin,
    footR: r.foot,
    toeR: r.toe,
  };
}

// ---------------------------------------------------------------------------------------------
// Signed-distance primitives
// ---------------------------------------------------------------------------------------------

interface Prim {
  kind: "ellipsoid" | "cone" | "floor";
  /** Smooth-union radius towards everything defined before this primitive. */
  k: number;
  cut: boolean;
  a: V3;
  b: V3;
  ra: number;
  rb: number;
  /** Row-major rotation taking model space into the primitive's frame (ellipsoids only). */
  rot: number[] | null;
}

/** Ellipsoid: centre, radii, blend radius, optional XYZ Euler rotation (radians). */
function E(
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  k = 0.02,
  euler?: V3,
): Prim {
  let rot: number[] | null = null;
  if (euler) {
    const m = new T.Matrix4().makeRotationFromEuler(new T.Euler(euler[0], euler[1], euler[2])).elements;
    // Inverse (transpose) of the column-major rotation, stored row-major.
    rot = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  }
  return { kind: "ellipsoid", k, cut: false, a: [cx, cy, cz], b: [rx, ry, rz], ra: 0, rb: 0, rot };
}
/** Rounded cone between two points with a radius at each end. */
function C(a: V3, b: V3, ra: number, rb: number, k = 0.02): Prim {
  return { kind: "cone", k, cut: false, a, b, ra, rb, rot: null };
}
/** Keep only the space above `y` (flat boot soles). */
function floor(y: number, k = 0.004): Prim {
  return { kind: "floor", k, cut: false, a: [0, y, 0], b: [0, 0, 0], ra: 0, rb: 0, rot: null };
}
const cut = (prim: Prim): Prim => ({ ...prim, cut: true });
/** Mirror primitives to the right-hand side of the body. */
function mirror(prims: Prim[]): Prim[] {
  return prims.map((p) => ({
    ...p,
    a: [-p.a[0], p.a[1], p.a[2]] as V3,
    b: p.kind === "cone" ? ([-p.b[0], p.b[1], p.b[2]] as V3) : p.b,
    rot: p.rot && [p.rot[0], -p.rot[1], -p.rot[2], -p.rot[3], p.rot[4], p.rot[5], -p.rot[6], p.rot[7], p.rot[8]],
  }));
}
const sided = (side: number, prims: Prim[]) => (side > 0 ? prims : mirror(prims));
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mix = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const smooth = (lo: number, hi: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

type Field = (x: number, y: number, z: number) => number;
function field(prims: Prim[]): Field {
  return (x, y, z) => {
    let d = 1e9;
    for (const p of prims) {
      let di: number;
      if (p.kind === "ellipsoid") {
        let px = x - p.a[0],
          py = y - p.a[1],
          pz = z - p.a[2];
        if (p.rot) {
          const r = p.rot,
            qx = r[0] * px + r[1] * py + r[2] * pz,
            qy = r[3] * px + r[4] * py + r[5] * pz;
          pz = r[6] * px + r[7] * py + r[8] * pz;
          px = qx;
          py = qy;
        }
        const ux = px / p.b[0],
          uy = py / p.b[1],
          uz = pz / p.b[2];
        const k0 = Math.sqrt(ux * ux + uy * uy + uz * uz);
        const vx = ux / p.b[0],
          vy = uy / p.b[1],
          vz = uz / p.b[2];
        const k1 = Math.sqrt(vx * vx + vy * vy + vz * vz);
        di = k1 < 1e-9 ? -Math.min(p.b[0], p.b[1], p.b[2]) : (k0 * (k0 - 1)) / k1;
      } else if (p.kind === "cone") {
        const bx = p.b[0] - p.a[0],
          by = p.b[1] - p.a[1],
          bz = p.b[2] - p.a[2];
        const px = x - p.a[0],
          py = y - p.a[1],
          pz = z - p.a[2];
        const h = Math.min(1, Math.max(0, (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz)));
        const ex = px - bx * h,
          ey = py - by * h,
          ez = pz - bz * h;
        di = Math.sqrt(ex * ex + ey * ey + ez * ez) - (p.ra + (p.rb - p.ra) * h);
      } else {
        // Intersection with the half-space above the floor.
        const g = p.a[1] - y,
          h = Math.max(p.k - Math.abs(d - g), 0) / p.k;
        d = Math.max(d, g) + h * h * p.k * 0.25;
        continue;
      }
      if (p.cut) {
        const h = p.k > 0 ? Math.max(p.k - Math.abs(d + di), 0) / p.k : 0;
        d = Math.max(d, -di) + h * h * p.k * 0.25;
      } else if (d > 1e8) d = di;
      else {
        const h = p.k > 0 ? Math.max(p.k - Math.abs(d - di), 0) / p.k : 0;
        d = Math.min(d, di) - h * h * p.k * 0.25;
      }
    }
    return d;
  };
}

/** Outermost surface along a ray, searched inwards from `far`. Returns 0 when nothing is hit. */
function cast(f: Field, o: V3, dx: number, dy: number, dz: number, far: number, offset = 0): number {
  let r = far,
    outside = far;
  for (let i = 0; i < 48; i++) {
    const d = f(o[0] + dx * r, o[1] + dy * r, o[2] + dz * r) - offset;
    if (d < 1e-4) break;
    outside = r;
    r -= Math.max(d * 0.7, 0.0012);
    if (r <= 0) return 0;
  }
  let lo = r,
    hi = outside;
  for (let i = 0; i < 7; i++) {
    const m = (lo + hi) / 2;
    if (f(o[0] + dx * m, o[1] + dy * m, o[2] + dz * m) - offset < 0) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------------------------
// Skinned mesh assembly
// ---------------------------------------------------------------------------------------------

export const GROUPS = ["skin", "shirt", "shorts", "socks", "trim", "boots", "hair", "gloves"] as const;
export type GroupName = (typeof GROUPS)[number];
type Weights = [number, number][];
type Rgb = readonly [number, number, number];

interface SheetOptions {
  group: GroupName;
  rows: number;
  cols: number;
  /** Position of a vertex; `col` is already wrapped into [0, cols). */
  at: (row: number, col: number) => V3;
  weight: (p: V3, row: number) => Weights;
  uv?: (row: number, col: number) => readonly [number, number];
  color?: (p: V3, row: number) => Rgb;
  /** Close an end with a single pole vertex. */
  capStart?: V3;
  capEnd?: V3;
}

/** Texel that every untextured skin vertex samples; see the face atlas in athlete.ts. */
export const PLAIN_UV: readonly [number, number] = [0.5, 0.012];
const WHITE: Rgb = [1, 1, 1];

class MeshBuilder {
  private parts = new Map<
    GroupName,
    { position: number[]; normal: number[]; uv: number[]; color: number[]; index: number[]; skinIndex: number[]; skinWeight: number[] }
  >();

  /** A wrapped grid of quads (a tube or a sphere-like shell) with seam-aware smooth normals. */
  sheet(o: SheetOptions): void {
    const stride = o.cols + 1,
      count = o.rows * stride + (o.capStart ? 1 : 0) + (o.capEnd ? 1 : 0);
    const position = new Float32Array(count * 3),
      uv = new Float32Array(count * 2);
    const put = (i: number, p: V3) => position.set(p, i * 3);
    for (let row = 0; row < o.rows; row++)
      for (let col = 0; col <= o.cols; col++) {
        const i = row * stride + col;
        if (col === o.cols) position.copyWithin(i * 3, row * stride * 3, row * stride * 3 + 3);
        else put(i, o.at(row, col));
        uv.set(o.uv ? o.uv(row, col) : PLAIN_UV, i * 2);
      }
    const index: number[] = [];
    for (let row = 0; row < o.rows - 1; row++)
      for (let col = 0; col < o.cols; col++) {
        const a = row * stride + col,
          b = a + 1,
          c = a + stride,
          d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    let next = o.rows * stride;
    const pole = (p: V3, row: number, start: boolean) => {
      put(next, p);
      uv.set(o.uv ? [o.uv(row, o.cols / 2)[0], o.uv(row, 0)[1]] : PLAIN_UV, next * 2);
      for (let col = 0; col < o.cols; col++) {
        const a = row * stride + col;
        if (start) index.push(next, a, a + 1);
        else index.push(next, a + 1, a);
      }
      return next++;
    };
    const poles: number[] = [];
    if (o.capStart) poles.push(pole(o.capStart, 0, true));
    if (o.capEnd) poles.push(pole(o.capEnd, o.rows - 1, false));

    // Orient outwards: a tube's signed volume about its centroid must be positive.
    const centre = [0, 0, 0];
    for (let i = 0; i < count * 3; i++) centre[i % 3] += position[i] / count;
    const at = (i: number, k: number) => position[i * 3 + k] - centre[k];
    let volume = 0;
    for (let i = 0; i < index.length; i += 3) {
      const [a, b, c] = [index[i], index[i + 1], index[i + 2]];
      volume +=
        at(a, 0) * (at(b, 1) * at(c, 2) - at(b, 2) * at(c, 1)) +
        at(a, 1) * (at(b, 2) * at(c, 0) - at(b, 0) * at(c, 2)) +
        at(a, 2) * (at(b, 0) * at(c, 1) - at(b, 1) * at(c, 0));
    }
    if (volume < 0) for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];

    const normal = new Float32Array(count * 3);
    for (let i = 0; i < index.length; i += 3) {
      const [a, b, c] = [index[i], index[i + 1], index[i + 2]];
      const ux = position[b * 3] - position[a * 3],
        uy = position[b * 3 + 1] - position[a * 3 + 1],
        uz = position[b * 3 + 2] - position[a * 3 + 2];
      const vx = position[c * 3] - position[a * 3],
        vy = position[c * 3 + 1] - position[a * 3 + 1],
        vz = position[c * 3 + 2] - position[a * 3 + 2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      for (const v of [a, b, c]) for (let k = 0; k < 3; k++) normal[v * 3 + k] += n[k];
    }
    // The seam column duplicates column 0 for texture coordinates; share its normal.
    for (let row = 0; row < o.rows; row++)
      for (let k = 0; k < 3; k++) {
        const a = row * stride * 3 + k,
          b = (row * stride + o.cols) * 3 + k;
        normal[a] = normal[b] = normal[a] + normal[b];
      }
    for (let i = 0; i < count; i++) {
      const length = Math.hypot(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]) || 1;
      for (let k = 0; k < 3; k++) normal[i * 3 + k] /= length;
    }

    const part = this.part(o.group),
      base = part.position.length / 3;
    for (let i = 0; i < count; i++) {
      const p: V3 = [position[i * 3], position[i * 3 + 1], position[i * 3 + 2]];
      const row = i < o.rows * stride ? Math.floor(i / stride) : i === poles[0] && o.capStart ? 0 : o.rows - 1;
      part.position.push(p[0], p[1], p[2]);
      part.normal.push(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]);
      part.uv.push(uv[i * 2], uv[i * 2 + 1]);
      part.color.push(...(o.color ? o.color(p, row) : WHITE));
      this.pushWeights(part, o.weight(p, row));
    }
    for (const i of index) part.index.push(base + i);
  }

  private part(group: GroupName) {
    let part = this.parts.get(group);
    if (!part) {
      part = { position: [], normal: [], uv: [], color: [], index: [], skinIndex: [], skinWeight: [] };
      this.parts.set(group, part);
    }
    return part;
  }

  private pushWeights(part: { skinIndex: number[]; skinWeight: number[] }, weights: Weights) {
    const top = weights
      .filter(([, w]) => w > 1e-4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const total = top.reduce((sum, [, w]) => sum + w, 0) || 1;
    for (let i = 0; i < 4; i++) {
      part.skinIndex.push(top[i]?.[0] ?? 0);
      part.skinWeight.push((top[i]?.[1] ?? 0) / total);
    }
  }

  /** `skinned` false omits bone attributes for parts that are rigidly attached to one bone. */
  build(skinned = true): T.BufferGeometry {
    const geometry = new T.BufferGeometry();
    const position: number[] = [],
      normal: number[] = [],
      uv: number[] = [],
      color: number[] = [],
      index: number[] = [],
      skinIndex: number[] = [],
      skinWeight: number[] = [];
    GROUPS.forEach((group, materialIndex) => {
      const part = this.parts.get(group);
      if (!part) return;
      const base = position.length / 3;
      geometry.addGroup(index.length, part.index.length, materialIndex);
      for (const i of part.index) index.push(base + i);
      position.push(...part.position);
      normal.push(...part.normal);
      uv.push(...part.uv);
      color.push(...part.color);
      skinIndex.push(...part.skinIndex);
      skinWeight.push(...part.skinWeight);
    });
    geometry.setIndex(index);
    geometry.setAttribute("position", new T.Float32BufferAttribute(position, 3));
    geometry.setAttribute("normal", new T.Float32BufferAttribute(normal, 3));
    geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    geometry.setAttribute("color", new T.Float32BufferAttribute(color, 3));
    if (!skinned) {
      geometry.computeBoundingSphere();
      return geometry;
    }
    geometry.setAttribute("skinIndex", new T.Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute("skinWeight", new T.Float32BufferAttribute(skinWeight, 4));
    // Limbs move well outside the bind pose; a fixed generous bound keeps culling stable.
    geometry.boundingSphere = new T.Sphere(new T.Vector3(0, 0.95, 0), 1.6);
    geometry.boundingBox = new T.Box3(new T.Vector3(-1.4, -0.4, -1.4), new T.Vector3(1.4, 2.4, 1.4));
    return geometry;
  }
}

interface Ring {
  c: V3;
  /** In-plane basis; angle 0 points along `u`, a quarter turn along `v`. */
  u: V3;
  v: V3;
  /** Cloth clearance added to the body surface. */
  offset: number;
  /** Largest radius allowed; shapes cloth that spans between body masses. */
  limit?: number;
  /** Axial displacement per fraction of a turn, for edges that are not planar (collars). */
  shift?: (around: number) => number;
}
interface Hem {
  thickness: number;
  depth: number;
}
interface LoftOptions {
  group: GroupName;
  field: Field;
  rings: Ring[];
  segments: number;
  far: number;
  weight: (p: V3, row: number) => Weights;
  uv?: (t: number, around: number) => readonly [number, number];
  color?: (p: V3, row: number) => Rgb;
  capStart?: boolean;
  capEnd?: boolean;
  /** Fold the open edge inwards so cloth reads as having thickness. */
  hemStart?: Hem;
  hemEnd?: Hem;
  minRadius?: number;
  /** Width-to-depth ratio of the cross-section; spreads segments evenly around wide shapes. */
  aspect?: number;
}

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** Sample a field into a tube: one ray per segment from each ring centre. */
function loft(builder: MeshBuilder, o: LoftOptions): void {
  const n = o.rings.length,
    axisAt = (i: number): V3 => unit(cross(o.rings[i].u, o.rings[i].v)),
    aspect = o.aspect ?? 1,
    angle = (col: number) => {
      const a = (col / o.segments) * Math.PI * 2;
      return aspect === 1 ? a : Math.atan2(Math.sin(a), aspect * Math.cos(a));
    };
  /** Ray origin for a segment: the ring centre, displaced along the axis for non-planar rings. */
  const origin = (ringIndex: number, col: number): V3 => {
    const ring = o.rings[ringIndex],
      d = ring.shift?.(col / o.segments) ?? 0,
      axis = axisAt(ringIndex);
    return d ? [ring.c[0] + axis[0] * d, ring.c[1] + axis[1] * d, ring.c[2] + axis[2] * d] : ring.c;
  };
  const radii = o.rings.map((ring, ringIndex) =>
    Array.from({ length: o.segments }, (_, i) => {
      const a = angle(i),
        ca = Math.cos(a),
        sa = Math.sin(a);
      const r = cast(
        o.field,
        origin(ringIndex, i),
        ring.u[0] * ca + ring.v[0] * sa,
        ring.u[1] * ca + ring.v[1] * sa,
        ring.u[2] * ca + ring.v[2] * sa,
        o.far,
        ring.offset,
      );
      return Math.min(Math.max(r, o.minRadius ?? 0.002), ring.limit ?? Infinity);
    }),
  );
  const before = o.hemStart ? 2 : 0,
    after = o.hemEnd ? 2 : 0;
  const point = (ringIndex: number, col: number, pull: number, shift: number, direction: number): V3 => {
    const ring = o.rings[ringIndex],
      c = origin(ringIndex, col),
      a = angle(col),
      r = Math.max(radii[ringIndex][col] - pull, 0.001),
      ca = Math.cos(a) * r,
      sa = Math.sin(a) * r,
      axis = axisAt(ringIndex);
    return [
      c[0] + ring.u[0] * ca + ring.v[0] * sa + axis[0] * shift * direction,
      c[1] + ring.u[1] * ca + ring.v[1] * sa + axis[1] * shift * direction,
      c[2] + ring.u[2] * ca + ring.v[2] * sa + axis[2] * shift * direction,
    ];
  };
  // The axis direction of travel decides which way a hem folds back into the tube.
  const forward = (i: number, j: number) => {
    const a = o.rings[i].c,
      b = o.rings[j].c,
      axis = axisAt(i);
    return (b[0] - a[0]) * axis[0] + (b[1] - a[1]) * axis[1] + (b[2] - a[2]) * axis[2] >= 0 ? 1 : -1;
  };
  const endPole = (ringIndex: number, towards: number): V3 => {
    const ring = o.rings[ringIndex],
      axis = axisAt(ringIndex),
      sign = forward(ringIndex, towards) * -1;
    const r = cast(o.field, ring.c, axis[0] * sign, axis[1] * sign, axis[2] * sign, o.far, ring.offset);
    return [ring.c[0] + axis[0] * sign * r, ring.c[1] + axis[1] * sign * r, ring.c[2] + axis[2] * sign * r];
  };
  const ringOf = (row: number) => Math.min(n - 1, Math.max(0, row - before));
  builder.sheet({
    group: o.group,
    rows: n + before + after,
    cols: o.segments,
    at: (row, col) => {
      if (row < before) {
        const hem = o.hemStart!;
        return point(0, col, hem.thickness, row === 0 ? hem.depth : 0, forward(0, 1));
      }
      if (row >= before + n) {
        const hem = o.hemEnd!;
        return point(n - 1, col, hem.thickness, row === before + n ? 0 : hem.depth, forward(n - 1, n - 2));
      }
      return point(row - before, col, 0, 0, 1);
    },
    uv: o.uv && ((row, col) => o.uv!(ringOf(row) / (n - 1), col / o.segments)),
    weight: (p, row) => o.weight(p, ringOf(row)),
    color: o.color && ((p, row) => o.color!(p, ringOf(row))),
    capStart: o.capStart ? endPole(0, 1) : undefined,
    capEnd: o.capEnd ? endPole(n - 1, n - 2) : undefined,
  });
}

/** Rings perpendicular to a straight axis at the given distances from `origin`. */
function axisRings(origin: V3, direction: V3, distances: number[], offset: (s: number) => number, reference: V3 = [1, 0, 0]): Ring[] {
  const axis = unit(direction),
    dot = reference[0] * axis[0] + reference[1] * axis[1] + reference[2] * axis[2];
  const u = unit([reference[0] - axis[0] * dot, reference[1] - axis[1] * dot, reference[2] - axis[2] * dot]),
    v = cross(axis, u);
  return distances.map((s) => ({ c: add(origin, [axis[0] * s, axis[1] * s, axis[2] * s]), u, v, offset: offset(s) }));
}
/** Evenly spaced values with a maximum step. */
function span(from: number, to: number, step: number): number[] {
  const n = Math.max(1, Math.ceil(Math.abs(to - from) / step));
  return Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
}
const join = (...lists: number[][]) => lists.flat().filter((v, i, all) => i === 0 || Math.abs(v - all[i - 1]) > 1e-6);

// ---------------------------------------------------------------------------------------------
// Anatomy
// ---------------------------------------------------------------------------------------------

const X = BODY.hipX,
  KNEE_Y = BODY.hipY - BODY.thigh;
function legPrims(side: number): Prim[] {
  return sided(side, [
    C([X + 0.002, 0.93, -0.008], [X, 0.54, 0.004], 0.084, 0.056), // femur mass
    E(X + 0.002, 0.75, 0.032, 0.062, 0.19, 0.056), // rectus femoris
    E(X + 0.036, 0.7, 0.004, 0.036, 0.17, 0.052), // vastus lateralis
    E(X - 0.03, 0.6, 0.022, 0.032, 0.07, 0.036), // vastus medialis
    E(X, 0.73, -0.042, 0.062, 0.19, 0.05), // hamstrings
    E(X - 0.04, 0.83, -0.008, 0.046, 0.12, 0.062), // adductors
    E(X, KNEE_Y, 0, 0.054, 0.06, 0.055), // knee
    E(X, KNEE_Y + 0.006, 0.043, 0.03, 0.036, 0.02, 0.012), // patella
    C([X, 0.47, 0.004], [X, 0.12, -0.004], 0.047, 0.033), // shank
    E(X - 0.017, 0.375, -0.036, 0.037, 0.105, 0.04), // gastrocnemius, medial head
    E(X + 0.017, 0.385, -0.032, 0.034, 0.1, 0.038), // gastrocnemius, lateral head
    E(X + 0.013, 0.37, 0.02, 0.026, 0.12, 0.026, 0.015), // tibialis anterior
    C([X, 0.27, -0.04], [X, 0.09, -0.036], 0.02, 0.015), // Achilles tendon
    E(X, 0.1, -0.002, 0.036, 0.03, 0.04), // ankle
  ]);
}
const glute = (side: number) => sided(side, [E(0.085, 0.955, -0.068, 0.085, 0.095, 0.07, 0.03)]);
const PELVIS: Prim[] = [E(0, 0.985, -0.012, 0.165, 0.105, 0.105)];
const TORSO: Prim[] = [
  E(0, 1.13, 0, 0.14, 0.15, 0.098, 0.04), // abdomen
  E(0, 1.31, -0.008, 0.157, 0.17, 0.115, 0.04), // ribcage
  E(0.078, 1.362, 0.068, 0.078, 0.062, 0.042, 0.03), // pectorals
  E(-0.078, 1.362, 0.068, 0.078, 0.062, 0.042, 0.03),
  E(0.138, 1.3, -0.04, 0.042, 0.13, 0.062, 0.03), // latissimus dorsi
  E(-0.138, 1.3, -0.04, 0.042, 0.13, 0.062, 0.03),
  E(0, 1.39, -0.065, 0.15, 0.12, 0.065, 0.03), // scapulae
  C([-0.165, 1.43, -0.02], [0.165, 1.43, -0.02], 0.048, 0.048, 0.03), // shoulder girdle
  E(0.075, 1.485, -0.03, 0.085, 0.04, 0.055, 0.03), // trapezius
  E(-0.075, 1.485, -0.03, 0.085, 0.04, 0.055, 0.03),
];
const NECK: Prim[] = [
  C([0, 1.44, -0.032], [0, 1.66, 0.0], 0.059, 0.05, 0.02),
  C([0.022, 1.47, 0.018], [0.046, 1.63, -0.03], 0.015, 0.013, 0.025), // sternocleidomastoid
  C([-0.022, 1.47, 0.018], [-0.046, 1.63, -0.03], 0.015, 0.013, 0.025),
];
function armPrims(side: number): Prim[] {
  const s: V3 = [BODY.shoulderX, BODY.shoulderY, BODY.shoulderZ],
    elbow = add(s, [ARM_DIR[0] * BODY.upperArm, ARM_DIR[1] * BODY.upperArm, 0]),
    wrist = add(elbow, [ARM_DIR[0] * BODY.forearm, ARM_DIR[1] * BODY.forearm, 0]);
  const biceps = add(mix(s, elbow, 0.55), [-0.004, 0, 0.02]),
    triceps = add(mix(s, elbow, 0.5), [0.006, 0, -0.022]),
    belly = add(mix(elbow, wrist, 0.25), [0.004, 0, 0.004]);
  return sided(side, [
    E(0.188, 1.398, -0.012, 0.046, 0.07, 0.058, 0.035), // deltoid
    C(s, elbow, 0.047, 0.038),
    E(biceps[0], biceps[1], biceps[2], 0.036, 0.095, 0.036),
    E(triceps[0], triceps[1], triceps[2], 0.036, 0.1, 0.036),
    E(elbow[0], elbow[1], elbow[2], 0.04, 0.042, 0.042),
    C(elbow, wrist, 0.04, 0.026),
    E(belly[0], belly[1], belly[2], 0.042, 0.085, 0.044),
    E(wrist[0], wrist[1], wrist[2], 0.022, 0.03, 0.03, 0.012),
  ]);
}
function bootPrims(side: number): Prim[] {
  return sided(side, [
    E(X, 0.047, -0.038, 0.035, 0.04, 0.045), // heel cup
    C([X, 0.05, -0.03], [X + 0.003, 0.042, 0.11], 0.038, 0.036), // midfoot
    E(X + 0.004, 0.038, 0.128, 0.047, 0.03, 0.062), // toe box
    C([X, 0.07, 0.055], [X, 0.105, 0], 0.03, 0.04), // instep
    E(X, 0.09, -0.01, 0.046, 0.036, 0.052), // collar, wide enough that the sock meets it at a clear angle
    floor(0.012),
  ]);
}

export interface FaceShape {
  jaw: number;
  nose: number;
  brow: number;
  cheek: number;
}
/**
 * Head primitives relative to the head centre (eye line near y = 0, face towards +z).
 *
 * The lower face follows the mandible rather than stacking rounded masses: each side runs from the
 * cheekbone down the ramus to the jaw angle, then forwards along the jaw to the chin. Blend radii
 * stay small because every smooth union pushes the surface outwards by up to a quarter of its radius;
 * large ones add up to a swollen, featureless outline. Target half-widths, front view: 73 mm at the
 * eyes, 63 mm below the cheekbones, 57 mm at the mouth, 50 mm at the jaw angle.
 */
function headPrims(shape: FaceShape): Prim[] {
  const j = shape.jaw,
    n = shape.nose;
  const sides = (prims: Prim[]) => [...prims, ...mirror(prims)];
  const zygoma: V3 = [0.043, -0.02, 0.015],
    gonion: V3 = [0.034 * j, -0.078, 0.0],
    chin: V3 = [0.012 * j, -0.096, 0.05];
  return [
    E(0, 0.022, -0.014, 0.0765, 0.092, 0.098, 0), // cranium
    E(0, -0.042, 0.026, 0.046, 0.062, 0.057, 0.02), // maxilla and the front of the mandible
    ...sides([C(zygoma, gonion, 0.021, 0.014 * j, 0.018)]), // ramus, under the masseter
    ...sides([C(gonion, chin, 0.014 * j, 0.019, 0.018)]), // body of the mandible
    ...sides([E(0.034, -0.052, 0.032, 0.02, 0.036, 0.03, 0.022)]), // cheek, between the mouth and the masseter
    E(0, -0.095, 0.052, 0.025 * j, 0.02, 0.024, 0.014), // chin
    ...sides([E(0.039, -0.026, 0.04, 0.022 * shape.cheek, 0.024, 0.028, 0.022)]), // cheekbone
    ...sides([E(0.04, -0.03, -0.02, 0.018, 0.035, 0.028, 0.02)]), // mastoid, behind the jaw below the ear
    C([-0.033, 0.023, 0.073], [0.033, 0.023, 0.073], 0.012 * shape.brow, 0.012 * shape.brow, 0.02), // brow ridge
    ...sides([cut(E(0.031, 0.001, 0.094, 0.021, 0.0135, 0.017, 0.012))]), // eye sockets
    ...sides([E(0.031, 0.001, 0.0655, 0.0128, 0.0125, 0.0128, 0.006)]), // eyeball under the lids
    C([0, 0.012, 0.079], [0, -0.034, 0.104], 0.0055 * n, 0.0092 * n, 0.012), // nose
    ...sides([E(0.0105 * n, -0.039, 0.089, 0.0068 * n, 0.0062, 0.0085, 0.007)]), // alae
    E(0, -0.066, 0.066, 0.03, 0.02, 0.022, 0.02), // mouth
    ...sides([E(0.0745, -0.008, -0.018, 0.006, 0.029, 0.018, 0.004, [0, 0.5, 0])]), // ears
    ...sides([cut(E(0.083, -0.012, -0.013, 0.0055, 0.013, 0.0075, 0.004))]), // concha
  ];
}

// --- Head parametrisation -------------------------------------------------------------------

/** Azimuth for a column fraction; columns are denser across the face than behind the head. */
const azimuth = (c: number) => {
  const t = 2 * c - 1;
  return Math.PI * t - 0.56 * Math.sin(Math.PI * t);
};
/** Polar angle for a row fraction; rows are densest between the brow and the chin. */
const polar = (r: number) => Math.PI * (r + 0.06 * (Math.sin(2 * Math.PI * (r - 0.1)) + Math.sin(0.2 * Math.PI)));
const invert = (f: (t: number) => number, value: number) => {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (f(m) < value) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
};
/** Fraction of the face atlas used by the head; the rest is a plain skin strip. */
export const HEAD_ATLAS = 0.94;
/** Atlas coordinates (column, row fractions) of a point given relative to the head centre. */
export function headAtlas(x: number, y: number, z: number): [number, number] {
  const length = Math.hypot(x, y, z) || 1;
  return [invert(azimuth, Math.atan2(x, z)), invert(polar, Math.acos(y / length))];
}
/** Hairline as [fraction of a half turn from the face, polar angle]: forehead, temple, sideburn, ear, nape. */
const HAIRLINE: [number, number][] = [
  [0, 0.62],
  [0.18, 0.66],
  [0.3, 0.82],
  [0.37, 1.0],
  [0.4, 1.5],
  [0.47, 1.55],
  [0.5, 1.25],
  [0.58, 1.22],
  [0.68, 1.9],
  [0.8, 2.2],
  [1, 2.25],
];
/** Edge of the hair shell: the same line without the sideburn, which is too fine to mesh cleanly. */
const SHELL_LINE: [number, number][] = [
  [0, 0.6],
  [0.2, 0.66],
  [0.3, 0.8],
  [0.37, 0.98],
  [0.46, 1.15],
  [0.58, 1.2],
  [0.68, 1.88],
  [0.8, 2.15],
  [1, 2.2],
];
function along(line: [number, number][], theta: number, recede: number): number {
  const a = Math.min(1, Math.abs(theta) / Math.PI);
  let i = 0;
  while (i < line.length - 2 && line[i + 1][0] < a) i++;
  const [a0, p0] = line[i],
    [a1, p1] = line[i + 1];
  return p0 + (p1 - p0) * smooth(a0, a1, a) - recede * 0.14 * (1 - smooth(0.2, 0.34, a));
}
/** Polar angle (radians from the crown) of the painted hairline at an azimuth. */
export const hairline = (theta: number, recede = 0) => along(HAIRLINE, theta, recede);

/** Atlas row fraction of the hairline for a column fraction (for painting the scalp). */
export const hairlineRow = (column: number, recede = 0) => invert(polar, hairline(azimuth(column), recede));

export type HairStyle = "shaved" | "buzz" | "crop" | "textured" | "curls";
const HAIR: Record<HairStyle, (theta: number, phi: number) => number> = {
  shaved: () => 0,
  buzz: () => 0.004,
  crop: (_theta, phi) => 0.006 + 0.008 * (1 - smooth(0.5, 1.1, phi)),
  textured: (theta, phi) => 0.006 + 0.02 * (1 - smooth(0.3, 1.0, phi)) * (0.7 + 0.3 * Math.cos(theta)),
  curls: (_theta, phi) => 0.016 + 0.01 * (1 - smooth(0.6, 1.3, phi)),
};

export interface BodyOptions {
  /** Tessellation multiplier: about 0.55 for the light preset up to 1.15 for cinematic. */
  detail: number;
  /** Goalkeeper kit: sleeves to the wrist and padded gloves. */
  keeper: boolean;
}
const segments = (detail: number) => (n: number) => Math.max(8, Math.round((n * detail) / 2) * 2);
const blend = (a: number, b: number, t: number): Weights => [
  [a, 1 - t],
  [b, t],
];

/** Build the skinned body (everything below the jaw) in the bind pose. Groups follow `GROUPS`. */
export function buildBody(options: BodyOptions): T.BufferGeometry {
  const builder = new MeshBuilder(),
    q = options.detail,
    seg = segments(q),
    step = (metres: number) => metres / q;

  for (const side of [1, -1]) {
    const L = side > 0,
      thigh = L ? B.thighL : B.thighR,
      shin = L ? B.shinL : B.shinR,
      foot = L ? B.footL : B.footR,
      toe = L ? B.toeL : B.toeR,
      upperArm = L ? B.upperArmL : B.upperArmR,
      forearm = L ? B.forearmL : B.forearmR,
      hand = L ? B.handL : B.handR;
    const leg = field(legPrims(side));
    const down = (ys: number[], offset: (y: number) => number) =>
      axisRings([side * X, 0, 0], [0, 1, 0], ys, offset, [side, 0, 0]);

    // Bare thigh and knee, from inside the shorts to inside the sock.
    loft(builder, {
      group: "skin",
      field: leg,
      rings: down(join(span(0.75, 0.6, step(0.04)), span(0.6, 0.43, step(0.022)), [0.4]), () => 0),
      segments: seg(16),
      far: 0.2,
      weight: (p) => blend(thigh, shin, smooth(KNEE_Y + 0.055, KNEE_Y - 0.05, p[1])),
    });
    // Sock over the calf, tucked into the boot, with a folded band at the top.
    loft(builder, {
      group: "socks",
      field: leg,
      rings: down(join(span(0.428, 0.2, step(0.03)), span(0.2, 0.07, step(0.025))), () => 0.0035),
      segments: seg(16),
      far: 0.2,
      weight: (p) => blend(shin, foot, smooth(0.17, 0.1, p[1])),
      hemStart: { thickness: 0.004, depth: 0.02 },
    });
    loft(builder, {
      group: "trim",
      field: leg,
      rings: down([0.436, 0.424, 0.408], (y) => (y < 0.41 ? 0.0038 : 0.0062)),
      segments: seg(16),
      far: 0.2,
      weight: () => [[shin, 1]],
      hemStart: { thickness: 0.004, depth: 0.012 },
    });

    // Boot: lofted from heel to toe so the toe box and the flat sole stay well sampled.
    const toeWeight = (p: V3): Weights => blend(foot, toe, smooth(0.1, 0.16, p[2]));
    loft(builder, {
      group: "boots",
      field: field(bootPrims(side)),
      rings: axisRings([side * (X + 0.002), 0.046, 0], [0, 0, 1], span(-0.076, 0.184, step(0.02)), () => 0, [side, 0, 0]),
      segments: seg(14),
      far: 0.16,
      weight: toeWeight,
      capStart: true,
      capEnd: true,
      color: (p) => (p[1] < 0.02 ? [0.2, 0.2, 0.2] : WHITE),
    });
    // Studs keep the sole 12 mm above the turf.
    for (const [dx, dz] of STUDS) {
      const centre: V3 = [side * (X + 0.003 + dx), 0, dz];
      builder.sheet({
        group: "boots",
        rows: 2,
        cols: 6,
        at: (row, col) => {
          const a = (col / 6) * Math.PI * 2,
            r = row ? 0.0045 : 0.0075;
          return [centre[0] + Math.cos(a) * r, row ? 0 : 0.0135, centre[2] + Math.sin(a) * r];
        },
        weight: toeWeight,
        capEnd: centre,
        color: () => [0.16, 0.16, 0.16],
      });
    }

    // Shorts leg: follows the thigh so the cloth cannot be pierced by the limb beneath it.
    loft(builder, {
      group: "shorts",
      field: field([...legPrims(side), ...glute(side)]),
      rings: down(span(0.94, 0.672, step(0.035)), (y) => 0.012 + 0.012 * smooth(0.9, 0.68, y)),
      segments: seg(18),
      far: 0.26,
      weight: (p) => blend(B.pelvis, thigh, smooth(0.95, 0.87, p[1])),
      hemEnd: { thickness: 0.006, depth: 0.03 },
    });

    // Sleeve and arm. `along` measures distance from the shoulder joint down the arm.
    const arm = field(armPrims(side)),
      shoulder: V3 = [side * BODY.shoulderX, BODY.shoulderY, BODY.shoulderZ],
      armDir: V3 = [side * ARM_DIR[0], ARM_DIR[1], 0],
      along = (p: V3) => (p[0] - shoulder[0]) * armDir[0] + (p[1] - shoulder[1]) * armDir[1],
      elbow = (p: V3) => smooth(BODY.upperArm - 0.05, BODY.upperArm + 0.045, along(p));
    const armRings = (distances: number[], offset: (s: number) => number) =>
      axisRings(shoulder, armDir, distances, offset, [side, 0, 0]);
    const sleeveEnd = options.keeper ? BODY.upperArm + BODY.forearm - 0.03 : 0.185;
    loft(builder, {
      group: "shirt",
      field: arm,
      // The sleeve starts well inside the shoulder of the shirt body and only emerges below the deltoid,
      // so coarse tessellation can never push its cap through the cloth above it.
      rings: armRings(
        join(span(-0.02, 0.05, step(0.02)), span(0.05, sleeveEnd, step(0.035))),
        (s) => -0.014 + 0.017 * smooth(-0.03, 0.08, s) + (options.keeper ? 0.005 : 0.013 * smooth(0.06, 0.18, s)),
      ),
      segments: seg(16),
      far: 0.16,
      weight: (p) => {
        const onArm = smooth(-0.05, 0.09, along(p)),
          lower = elbow(p);
        return [
          [B.chest, 1 - onArm],
          [upperArm, onArm * (1 - lower)],
          [forearm, onArm * lower],
        ];
      },
      capStart: true,
      hemEnd: { thickness: 0.005, depth: 0.03 },
      uv: (t, around) => [(L ? 0 : 0.5) + 0.5 * around, SLEEVE_V[0] + (SLEEVE_V[1] - SLEEVE_V[0]) * (1 - t)],
    });
    if (!options.keeper)
      loft(builder, {
        group: "skin",
        field: arm,
        rings: armRings(
          join(span(0.15, 0.24, step(0.035)), span(0.24, 0.36, step(0.022)), span(0.36, 0.575, step(0.035))),
          () => 0,
        ),
        segments: seg(14),
        far: 0.16,
        weight: (p) => {
          const lower = elbow(p),
            wrist = smooth(0.545, 0.585, along(p));
          return [
            [upperArm, 1 - lower],
            [forearm, lower * (1 - wrist)],
            [hand, lower * wrist],
          ];
        },
      });
    buildHand(builder, side, hand, options.keeper, seg);
  }

  // Shorts: pelvis block down to the crotch; each leg tube above overlaps it.
  loft(builder, {
    group: "shorts",
    field: field([...PELVIS, ...glute(1), ...glute(-1), E(0, 0.9, 0, 0.1, 0.06, 0.075), ...legPrims(1), ...legPrims(-1)]),
    rings: axisRings([0, 0, -0.008], [0, 1, 0], join(span(0.868, 0.92, step(0.018)), span(0.92, 1.075, step(0.035))), () => 0.012),
    segments: seg(26),
    aspect: 1.5,
    far: 0.36,
    weight: (p) => blend(B.pelvis, p[0] > 0 ? B.thighL : B.thighR, smooth(0.95, 0.87, p[1]) * smooth(0.02, 0.09, Math.abs(p[0])) * 0.7),
    capStart: true,
  });

  // Shirt body. `around` runs left side → back → right side → front, so numbers read correctly.
  // The last rings narrow to the neck and dip at the throat to form a crew collar.
  const shirt = field([
    ...PELVIS,
    ...glute(1),
    ...glute(-1),
    ...legPrims(1).slice(0, 6),
    ...legPrims(-1).slice(0, 6),
    ...TORSO,
    E(0, 1.13, -0.003, 0.162, 0.36, 0.12, 0.05),
    NECK[0],
    E(0.188, 1.395, -0.012, 0.048, 0.072, 0.06, 0.05), // deltoids under the cloth
    E(-0.188, 1.395, -0.012, 0.048, 0.072, 0.06, 0.05),
  ]);
  const shirtYs = join(span(SHIRT_Y[0], 1.36, step(0.04)), span(1.36, 1.45, step(0.02)), span(1.45, SHIRT_Y[1], step(0.01)));
  const dip = (y: number) => (around: number) =>
    -0.042 * smooth(1.4, SHIRT_Y[1], y) * Math.pow(0.5 + 0.5 * Math.cos((around - 0.75) * Math.PI * 2), 1.5);
  const shirtRing = (y: number): Ring => ({
    c: [0, y, -0.01 - 0.007 * smooth(1.36, SHIRT_Y[1], y)],
    u: [1, 0, 0],
    v: [0, 0, -1],
    offset: 0.009 + 0.016 * smooth(1.2, 0.95, y),
    limit: y > 1.465 ? 0.24 + (COLLAR - 0.24) * Math.pow((y - 1.465) / (SHIRT_Y[1] - 1.465), 0.85) : undefined,
    shift: dip(y),
  });
  loft(builder, {
    group: "shirt",
    field: shirt,
    rings: shirtYs.map(shirtRing),
    segments: seg(32),
    aspect: 1.7,
    far: 0.4,
    weight: (p) => {
      const pelvis = smooth(1.1, 0.98, p[1]),
        chest = smooth(1.14, 1.32, p[1]),
        // The front hem rides up with a lifted thigh instead of being pierced by it.
        lifted = smooth(1.03, 0.93, p[1]) * smooth(0, 0.08, p[2]) * smooth(0.02, 0.08, Math.abs(p[0])) * 0.3;
      // The cloth over each deltoid partly follows the upper arm.
      const cap = 0.5 * smooth(0.15, 0.21, Math.abs(p[0])) * smooth(1.33, 1.38, p[1]);
      return [
        [B.pelvis, pelvis * (1 - lifted)],
        [p[0] > 0 ? B.thighL : B.thighR, pelvis * lifted],
        [B.spine, Math.max(0, 1 - pelvis - chest)],
        [B.chest, chest * (1 - cap)],
        [p[0] > 0 ? B.upperArmL : B.upperArmR, chest * cap],
      ];
    },
    hemStart: { thickness: 0.004, depth: 0.03 },
    uv: (t, around) => [around, TORSO_V * ((shirtYs[Math.round(t * (shirtYs.length - 1))] - SHIRT_Y[0]) / (SHIRT_Y[1] - SHIRT_Y[0]))],
  });
  const collar = (dy: number, limit: number): Ring => ({ ...shirtRing(SHIRT_Y[1]), c: [0, SHIRT_Y[1] + dy, -0.017], limit, offset: 0.03 });
  loft(builder, {
    group: "trim",
    field: shirt,
    rings: [collar(-0.006, COLLAR + 0.004), collar(0.005, COLLAR + 0.004), collar(0.013, COLLAR)],
    segments: seg(32),
    aspect: 1.7,
    far: 0.4,
    weight: () => [
      [B.chest, 0.75],
      [B.neck, 0.25],
    ],
    hemEnd: { thickness: 0.007, depth: 0.012 },
  });

  // Neck. Below the collar it spreads into the shoulders so the opening is never see-through.
  loft(builder, {
    group: "skin",
    field: field([...NECK, ...TORSO.slice(7), E(0, 1.46, -0.02, 0.12, 0.035, 0.07, 0.03)]),
    rings: axisRings([0, 1.44, -0.03], [0, 0.18, 0.03], join(span(0.015, 0.06, step(0.015)), span(0.06, 0.225, step(0.022))), () => 0).map(
      (ring) => ({ ...ring, limit: 0.2 + (0.064 - 0.2) * smooth(1.45, 1.5, ring.c[1]) }),
    ),
    segments: seg(16),
    far: 0.3,
    weight: (p) => {
      const neck = smooth(1.47, 1.53, p[1]),
        head = smooth(1.55, 1.61, p[1]);
      return [
        [B.chest, 1 - neck],
        [B.neck, neck * (1 - head)],
        [B.head, neck * head],
      ];
    },
  });
  return builder.build();
}

/** Shirt atlas layout shared with the kit painter: torso rows, then a band for both sleeves. */
export const TORSO_V = 0.62;
export const SLEEVE_V: readonly [number, number] = [0.66, 0.86];
const SHIRT_Y: readonly [number, number] = [0.93, 1.52];
/** Collar radius around the neck axis. */
const COLLAR = 0.0705;
const STUDS: [number, number][] = [
  [-0.02, -0.052],
  [0.02, -0.052],
  [-0.022, -0.02],
  [0.022, -0.02],
  [-0.03, 0.09],
  [0.034, 0.085],
  [-0.028, 0.125],
  [0.036, 0.12],
  [0.004, 0.158],
];

function buildHand(builder: MeshBuilder, side: number, bone: number, glove: boolean, seg: (n: number) => number): void {
  const group: GroupName = glove ? "gloves" : "skin",
    g = glove ? 1.28 : 1,
    reach = BODY.upperArm + BODY.forearm;
  const wrist: V3 = [side * (BODY.shoulderX + ARM_DIR[0] * reach), BODY.shoulderY + ARM_DIR[1] * reach, BODY.shoulderZ];
  // Hand frame: `d` towards the fingertips, `f` towards the thumb, `n` out of the palm.
  const d: V3 = [side * ARM_DIR[0], ARM_DIR[1], 0],
    f: V3 = [0, 0, 1],
    n: V3 = [-side * Math.cos(BODY.armRest), -Math.sin(BODY.armRest), 0];
  const local = (along: number, across: number, out: number): V3 => [
    wrist[0] + d[0] * along + f[0] * across + n[0] * out,
    wrist[1] + d[1] * along + f[1] * across + n[1] * out,
    wrist[2] + d[2] * along + f[2] * across + n[2] * out,
  ];
  const towards = (along: number, across: number, out: number): V3 =>
    unit([
      d[0] * along + f[0] * across + n[0] * out,
      d[1] * along + f[1] * across + n[1] * out,
      d[2] * along + f[2] * across + n[2] * out,
    ]);
  const weight = (): Weights => [[bone, 1]];
  const palm = local(0.052 * g, 0.002, 0);
  loft(builder, {
    group,
    field: field([
      E(palm[0], palm[1], palm[2], 0.0145 * g, 0.056 * g, 0.043 * g, 0),
      C(local(-0.02, 0, 0), local(0.03 * g, 0, 0), 0.024 * g, 0.026 * g, 0.02),
    ]),
    rings: axisRings(wrist, d, span(-0.015, 0.104 * g, 0.02), () => 0, [side, 0, 0]),
    segments: seg(10),
    far: 0.09,
    weight,
    capEnd: true,
  });
  // A digit is a tapered tube along a polyline that curls towards the palm.
  const digit = (origin: V3, direction: V3, lengths: number[], radius: number, curl: number) => {
    const points: V3[] = [origin];
    let dir = direction;
    for (const length of lengths) {
      points.push(add(points[points.length - 1], [dir[0] * length, dir[1] * length, dir[2] * length]));
      dir = unit([dir[0] + n[0] * curl, dir[1] + n[1] * curl, dir[2] + n[2] * curl]);
    }
    const rows = points.length,
      cols = 6,
      tip = radius * 0.6;
    builder.sheet({
      group,
      rows,
      cols,
      at: (row, col) => {
        const from = points[Math.min(row, rows - 2)],
          to = points[Math.min(row, rows - 2) + 1],
          axis = unit([to[0] - from[0], to[1] - from[1], to[2] - from[2]]),
          u = unit(cross(axis, f)),
          v = cross(axis, u),
          a = (col / cols) * Math.PI * 2,
          r = radius * (1 - 0.22 * (row / (rows - 1))),
          ca = Math.cos(a) * r,
          sa = Math.sin(a) * r;
        return [points[row][0] + u[0] * ca + v[0] * sa, points[row][1] + u[1] * ca + v[1] * sa, points[row][2] + u[2] * ca + v[2] * sa];
      },
      weight,
      capEnd: add(points[rows - 1], [dir[0] * tip, dir[1] * tip, dir[2] * tip]),
    });
  };
  const fingers: [number, number][] = [
    [0.031, 0.072],
    [0.011, 0.08],
    [-0.01, 0.075],
    [-0.029, 0.06],
  ];
  fingers.forEach(([across, length], i) =>
    digit(
      local(0.09 * g, across * g, 0.001),
      towards(1, 0, 0.18),
      [length * 0.45 * g, length * 0.32 * g, length * 0.23 * g],
      (0.0092 - i * 0.0004) * g,
      0.52,
    ),
  );
  digit(local(0.03 * g, 0.034 * g, 0.004), towards(0.72, 0.6, 0.3), [0.034 * g, 0.03 * g], 0.0108 * g, 0.2);
}

const headColumns = (detail: number) => Math.max(24, Math.round((56 * detail) / 2) * 2);
/** Head surface point (relative to the head bone) for column/row fractions, pushed out by `extra`. */
function headSurface(f: Field, c: number, r: number, extra = 0): V3 {
  const theta = azimuth(c),
    phi = polar(r),
    dx = Math.sin(theta) * Math.sin(phi),
    dy = Math.cos(phi),
    dz = Math.cos(theta) * Math.sin(phi),
    radius = cast(f, [0, 0, 0], dx, dy, dz, 0.2) + extra;
  return [HEAD_OFFSET[0] + dx * radius, HEAD_OFFSET[1] + dy * radius, HEAD_OFFSET[2] + dz * radius];
}
const NEUTRAL_FACE: FaceShape = { jaw: 1, nose: 1, brow: 1, cheek: 1 };

/** Head mesh in head-bone space. UVs address the face atlas (see `headAtlas`). */
export function buildHead(detail: number, face: FaceShape): T.BufferGeometry {
  const builder = new MeshBuilder(),
    f = field(headPrims(face)),
    cols = headColumns(detail),
    rows = Math.max(18, Math.round(40 * detail));
  // Row 0 sits just off the crown so the cap has a ring to fan from; the underside is hidden by the neck.
  const fraction = (row: number) => 0.012 + (0.948 * row) / (rows - 1);
  builder.sheet({
    group: "skin",
    rows,
    cols,
    at: (row, col) => headSurface(f, col / cols, fraction(row)),
    uv: (row, col) => [col / cols, 1 - fraction(row) * HEAD_ATLAS],
    weight: () => [],
    capStart: headSurface(f, 0.5, 0),
  });
  return builder.build(false);
}

/** Hair shell in head-bone space, or null for a shaved head (the scalp is painted instead). */
export function buildHair(detail: number, style: HairStyle, recede: number): T.BufferGeometry | null {
  if (style === "shaved") return null;
  const builder = new MeshBuilder(),
    f = field(headPrims(NEUTRAL_FACE)),
    cols = headColumns(detail),
    rows = Math.max(10, Math.round(18 * detail)),
    thickness = HAIR[style];
  builder.sheet({
    group: "hair",
    rows,
    cols,
    // Each column runs from the crown to its own hairline, where the shell sinks into the scalp.
    at: (row, col) => {
      const c = col / cols,
        theta = azimuth(c),
        t = row / (rows - 1),
        phi = Math.max(0.03, t * (along(SHELL_LINE, theta, recede) + 0.02)),
        taper = 1 - Math.pow(t, 5);
      return headSurface(f, c, invert(polar, phi), thickness(theta, phi) * taper - 0.0015 * (1 - taper));
    },
    uv: (row, col) => [col / cols, row / (rows - 1)],
    weight: () => [],
    capStart: headSurface(f, 0.5, 0, thickness(0, 0)),
  });
  return builder.build(false);
}
