import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createDemo, type Team } from '../src/core';
import { inspector, popover } from './ui';

function fixture(team: Team = 'home', free = false) {
  const p = createDemo(), sign = team === 'home' ? 1 : -1, other = team === 'home' ? 'away' : 'home';
  for (const f of p.frames) {
    p.roster.forEach((r, i) => { f.players[r.id] = { x: sign * (r.team === team ? -10 : 18), z: -28 + i % 11 * 5, body: r.team === 'home' ? 0 : 180, head: 0, pitch: 0 }; });
    f.players[`${team}-6`] = { x: sign * 40, z: 0, body: team === 'home' ? 0 : 180, head: 0, pitch: 0 };
    f.players[`${other}-1`] = { x: sign * 51, z: 0, body: 180, head: 0, pitch: 0 };
    f.players[`${other}-2`] = { x: sign * 45, z: .5, body: 180, head: 0, pitch: 0 };
    f.ball = { x: sign * 40.48, z: 0, y: .11, owner: free ? null : `${team}-6`, arc: 0 };
  }
  return p;
}
async function load(page: Page, team: Team = 'home', free = false) {
  await page.addInitScript(p => localStorage.setItem('touchline.project.v1', JSON.stringify(p)), fixture(team, free));
  await page.goto('/'); await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready', 'true');
  await inspector(page, '選手 / ボール');
  await page.getByLabel('編集する選手', { exact: true }).selectOption(`${team}-6`);
}
async function settled(page: Page) {
  await expect(page.getByTestId('xg-value')).toHaveText(/^0\.\d{3}$/, { timeout: 30000 });
  await expect(page.getByTestId('xg-freshness')).toContainText('更新済み');
}
async function dragPlayer(page: Page, id: string, x: number, z: number) {
  const target = await page.getByTestId('tactics-board').evaluate((el, p) => {
    const svg = el as unknown as SVGSVGElement, point = svg.createSVGPoint(); point.x = p.x; point.y = p.z;
    const result = point.matrixTransform(svg.getScreenCTM()!); return { x: result.x, y: result.y };
  }, { x, z });
  const b = await page.getByTestId(`player-${id}`).boundingBox(); if (!b) throw new Error('Missing player');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 5 }); await page.mouse.up();
}

