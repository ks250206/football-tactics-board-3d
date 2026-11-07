import type { Project } from '../core';
import { authorSequence } from './sequence';

export const trossardReplay = {
  id: 'pl-2025-26-west-ham-arsenal-trossard-83',
  title: '25/26 ウェストハム対アーセナル · トロサール 83分',
  match: '2026-05-10 · Premier League · West Ham United 0–1 Arsenal',
  event: '83rd minute: Leandro Trossard scores, assisted by Martin Ødegaard.',
  aliases: ['25/26 ウェストハム vs アーセナル トロサール', 'West Ham vs Arsenal 2025/26 Trossard goal'],
  source: 'https://www.premierleague.com/en/news/4654073/odegaard-and-raya-rise-to-the-occasion-to-keep-arsenal-in-control-of-title-race',
  note: 'ウーデゴールの侵入とラストパスからトロサールが決める流れ。位置・軌道・経過秒は公式記事をもとにした推定で、ユニフォームは共通モデルです。',
  accuracy: 'Illustrative reconstruction with estimated positions, ball path and timing. No tracking feed.',
};

export function createTrossardReplay(): Project {
  const home: [number, number][] = [
    [-51, 0], [-38, 17], [-44, 9], [-44, 2], [-43, -7], [-38, -17],
    [-34, 7], [-35, -5], [-22, 0], [-29, 14], [-30, -13],
  ];
  const away: [number, number][] = [
    [46, 0], [-27, -21], [-3, -10], [0, 10], [-27, 22],
    [-24, -5], [-37, -21], [-27, 8], [-42, 4], [-32, -12], [-32, 10],
  ];
  const initial = [
    ...home.map(([x, z], index) => ({ id: 'home-' + (index + 1), x, z, body: 0 })),
    ...away.map(([x, z], index) => ({ id: 'away-' + (index + 1), x, z, body: 180 })),
  ];
  const project = authorSequence({
    name: trossardReplay.title, duration: 6,
    keyframes: [
      { t: 0, players: initial, ball: { owner: 'away-10' } },
      { t: 1.4, players: [
        { id: 'away-10', x: -38, z: -8, body: 155 },
        { id: 'away-11', x: -34, z: 7 },
        { id: 'home-3', x: -42, z: 7 },
        { id: 'home-5', x: -42, z: -6 },
      ], ball: { owner: 'away-10' } },
      { t: 2.5, players: [
        { id: 'away-10', x: -42, z: -5, body: 90 },
        { id: 'away-11', x: -37, z: 4, body: 180 },
        { id: 'home-5', x: -44, z: -4 },
      ], ball: { owner: 'away-10' } },
      { t: 3.1, players: [
        { id: 'away-11', x: -39, z: 3, body: 160 },
        { id: 'home-3', x: -44, z: 6 },
      ], ball: { owner: 'away-11' } },
      { t: 3.65, players: [{ id: 'home-1', x: -51.5, z: 1.2 }],
        ball: { x: -53.4, z: -2.4, y: 0.23 } },
      { t: 6, ball: { x: -53.6, z: -2.5, y: 0.11 } },
    ],
  });
  // IDs remain board slots. Show the two documented participants' shirt numbers.
  project.roster.find(player => player.id === 'away-10')!.number = 8;
  project.roster.find(player => player.id === 'away-8')!.number = 10;
  project.roster.find(player => player.id === 'away-11')!.number = 19;
  return project;
}
