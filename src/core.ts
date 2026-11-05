/** Pure, renderer-independent scene model. Metres, seconds and degrees. +x attacks right. */
export type Team = 'home' | 'away';
export interface Player { id: string; number: number; role: string; team: Team; height: number; skin: number }
export interface Pose { x: number; z: number; body: number; head: number; pitch: number }
export interface Ball { x: number; z: number; y: number; owner: string | null; arc: number }
export interface Frame { t: number; players: Record<string, Pose>; ball: Ball }
export interface DefencePlan { team: Team; mode: 'zone' | 'man'; anchors: Record<string, {x:number;z:number}>; reference: {x:number;z:number}; marks: Record<string,string> }
export interface Project { version: 1; name: string; duration: number; roster: Player[]; frames: Frame[]; defence?: DefencePlan }
export type CameraMode = 'eye' | 'follow' | 'orbit';
export type Lighting = 'golden' | 'day' | 'night';
export type Quality = 'low' | 'balanced' | 'cinematic';
export interface ViewSettings { camera: CameraMode; lighting: Lighting; quality: Quality; fov: number; eye: number; labels: boolean; paths: boolean; vision: boolean; bob: boolean; ballLook: boolean; fps: boolean; sensitivity: number; lanes: boolean; bielsa: boolean; xg: boolean }
/** Role text is editable/imported metadata; reserve exactly one keeper slot per team. */
export function squad(roster:Player[],team:Team) {
  const players=roster.filter(p=>p.team===team);
  const keeper=players.find(p=>p.role==='GK')??players[0];
  return {keeper,outfield:players.filter(p=>p.id!==keeper.id)};
}
export const RAD = Math.PI / 180;
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const wrap = (a: number) => ((a + 180) % 360 + 360) % 360 - 180;
export const angleLerp = (a: number, b: number, t: number) => t <= 0 ? a : t >= 1 ? b : wrap(a + wrap(b - a) * t);
export const clone = <T,>(x: T): T => structuredClone(x);
export const distance = (a: {x: number; z: number}, b: {x: number; z: number}) => Math.hypot(a.x - b.x, a.z - b.z);
export function verticalFov(horizontal: number, aspect: number) { return 2 * Math.atan(Math.tan(horizontal * RAD / 2) / Math.max(aspect, .1)) / RAD; }

export function ballPosition(frame: Frame): Ball {
  const p = frame.ball.owner ? frame.players[frame.ball.owner] : undefined;
  return p ? { ...frame.ball, x: p.x + Math.cos(p.body * RAD) * .48, z: p.z + Math.sin(p.body * RAD) * .48, y: .11 } : { ...frame.ball };
}

/** Linear spatial interpolation avoids spline overshoot outside the pitch.
 * Angles use the shortest arc. A ball's outgoing arc belongs to the left keyframe. */
export function sample(project: Project, t: number): Frame {
  t = clamp(t, 0, project.duration);
  const frames = project.frames;
  let index = 0;
  while (index < frames.length - 2 && frames[index + 1].t <= t) index++;
  const a = frames[index], b = frames[Math.min(index + 1, frames.length - 1)];
  const u = a === b ? 0 : clamp((t - a.t) / (b.t - a.t), 0, 1);
  const endpoint = u === 0 ? a : u === 1 ? b : null;
  if (endpoint) return { t, players: clone(endpoint.players), ball: ballPosition(endpoint) };
  const players: Record<string, Pose> = {};
  for (const player of project.roster) {
    const p = a.players[player.id], q = b.players[player.id];
    players[player.id] = { x: lerp(p.x, q.x, u), z: lerp(p.z, q.z, u), body: angleLerp(p.body, q.body, u), head: lerp(p.head, q.head, u), pitch: lerp(p.pitch, q.pitch, u) };
  }
  const ba = ballPosition(a), bb = ballPosition(b);
  const sameOwner = a.ball.owner !== null && a.ball.owner === b.ball.owner;
  const ball: Ball = { x: lerp(ba.x, bb.x, u), z: lerp(ba.z, bb.z, u), y: lerp(ba.y, bb.y, u) + (sameOwner ? 0 : 4 * a.ball.arc * u * (1 - u)), arc: a.ball.arc, owner: sameOwner ? a.ball.owner : u === 0 ? a.ball.owner : u === 1 ? b.ball.owner : null };
  const frame = { t, players, ball };
  if (sameOwner) frame.ball = ballPosition(frame);
  return frame;
}

