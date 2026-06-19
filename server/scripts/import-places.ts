/**
 * Import OpenBible.info Bible places (geocoding) into normalized place + place-ref JSON.
 *
 * Source: https://github.com/openbibleinfo/Bible-Geocoding-Data  →  data/ancient.jsonl  (CC-BY).
 *   JSONL, one place per line. Fields used: friendly_id (name), url_slug, verses[].osis
 *   (OSIS refs where the place appears, e.g. "2Kgs.5.12").
 *
 * Outputs (gitignored — regenerate, don't commit):
 *   server/data/scripture-knowledge/places.json     [{ id, slug, name, latitude, longitude }]
 *   server/data/scripture-knowledge/place-refs.json [{ entityType:'place', entityId, book, chapter, verse }]
 *
 * Coordinates are left null for now (precise geometry lives in separate per-place geojson
 * files); the value here is the name + verse references for passage↔place edges.
 *
 * Usage: npx tsx server/scripts/import-places.ts [inputPath]
 * See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md and the data-dir README.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseOsisVerse, isValidVerse, canonicalBookOrder } from '../../src/utils/scripture-osis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUT_DIR = resolve(__dirname, '../data/scripture-knowledge');
const DEFAULT_INPUT = resolve(OUT_DIR, 'raw/ancient.jsonl');
const PLACES_FILE = resolve(OUT_DIR, 'places.json');
const PLACE_REFS_FILE = resolve(OUT_DIR, 'place-refs.json');

export interface PlaceRow {
  id: string;
  slug: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

export interface EntityRefRow {
  entityType: 'place' | 'person';
  entityId: string;
  book: string;
  chapter: number;
  verse: number;
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function main() {
  const input = resolve(process.argv[2] ?? DEFAULT_INPUT);
  if (!existsSync(input)) {
    console.error(`Input not found: ${input}`);
    console.error('Download data/ancient.jsonl from github.com/openbibleinfo/Bible-Geocoding-Data.');
    process.exit(1);
  }

  console.log(`Reading ${input}...`);
  const lines = readFileSync(input, 'utf-8').split('\n').filter((l) => l.trim());

  const places: PlaceRow[] = [];
  const refs = new Map<string, EntityRefRow>(); // entityId|book|chapter|verse → ref
  const seenSlugs = new Set<string>();
  let invalid = 0;

  for (const line of lines) {
    let o: { friendly_id?: string; url_slug?: string; verses?: Array<{ osis?: string }> };
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const name = (o.friendly_id ?? '').trim();
    if (!name) continue;

    let slug = o.url_slug?.trim() || slugify(name);
    // Disambiguate the rare slug collision so entityId stays unique.
    if (seenSlugs.has(slug)) {
      let n = 2;
      while (seenSlugs.has(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }
    seenSlugs.add(slug);

    const entityId = `place_${slug}`;
    places.push({ id: entityId, slug, name, latitude: null, longitude: null });

    for (const v of o.verses ?? []) {
      const parsed = v.osis ? parseOsisVerse(v.osis) : null;
      if (!parsed) continue;
      if (!isValidVerse(parsed.book, parsed.chapter, parsed.verse)) {
        invalid++;
        continue;
      }
      const key = `${entityId}|${parsed.book}|${parsed.chapter}|${parsed.verse}`;
      if (!refs.has(key)) {
        refs.set(key, { entityType: 'place', entityId, book: parsed.book, chapter: parsed.chapter, verse: parsed.verse });
      }
    }
  }

  places.sort((a, b) => a.slug.localeCompare(b.slug));
  const refRows = [...refs.values()].sort(
    (a, b) =>
      canonicalBookOrder(a.book) - canonicalBookOrder(b.book) ||
      a.chapter - b.chapter ||
      a.verse - b.verse ||
      a.entityId.localeCompare(b.entityId),
  );

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(PLACES_FILE, JSON.stringify(places));
  writeFileSync(PLACE_REFS_FILE, JSON.stringify(refRows));

  console.log(`Wrote ${places.length.toLocaleString()} places → ${PLACES_FILE}`);
  console.log(`Wrote ${refRows.length.toLocaleString()} place→verse edges → ${PLACE_REFS_FILE}`);
  console.log(`  dropped (out-of-range verses): ${invalid.toLocaleString()}`);
}

main();
