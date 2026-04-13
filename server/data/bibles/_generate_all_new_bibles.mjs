/**
 * Generate NASB.json (NASB 1995), CSB.json, AMP.json, MSG.json in sequence using Claude.
 * Each translation resumes automatically from a partial file if interrupted.
 *
 * Usage:
 *   npm run bible:generate:all
 *
 * Requires ANTHROPIC_API_KEY in .env
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
      else reject(new Error(`${scriptPath} exited with code ${code}`));
    });
  });
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error('Add ANTHROPIC_API_KEY to .env');
    process.exit(1);
  }

  const script = join(__dirname, '_generate_translation.mjs');
  for (const id of IDS) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Generating ${id}...`);
    console.log('='.repeat(50));
    await runNode(script, [id]);
  }

  console.log('\nAll translations generated. Run:');
  console.log('  npx tsx server/scripts/seed-bible-verses.ts');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
