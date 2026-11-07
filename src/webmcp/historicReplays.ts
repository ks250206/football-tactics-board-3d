import type { Project } from '../core';
import { authorSequence } from './sequence';

type Point = readonly [x: number, z: number];
type Move = readonly [slot: number, x: number, z: number, body?: number];
type BallCue = number | { owner: number; arc: number } | { x: number; z: number; y?: number; arc?: number };

export interface ReplayInfo {
  id: string;
  title: string;
  match: string;
  event: string;
  aliases: string[];
  source: string;
  note: string;
  accuracy: string;
}

export interface Replay {
  info: ReplayInfo;
  focus: string;
  create: () => Project;
}

// Positive slots are HOME, negative slots are AWAY. Shirts are assigned
// independently of these IDs so saved scenes remain editable.
const playerId = (slot: number) => (slot > 0 ? 'home-' : 'away-') + Math.abs(slot);
const formation = (sign: 1 | -1, points: readonly Point[]): Move[] =>
  points.map(([x, z], i) => [sign * (i + 1), x, z, sign === 1 ? 0 : 180]);
const flight = (x: number, z: number, y = .11, arc = 0): BallCue => ({ x, z, y, arc });
const lift = (owner: number, arc: number): BallCue => ({ owner, arc });

function cue(t: number, ball: BallCue, ...moves: Move[]) {
  return {
    t,
    ball: typeof ball === 'number' ? { owner: playerId(ball) }
      : 'owner' in ball ? { owner: playerId(ball.owner), arc: ball.arc } : ball,
    players: moves.map(([slot, x, z, body]) => ({
      id: playerId(slot), x, z, ...(body === undefined ? {} : { body }),
    })),
  };
}

const approximation = 'Illustrative reconstruction. Lead-in positions, timing and ball paths are estimated; players use generic models.';

function replay(info: Omit<ReplayInfo, 'accuracy'>, scorer: number,
  shirts: readonly number[], keyframes: ReturnType<typeof cue>[], opponentShirts?: readonly number[]): Replay {
  const focus = playerId(scorer);
  return {
    info: { ...info, accuracy: approximation },
    focus,
    create() {
      const project = authorSequence({ name: info.title, duration: keyframes.at(-1)!.t, keyframes });
      const attackingTeam = scorer > 0 ? 'home' : 'away';
      project.roster.filter(p => p.team === attackingTeam).forEach((p, i) => { p.number = shirts[i]; });
      if (opponentShirts) {
        project.roster.filter(p => p.team !== attackingTeam).forEach((p, i) => { p.number = opponentShirts[i]; });
      }
      return project;
    },
  };
}

