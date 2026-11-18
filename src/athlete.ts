import * as T from "three";
import {
  BODY,
  BONES,
  GROUPS,
  HEAD_ATLAS,
  SLEEVE_V,
  TORSO_V,
  buildBody,
  buildHair,
  buildHead,
  hairlineRow,
  headAtlas,
  type BoneName,
  type FaceShape,
  type GroupName,
  type HairStyle,
} from "./anatomy";
import { noiseTexture, seeded, texture } from "./world";
import type { Player, Pose, Quality } from "./core";
import { createRig, createSkeleton, placeRoot } from "./rig";
import type { MotionState } from "./motion";

export interface Athlete {
  root: T.Group;
  label: T.Sprite;
  bones: Record<BoneName, T.Bone>;
  /** Place the athlete at a model pose and animate the body from its planned gait state. */
  pose: (p: Pose, motion: MotionState, time: number) => void;
  /** Free the per-athlete GPU resources that scene traversal cannot reach. */
  dispose: () => void;
}

const SKIN = ["#b47d56", "#633d29", "#dab18c", "#8b593c", "#e0bea0"];
const FACES: FaceShape[] = [
  { jaw: 1, nose: 1, brow: 1, cheek: 1 },
  { jaw: 1.07, nose: 1.12, brow: 1.2, cheek: 0.8 },
  { jaw: 0.94, nose: 0.92, brow: 0.85, cheek: 1.2 },
];
const HAIR_STYLES: HairStyle[] = ["crop", "buzz", "textured", "crop", "curls", "buzz", "shaved", "textured"];
const HAIR_COLOURS = ["#15130f", "#15130f", "#2e2014", "#15130f", "#4a3420"];
const EYES = ["#3d2817", "#3d2817", "#4b3a1f", "#35434c"];
/** Tessellation per preset. The skinned body costs most per vertex; the rigid head carries the detail. */
const DETAIL: Record<Quality, { body: number; head: number }> = {
  low: { body: 0.55, head: 0.6 },
  balanced: { body: 0.7, head: 0.85 },
  cinematic: { body: 1.15, head: 1.15 },
};

interface Look {
  skin: string;
  face: number;
  hair: HairStyle;
  hairColour: string;
  recede: number;
  eyes: string;
  stubble: number;
}
/** Deterministic appearance from the roster entry: the same player always looks the same. */
function lookOf(player: Player): Look {
  const n = player.number + (player.team === "home" ? 0 : 5),
    dark = player.skin === 1 || player.skin === 3;
  return {
    skin: SKIN[player.skin] ?? SKIN[0],
    face: n % FACES.length,
    hair: HAIR_STYLES[(n * 3) % HAIR_STYLES.length],
    hairColour: dark ? HAIR_COLOURS[0] : HAIR_COLOURS[n % HAIR_COLOURS.length],
    recede: ((n * 7) % 2) * 0.5,
    eyes: dark ? EYES[0] : EYES[n % EYES.length],
    stubble: [0, 0.2, 0, 0.32, 0.12][n % 5],
  };
}

const shade = (hex: string, amount: number) => `#${new T.Color(hex).multiplyScalar(amount).getHexString()}`;
const tint = (hex: string, towards: string, amount: number) => `#${new T.Color(hex).lerp(new T.Color(towards), amount).getHexString()}`;

