/**
 * Renumber a raw download into Harvous's verse numbering and write the corpus file.
 *
 * Usage:
 *   node server/data/bibles/_remap.mjs NABRE
 *
 * Reads:  server/data/bibles/raw/<ID>.json  (gitignored; written by _download_bolls.mjs or _import_usfm.mjs)
 * Writes: server/data/bibles/<ID>.json
 * Then:   npx tsx server/scripts/seed-bible-verses.ts <ID>
 *
 * The report lists what didn't map one-to-one. Read it before seeding: every line should be a
 * known difference (a dropped addition, two verses printed as one), not a mapping mistake.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { remapVerses, SOURCES } from '../versification/remap.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function writeRemapped(translationId) {
  const raw = JSON.parse(readFileSync(join(__dirname, 'raw', `${translationId}.json`), 'utf-8'));
  const { alignWith } = SOURCES[translationId];
  const reference = alignWith && JSON.parse(readFileSync(join(__dirname, `${alignWith}.json`), 'utf-8'));
  const { verses, report } = remapVerses(raw, translationId, { reference });
  const outPath = join(__dirname, `${translationId}.json`);
  writeFileSync(outPath, JSON.stringify(verses, null, 2));

  console.log(`\n${translationId}: ${raw.length} source verses → ${verses.length} Harvous verses`);
  console.log(`  Psalm titles dropped: ${report.titlesDropped}`);
  console.log(`  Outside the 66-book table (${report.outsideCanon.length}): ${summarize(report.outsideCanon)}`);
  console.log(`  Moved by alignment with ${alignWith ?? '(none)'} (${report.moved.length}): ${report.moved.join(', ') || 'none'}`);
  console.log(`  Joined into one verse (${report.joined.length}): ${report.joined.join(', ') || 'none'}`);
  console.log(`  Missing (${report.missing.length}): ${report.missing.join(', ') || 'none'}`);
  console.log(`Saved to ${outPath}`);
  return report;
}

/** Collapse runs within a chapter so 67 Song-of-the-Three verses read as one entry. */
function summarize(keys) {
  const groups = new Map();
  for (const k of keys) {
    const chapter = k.replace(/:\d+.*$/, '');
    groups.set(chapter, (groups.get(chapter) ?? 0) + 1);
  }
  return [...groups].map(([c, n]) => (n > 1 ? `${c} (${n} verses)` : c)).join(', ') || 'none';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const translationId = (process.argv[2] || '').trim().toUpperCase();
  if (!SOURCES[translationId]) {
    console.error(`Usage: node _remap.mjs <${Object.keys(SOURCES).join('|')}>`);
    process.exit(1);
  }
  writeRemapped(translationId);
}