const wilshere = replay({
  id: 'pl-2013-14-arsenal-norwich-wilshere-18',
  title: '13/14 アーセナル対ノリッジ · ウィルシャー 18分',
  match: '2013-10-19 · Premier League · Arsenal 4–1 Norwich City',
  event: '18th minute: Arsenal advance from their own half before Wilshere, Cazorla and Giroud combine for Wilshere’s close-range volley.',
  aliases: ['ウィルシャーのノリッジ戦ゴール', 'Jack Wilshere Norwich Wengerball goal'],
  source: 'https://arsenal-fc.shorthandstories.com/minute-detail-16-30/index.html',
  note: '自陣でウィルシャーが受け直し、左を運ぶカソルラにつなぎます。ジルーとのワンタッチの後、ウィルシャーがその右を抜けてボレーします。',
}, 10, [1, 28, 4, 6, 3, 8, 20, 19, 12, 10, 11], [
  cue(0, 7,
    ...formation(1, [[-49,0],[-27,1],[-36,8],[-37,-7],[-28,22],[-23,-5],[-31,5],[-14,-27],[9,-4],[-25,9],[-2,16]]),
    ...formation(-1, [[50,0],[5,-22],[12,-7],[13,7],[6,22],[-5,-8],[-11,-22],[-7,6],[-24,8],[-15,3],[-7,23]])),
  cue(.65, 7, [7,-29,7,13], [10,-24,9], [-9,-26,7]),
  cue(1.45, 10, [10,-22,9,-93], [2,-23,2], [-8,-12,6]),
  cue(2.05, 2, [2,-22,2,-52], [10,-19,4,-54]),
  cue(4.1, 10, [10,-12,-10,-77], [2,-17,-8], [8,-9,-29], [-9,-20,2]),
  cue(5.55, 8, [8,-8,-31,0], [10,-9,-10,2], [9,12,-4]),
  cue(8.6, 8, [8,1,-31,0], [10,1,-10,6], [9,19,-4], [11,9,15],
    [-2,16,-22], [-3,20,-7], [-4,21,7], [-5,17,21], [-6,7,-6], [-7,0,-22]),
  cue(12.2, 8, [8,14,-31,51], [10,13,-8,10], [9,27,-4], [11,20,15],
    [-2,27,-20], [-3,31,-7], [-4,32,5], [-5,27,19], [-6,21,-6], [-7,15,-25], [-8,21,6]),
  cue(15.6, 8, [8,25.5,-16,101], [10,23.5,-6], [9,33,-4], [11,28,14],
    [-2,30,-18], [-3,37,-8], [-4,37,4], [-5,33,17], [-6,29,-3], [-7,23,-20], [-8,27,5]),
  cue(16.25, 10, [10,23.7,-6,-51], [8,27,-15,26], [9,34,-4]),
  cue(16.85, 8, [8,29.4,-13.8,58], [10,27,-3,21], [9,34.8,-4]),
  cue(17.5, 9, [9,35.4,-4,116], [10,31.6,-.4,15], [-3,38,-7], [-6,30,-2]),
  cue(17.85, 10, [10,33.2,.4,-44], [9,36.1,-4.5,128]),
  cue(18.35, lift(9,.22), [10,36.1,.8,0], [9,38,-5,48], [-4,39,3]),
  cue(19.4, flight(43,.25,.44), [10,42.6,.3,-13], [-1,49.6,0], [-3,42,-8], [-4,42,4.5]),
  cue(19.9, flight(53.4,-2,.33), [-1,50,-.9]),
  cue(22, flight(54,-2.2,.11)),
]);

const iniesta = replay({
  id: 'ucl-2008-09-chelsea-barcelona-iniesta-90-3',
  title: '08/09 チェルシー対バルセロナ · イニエスタ 90+3分',
  match: '2009-05-06 · UEFA Champions League semi-final second leg · Chelsea 1–1 Barcelona',
  event: '90+3: Essien’s clearance fails, Messi squares the ball and Iniesta strikes from outside the area.',
  aliases: ['イニエスタ チェルシー ミドル', 'Iniesta Stamford Bridge Iniestazo 2009'],
  source: 'https://www.uefa.com/uefachampionsleague/news/01d9-0e72254a5b3a-23a74c5aeec1-1000/',
  note: 'バルセロナの押し込みから、エッシェンのクリアがこぼれ、メッシの横パスをイニエスタがボックス外から決めます。退場したバルセロナの選手枠はプレーから離してあります。',
}, -8, [1, 20, 3, 24, 22, 6, 15, 8, 7, 10, 27], [
  cue(0, -6,
    ...formation(1, [[-50,0],[-38,17],[-42,8],[-43,-4],[-39,-17],[-30,3],[-28,17],[-32,-6],[-18,0],[-25,-13],[-19,11]]),
    ...formation(-1, [[48,0],[-12,-26],[-7,-5],[-5,6],[40,33],[-11,-4],[-14,12],[-18,-3],[-36,3],[-28,-12],[-28,17]])),
  cue(2.2, -6, [-6,-20,-4,-132], [-2,-23,-25,179], [-8,-23,-2], [10,-29,-16]),
  cue(3.1, -2, [-2,-27,-25,170], [5,-38,-20], [-10,-31,-12]),
  cue(6.4, lift(-2,2.3), [-2,-39,-24,132], [5,-43,-18], [-9,-44,1], [-10,-35,-8], [-8,-32,0]),
  cue(7.62, flight(-40,-2,1), [6,-40,-2], [3,-44,5], [-9,-44,2]),
  cue(8.05, flight(-36,-7,.17), [-10,-36.1,-7.2,100], [6,-40,-2,155], [-8,-31,1]),
  cue(8.3, -10, [-10,-36,-7,79], [-8,-33,0,180]),
  cue(8.86, flight(-34.4,1,.12), [-8,-34,1,177], [4,-44,-3], [8,-37,4]),
  cue(9.67, flight(-53.3,-3,2.19), [1,-50.8,-1.6,22]),
  cue(11.5, flight(-54,-3,.22)),
], [1, 3, 26, 33, 17, 5, 15, 8, 11, 13, 39]);

