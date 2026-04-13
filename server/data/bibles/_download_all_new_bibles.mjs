/**
 * Generate NASB.json (NASB 1995), CSB.json, AMP.json, MSG.json in one run (same pipeline as other API.Bible translations).
 *
 * Requires in .env (repo root):
 *   API_BIBLE_KEY=...
 *   API_BIBLE_ID_NASB=<uuid>
 *   API_BIBLE_ID_CSB=<uuid>
 *   API_BIBLE_ID_AMP=<uuid>
 *   API_BIBLE_ID_MSG=<uuid>
 *
 * Get IDs from: npm run bible:list-api-bibles
 * Then: npm run bible:download:new
 * Then: npx tsx server/scripts/seed-bible-verses.ts
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
loadEnv({ path: join(ROOT, '.env') });

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
  const key = process.env.API_BIBLE_KEY?.trim();
  if (!key) {
    console.error('Add API_BIBLE_KEY to .env (https://scripture.api.bible).');
    console.error('List IDs: npm run bible:list-api-bibles');
    process.exit(1);
  }

  const script = join(__dirname, '_download_api_bible.mjs');
  for (const id of IDS) {
    const envId = process.env[`API_BIBLE_ID_${id}`]?.trim();
    if (!envId) {
      console.error(`Missing API_BIBLE_ID_${id} in .env — run npm run bible:list-api-bibles`);
      process.exit(1);
    }
    console.log(`\n========== ${id} ==========\n`);
    await runNode(script, [id, envId]);
  }
  console.log('\nDone. All four JSON files written under server/data/bibles/');
  console.log('Next: npx tsx server/scripts/seed-bible-verses.ts');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
