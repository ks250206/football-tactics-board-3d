import { test, expect } from '@playwright/test';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import type { Response, Snapshot } from '../src/xg/analysis';

/** Exercise the actual Vite-built production Worker in Chromium, not Node or a mock. */
test('production browser worker matches independent native-XGBoost reference snapshots', async ({ page }) => {
  const oracle = JSON.parse(await readFile('tests/fixtures/xg-browser-reference.json', 'utf8')) as {
    native_xgboost: string;
    cases: { name: string; snapshot: Snapshot; model: string; expected: number; features: Record<string, number> }[];
  };
  const assets = await readdir('dist/assets');
  const workers = assets.filter(file => /^worker-.*\.js$/.test(file));
  expect(workers).toHaveLength(1);
  await page.goto('/');
  const results = await page.evaluate(async ({ path, cases }) => {
    const worker = new Worker(path, { type: 'module' });
    const output: Response[] = [];
    try {
      for (const c of cases) {
        const result = await new Promise<Response>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error('Browser oracle worker timeout')), 30000);
          worker.onmessage = event => {
            window.clearTimeout(timeout);
            if (event.data.error) reject(new Error(event.data.error));
            else resolve(event.data.result);
          };
          worker.onerror = event => { window.clearTimeout(timeout); reject(new Error(event.message)); };
          worker.postMessage({ key: c.name, snapshot: c.snapshot, heatmap: false,
            base: new URL('/models/adamsaidane/', location.origin).href });
        });
        output.push(result);
      }
    } finally { worker.terminate(); }
    return output;
  }, { path: `/assets/${workers[0]}`, cases: oracle.cases });
  let maxAbsoluteError = 0;
  for (const [i, result] of results.entries()) {
    const c = oracle.cases[i];
    expect(result.key).toBe(c.name);
    expect(result.prediction.model, c.name).toBe(c.model);
    expect(result.prediction.reason, c.name).toBeNull();
    expect(result.prediction.value, c.name).not.toBeNull();
    const error = Math.abs(result.prediction.value! - c.expected);
    expect(error, c.name).toBeLessThan(3e-6);
    expect(result.prediction.angle, c.name).toBeCloseTo(c.features.angle, 8);
    expect(result.prediction.opponentsInCone, c.name).toBe(c.features.num_opposing_players);
    maxAbsoluteError = Math.max(maxAbsoluteError, error);
  }
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/xg-browser-parity.json', JSON.stringify({
    native: oracle.native_xgboost, runtime: 'Chromium production Worker',
    cases: results.length, maxAbsoluteError, tolerance: 3e-6,
  }, null, 2));
});