const vanPersie = replay({
  id: 'pl-2012-13-man-utd-aston-villa-van-persie-13',
  title: '12/13 マンチェスター・U対アストン・ヴィラ · ファン・ペルシ 13分',
  match: '2013-04-22 · Premier League · Manchester United 3–0 Aston Villa',
  event: '13th minute: Rooney lifts a long pass over the defence and Van Persie volleys it first time.',
  aliases: ['ファン・ペルシ アストン・ヴィラ ボレー', 'Van Persie Aston Villa Rooney long pass volley'],
  source: 'https://www.manutd.com/en/news/utd-podcast-van-persie-recalls-2013-aston-villa-hat-trick',
  note: 'ユナイテッドの自陣での保持から、ルーニーのロングパスにファン・ペルシが抜け出し、落下するボールを直接ボレーします。',
}, 9, [1, 2, 5, 6, 3, 16, 7, 11, 20, 10, 26], [
  cue(0, 3,
    ...formation(1, [[-49,0],[-26,22],[-33,7],[-34,-7],[-26,-23],[-20,-3],[-7,24],[-11,-22],[8,-9],[-18,4],[3,6]]),
    ...formation(-1, [[49,0],[17,-20],[16,-7],[18,7],[16,22],[4,-7],[2,-22],[5,7],[-15,3],[-8,-8],[1,21]])),
  cue(2.15, 3, [3,-28,7,-35], [6,-18,-4], [10,-14,5], [-9,-20,4]),
  cue(2.9, 6, [6,-16,-4,46], [-10,-11,-7], [9,10,-9]),
  cue(3.6, 10, [10,-12,6,-21], [9,12,-9,0]),
  cue(5.85, lift(10,6.3), [10,-6,4,-22], [9,17,-8,0], [11,11,6],
    [-3,21,-7], [-4,22,6], [-6,8,-7], [-1,47,0]),
  cue(8.18, flight(34.8,-10,.63), [9,34.4,-10,4], [-3,28,-7], [-4,29,5], [-1,48,-1]),
  cue(9.02, flight(53.5,1.9,1.1), [-1,49,.3]),
  cue(11, flight(54,2.1,.11)),
]);

