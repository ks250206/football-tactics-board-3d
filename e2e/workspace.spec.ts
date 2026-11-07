import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { inspector, popover } from './ui';

async function inViewport(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
}
for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 720]]) test(`workbench ${width}x${height}: team controls never displace board, 3D or timeline`, async ({ page }) => {
  await page.setViewportSize({ width, height }); await page.goto('/');
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByTestId('scene-canvas').evaluate(el => el.setAttribute('data-identity', 'same'));
  const board = await page.locator('.board-panel').boundingBox(), view = await page.locator('.view-panel').boundingBox();
  await inspector(page, 'チーム');
  await page.getByText('カスタム配置・配置の条件', { exact: true }).click();
  await page.getByLabel('横の広さ', { exact: true }).fill('24');
  await page.getByLabel('コンパクトさ', { exact: true }).fill('94');
  expect(await page.locator('.board-panel').boundingBox()).toEqual(board);
  expect(await page.locator('.view-panel').boundingBox()).toEqual(view);
  for (const selector of ['.board-panel', '.view-panel', '.timeline']) await inViewport(page, selector);
  expect(await page.evaluate(() => ({ x: document.documentElement.scrollWidth > innerWidth + 1, y: document.documentElement.scrollHeight > innerHeight + 1 }))).toEqual({ x: false, y: false });
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-identity', 'same');
  await mkdir('artifacts', { recursive: true }); await page.screenshot({ path: `artifacts/workspace-team-${width}.png`, fullPage: true });
  await inspector(page, '分析'); await expect(page.getByTestId('xg-value')).not.toHaveText('—');
  await page.screenshot({ path: `artifacts/workspace-analysis-${width}.png`, fullPage: true });
});

test('resizes, hides Inspector, switches layouts and tabs without losing renderer or team drafts', async ({ page }) => {
  await page.goto('/'); await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready', 'true');
  const canvas = page.getByTestId('scene-canvas'); await canvas.evaluate(el => el.setAttribute('data-identity', 'same'));
  await inspector(page, 'チーム'); await page.getByLabel('横の広さ', { exact: true }).fill('42');
  await inspector(page, '選手 / ボール'); await inspector(page, 'チーム');
  await expect(page.getByLabel('横の広さ', { exact: true })).toHaveValue('42');
  const before = (await page.locator('.board-panel').boundingBox())!.width;
  const separator = page.getByRole('separator', { name: '2Dと3Dの幅' }); await separator.focus(); await page.keyboard.press('ArrowRight');
  expect((await page.locator('.board-panel').boundingBox())!.width).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Inspectorを閉じる', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspector', exact: true })).toBeFocused();
  await page.getByLabel('ワークスペース表示').getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.locator('.board-panel')).toBeHidden();
  await page.getByLabel('ワークスペース表示').getByRole('button', { name: '2D + 3D', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-identity', 'same');
  await inspector(page, '選手 / ボール'); await page.getByRole('tab', { name: '選手 / ボール', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'チーム', exact: true })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'チーム', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '時間軸を縮小', exact: true }).click(); await inViewport(page, '.timeline');
  await page.getByRole('button', { name: '時間軸を展開', exact: true }).click(); await inViewport(page, '.timeline');
});

test('scenario preview is non-destructive, traps focus, confirms replacement and supports undo', async ({ page }) => {
  await page.goto('/'); await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('touchline.project.v1'))).not.toBeNull();
  const before = await page.evaluate(() => localStorage.getItem('touchline.project.v1'));
  const board = await page.locator('.board-panel').boundingBox();
  await page.getByRole('button', { name: 'シナリオ', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('シナリオの種類').selectOption('phase:low-block');
  await expect(page.getByRole('button', { name: 'シーケンスを置き換える', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('touchline.project.v1'))).toBe(before);
  expect(await page.locator('.board-panel').boundingBox()).toEqual(board);
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(true);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'シナリオ', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'シナリオ', exact: true }).click();
  await page.getByLabel('シナリオの種類').selectOption('phase:low-block');
  await page.getByLabel('シーケンス全体の置き換えを確認しました').check();
  await page.getByRole('button', { name: 'シーケンスを置き換える', exact: true }).click();
  await expect(page.getByLabel('シーケンス名')).toHaveValue(/ローブロック/);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(page.getByLabel('シーケンス名')).toHaveValue(JSON.parse(before!).name);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('touchline.project.v1'))).toBe(before);
});

test('390px workspace switches views, scrolls only Inspector and keeps popovers on screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready', 'true');
  await inViewport(page, '.timeline');
  await page.getByLabel('モバイル表示').getByRole('button', { name: '3D', exact: true }).click();
  for (const label of ['カメラ設定', '映像出力']) {
    await popover(page, label);
    const r = await page.locator('.studio-popover-content').boundingBox();
    expect(r!.x).toBeGreaterThanOrEqual(0); expect(r!.x + r!.width).toBeLessThanOrEqual(390);
    await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: label, exact: true })).toBeFocused();
  }
  await inspector(page, 'チーム'); await page.getByLabel('フォーメーション', { exact: true }).selectOption('6-3-1');
  await page.getByRole('button', { name: 'Inspectorを閉じる', exact: true }).click();
  await page.getByLabel('モバイル表示').getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByTestId('tactics-board')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1)).toBe(false);
  await mkdir('artifacts', { recursive: true }); await page.screenshot({ path: 'artifacts/workspace-mobile.png', fullPage: true });
});

test('switches and persists the interface language and links to the GitHub repository', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const language = page.locator('.language-select');
  const canvas = page.getByTestId('scene-canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await canvas.evaluate(el => el.setAttribute('data-identity', 'same'));
  const labels = [
    ['en', 'Language', 'Shot lanes'],
    ['zh-Hans', '显示语言', '射门线路'],
    ['ko', '표시 언어', '슈팅 경로'],
    ['es', 'Idioma', 'Líneas de tiro'],
    ['pt-BR', 'Idioma', 'Linhas de finalização'],
  ];
  for (const [code, selectorLabel, shotLabel] of labels) {
    await language.selectOption(code);
    await expect(page.locator('html')).toHaveAttribute('lang', code);
    await expect(language).toHaveAccessibleName(selectorLabel);
    await expect(page.getByRole('button', { name: shotLabel, exact: true })).toBeVisible();
  }
  await expect(canvas).toHaveAttribute('data-identity', 'same');
  const repo = page.getByRole('link', { name: 'Repositório no GitHub' });
  await expect(repo).toHaveAttribute('href', 'https://github.com/ks250206/football-tactics-board-3d');
  await expect(repo).toHaveAttribute('target', '_blank');
  await page.getByRole('button', { name: 'Cenários', exact: true }).click();
  const scenarios = page.getByLabel('Tipo de cenário');
  await expect(scenarios.locator('option[value="phase:build-up"]')).toHaveText('Posse / Saída de bola');
  await page.keyboard.press('Escape');
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/workspace-portuguese.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(language).toHaveValue('pt-BR');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(repo).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'artifacts/workspace-portuguese-mobile.png' });
  expect(errors).toEqual([]);
});