/** Snap nearby edits without moving the protected first/last keyframe. */
function keyTime(project: Project, time: number): number {
  const rounded = clamp(Math.round(time * 100) / 100, 0, project.duration);
  return project.frames.find(f => Math.abs(f.t - rounded) < .025)?.t ?? rounded;
}

/** Pose-only insertion preserves the existing ball parabola exactly. */
export function upsert(project: Project, time: number, edit: (frame: Frame) => void): Project {
  const next: Project = { ...project, frames: clone(project.frames) };
  const t = keyTime(project, time);
  const i = next.frames.findIndex(f => f.t === t);
  const frame = i >= 0 ? next.frames[i] : sample(next, t);
  if (i < 0) {
    const right = next.frames.findIndex(f => f.t > t);
    if (right > 0) {
      const left = next.frames[right - 1];
      const u = (t - left.t) / (next.frames[right].t - left.t);
      const arc = left.ball.arc;
      left.ball.arc = arc * u * u;
      frame.ball.arc = arc * (1 - u) * (1 - u);
    }
    next.frames.push(frame);
  }
  edit(frame);
  next.frames.sort((a, b) => a.t - b.t);
  return next;
}

export function removeKeyframe(project: Project, t: number): Project {
  return { ...project, frames: project.frames.filter(f => f.t === 0 || f.t === project.duration || Math.abs(f.t - t) > .025) };
}

export function makePass(project: Project, t: number, from: string, to: string, seconds = 1.2, arc = 0): Project {
  if (from === to || !project.roster.some(p => p.id === from) || !project.roster.some(p => p.id === to)) return project;
  t = keyTime(project, t);
  const end = keyTime(project, t + seconds);
  if (end - t < .1) return project;
  let next = upsert(project, t, f => { f.ball = { ...f.ball, owner: from, arc, y: .11 }; });
  // Remove intermediate ball waypoints while preserving all intermediate player poses.
  const startBall = ballPosition(sample(next, t));
  const endFrame = sample(next, end);
  endFrame.ball.owner = to;
  const endBall = ballPosition(endFrame);
  next = { ...next, frames: next.frames.map(f => {
    if (f.t <= t || f.t >= end) return f;
    const u = (f.t - t) / (end - t);
    return { ...f, ball: { owner: null, x: lerp(startBall.x, endBall.x, u), z: lerp(startBall.z, endBall.z, u), y: .11 + 4 * arc * u * (1-u), arc: 0 } };
  }) };
  next = upsert(next, end, f => { f.ball = { ...f.ball, owner: to, arc: 0, y: .11 }; });
  // Piecewise quadratic interpolation preserves the full flight through intermediate frames.
  const startIndex = next.frames.findIndex(f => Math.abs(f.t - t) < .025);
  for (let i = startIndex; i < next.frames.length - 1 && next.frames[i].t < end; i++) {
    const fraction = (Math.min(end, next.frames[i + 1].t) - next.frames[i].t) / (end - t);
    next.frames[i].ball.arc = arc * fraction * fraction;
  }
  return next;
}

export function segmentDistance(p: Pose, a: Pose, b: Pose): { distance: number; u: number } {
  const dx = b.x - a.x, dz = b.z - a.z;
  const u = clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz || 1), 0, 1);
  return { distance: Math.hypot(p.x-a.x-u*dx, p.z-a.z-u*dz), u };
}

export interface Sight { id: string; inView: boolean; occluded: boolean; clearPass: boolean; distance: number }
/** Static geometric approximation, not attention tracking or interception prediction. */
export function analyse(project: Project, frame: Frame, id: string, fov: number, eye: number, aspect = 1.65): Sight[] {
  const observer = frame.players[id];
  const team = project.roster.find(p => p.id === id)?.team;
  const vfov = verticalFov(fov, aspect);
  return project.roster.filter(p => p.id !== id && p.team === team).map(player => {
    const target = frame.players[player.id];
    const d = distance(observer, target);
    const bearing = Math.atan2(target.z-observer.z, target.x-observer.x) / RAD;
    const elevation = Math.atan2(player.height*.72-eye, d) / RAD;
    const inView = Math.abs(wrap(bearing-observer.body-observer.head)) <= fov/2 && Math.abs(elevation-observer.pitch) <= vfov/2;
    let occluded = false, clearPass = true;
    for (const other of project.roster) {
      if (other.id === id || other.id === player.id) continue;
      const hit = segmentDistance(frame.players[other.id], observer, target);
      if (hit.u <= .01 || hit.u >= .99) continue;
      const rayHeight = lerp(eye, player.height*.72, hit.u);
      if (hit.distance < .28 && rayHeight < other.height) occluded = true;
      if (other.team !== team && hit.distance < .85) clearPass = false;
    }
    return { id: player.id, inView, occluded, clearPass, distance: d };
  });
}

