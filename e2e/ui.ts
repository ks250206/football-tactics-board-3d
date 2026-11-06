import type { Page } from '@playwright/test';
export async function inspector(page: Page, tab: '選手 / ボール' | 'チーム' | '分析') {
  const toggle = page.getByRole('button', { name: 'Inspector', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.getByRole('tab', { name: tab, exact: true }).click();
}
export async function popover(page: Page, label: string, open = true) {
  const button = page.getByRole('button', { name: label, exact: true });
  if ((await button.getAttribute('aria-expanded') === 'true') !== open) await button.click();
}