/** Face atlas: the head unwrapped by column/row, plus a plain skin strip for the limbs. */
function paintFace(c: CanvasRenderingContext2D, look: Look, size: number): void {
  const head = size * HEAD_ATLAS,
    skin = look.skin;
  const at = (x: number, y: number, z: number): [number, number] => {
    const [u, v] = headAtlas(x, y, z);
    return [u * size, v * head];
  };
  /** Pixels per metre along the surface, around the head and down it, at a point. */
  const scale = (x: number, y: number, z: number): [number, number] => {
    const flat = Math.hypot(x, z) || 1e-6,
      length = Math.hypot(x, y, z),
      e = 0.002,
      a = at(x, y, z),
      b = at(x + (z / flat) * e, y, z - (x / flat) * e),
      d = at(x + ((x * y) / (flat * length)) * e, y - (flat / length) * e, z + ((z * y) / (flat * length)) * e);
    return [Math.abs(b[0] - a[0]) / e, Math.abs(d[1] - a[1]) / e];
  };
  const soft = (x: number, y: number, z: number, width: number, height: number, colour: string, alpha: number, core = 0) => {
    const [px, py] = at(x, y, z),
      [sx, sy] = scale(x, y, z);
    c.save();
    c.translate(px, py);
    c.scale((width * sx) / 2, (height * sy) / 2);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1),
      rgb = new T.Color(colour),
      css = (a: number) => `rgba(${Math.round(rgb.r * 255)},${Math.round(rgb.g * 255)},${Math.round(rgb.b * 255)},${a})`;
    // Canvas colours are sRGB; T.Color parses hex into linear, so convert back before painting.
    rgb.convertLinearToSRGB();
    g.addColorStop(0, css(alpha));
    g.addColorStop(core, css(alpha));
    g.addColorStop(1, css(0));
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 1, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };
  /** Quadratic through three surface points (the middle one is on the curve). */
  const arc = (a: [number, number], mid: [number, number], b: [number, number], move = true) => {
    if (move) c.moveTo(a[0], a[1]);
    c.quadraticCurveTo(2 * mid[0] - (a[0] + b[0]) / 2, 2 * mid[1] - (a[1] + b[1]) / 2, b[0], b[1]);
  };

  c.fillStyle = skin;
  c.fillRect(0, 0, size, size);
  const rng = seeded(look.face * 97 + 13);
  for (let i = 0; i < 9000 * (size / 1024) ** 2; i++) {
    c.fillStyle = rng() > 0.5 ? "rgba(255,235,220,.035)" : "rgba(60,20,10,.04)";
    c.fillRect(rng() * size, rng() * head, 2, 2);
  }
  // Colour zones: redder cheeks, nose and ears; shadowed sockets and jaw underside.
  for (const s of [-1, 1]) {
    soft(s * 0.046, -0.03, 0.06, 0.05, 0.04, tint(skin, "#c2452f", 0.6), 0.16);
    soft(s * 0.079, -0.012, -0.018, 0.034, 0.07, tint(skin, "#c2452f", 0.5), 0.22);
    soft(s * 0.031, 0.004, 0.08, 0.05, 0.034, shade(skin, 0.55), 0.5, 0.25);
    // Ear: a shaded bowl inside a darker rim.
    soft(s * 0.084, -0.012, -0.012, 0.014, 0.036, shade(skin, 0.38), 0.75, 0.2);
    const [ex, ey] = at(s * 0.08, -0.008, -0.02),
      [esx, esy] = scale(s * 0.08, -0.008, -0.02);
    c.strokeStyle = shade(skin, 0.6);
    c.globalAlpha = 0.55;
    c.lineWidth = 0.0022 * esy;
    c.beginPath();
    c.ellipse(ex, ey, 0.013 * esx, 0.027 * esy, 0, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 1;
  }
  soft(0, -0.036, 0.11, 0.03, 0.024, tint(skin, "#c2452f", 0.6), 0.14);
  soft(0, -0.125, 0.03, 0.14, 0.05, shade(skin, 0.6), 0.5);

  // Scalp: solid under a hair shell, a darkened shadow on a shaved head, fading out at the hairline.
  const scalp = look.hair === "shaved" ? tint(skin, look.hairColour, 0.28) : look.hairColour,
    fade = ((look.hair === "shaved" || look.hair === "buzz" ? 26 : 12) * size) / 1024;
  const column = Math.max(2, size / 256);
  for (let x = 0; x < size; x += column) {
    const y = hairlineRow((x + column / 2) / size, look.recede) * head,
      g = c.createLinearGradient(0, y - fade, 0, y + fade * 0.4);
    g.addColorStop(0, scalp);
    g.addColorStop(1, `${scalp}00`);
    c.fillStyle = scalp;
    c.fillRect(x, 0, column, Math.max(0, y - fade));
    c.fillStyle = g;
    c.fillRect(x, y - fade, column, fade * 1.4);
  }
  if (look.stubble) {
    soft(0, -0.092, 0.06, 0.15, 0.085, look.hairColour, look.stubble, 0.5);
    soft(0, -0.054, 0.09, 0.06, 0.016, look.hairColour, look.stubble * 0.9, 0.4);
    for (const s of [-1, 1]) soft(s * 0.055, -0.06, 0.02, 0.05, 0.09, look.hairColour, look.stubble * 0.8, 0.3);
  }

  for (const s of [-1, 1]) {
    // Eye: sclera, iris and pupil clipped to the lid opening, then lash and crease lines.
    const inner = at(s * 0.0165, 0, 0.081),
      outer = at(s * 0.0455, 0.0028, 0.075),
      upper = at(s * 0.03, 0.0074, 0.079),
      lower = at(s * 0.0315, -0.0042, 0.079),
      centre = at(s * 0.031, 0.0018, 0.079),
      [sx, sy] = scale(s * 0.031, 0.0018, 0.079);
    c.save();
    c.beginPath();
    arc(inner, upper, outer);
    arc(outer, lower, inner, false);
    c.closePath();
    c.clip();
    const sclera = c.createLinearGradient(0, upper[1], 0, lower[1]);
    sclera.addColorStop(0, "#b9b2aa");
    sclera.addColorStop(0.45, "#ebe5dc");
    sclera.addColorStop(1, "#d9d1c7");
    c.fillStyle = sclera;
    c.fillRect(centre[0] - 40, centre[1] - 30, 80, 60);
    const disc = (radius: number, colour: string, dx = 0, dy = 0) => {
      c.fillStyle = colour;
      c.beginPath();
      c.ellipse(centre[0] + dx * sx, centre[1] - dy * sy, radius * sx, radius * sy, 0, 0, Math.PI * 2);
      c.fill();
    };
    disc(0.0063, shade(look.eyes, 0.45));
    disc(0.0055, look.eyes);
    disc(0.0023, "#060505");
    disc(0.0009, "rgba(255,255,255,.85)", 0.0017, 0.0019);
    c.restore();
    c.lineCap = "round";
    c.strokeStyle = "#17100c";
    c.lineWidth = 0.0017 * sy;
    c.beginPath();
    arc(inner, upper, outer);
    c.stroke();
    c.strokeStyle = shade(skin, 0.6);
    c.globalAlpha = 0.7;
    c.lineWidth = 0.0007 * sy;
    c.beginPath();
    arc(outer, lower, inner);
    c.stroke();
    c.beginPath();
    arc(at(s * 0.017, 0.0045, 0.081), at(s * 0.03, 0.0122, 0.079), at(s * 0.046, 0.0065, 0.075));
    c.stroke();
    c.globalAlpha = 1;
    // Eyebrow: a soft wide pass under a darker core.
    const brow: [[number, number], [number, number], [number, number]] = [
      at(s * 0.012, 0.0205, 0.084),
      at(s * 0.032, 0.0272, 0.082),
      at(s * 0.0515, 0.0205, 0.07),
    ];
    for (const [width, alpha] of [
      [0.007, 0.16],
      [0.0044, 0.85],
    ]) {
      c.strokeStyle = look.hairColour;
      c.globalAlpha = alpha;
      c.lineWidth = width * sy;
      c.beginPath();
      arc(brow[0], brow[1], brow[2]);
      c.stroke();
    }
    c.globalAlpha = 1;
    soft(s * 0.0085, -0.0462, 0.097, 0.0062, 0.0036, shade(skin, 0.25), 0.9, 0.4);
  }

  // Lips.
  const lip = tint(skin, "#9a433f", 0.5),
    left = at(-0.0245, -0.0668, 0.08),
    right = at(0.0245, -0.0668, 0.08),
    line = at(0, -0.0672, 0.088);
  c.fillStyle = shade(lip, 0.86);
  c.beginPath();
  arc(left, at(-0.0125, -0.0612, 0.086), at(-0.006, -0.0596, 0.088));
  arc(at(-0.006, -0.0596, 0.088), at(-0.003, -0.0604, 0.088), at(0, -0.0612, 0.088), false);
  arc(at(0, -0.0612, 0.088), at(0.003, -0.0604, 0.088), at(0.006, -0.0596, 0.088), false);
  arc(at(0.006, -0.0596, 0.088), at(0.0125, -0.0612, 0.086), right, false);
  arc(right, line, left, false);
  c.fill();
  c.fillStyle = lip;
  c.beginPath();
  arc(left, line, right);
  arc(right, at(0, -0.0768, 0.088), left, false);
  c.fill();
  c.strokeStyle = "rgba(50,22,20,.85)";
  c.lineWidth = 0.001 * scale(0, -0.067, 0.088)[1];
  c.beginPath();
  arc(left, line, right);
  c.stroke();
  soft(0, -0.0815, 0.085, 0.03, 0.008, shade(skin, 0.55), 0.35);
}

