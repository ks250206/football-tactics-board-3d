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
  await page.locator('.tactics-panel summary').click();
  await page.getByRole('button', { name: '視点を固定', exact: true }).click();
  await page.getByLabel('編集する選手', { exact: true }).selectOption('away-2');
  await page.getByText('全員の向き（22人）', { exact: true }).click();
  await page.waitForTimeout(1000);
  await mkdir('docs/images', { recursive: true });
  await page.screenshot({ path: 'docs/images/studio.png', fullPage: true });
  await page.getByRole('button', { name: '5レーン', exact: true }).click();
  await page.getByRole('button', { name: 'ビエルサゾーン', exact: true }).click();
  await page.locator('.board-container').screenshot({ path: 'docs/images/tactical-overlays.png' });
  await page.getByRole('button', { name: '5レーン', exact: true }).click();
  await page.getByRole('button', { name: 'ビエルサゾーン', exact: true }).click();
  await page.getByRole('button', { name: '自由', exact: true }).click();
  await page.getByTestId('scene-canvas').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await page.getByTestId('scene-canvas').screenshot({ path: 'docs/images/free-camera.png' });
  expect(errors).toEqual([]);
} finally {
  await browser.close();
}