const homeRoles = ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'RW', 'CM', 'ST', 'AM', 'LW'];
const homeStart = [[-48,0],[-28,25],[-31,9],[-31,-9],[-28,-25],[-12,0],[7,25],[-2,13],[22,0],[4,-10],[10,-26]];
const awayStart = [[48,0],[27,-24],[29,-8],[29,8],[27,24],[10,1],[0,-23],[0,12],[-22,-2],[-12,-12],[-5,25]];
export function createDemo(kind = 'build'): Project {
  const roster: Player[] = ['home','away'].flatMap((team, ti) => homeRoles.map((role, i) => ({ id: `${team}-${i+1}`, number: i+1, role, team: team as Team, height: 1.76 + ((i*7)%11)/100, skin: (i+ti*2)%5 })));
  const times = [0, 1.2, 2.4, 3.6, 4.8, 6, 7.5, 9, 12];
  const frames = times.map(t => {
    const u = t/12;
    const players: Record<string, Pose> = {};
    roster.forEach((p,i) => {
      const n = i%11, base = (p.team === 'home' ? homeStart : awayStart)[n];
      const move = n === 0 ? 0 : p.team === 'home' ? u*(n>5?12:5) : u*3;
      players[p.id] = { x: base[0]+move, z: base[1]+(n === 6 ? -u*8 : n === 7 ? -u*5 : Math.sin(u*Math.PI)*1.5), body: p.team === 'home' ? 0 : 180, head: 0, pitch: -2 };
    });
    const p6 = players['home-6'];
    p6.x = -12 + Math.max(0,t-3.6)*.8;
    p6.body = t < 2.4 ? -t*20 : t < 4.8 ? -48 + (t-2.4)*20 : 0;
    p6.head = t === 1.2 ? -100 : t === 2.4 ? -90 : t === 3.6 ? -55 : t === 6 ? 35 : 0;
    players['away-9'].x = -22 + Math.min(t,4)*2.8;
    players['away-9'].z = -2 + Math.min(t,4)*1.5;
    players['away-9'].body = 20;
    const owner = t <= 1.2 ? 'home-3' : t === 2.4 ? null : t <= 4.8 ? 'home-6' : t === 6 ? null : 'home-7';
    const ball: Ball = { x: -21, z: 4.5, y: .11, owner, arc: t === 4.8 ? .25 : 0 };
    if(t === 6) { ball.x = 3; ball.z = 12; ball.y = .35; }
    if(kind === 'through') {
      players['home-9'].x = 18 + u*24; players['home-9'].z = -u*10;
      players['home-6'].x += 12; players['home-6'].head = 0; players['home-6'].body = -8;
      ball.owner = t <= 3.6 ? 'home-6' : t >= 7.5 ? 'home-9' : null;
      ball.x = 10 + (t-3.6)*5.2; ball.z = -(t-3.6)*1.5; ball.arc = t === 3.6 ? .8 : 0;
    }
    if(kind === 'overlap') {
      players['home-2'].x = -28+u*65; players['home-2'].z = 28;
      players['home-7'].x = 7+u*10; players['home-7'].z = 23-u*9;
      ball.owner = t <= 4.8 ? 'home-7' : t >= 7.5 ? 'home-2' : null;
      ball.x = 13; ball.z = 26; ball.arc = .05;
    }
    // JSON has no negative zero. Keep generated data canonical before it is saved.
    for (const pose of Object.values(players)) {
      for (const key of ['x', 'z', 'body', 'head', 'pitch'] as const) {
        if (Object.is(pose[key], -0)) pose[key] = 0;
      }
    }
    for (const key of ['x', 'z', 'y', 'arc'] as const) {
      if (Object.is(ball[key], -0)) ball[key] = 0;
    }
    return { t, players, ball };
  });
  return { version: 1, name: kind === 'through' ? 'ライン間からのスルーパス' : kind === 'overlap' ? 'サイドバックのオーバーラップ' : 'ボランチの首振りと展開', duration: 12, roster, frames };
}

