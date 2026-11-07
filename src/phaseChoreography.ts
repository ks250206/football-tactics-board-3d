import { ballPosition, clamp, clone, distance, RAD, sample, squad, wrap, type Frame, type Pose, type Project, type Team } from './core';

// Positions are metres in the initial attacking team's perspective. Slot 1 is the
// keeper and 2–11 are stable outfield slots, independent of shirt numbers.
type Point = readonly [x: number, z: number];
type Shift = Readonly<Record<number, Point>>;
type Beat = readonly [time: number, carrier: number, attack?: Shift, defence?: Shift];
interface Pattern {
  centre: number;
  line: number;
  block?: 'high' | 'deep';
  beats: readonly Beat[];
}

// Positive carrier slots belong to the initial attack. Negative slots indicate
// a turnover or the opponent in a transition. Repeated slots carry the ball.
const patterns: Record<string, Pattern> = {
  'build-up': { centre: -25, line: -8, beats: [
    [0, 1, { 3: [-43, 9], 4: [-43, -9], 6: [-33, 4] }],
    [2, 3, { 6: [-36, 2] }], [4.4, 6, { 2: [-29, 21], 8: [-22, 11] }],
    [6, 3, { 7: [-10, 30] }], [8.8, 2, { 2: [-23, 21], 8: [-15, 13] }],
    [11, 8, { 8: [-12, 12] }], [12, 8, { 8: [-9, 12] }],
  ] },
  progression: { centre: -2, line: 21, beats: [
    [0, 3], [2.6, 10, { 10: [3, -9], 6: [-2, -7] }],
    [4, 6, { 8: [9, 7], 9: [15, 1] }], [6.7, 8, { 8: [15, 8], 7: [17, 30] }],
    [9.4, 7, { 7: [23, 29], 9: [25, 3], 10: [17, -10] }], [12, 7, { 7: [28, 27] }],
  ] },
  through: { centre: 3, line: 27, beats: [
    [0, 6, { 9: [22, 0], 10: [13, -11] }], [3, 10, { 10: [17, -10], 9: [25, 4] }],
    [5, 10, { 10: [20, -7], 9: [26, 8], 7: [21, 28] }],
    [7, 9, { 9: [34, 8] }, { 3: [31, 8], 4: [31, -4] }],
    [10, 9, { 9: [43, 5] }, { 3: [40, 8], 4: [39, -4] }], [12, 9, { 9: [46, 3] }],
  ] },
  'final-third': { centre: 24, line: 45, block: 'deep', beats: [
    [0, 6, { 7: [38, 29], 8: [36, 13], 9: [40, 0], 10: [33, -10] }],
    [2.8, 8, { 8: [38, 14] }], [5.2, 7, { 7: [44, 23], 8: [40, 11], 9: [43, 1] }],
    [8.8, 7, { 7: [49, 13], 9: [44, 0], 10: [36, -4] }, { 8: [35, -7] }],
    [10, 10, { 10: [37, 0] }], [12, 10, { 10: [39, 0] }],
  ] },
  switch: { centre: 8, line: 29, beats: [
    [0, 7, { 7: [21, 29], 8: [15, 15], 11: [23, -30] }],
    [2.5, 8, { 8: [13, 15] }], [5, 6, { 6: [5, 5] }], [7.5, 4, { 4: [1, -11] }],
    [10, 11, { 11: [24, -29] }], [12, 11, { 11: [29, -25], 10: [24, -11] }],
  ] },
  overload: { centre: 24, line: 43, block: 'deep', beats: [
    [0, 7, { 2: [28, 27], 7: [38, 29], 8: [35, 17] }],
    [3, 8, { 7: [39, 22], 8: [38, 16], 2: [36, 30] }],
    [5.5, 2, { 2: [44, 29], 7: [42, 20] }],
    [8.6, 2, { 2: [49, 19], 8: [41, 10], 9: [43, -2] }],
    [10, 8, { 8: [41, 6] }], [12, 8, { 8: [42, 5] }],
  ] },
  counter: { centre: -8, line: 21, beats: [
    [0, -6, { 6: [-3, 2], 9: [4, 0], 7: [1, 23], 11: [4, -21] }, { 6: [-2, 1] }],
    [1, 6], [3.8, 8, { 8: [9, 7], 9: [14, 0], 7: [15, 24], 11: [18, -23] }],
    [6.6, 11, { 11: [28, -20], 9: [27, 0], 7: [26, 19] }, { 3: [30, 7], 4: [31, -7] }],
    [9.4, 9, { 9: [38, -3], 11: [37, -16], 7: [35, 11] }, { 3: [40, 6], 4: [41, -5] }],
    [12, 9, { 9: [42, -4] }],
  ] },
  'rest-defence': { centre: 21, line: 42, block: 'deep', beats: [
    [0, 7], [3, 8], [5.5, -4, {}, { 4: [41, 7] }],
    [7.5, -6, { 6: [25, 2], 5: [20, -7] }, { 6: [28, 5] }],
    [9, 6, { 6: [24, 2], 5: [19, -6] }],
    [12, 3, { 3: [10, 2] }],
  ] },
  'high-press': { centre: -26, line: -8, block: 'high', beats: [
    [0, 1, { 3: [-43, 11], 4: [-43, -11], 2: [-32, 25] }],
    [2.2, 3, {}, { 9: [-39, 8], 10: [-35, -4], 7: [-32, 15] }],
    [4.8, 2, { 2: [-33, 25] }, { 7: [-31, 23], 6: [-26, 14], 9: [-37, 11] }],
    [7, -7, {}, { 7: [-33, 24], 9: [-39, 12] }],
    [9.6, -9, {}, { 9: [-43, 8] }], [12, -9, {}, { 9: [-46, 4] }],
  ] },
  'mid-block': { centre: 1, line: 22, beats: [
    [0, 3], [3, 2, { 2: [-1, 21] }], [6, 6, { 6: [2, 5] }, { 9: [3, 1] }],
    [9, 4, { 4: [-9, -12] }], [12, 5, { 5: [0, -19] }],
  ] },
  'low-block': { centre: 26, line: 46, block: 'deep', beats: [
    [0, 7, { 7: [41, 27] }], [3, 8, { 8: [40, 15] }, { 2: [44, 20] }],
    [6, 6, { 6: [30, 7] }], [9, 10, { 10: [38, -10] }, { 5: [44, -18] }],
    [12, 11, { 11: [40, -28] }],
  ] },
  counterpress: { centre: -24, line: -4, block: 'high', beats: [
    [0, -7, { 2: [-30, 24] }, { 7: [-28, 22], 9: [-34, 11], 6: [-21, 12] }],
    [1.2, 2, { 2: [-28, 24] }, { 7: [-27, 22] }],
    [3, 2, { 2: [-25, 23] }, { 7: [-25, 26], 6: [-23, 17], 9: [-30, 16] }],
    [4.5, -6, {}, { 6: [-24, 21] }],
    [7, -9, {}, { 9: [-34, 12] }], [12, -9, {}, { 9: [-43, 6] }],
  ] },
  recovery: { centre: 2, line: 17, beats: [
    [0, 6, {}, { 6: [9, 2], 7: [3, 23], 11: [3, -22] }],
    [2.6, 8, { 8: [14, 12] }, { 6: [18, 4], 3: [24, 7], 4: [24, -7] }],
    [5.2, 7, { 7: [24, 25] }, { 6: [25, 5], 3: [33, 7], 4: [33, -7], 7: [21, 23], 11: [21, -16] }],
    [8.3, 7, { 7: [35, 22] }, { 6: [32, 6], 3: [39, 7], 4: [39, -7], 7: [31, 25], 11: [30, -12] }],
    [12, 8, { 8: [34, 13] }, { 6: [36, 5], 3: [42, 7], 4: [42, -7], 7: [36, 25], 11: [35, -13] }],
  ] },
};