const ronaldo = replay({
  id: 'ucl-2011-12-real-madrid-ajax-ronaldo-25',
  title: '11/12 レアル・マドリード対アヤックス · C・ロナウド 25分',
  match: '2011-09-27 · UEFA Champions League group stage · Real Madrid 3–0 Ajax',
  event: '25th minute: Madrid counter from deep. Ramos starts the break through Özil; Ronaldo exchanges passes with Kaká before finding Özil, who releases Benzema to cross back to Ronaldo.',
  aliases: ['ロナウド アヤックス ワンタッチ カウンター', 'Cristiano Ronaldo Ajax one-touch counterattack 2011'],
  source: 'https://www.uefa.com/uefachampionsleague/news/0254-0d7d69c526a7-1f168d451a8e-1000--masterful-madrid-too-much-for-ajax/',
  note: 'マドリーが自陣でボールを拾って速攻。ロナウドからエジル、ベンゼマへつなぎ、中央へ走り込んだロナウドがクロスをワンタッチで合わせます。',
}, 7, [1, 4, 19, 2, 17, 14, 7, 8, 9, 10, 6], [
  cue(0, 2,
    ...formation(1, [[-49,0],[-43,12],[-42,6],[-42,-7],[-36,-22],[-31,2],[-26,-13],[-25,-5],[-18,10],[-34,13],[-30,-1]]),
    ...formation(-1, [[49,0],[12,-23],[9,-8],[10,8],[8,22],[-15,-3],[-27,-21],[-22,7],[-39,-1],[-29,11],[-29,23]])),
  cue(1.05, 2, [2,-39,12,4], [10,-29,13], [-9,-40,8]),
  cue(1.7, 10, [10,-28,13,-79], [7,-23,-11], [9,-14,14]),
  cue(2.7, 7, [7,-20,-11,34], [8,-18,-3], [10,-23,12]),
  cue(3.25, 8, [8,-17,-3,-55], [7,-17,-11], [9,-9,16]),
  cue(3.72, 7, [7,-13,-11,0], [8,-15,-3], [10,-15,9]),
  cue(6, 7, [7,4,-13,1], [9,10,17], [10,-1,5],
    [-2,19,-22], [-3,20,-8], [-4,23,8], [-5,19,23], [-6,-2,-4], [-8,-6,9]),
  cue(7.85, 7, [7,16,-11,55], [10,13,3], [9,22,16],
    [-3,27,-8], [-4,27,7], [-5,25,21], [-6,8,-3]),
  cue(8.54, 10, [7,20,-8,22], [10,18,3,25], [9,27,16]),
  cue(9.38, 9, [10,23,3,36], [9,32,17,0], [7,26,-5,17]),
  cue(11.12, 9, [9,43,15,-91], [7,37,-1,14], [10,32,4],
    [-3,39,-5], [-4,38,9], [-5,40,19], [-1,49,2]),
  cue(12.01, flight(42.4,1,.15), [7,42,1,10], [9,45,14], [-1,48,2]),
  cue(12.55, flight(53.4,-2.8,.21), [-1,49,-.4]),
  cue(14, flight(54,-3,.11)),
]);

const messiMadrid = replay({
  id: 'ucl-2010-11-real-madrid-barcelona-messi-87',
  title: '10/11 レアル・マドリード対バルセロナ · メッシ 87分',
  match: '2011-04-27 · UEFA Champions League semi-final first leg · Real Madrid 0–2 Barcelona',
  event: '87th minute: Messi takes Busquets’s pass near halfway and dribbles past several Madrid players before finishing past Casillas.',
  aliases: ['メッシ レアル CL 準決勝 2011 ドリブル', 'Messi Madrid 2011 Champions League solo run Busquets 87'],
  source: 'https://www.uefa.com/uefachampionsleague/news/01f0-0e7810b91a10-94576e9fc2aa-1000--ten-man-madrid-undone-by-messi-magic/',
  note: 'バルセロナの中盤での保持から、ブスケツのパスを受けたメッシが複数の守備者の間を抜け、カシージャスを破ります。退場したマドリーの選手枠はプレーから離してあります。',
}, -10, [1, 2, 3, 14, 5, 6, 16, 8, 7, 10, 17], [
  cue(0, -6,
    ...formation(1, [[-50,0],[-28,22],[-30,7],[-29,-7],[-27,-21],[-13,6],[-10,-12],[-6,13],[11,0],[-9,-4],[40,33]]),
    ...formation(-1, [[48,0],[3,-26],[13,-7],[14,8],[2,23],[11,6],[8,1],[1,15],[-12,16],[2,-4],[-10,-24]])),
  cue(2.4, -6, [-6,5,6,-131], [-7,3,1], [-10,1,-4,180], [8,-4,10]),
  cue(3.15, -7, [-7,1,0,-126], [-10,-1.5,-4.6,170]),
  cue(3.58, -10, [-10,-2,-3.5,159], [-7,1,0], [8,-4,9]),
  cue(4.85, -10, [-10,-8.8,-1.5,161], [8,-6,3], [10,-10,-3.5], [6,-14,5]),
  cue(6.18, -10, [-10,-17.3,1.7,176], [6,-15,2.9], [10,-15,-2], [3,-24,5], [4,-25,-5]),
  cue(7.4, -10, [-10,-25.5,2.4,175], [3,-23,4], [4,-28,-1], [5,-27,-10], [-9,-22,14]),
  cue(8.65, -10, [-10,-33.5,2.5,194], [3,-29,5], [4,-31,-1], [5,-32,-7], [1,-48,1]),
  cue(9.6, -10, [-10,-39.5,1,189], [3,-34,5], [4,-36,-1], [1,-46,1.7]),
  cue(10.36, flight(-53.5,-2.5,.22), [1,-47,-.8]),
  cue(12, flight(-54,-2.7,.11)),
], [1, 17, 4, 18, 12, 14, 22, 10, 7, 23, 3]);

