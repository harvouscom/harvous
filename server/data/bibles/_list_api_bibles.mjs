/**
 * Print Bible `id`, `abbreviation`, and `name` for bibles your API key can access.
 * Use the id values in API_BIBLE_ID_NASB, etc.
 *
 * Usage: npm run bible:list-api-bibles
 * Requires: API_BIBLE_KEY in .env
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
loadEnv({ path: join(ROOT, '.env') });

const BASE = 'https://api.scripture.api.bible/v1';

async function main() {
  const key = process.env.API_BIBLE_KEY?.trim();
  if (!key) {
    console.error('Set API_BIBLE_KEY in .env');
    process.exit(1);
  }
  const res = await fetch(`${BASE}/bibles?language=eng`, {
    headers: { 'api-key': key },
  });
  if (!res.ok) {
    console.error(await res.text());
    process.exit(1);
  }
  const json = await res.json();
  const rows = (json.data || [])
    .map((b) => ({
      id: b.id,
      abbreviation: b.abbreviation || '',
      name: b.name || '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const want = /NASB|CSB|AMP|MSG|Amplified|Message|Christian Standard|American Standard/i;
  const highlighted = rows.filter((r) => want.test(r.name));
  if (highlighted.length) {
    console.log('Likely matches for NASB 1995 / CSB / AMP / MSG:\n');
    for (const r of highlighted) {
      console.log(`${r.abbreviation}\t${r.id}\t${r.name}`);
    }
    console.log('\n---\n');
  }
  console.log('All English bibles (abbreviation \\t id \\t name):\n');
  for (const r of rows) {
    console.log(`${r.abbreviation}\t${r.id}\t${r.name}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