function attackShape(centre: number): Point[] {
  return [
    [-48, 0],
    [centre - 13, 17], [centre - 15, 0], [centre - 13, -17],
    [centre - 3, -8], [centre - 3, 8],
    [centre + 13, 29], [centre + 10, 12], [centre + 16, 0], [centre + 10, -12], [centre + 13, -29],
  ];
}

function defenceShape(line: number, block: Pattern['block']): Point[] {
  const defenders: Point[] = [
    [50, 0], [line, 18], [line + 1, 7], [line + 1, -7], [line, -18],
    [line - 11, 5], [line - 12, 21], [line - 11, -5], [line - 21, 4], [line - 21, -6], [line - 12, -21],
  ];
  if (block === 'deep') {
    defenders[5] = [line + 1, 0]; // fifth defender
    defenders[9] = [line - 9, 4]; // join the midfield four
    defenders[7] = [line - 9, -5];
    defenders[8] = [line - 17, 0]; // lone outlet
  }
  if (block === 'high') {
    defenders[6] = [line - 23, 19];
    defenders[10] = [line - 23, -19];
    defenders[8] = [line - 26, 5];
    defenders[9] = [line - 25, -5];
  }
  return defenders;
}

export function choreographPhase(base: Project, id: string, name: string, attack: Team): Project {
  const pattern = patterns[id] ?? patterns['build-up'];
  const defend = attack === 'home' ? 'away' : 'home';
  const sign = attack === 'home' ? 1 : -1;
  const lineup = (team: Team) => {
    const { keeper, outfield } = squad(base.roster, team);
    return [keeper, ...outfield].map(player => player.id);
  };
  const sides = [lineup(attack), lineup(defend)];
  const carrier = (slot: number) => sides[slot < 0 ? 1 : 0][Math.abs(slot) - 1];
  const shapes = [attackShape(pattern.centre), defenceShape(pattern.line, pattern.block)];
  const retained: [Record<number, Point>, Record<number, Point>] = [{}, {}];
  const frames = pattern.beats.map(([t, holder, attackEdits, defenceEdits]): Frame => {
    Object.assign(retained[0], attackEdits);
    Object.assign(retained[1], defenceEdits);
    const ballSide = holder < 0 ? 1 : 0;
    const slot = Math.abs(holder);
    const [bx, bz] = retained[ballSide][slot] ?? shapes[ballSide][slot - 1];
    const players: Record<string, Pose> = {};
    sides.forEach((ids, side) => ids.forEach((player, index) => {
      const authored = retained[side][index + 1];
      const [x, z] = authored ?? shapes[side][index];
      // Shift the block towards the ball while preserving relative spacing.
      const slide = side === 1 && ballSide === 0 && !authored ? clamp(bz * (index === 0 ? .12 : .23), -6, 6) : 0;
      const retreat = id === "recovery" && side === 1 && index > 0 && !authored ? t * 2 : 0;
      players[player] = {
        x: sign * clamp(x + retreat, -52, 52) || 0, z: sign * clamp(z + slide, -32, 32) || 0,
        body: side === 0 ? (sign === 1 ? 0 : 180) : (sign === 1 ? 180 : 0),
        head: 0, pitch: 0,
      };
    }));
    return { t, players, ball: { x: bx * sign || 0, z: bz * sign || 0, y: .11, arc: 0, owner: carrier(holder) } };
  });
  const project: Project = { version: 1, name, duration: 12, roster: clone(base.roster), frames };
  for (const [index, frame] of frames.entries()) {
    const next = frames[index + 1] ?? frame;
    for (const [id, pose] of Object.entries(frame.players)) {
      const target = next.players[id];
      const moving = distance(pose, target) > .8;
      if (moving) pose.body = Math.atan2(target.z - pose.z, target.x - pose.x) / RAD;
      const bearing = Math.atan2(frame.ball.z - pose.z, frame.ball.x - pose.x) / RAD;
      if (id !== frame.ball.owner && distance(pose, frame.ball) > .6) {
        const relative = wrap(bearing - pose.body);
        pose.head = clamp(relative, -110, 110);
        pose.body = wrap(bearing - pose.head);
      }
      pose.body ||= 0;
      pose.head ||= 0;
    }
    frame.ball = ballPosition(frame);
  }
  // Keep the carrier in possession until release. A short flight interpolates
  // between the two players' feet instead of spending the whole beat in transit.
  const timedFrames = frames.flatMap((frame, index) => {
    const next = frames[index + 1];
    if (!next || next.ball.owner === frame.ball.owner) return [frame];
    const interval = next.t - frame.t;
    const flight = clamp(distance(frame.ball, next.ball) / 18, .2, interval * .82);
    const release = sample(project, next.t - flight);
    release.ball = ballPosition({ ...release, ball: { ...frame.ball, arc: distance(frame.ball, next.ball) > 30 ? 1.1 : 0 } });
    return [frame, release];
  });
  return { ...project, frames: timedFrames };
}
