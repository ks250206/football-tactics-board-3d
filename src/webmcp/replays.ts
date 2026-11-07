import type { Project } from '../core';
import { historicReplays, type Replay } from './historicReplays';
import { authorSequence } from './sequence';

const trossardReplay = {
  id: 'pl-2025-26-west-ham-arsenal-trossard-83',
  title: '25/26 ウェストハム対アーセナル · トロサール 83分',
  match: '2026-05-10 · Premier League · West Ham United 0–1 Arsenal',
  event: '83rd minute: Martin Ødegaard exchanges passes with Declan Rice, enters the box and cuts back for Leandro Trossard.',
  aliases: ['25/26 ウェストハム vs アーセナル トロサール', 'West Ham vs Arsenal 2025/26 Trossard goal'],
  source: 'https://www.premierleague.com/en/news/4654073/odegaard-and-raya-rise-to-the-occasion-to-keep-arsenal-in-control-of-title-race',
  note: '右サイドでのボール回しから、ウーデゴールがライスとワンツーで侵入し、折り返しをトロサールが決めます。',
  accuracy: 'Illustrative reconstruction with estimated positions, ball path and timing. No tracking feed.',
};

export const matchReplays: readonly Replay[] = [
  { info: trossardReplay, focus: 'away-11', create: createTrossardReplay },
  ...historicReplays,
];

export function createTrossardReplay(): Project {
  const home: [number, number][] = [
    [-51, 0], [-38, 17], [-44, 9], [-44, 2], [-43, -7], [-38, -17],
    [-34, 7], [-35, -5], [-22, 0], [-29, 14], [-30, -13],
  ];
  const away: [number, number][] = [
    [46, 0], [-13, -18], [-3, -10], [0, 10], [-23, 22],
    [-19, -1], [-31, -25], [-23, 8], [-39, 4], [-24, -12], [-28, 12],
  ];
  const initial = [
    ...home.map(([x, z], index) => ({ id: 'home-' + (index + 1), x, z, body: 0 })),
    ...away.map(([x, z], index) => ({ id: 'away-' + (index + 1), x, z, body: 180 })),
  ];
  const project = authorSequence({
    name: trossardReplay.title, duration: 11.5,
    keyframes: [
      { t: 0, players: initial, ball: { owner: 'away-2' } },
      { t: 1.8, players: [
        { id: 'away-2', x: -17, z: -17, body: 126 },
        { id: 'away-10', x: -22, z: -10, body: 32 },
        { id: 'home-10', x: -26, z: 12 },
      ], ball: { owner: 'away-2' } },
      { t: 2.4, players: [
        { id: 'away-10', x: -22, z: -10, body: 177 },
        { id: 'away-2', x: -19, z: -18 },
        { id: 'away-11', x: -30, z: 10 },
      ], ball: { owner: 'away-10' } },
      { t: 4.55, players: [
        { id: 'away-10', x: -29, z: -12, body: -57 },
        { id: 'away-2', x: -26, z: -18 },
        { id: 'home-8', x: -32, z: -8 },
        { id: 'home-11', x: -28, z: -12 },
      ], ball: { owner: 'away-10' } },
      { t: 5.0, players: [
        { id: 'away-2', x: -28, z: -18, body: 133 },
        { id: 'away-10', x: -31, z: -11, body: 162 },
        { id: 'away-7', x: -35, z: -24 },
        { id: 'home-8', x: -33, z: -8 },
      ], ball: { owner: 'away-2' } },
      { t: 5.65, players: [
        { id: 'away-10', x: -34, z: -11, body: 145 },
        { id: 'away-11', x: -32, z: 9 },
        { id: 'home-8', x: -35, z: -7 },
      ], ball: { owner: 'away-10' } },
      { t: 6.6, players: [
        { id: 'away-10', x: -38, z: -8, body: 155 },
        { id: 'away-11', x: -34, z: 7 },
        { id: 'home-3', x: -42, z: 7 },
        { id: 'home-5', x: -42, z: -6 },
      ], ball: { owner: 'away-10' } },
      { t: 7.65, players: [
        { id: 'away-10', x: -42, z: -5, body: 90 },
        { id: 'away-11', x: -37, z: 4, body: 180 },
        { id: 'home-5', x: -44, z: -4 },
      ], ball: { owner: 'away-10' } },
      { t: 8.25, players: [
        { id: 'away-11', x: -41, z: 3, body: 203 },
        { id: 'home-3', x: -44, z: 6 },
      ], ball: { owner: 'away-11' } },
      { t: 8.8, players: [{ id: 'home-1', x: -51.5, z: 1.2 }],
        ball: { x: -53.4, z: -2.4, y: 0.23 } },
      { t: 11.5, ball: { x: -53.6, z: -2.5, y: 0.11 } },
    ],
  });
  // IDs remain board slots. Show the documented participants' shirt numbers.
  project.roster.find(player => player.id === 'away-2')!.number = 41;
  project.roster.find(player => player.id === 'away-10')!.number = 8;
  project.roster.find(player => player.id === 'away-8')!.number = 10;
  project.roster.find(player => player.id === 'away-11')!.number = 19;
  return project;
}
