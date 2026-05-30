/**
 * Fetches Easton's Bible Dictionary (CC BY 4.0) from neuu-org/bible-dictionary-dataset,
 * auto-categorizes each entry as person/place/thing, and writes:
 *   server/data/dictionaries/eastons.json         — full entries array
 *   server/data/dictionaries/eastons-slug-index.json — lightweight slug→{headword,category} map
 *
 * Run: node scripts/build-eastons-index.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'server', 'data', 'dictionaries');

const BASE_URL =
  'https://raw.githubusercontent.com/neuu-org/bible-dictionary-dataset/main/data/02_sources/easton';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

// ── Categorization heuristics ──────────────────────────────────────────────

const PERSON_PATTERNS = [
  /\bson of\b/i,
  /\bdaughter of\b/i,
  /\bwife of\b/i,
  /\bhusband of\b/i,
  /\bfather of\b/i,
  /\bmother of\b/i,
  /\bbrother of\b/i,
  /\bsister of\b/i,
  /\bking of\b/i,
  /\bqueen of\b/i,
  /\bprophet\b/i,
  /\bprophetess\b/i,
  /\bapostle\b/i,
  /\bdisciple\b/i,
  /\bhigh priest\b/i,
  /\bpriest of\b/i,
  /\bjudge of\b/i,
  /\bleader of\b/i,
  /\bservant of\b/i,
  /\bhe was\b/i,
  /\bshe was\b/i,
  /\bhe became\b/i,
  /\bborn in\b/i,
];

const PLACE_PATTERNS = [
  /\ba city\b/i,
  /\bthe city\b/i,
  /\ba town\b/i,
  /\bthe town\b/i,
  /\ba village\b/i,
  /\bthe village\b/i,
  /\ba river\b/i,
  /\bthe river\b/i,
  /\ba brook\b/i,
  /\bthe brook\b/i,
  /\ba valley\b/i,
  /\bthe valley\b/i,
  /\ba mountain\b/i,
  /\bthe mountain\b/i,
  /\ba hill\b/i,
  /\bthe hill\b/i,
  /\bthe land\b/i,
  /\ba land\b/i,
  /\bthe country\b/i,
  /\ba country\b/i,
  /\bthe region\b/i,
  /\ba region\b/i,
  /\bthe sea\b/i,
  /\bthe lake\b/i,
  /\bthe plain\b/i,
  /\bthe desert\b/i,
  /\bthe wilderness\b/i,
  /\bsituated\b/i,
  /\blocated\b/i,
  /\bnear\b.*\binhabitants\b/i,
];

function categorize(body) {
  const text = body || '';
  let personScore = 0;
  let placeScore = 0;
  for (const p of PERSON_PATTERNS) {
    if (p.test(text)) personScore++;
  }
  for (const p of PLACE_PATTERNS) {
    if (p.test(text)) placeScore++;
  }
  if (personScore === 0 && placeScore === 0) return 'thing';
  if (personScore >= placeScore) return 'person';
  return 'place';
}

// ── Fetch + merge ──────────────────────────────────────────────────────────

async function fetchLetter(letter) {
  const url = `${BASE_URL}/${letter}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  [skip] ${letter}.json → HTTP ${res.status}`);
    return {};
  }
  return res.json();
}

async function main() {
  console.log('Fetching Easton\'s Bible Dictionary (26 letter files)…');
  mkdirSync(OUT_DIR, { recursive: true });

  const allEntries = [];
  const slugIndex = [];

  for (const letter of LETTERS) {
    process.stdout.write(`  ${letter}… `);
    const data = await fetchLetter(letter);
    const keys = Object.keys(data);
    process.stdout.write(`${keys.length} entries\n`);

    for (const key of keys) {
      const entry = data[key];
      // Extract the Easton source definition
      const def = entry.definitions?.find((d) => d.source === 'EAS');
      if (!def) continue;

      const body = def.text || '';
      const slug = entry.slug || key.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const headword = entry.name || key;
      const category = categorize(body);

      // See-also: look for cross-refs ending with period or as "(see X)" patterns
      const seeAlso = [];
      const seeRe = /\bsee\s+([""]?[A-Z][A-Za-z\s]+[""]?)/g;
      let m;
      while ((m = seeRe.exec(body)) !== null) {
        const ref = m[1].replace(/["""]/g, '').trim();
        if (ref.length < 40) seeAlso.push(ref);
      }

      allEntries.push({ slug, headword, category, body, seeAlso });
      slugIndex.push({ slug, headword, category });
    }
  }

  allEntries.sort((a, b) => a.headword.localeCompare(b.headword));
  slugIndex.sort((a, b) => a.headword.localeCompare(b.headword));

  const entriesPath = join(OUT_DIR, 'eastons.json');
  const indexPath = join(OUT_DIR, 'eastons-slug-index.json');

  writeFileSync(entriesPath, JSON.stringify(allEntries, null, 2));
  writeFileSync(indexPath, JSON.stringify(slugIndex, null, 2));

  console.log(`\nWrote ${allEntries.length} entries → server/data/dictionaries/eastons.json`);
  console.log(`Wrote ${slugIndex.length} slugs   → server/data/dictionaries/eastons-slug-index.json`);

  const counts = { person: 0, place: 0, thing: 0 };
  for (const e of allEntries) counts[e.category]++;
  console.log(`Categories: ${counts.person} people, ${counts.place} places, ${counts.thing} things`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
