import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Run against the local production preview; all scenes and assets stay local.
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:4173');
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
  const layers = async toggle => {
    await page.getByRole('button', { name: 'レイヤー', exact: true }).click();
    for (const name of ['5レーン', 'ビエルサゾーン']) await page.getByRole('button', { name, exact: true }).click();
    if (toggle) await page.getByRole('button', { name: 'レイヤー', exact: true }).click();
  };
  await page.getByRole('button', { name: '視点を固定', exact: true }).click();
  await page.getByLabel('編集する選手', { exact: true }).selectOption('away-2');
  await page.getByText('全員の向き（22人）', { exact: true }).click();
  await page.waitForTimeout(1000);
  await mkdir('docs/images', { recursive: true });
  await page.screenshot({ path: 'docs/images/studio.png', fullPage: true });
  await layers(true);
  await page.locator('.board-container').screenshot({ path: 'docs/images/tactical-overlays.png' });
  await layers(true);
  await page.getByRole('button', { name: '自由', exact: true }).click();
  await page.getByTestId('scene-canvas').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await page.getByTestId('scene-canvas').screenshot({ path: 'docs/images/free-camera.png' });
  // Close-up of the athletes: scrub to just after the pass, then dolly the free camera in and down.
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
  const box = await page.getByTestId('scene-canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 25; i++) await page.mouse.wheel(0, -300);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 - 28, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await page.getByTestId('scene-canvas').screenshot({ path: 'docs/images/athletes.png' });
  expect(errors).toEqual([]);
} finally {
  await browser.close();
}
