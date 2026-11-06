import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { compileBooster, predictBooster } from '../src/xg/booster.ts';
const oracle = JSON.parse(await readFile(new URL('../artifacts/xg-reference.json', import.meta.url), 'utf8'));
const report = { native: oracle.xgboost, tolerance: 0.000003, cases: 0, maxAbsoluteError: 0, models: [] };
for (const c of oracle.cases) {
  const raw = JSON.parse(await readFile(new URL(`../public/models/adamsaidane/${c.file}`, import.meta.url), 'utf8'));
  const model = compileBooster(raw); assert.deepEqual(model.names, c.names);
  let maxError = 0;
  c.rows.forEach((row, i) => {
    const got = predictBooster(model, row.map(x => x === null ? NaN : x));
    const error = Math.abs(got - c.expected[i]);
    assert.ok(error <= report.tolerance, `${c.file} row ${i}: ${got} vs ${c.expected[i]}`);
    maxError = Math.max(maxError, error); report.cases++;
  });
  report.maxAbsoluteError = Math.max(report.maxAbsoluteError, maxError);
  report.models.push({ file: c.file, trees: model.trees.length, features: model.names, cases: c.rows.length, maxAbsoluteError: maxError });
}
await writeFile(new URL('../artifacts/xg-parity.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
