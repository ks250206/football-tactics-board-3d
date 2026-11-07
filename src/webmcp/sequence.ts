import { clone, createDemo, parseProject, type Ball, type Frame, type Project, type Pose } from '../core';

const baseline = createDemo();
const playerIds = baseline.roster.map(player => player.id);
const playerIdSet = new Set(playerIds);
const position = {
  x: { type: 'number', minimum: -52.5, maximum: 52.5 },
  z: { type: 'number', minimum: -34, maximum: 34 },
} as const;
const playerId = { type: 'string', enum: playerIds } as const;
const object = <T extends Record<string, object>>(properties: T, required: (keyof T)[] = []) =>
  ({ type: 'object', properties, required, additionalProperties: false } as const);

export const sequenceSchema = object({
  name: { type: 'string', minLength: 1, maxLength: 120 },
  duration: { type: 'number', minimum: 1, maximum: 120, description: 'Duration in seconds.' },
  keyframes: {
    type: 'array', minItems: 2, maxItems: 80,
    description: 'Strictly increasing time. Start at 0 and end at duration. Omitted player fields carry forward from the preceding key, starting from the default formation.',
    items: object({
      t: { type: 'number', minimum: 0, maximum: 120 },
      players: {
        type: 'array', maxItems: 22,
        description: 'One update per player ID. HOME attacks toward +x and AWAY toward -x. Coordinates are metres. Angles are degrees, with body 0 facing +x and head relative to body.',
        items: object({
          id: playerId, ...position,
          body: { type: 'number', minimum: -360, maximum: 360 },
          head: { type: 'number', minimum: -110, maximum: 110 },
          pitch: { type: 'number', minimum: -45, maximum: 45 },
        }, ['id']),
      },
      ball: {
        ...object({
          owner: playerId,
          x: { type: 'number', minimum: -60, maximum: 60 },
          z: { type: 'number', minimum: -42, maximum: 42 },
          y: { type: 'number', minimum: 0.05, maximum: 30 },
          arc: { type: 'number', minimum: 0, maximum: 12 },
        }),
        description: 'Required at t=0. For possession, supply owner. For a free ball, omit owner and supply x and z. y defaults to 0.11 m. arc is the outgoing arc height. Omitting ball carries possession/position but resets arc.',
      },
    }, ['t']),
  },
}, ['name', 'duration', 'keyframes']);

type RecordInput = Record<string, unknown>;

function record(value: unknown, keys: readonly string[], path: string): RecordInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(path + ' must be an object.');
  const entries = Object.entries(value);
  if (entries.some(([key]) => !keys.includes(key))) throw new Error(path + ' contains an unknown field.');
  return Object.fromEntries(entries);
}

function number(value: unknown, min: number, max: number, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(path + ' must be a number between ' + min + ' and ' + max + '.');
  }
  return value;
}

function id(value: unknown, path: string): string {
  if (typeof value !== 'string' || !playerIdSet.has(value)) throw new Error(path + ' must use a home-1…home-11 or away-1…away-11 ID.');
  return value;
}

function readBall(value: unknown, path: string): Ball {
  const ball = record(value, ['owner', 'x', 'z', 'y', 'arc'], path);
  const owner = ball.owner === undefined ? null : id(ball.owner, path + '.owner');
  return {
    owner,
    x: number(owner && ball.x === undefined ? 0 : ball.x, -60, 60, path + '.x'),
    z: number(owner && ball.z === undefined ? 0 : ball.z, -42, 42, path + '.z'),
    y: number(ball.y === undefined ? 0.11 : ball.y, 0.05, 30, path + '.y'),
    arc: number(ball.arc === undefined ? 0 : ball.arc, 0, 12, path + '.arc'),
  };
}

export function authorSequence(input: unknown): Project {
  const draft = record(input, ['name', 'duration', 'keyframes'], 'Sequence');
  if (typeof draft.name !== 'string' || !draft.name.trim() || draft.name.length > 120) {
    throw new Error('name must contain 1–120 characters.');
  }
  const duration = number(draft.duration, 1, 120, 'duration');
  if (!Array.isArray(draft.keyframes) || draft.keyframes.length < 2 || draft.keyframes.length > 80) {
    throw new Error('Supply 2–80 keyframes.');
  }

  const frames: Frame[] = [];
  for (const [index, raw] of draft.keyframes.entries()) {
    const path = 'keyframes[' + index + ']';
    const key = record(raw, ['t', 'players', 'ball'], path);
    const t = number(key.t, 0, duration, path + '.t');
    const previous = frames.at(-1);
    if ((!previous && t !== 0) || (previous && t <= previous.t)) {
      throw new Error('Keyframes must start at 0 and increase strictly.');
    }
    const players = clone((previous ?? baseline.frames[0]).players);
    const updates = key.players === undefined ? [] : key.players;
    if (!Array.isArray(updates) || updates.length > 22) throw new Error(path + '.players must be an array of at most 22 updates.');
    const seen = new Set<string>();
    for (const rawPlayer of updates) {
      const update = record(rawPlayer, ['id', 'x', 'z', 'body', 'head', 'pitch'], path + '.players');
      const player = id(update.id, path + '.players.id');
      if (seen.has(player)) throw new Error(path + ' contains duplicate player ' + player + '.');
      seen.add(player);
      const limits = { x: 52.5, z: 34, body: 360, head: 110, pitch: 45 } satisfies Record<keyof Pose, number>;
      for (const field of Object.keys(limits) as (keyof Pose)[]) {
        if (update[field] !== undefined) {
          players[player][field] = number(update[field], -limits[field], limits[field], path + '.' + player + '.' + field);
        }
      }
    }
    const ball = key.ball === undefined && previous
      ? { ...previous.ball, arc: 0 }
      : readBall(key.ball, path + '.ball');
    frames.push({ t, players, ball });
  }
  if (frames.at(-1)?.t !== duration) throw new Error('The last keyframe must be at duration.');
  return parseProject(JSON.stringify({ version: 1, name: draft.name.trim(), duration, roster: baseline.roster, frames }));
}