test('single XGBoost result, heatmap and goal masks update on a real defender drag', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const external: string[] = []; page.on('request', r => { if (r.url().startsWith('http') && !r.url().startsWith('http://127.0.0.1:4173/')) external.push(r.url()); });
  await load(page);
  await expect(page.getByRole('button', { name: '学習済みxG', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'xGヒートマップ', exact: true }).click();
  await page.getByRole('button', { name: 'シュートコース', exact: true }).click();
  await inspector(page, '分析'); await settled(page);
  await expect(page.getByTestId('xg-heatmap').locator('rect')).toHaveCount(884);
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-xg-heatmap-cells', '884');
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-xg-goal-cells', '192');
  const before = await page.getByTestId('xg-value').textContent(), heatBefore = await page.getByTestId('xg-heatmap').innerHTML();
  const mask = await page.getByTestId('scene-canvas').getAttribute('data-xg-goal-colors');
  await page.getByTestId('scene-canvas').evaluate(el => el.setAttribute('data-identity', 'retained'));
  await page.getByRole('button', { name: '視点を固定', exact: true }).click();
  await dragPlayer(page, 'away-2', 45, 14); await settled(page);
  expect(await page.getByTestId('xg-value').textContent()).not.toBe(before);
  expect(await page.getByTestId('xg-heatmap').innerHTML()).not.toBe(heatBefore);
  await expect(page.getByTestId('scene-canvas')).not.toHaveAttribute('data-xg-goal-colors', mask!);
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-identity', 'retained');
  await page.getByRole('button', { name: '自由', exact: true }).click();
  await mkdir('artifacts', { recursive: true }); await page.screenshot({ path: 'artifacts/xg-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '一人称', exact: true }).click();
  await page.screenshot({ path: 'artifacts/xg-first-person.png', fullPage: true });
  await page.getByRole('button', { name: 'xGヒートマップ', exact: true }).click();
  await page.getByRole('button', { name: 'シュートコース', exact: true }).click();
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-xg-heatmap-cells', '0');
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-xg-goal-cells', '0');
  await settled(page); expect(errors).toEqual([]); expect(external).toEqual([]);
});

for (const team of ['home', 'away'] as const) test(`free-ball ${team}: locked attack survives opponent/teammate/GK edits and updates real goal colors`, async ({ page }) => {
  await load(page, team, true);
  const sign = team === 'home' ? 1 : -1, other = team === 'home' ? 'away' : 'home';
  await popover(page, 'カメラ設定'); await page.getByRole('button', { name: 'ボールを自動で見る', exact: true }).click(); await popover(page, 'カメラ設定', false);
  await page.getByRole('button', { name: '視点を固定', exact: true }).click();
  await page.getByRole('button', { name: 'xGヒートマップ', exact: true }).click();
  await page.getByRole('button', { name: 'シュートコース', exact: true }).click();
  await inspector(page, '分析'); await settled(page);
  const canvas = page.getByTestId('scene-canvas');
  await canvas.evaluate(el => el.setAttribute('data-identity', 'fixed-view'));
  await mkdir('artifacts', { recursive: true }); await canvas.screenshot({ path: `artifacts/goal-${team}-blocked.png` });
  const heat = await page.getByTestId('xg-heatmap').innerHTML();
  let mask = await canvas.getAttribute('data-xg-goal-colors');
  await dragPlayer(page, `${other}-2`, sign * 45, 14); await settled(page);
  await expect(canvas).not.toHaveAttribute('data-xg-goal-colors', mask!);
  expect(await page.getByTestId('xg-heatmap').innerHTML()).not.toBe(heat);
  await canvas.screenshot({ path: `artifacts/goal-${team}-defender-moved.png` });
  mask = await canvas.getAttribute('data-xg-goal-colors');
  await dragPlayer(page, `${other}-1`, sign * 51, 9); await settled(page);
  await expect(canvas).not.toHaveAttribute('data-xg-goal-colors', mask!);
  mask = await canvas.getAttribute('data-xg-goal-colors');
  const score = await page.getByTestId('xg-value').textContent();
  await dragPlayer(page, `${team}-7`, sign * 45, 0); await settled(page);
  await expect(canvas).not.toHaveAttribute('data-xg-goal-colors', mask!);
  // Teammates obstruct the geometric course but are NOT an XGBoost feature.
  await expect(page.getByTestId('xg-value')).toHaveText(score!);
  await expect(page.getByTestId('shot-lanes').locator('path[fill="#c4b5fd"]')).not.toHaveCount(0);
  await canvas.screenshot({ path: `artifacts/goal-${team}-teammate-blocked.png` });
  await expect(page.getByTestId('analysis-anchor')).toHaveAttribute('data-attack-team', team);
  await expect(canvas).toHaveAttribute('data-xg-goal-x', String(sign * 52.5));
  await expect(page.getByTestId('stage')).toHaveAttribute('data-camera-player', `${team}-6`);
  await expect(canvas).toHaveAttribute('data-identity', 'fixed-view');
  const halves = await page.getByTestId('xg-heatmap').locator('rect').evaluateAll(els => els.map(el => Number(el.getAttribute('x'))));
  expect(halves.every(x => sign === 1 ? x >= 0 : x < 0)).toBe(true);
  await page.getByRole('button', { name: '視点を固定', exact: true }).click();
  await page.getByTestId(`player-${other}-2`).click(); await settled(page);
  await expect(page.getByTestId('analysis-anchor')).toHaveAttribute('data-attack-team', other);
});

test('mobile analysis, explicit 1v1 and timeline edits remain accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await load(page);
  await page.getByRole('button', { name: 'Inspectorを閉じる', exact: true }).click();
  await page.getByRole('button', { name: 'xGヒートマップ', exact: true }).click();
  await page.getByRole('button', { name: 'シュートコース', exact: true }).click();
  await inspector(page, '分析'); await settled(page);
  await page.getByLabel('1対1を仮定', { exact: true }).check(); await settled(page);
  await expect(page.getByTestId('xg-readout')).toContainText('近距離・1対1');
  expect(await page.getByTestId('xg-heatmap').locator('rect').count()).toBeLessThan(884);
  await page.getByTestId('play-button').click();
  await expect.poll(() => page.getByTestId('xg-freshness').textContent()).not.toContain('解析時刻 0.00 s');
  await page.getByTestId('play-button').click(); await settled(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await mkdir('artifacts', { recursive: true }); await page.screenshot({ path: 'artifacts/xg-mobile.png', fullPage: true });
});

test('model failure is explicit and retry recovers without heuristic xG', async ({ page }) => {
  await page.route('**/models/adamsaidane/*.json', route => route.fulfill({ status: 503, body: 'test unavailable' }));
  await load(page); await inspector(page, '分析');
  await expect(page.getByRole('alert')).toContainText('モデルを読み込めません');
  await expect(page.getByTestId('xg-value')).toHaveText('—');
  await page.unroute('**/models/adamsaidane/*.json'); await page.getByRole('button', { name: 'モデルを再試行', exact: true }).click(); await settled(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