/** Strict allowlist parser. Imported data never reaches the renderer without validation. */
export function parseProject(text: string): Project {
  if(text.length > 2_000_000) throw new Error('ファイルは2 MB以下にしてください。');
  const raw = JSON.parse(text) as Record<string, unknown>;
  const fail = () => { throw new Error('対応するTOUCHLINE形式ではありません。22人・0秒と終了秒のキーフレームが必要です。'); };
  if(!raw || raw.version !== 1 || typeof raw.name !== 'string' || raw.name.length > 120 || typeof raw.duration !== 'number' || !Number.isFinite(raw.duration) || raw.duration < 1 || raw.duration > 300 || !Array.isArray(raw.roster) || raw.roster.length !== 22 || !Array.isArray(raw.frames) || raw.frames.length < 2 || raw.frames.length > 1000) return fail();
  const num = (v: unknown, lo: number, hi: number): number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fail();
  const ids = new Set<string>();
  const roster: Player[] = raw.roster.map((r: Player) => {
    if(!r || typeof r.id !== 'string' || !/^(home|away)-\d{1,2}$/.test(r.id) || ids.has(r.id) || (r.team !== 'home' && r.team !== 'away') || typeof r.role !== 'string' || r.role.length > 20) return fail();
    if (!Number.isInteger(r.number) || !Number.isInteger(r.skin) || !r.id.startsWith(`${r.team}-`)) return fail();
    ids.add(r.id);
    return { id: r.id, team: r.team, role: r.role, number: num(r.number,1,99), height: num(r.height,1.4,2.2), skin: num(r.skin,0,4) };
  });
  if(roster.filter(r=>r.team==='home').length !== 11) return fail();
  let previous = -1;
  const duration = raw.duration;
  const frames: Frame[] = raw.frames.map((f: Frame) => {
    if(!f || !f.players || !f.ball) return fail();
    const t = num(f.t,0,duration);
    if(t <= previous) return fail(); previous = t;
    const players: Record<string, Pose> = {};
    for(const r of roster) {
      const p = f.players[r.id]; if(!p) return fail();
      players[r.id] = { x:num(p.x,-52.5,52.5), z:num(p.z,-34,34), body:num(p.body,-360,360), head:num(p.head,-110,110), pitch:num(p.pitch,-45,45) };
    }
    const b = f.ball;
    if(b.owner !== null && !ids.has(b.owner)) return fail();
    return { t, players, ball:{x:num(b.x,-60,60),z:num(b.z,-42,42),y:num(b.y,.05,30),owner:b.owner,arc:num(b.arc,0,12)} };
  });
  if(frames[0].t !== 0 || frames.at(-1)!.t !== duration) return fail();
  let defence: DefencePlan | undefined;
  if(raw.defence !== undefined) {
    const d=raw.defence as DefencePlan;
    if(!d || (d.team!=='home' && d.team!=='away') || (d.mode!=='zone' && d.mode!=='man') || !d.anchors || !d.reference || !d.marks) return fail();
    const anchors: DefencePlan['anchors']={}, marks: Record<string,string>={};
    const targets=new Set<string>();
    for(const p of roster.filter(p=>p.team===d.team)) {
      const a=d.anchors[p.id];if(!a)return fail();
      anchors[p.id]={x:num(a.x,-52.5,52.5),z:num(a.z,-34,34)};
      if(d.mode==='man' && p.id!==squad(roster,d.team).keeper.id) {
        const target=squad(roster,d.team==='home'?'away':'home').outfield.find(q=>q.id===d.marks[p.id]);
        if(!target || targets.has(target.id))return fail();targets.add(target.id);marks[p.id]=target.id;
      }
    }
    defence={team:d.team,mode:d.mode,anchors,reference:{x:num(d.reference.x,-60,60),z:num(d.reference.z,-42,42)},marks};
  }
  return { version:1, name:raw.name, duration, roster, frames, ...(defence?{defence}:{}) };
}