const messiBayern = replay({
  id: 'ucl-2014-15-barcelona-bayern-messi-80',
  title: '14/15 バルセロナ対バイエルン · メッシ 80分',
  match: '2015-05-06 · UEFA Champions League semi-final first leg · Barcelona 3–0 Bayern Munich',
  event: '80th minute: Rakitić finds Messi, who wrong-foots Boateng and chips Neuer with his right foot for Barcelona’s second.',
  aliases: ['メッシ バイエルン ボアテング アンクルブレイク', 'Messi Bayern Boateng ankle break chip Neuer 2015 second goal'],
  source: 'https://www.uefa.com/uefachampionsleague/news/0221-0e909116af7b-fe3ef95b6374-1000--messi-double-puts-barca-in-control-against-bayern/',
  note: '中盤での保持からラキティッチがメッシへ。内側へ行くと見せて切り返し、逆を取られたボアテングをかわし、右足のチップでノイアーを越えます。',
}, 10, [1, 22, 3, 14, 18, 5, 4, 8, 9, 10, 11], [
  cue(0, 6,
    ...formation(1, [[-49,0],[-4,24],[-17,8],[-18,-8],[-3,-23],[-9,3],[-2,12],[0,-10],[22,0],[17,18],[16,-23]]),
    ...formation(-1, [[49,0],[30,-21],[31,10],[31,-6],[28,24],[14,-4],[16,20],[12,8],[4,2],[8,-11],[13,-21]])),
  cue(2.15, 6, [6,-3,3,23], [7,5,13], [2,6,26], [-8,12,8], [-9,1,2]),
  cue(3.08, 7, [7,10,11,12], [10,23,16], [-8,14,8], [-3,32,11]),
  cue(5.45, 7, [7,23,9,26], [10,31,14,7], [9,30,-1], [11,26,-21], [-3,36,11], [-4,36,-4], [-5,33,22]),
  cue(6.02, 10, [10,34,13,-22], [-3,37,10,35], [-1,49,1]),
  cue(6.64, 10, [10,36,11.8,-42], [-3,37.7,9.8,51], [-1,48,2]),
  cue(7.18, 10, [10,38,13.3,31], [-3,37.5,9.5,-75], [-1,47,3.8]),
  cue(8.36, lift(10,2.45), [10,43.4,11.2,-47], [-3,38,10,-15], [-1,46.5,5,-134]),
  cue(9.21, flight(53.2,-2.1,1.5), [-1,47,4,-165], [-4,48,-4]),
  cue(11, flight(54,-2.4,.11)),
], [1, 13, 17, 5, 18, 31, 21, 16, 9, 25, 3]);

export const historicReplays = [wilshere, iniesta, vanPersie, ronaldo, messiMadrid, messiBayern];
