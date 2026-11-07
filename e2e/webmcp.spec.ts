import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.use({
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage',
      '--enable-blink-features=WebMCP,WebMCPTesting'],
  },
});

const toolNames = [
  'touchline_list_replays', 'touchline_preview_replay', 'touchline_preview_sequence',
];

async function callTool(page: Page, name: string, input: object = {}) {
  return page.evaluate(async ({ name, input }) => {
    const context = document.modelContext!;
    const tool = (await context.getTools()).find(item => item.name === name);
    if (!tool) throw new Error('Missing native WebMCP tool ' + name);
    const result = await context.executeTool(tool, input);
    return typeof result === 'string' ? JSON.parse(result) : result;
  }, { name, input });
}

test('native WebMCP previews an editable match replay and accepts sparse custom scenes', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => {
    const tools = await document.modelContext?.getTools();
    return tools?.map(tool => tool.name).sort();
  })).toEqual(toolNames);
  const title = page.getByLabel('シーケンス名');
  const original = await title.inputValue();
  const catalog = await callTool(page, 'touchline_list_replays');
  const replayId = 'pl-2025-26-west-ham-arsenal-trossard-83';
  expect(catalog.replays[0]).toMatchObject({ id: replayId, match: expect.stringContaining('2026-05-10') });
  expect(catalog.replays).toHaveLength(7);

  const invalid = await callTool(page, 'touchline_preview_sequence', {
    name: 'Invalid', duration: 2, keyframes: [
      { t: 0, ball: { x: 0, z: 0 } },
      { t: 1 },
    ],
  });
  expect(invalid.error).toContain('last keyframe');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(title).toHaveValue(original);

  const draft = { name: 'AI pass rehearsal', duration: 2, keyframes: [
    { t: 0, players: [{ id: 'home-6', x: 1, z: 2 }], ball: { owner: 'home-6' } },
    { t: 2, ball: { owner: 'home-9' } },
  ] };
  expect(await callTool(page, 'touchline_preview_sequence', draft)).toMatchObject({
    status: 'awaiting_user_confirmation', duration: 2, keyframes: 2,
  });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(draft.name);
  await expect(title).toHaveValue(original);
  const apply = dialog.getByRole('button', { name: 'シーケンスを置き換える' });
  await expect(apply).toBeDisabled();
  const confirm = dialog.getByLabel('シーケンス全体の置き換えを確認しました');
  await confirm.check();
  // A second invocation cannot replace a preview that the user already reviewed.
  expect(await callTool(page, 'touchline_preview_replay', { replayId })).toHaveProperty('error');
  await dialog.getByRole('button', { name: 'キャンセル' }).click();
  await expect(title).toHaveValue(original);

  expect(await callTool(page, 'touchline_preview_replay', { replayId })).toMatchObject({
    status: 'awaiting_user_confirmation', duration: 6, keyframes: 6,
  });
  await expect(dialog).toContainText('トロサール 83分');
  await expect(dialog.getByRole('link', { name: '公式レポート' })).toBeVisible();
  await confirm.check();
  await apply.click();
  await expect(title).toHaveValue(/トロサール 83分/);
  await expect(page.getByTestId('player-away-11')).toHaveAttribute('aria-label', /AWAY 19/);
  const canvas = page.getByTestId('scene-canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/webmcp-replay.png' });
  const time = await page.getByTestId('timecode').innerText();
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('timecode')).not.toHaveText(time);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(title).toHaveValue(original);

  const wilshere = catalog.replays.find((replay: { id: string }) => replay.id.endsWith('wilshere-18'));
  expect(await callTool(page, 'touchline_preview_replay', { replayId: wilshere.id })).toMatchObject({
    status: 'awaiting_user_confirmation', duration: 16,
  });
  await expect(dialog).toContainText('ウィルシャー 18分');
  await dialog.getByRole('button', { name: 'キャンセル' }).click();

  await page.getByRole('button', { name: 'シナリオ', exact: true }).click();
  const select = dialog.getByLabel('シナリオの種類');
  await expect(select.locator('optgroup[label="試合の再現"] option')).toHaveCount(7);
  await select.selectOption('replay:' + wilshere.id);
  await confirm.check();
  await apply.click();
  await expect(title).toHaveValue(/ウィルシャー 18分/);
  await expect(page.getByTestId('stage')).toHaveAttribute('data-camera-player', 'home-10');
  const start = await page.getByTestId('ball-token').getAttribute('transform');
  expect(start).toMatch(/^translate\(-/);
  await page.screenshot({ path: 'artifacts/webmcp-wilshere-start.png' });
});