interface Kit {
  shirt: string;
  shorts: string;
  socks: string;
  trim: string;
  ink: string;
}
function kitOf(player: Player, keeper: boolean): Kit {
  const home = player.team === "home";
  return {
    shirt: keeper ? (home ? "#f4bc49" : "#c2dc57") : home ? "#e4e8d8" : "#c94e38",
    shorts: keeper ? (home ? "#b68224" : "#637d37") : home ? "#263e38" : "#431f23",
    socks: keeper ? (home ? "#f4bc49" : "#c2dc57") : home ? "#e0e7d8" : "#a7352c",
    trim: home ? "#385a45" : "#e6bc90",
    // Both keeper shirts are light, so they take the dark ink.
    ink: home || keeper ? "#233c32" : "#f9ecd2",
  };
}
/** Shirt atlas. Torso columns run left side, back, right side, front; sleeves share a band above. */
function paintShirt(c: CanvasRenderingContext2D, kit: Kit, number: number, size: number): void {
  const back = size * 0.25,
    front = size * 0.75,
    metre = (size * TORSO_V) / 0.59,
    y = (height: number) => size - (height - 0.93) * metre;
  c.fillStyle = kit.shirt;
  c.fillRect(0, 0, size, size);
  // Side panels from the hem to the armpit.
  c.fillStyle = kit.trim;
  for (const x of [0, size / 2, size]) c.fillRect(x - size * 0.022, y(1.32), size * 0.044, size - y(1.32));
  c.fillStyle = kit.ink;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `bold ${Math.round(0.25 * metre)}px sans-serif`;
  c.fillText(String(number), back, y(1.275));
  c.font = `bold ${Math.round(0.085 * metre)}px sans-serif`;
  c.fillText(String(number), front, y(1.24));
  c.font = `600 ${Math.round(0.026 * metre)}px sans-serif`;
  c.fillText("TOUCHLINE", front, y(1.335));
  // Crest over the heart: the athlete's left is towards the end of the atlas.
  const crest = front + size * 0.085;
  c.beginPath();
  c.arc(crest, y(1.4), 0.021 * metre, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = kit.shirt;
  c.beginPath();
  c.arc(crest, y(1.4), 0.012 * metre, 0, Math.PI * 2);
  c.fill();
  // Sleeve cuffs.
  c.fillStyle = kit.trim;
  c.fillRect(0, size * (1 - SLEEVE_V[0]) - size * 0.028, size, size * 0.034);
}

function standard(colour: string, roughness: number, options: T.MeshStandardMaterialParameters = {}) {
  return new T.MeshStandardMaterial({ color: colour, roughness, ...options });
}

/**
 * Builds athletes for one renderer. Geometry is generated once per body type, face and hair style
 * and shared; every athlete owns its skeleton, materials and textures.
 */
export function createAthleteFactory(quality: Quality): (player: Player) => Athlete {
  const detail = DETAIL[quality],
    // Per-athlete textures dominate GPU memory; only the cinematic preset affords 1024 px atlases.
    atlas = quality === "cinematic" ? 1024 : quality === "balanced" ? 512 : 256,
    cache = new Map<string, T.BufferGeometry | null>(),
    cached = <G extends T.BufferGeometry | null>(key: string, make: () => G): G => {
      if (!cache.has(key)) cache.set(key, make());
      return cache.get(key) as G;
    };
  const fabric = noiseTexture();
  fabric.repeat.set(26, 26);
  const strands = texture(256, 256, (c) => {
    const rng = seeded(31);
    c.fillStyle = "#808080";
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      c.strokeStyle = rng() > 0.5 ? "rgba(255,255,255,.5)" : "rgba(0,0,0,.5)";
      c.lineWidth = 1 + rng();
      const x = rng() * 256,
        y = rng() * 256;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (rng() - 0.5) * 10, y + 14 + rng() * 22);
      c.stroke();
    }
  });
  strands.colorSpace = T.NoColorSpace;
  strands.wrapS = strands.wrapT = T.RepeatWrapping;
  strands.repeat.set(5, 2);

  return (player) => {
    const root = new T.Group();
    root.name = player.id;
    root.userData.playerId = player.id;
    const keeper = player.number === 1,
      kit = kitOf(player, keeper),
      look = lookOf(player);

    const bones = createSkeleton();
    root.add(bones.pelvis);

    const face = texture(atlas, atlas, (c) => paintFace(c, look, atlas)),
      shirt = texture(atlas, atlas, (c) => paintShirt(c, kit, player.number, atlas));
    face.anisotropy = shirt.anisotropy = 4;
    const skin = new T.MeshPhysicalMaterial({ map: face, roughness: 0.6, metalness: 0, clearcoat: 0.05, clearcoatRoughness: 0.8 });
    const cloth = { side: T.DoubleSide, bumpMap: fabric } as const;
    const materials: Record<GroupName, T.Material> = {
      skin,
      shirt: standard("#ffffff", 0.88, { ...cloth, map: shirt, bumpScale: 0.35 }),
      shorts: standard(kit.shorts, 0.93, { side: T.DoubleSide }),
      socks: standard(kit.socks, 0.95, { side: T.DoubleSide }),
      trim: standard(kit.trim, 0.8, { side: T.DoubleSide }),
      boots: standard(player.number % 3 === 0 ? "#e5d56d" : player.number % 5 === 0 ? "#d8dde0" : "#202622", 0.42, { metalness: 0.08, vertexColors: true }),
      hair: standard(look.hairColour, 0.92, { bumpMap: strands, bumpScale: look.hair === "curls" ? 2.4 : 1.4 }),
      gloves: standard(player.team === "home" ? "#e9ecea" : "#22282b", 0.75),
    };
    const body = new T.SkinnedMesh(
      cached(`body-${keeper}`, () => buildBody({ detail: detail.body, keeper })),
      GROUPS.map((group) => materials[group]),
    );
    body.castShadow = body.receiveShadow = true;
    body.boundingSphere = new T.Sphere(new T.Vector3(0, 0.95, 0), 1.6);
    body.boundingBox = new T.Box3(new T.Vector3(-1.4, -0.4, -1.4), new T.Vector3(1.4, 2.4, 1.4));
    root.add(body);
    root.updateMatrixWorld(true);
    const skeleton = new T.Skeleton(BONES.map((name) => bones[name]));
    body.bind(skeleton);

    const head = new T.Mesh(
      cached(`head-${look.face}`, () => buildHead(detail.head, FACES[look.face])),
      skin,
    );
    head.castShadow = head.receiveShadow = true;
    bones.head.add(head);
    const hair = cached(`hair-${look.hair}-${look.recede}`, () => buildHair(detail.head, look.hair, look.recede));
    if (hair) {
      const mesh = new T.Mesh(hair, materials.hair);
      mesh.castShadow = true;
      bones.head.add(mesh);
    }

    const home = player.team === "home";
    const labelMap = texture(128, 80, (c) => {
      c.fillStyle = "rgba(9,17,16,.84)";
      c.beginPath();
      c.roundRect(13, 8, 102, 60, 22);
      c.fill();
      c.fillStyle = home ? "#dbf4bb" : "#ffb19a";
      c.font = "600 34px sans-serif";
      c.textAlign = "center";
      c.fillText(String(player.number).padStart(2, "0"), 64, 51);
    });
    const label = new T.Sprite(new T.SpriteMaterial({ map: labelMap, transparent: true, depthTest: true, depthWrite: false }));
    label.position.y = 2.02;
    label.scale.set(0.77, 0.48, 1);
    root.add(label);
    const scale = player.height / BODY.height,
      rig = createRig(bones, { scale, keeper, seed: (player.number * 0.137 + (home ? 0 : 0.41)) % 1 });
    root.scale.setScalar(scale);
    return {
      root,
      label,
      bones,
      pose(p, motion, time) {
        placeRoot(root, p, scale);
        rig.solve(p, motion, time);
      },
      dispose: () => skeleton.dispose(),
    };
  };
}

