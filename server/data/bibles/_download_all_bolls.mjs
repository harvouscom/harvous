/**
 * Download NASB.json (NASB 1995), CSB.json, AMP.json, MSG.json from Bolls.life API in sequence.
 * No API key required.
 *
 * Usage: npm run bible:download:bolls:all
 * Then:  npx tsx server/scripts/seed-bible-verses.ts
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');

const IDS = ['NASB', 'CSB', 'AMP', 'MSG'];

function runNode(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`exit ${code}`));
    });
  });
}

async function main() {
  const script = join(__dirname, '_download_bolls.mjs');
  for (const id of IDS) {
    console.log(`\n========== ${id} ==========\n`);
    await runNode(script, [id]);
  }
  console.log('\nDone. All four JSON files written under server/data/bibles/');
  console.log('Next: npx tsx server/scripts/seed-bible-verses.ts');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
