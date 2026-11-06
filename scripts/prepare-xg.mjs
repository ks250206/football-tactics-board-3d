// Build-time only: pin and verify upstream bytes. No tactic data leaves the browser.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export const revision = '3dfa855294abe947e42c276a9b136e9ff05b9ca9';
export const assets = [
  ['xG_foot_openplay_inside_1on1.json', '3a029342bb95bc593cef401b2f904442cb6efc00'],
  ['xG_foot_openplay_inside_not_1on1.json', 'bf5d44a1ddd5b82b9809c1ffb482de8d8fd5ec0a'],
  ['xG_foot_openplay_outside.json', 'fb82cbabc031a324b0b5bce468fdbb6876613a43'],
  ['LICENSE', '5210e5348babef0b62a98ad462269e5e200b1101'],
];
export function gitHash(bytes) { return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'); }
export async function prepare(checkOnly = false) {
  const directory = new URL('../public/models/adamsaidane/', import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const [name, hash] of assets) {
    const destination = new URL(name, directory);
    const cached = await readFile(destination).catch(() => null);
    if (cached && gitHash(cached) === hash) continue;
    if (checkOnly) throw new Error(`Missing or modified xG asset: ${name}. Run pnpm models:prepare.`);
    const source = `https://raw.githubusercontent.com/adamsaidane/xG_model/${revision}/${name === 'LICENSE' ? '' : 'models/'}${name}`;
    let failure;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`${response.status}: ${source}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (gitHash(bytes) !== hash) throw new Error(`Integrity mismatch: ${name}`);
        const temp = fileURLToPath(destination) + `.${process.pid}.tmp`;
        try { await writeFile(temp, bytes); await rename(temp, destination); }
        finally { await rm(temp, { force: true }); }
        console.log(`Verified ${name} (${bytes.length} bytes)`);
        failure = undefined; break;
      } catch (error) { failure = error; }
    }
    if (failure) throw failure;
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  prepare(process.argv.includes('--check')).catch(error => { console.error(error.message); process.exitCode = 1; });
}