/** Truncated-icosahedron panels projected onto a sphere: 12 black pentagons, 20 white hexagons. */
export function createBall(): T.Mesh {
  const source = new T.IcosahedronGeometry(1, 0);
  const attr = source.getAttribute("position");
  const vertices: T.Vector3[] = [];
  const faces: number[][] = [];
  const index = (v: T.Vector3) => {
    let i = vertices.findIndex((p) => p.distanceToSquared(v) < 1e-8);
    if (i < 0) {
      i = vertices.length;
      vertices.push(v);
    }
    return i;
  };
  for (let i = 0; i < attr.count; i += 3) faces.push([0, 1, 2].map((k) => index(new T.Vector3().fromBufferAttribute(attr, i + k))));
  source.dispose();
  const neighbors = vertices.map(() => new Set<number>());
  faces.forEach((f) =>
    f.forEach((v, i) => {
      neighbors[v].add(f[(i + 1) % 3]);
      neighbors[v].add(f[(i + 2) % 3]);
    }),
  );
  const cut = (a: number, b: number) =>
    vertices[a]
      .clone()
      .multiplyScalar(2 / 3)
      .addScaledVector(vertices[b], 1 / 3)
      .normalize();
  const panels: { points: T.Vector3[]; color: T.Color }[] = [];
  vertices.forEach((v, i) => {
    const pts = [...neighbors[i]].map((n) => cut(i, n));
    const axis = pts[0]
      .clone()
      .sub(v.clone().multiplyScalar(pts[0].dot(v)))
      .normalize();
    const cross = new T.Vector3().crossVectors(v, axis);
    pts.sort((a, b) => Math.atan2(a.dot(cross), a.dot(axis)) - Math.atan2(b.dot(cross), b.dot(axis)));
    panels.push({ points: pts, color: new T.Color("#17201d") });
  });
  faces.forEach(([a, b, c]) =>
    panels.push({ points: [cut(a, b), cut(b, a), cut(b, c), cut(c, b), cut(c, a), cut(a, c)], color: new T.Color("#e9e8da") }),
  );
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [];
  function tri(a: T.Vector3, b: T.Vector3, c: T.Vector3, color: T.Color, depth = 2) {
    if (depth) {
      const ab = a.clone().add(b).normalize(),
        bc = b.clone().add(c).normalize(),
        ca = c.clone().add(a).normalize();
      tri(a, ab, ca, color, depth - 1);
      tri(ab, b, bc, color, depth - 1);
      tri(ca, bc, c, color, depth - 1);
      tri(ab, bc, ca, color, depth - 1);
      return;
    }
    const n = new T.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    if (n.dot(a) < 0) [b, c] = [c, b];
    for (const p of [a, b, c]) {
      positions.push(p.x * 0.11, p.y * 0.11, p.z * 0.11);
      normals.push(p.x, p.y, p.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  panels.forEach(({ points, color }) => {
    const center = points.reduce((a, b) => a.add(b), new T.Vector3()).normalize();
    points.forEach((p, i) => tri(center, p, points[(i + 1) % points.length], color));
  });
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  const ball = new T.Mesh(geometry, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 }));
  ball.castShadow = true;
  ball.receiveShadow = true;
  return ball;
}
