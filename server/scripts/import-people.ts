/**
 * Import STEPBible TIPNR people into normalized person + person-ref JSON.
 *
 * Source: github.com/STEPBible/STEPBible-Data, "Proper Nouns/TIPNR - ... CC BY.txt" (CC-BY 4.0).
 *   Records are separated by "$========== PERSON(s)" lines. The first line of each record is a
 *   header "Name@FirstRef=uStrong <tab> Description <tab> ... <tab> Type"; the "– Total" sub-line
 *   carries the full abbreviated reference list in its 4th tab-field. Place/Other sections are
 *   skipped (places come from OpenBible geocoding).
 *
 * Outputs (gitignored — regenerate, don't commit):
 *   server/data/scripture-knowledge/people.json      [{ id, slug, name }]
 *   server/data/scripture-knowledge/person-refs.json [{ entityType:'person', entityId, book, chapter, verse }]
 *
 * Usage: npx tsx server/scripts/import-people.ts [inputPath]
 * See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md and the data-dir README.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseTipnrRefs } from '../../src/utils/tipnr-refs';
import { canonicalBookOrder } from '../../src/utils/scripture-osis';
import type { PlaceRow, EntityRefRow } from './import-places';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUT_DIR = resolve(__dirname, '../data/scripture-knowledge');
const DEFAULT_INPUT = resolve(OUT_DIR, 'raw/tipnr.txt');
const PEOPLE_FILE = resolve(OUT_DIR, 'people.json');
const PERSON_REFS_FILE = resolve(OUT_DIR, 'person-refs.json');

// Reuse the place row shape (id, slug, name, …) for people too; coords stay absent.
type PersonRow = Pick<PlaceRow, 'id' | 'slug' | 'name'>;

const PERSON_MARKER = /^\$=+\s*PERSON/;
const SECTION_MARKER = /^\$=+\s*(PERSON|PLACE|OTHER|LOCATION)/;

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function main() {
  const input = resolve(process.argv[2] ?? DEFAULT_INPUT);
  if (!existsSync(input)) {
    console.error(`Input not found: ${input}`);
    console.error('Download the TIPNR file from github.com/STEPBible/STEPBible-Data (Proper Nouns/).');
    process.exit(1);
  }

  console.log(`Reading ${input}...`);
  const lines = readFileSync(input, 'utf-8').split('\n');

  const people: PersonRow[] = [];
  const refs = new Map<string, EntityRefRow>();
  const seenSlugs = new Set<string>();
  let withoutRefs = 0;

  let i = 0;
  while (i < lines.length) {
    if (!PERSON_MARKER.test(lines[i])) {
      i++;
      continue;
    }

    // Header is the next non-empty line; ignore the documentation legend (no "@Book.ch" ref).
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    const header = lines[j] ?? '';
    const headerField0 = (header.split('\t')[0] ?? '').replace(/═/g, '=');
    if (!/@[A-Za-z0-9]+\.\d/.test(headerField0)) {
      i = j + 1;
      continue;
    }

    // Collect record lines up to the next section marker; grab the "– Total" refs field.
    let k = j + 1;
    let totalRefs: string | null = null;
    while (k < lines.length && !SECTION_MARKER.test(lines[k])) {
      const fields = lines[k].split('\t');
      if (/^[–-]\s*Total\b/.test(fields[0] ?? '')) totalRefs = fields[3] ?? '';
      k++;
    }

    const name = headerField0.split('@')[0].trim();
    const uStrong = headerField0.includes('=') ? (headerField0.split('=').pop() ?? '').trim() : '';

    // Prefer the aggregated Total refs; fall back to the header's first reference.
    let refsStr = totalRefs ?? '';
    if (!refsStr) {
      const m = headerField0.match(/@([A-Za-z0-9]+\.\d+(?:\.\d+)?)/);
      refsStr = m ? m[1] : '';
    }

    if (name) {
      let slug = slugify(name) + (uStrong ? `-${uStrong.toLowerCase()}` : '');
      if (seenSlugs.has(slug)) {
        let n = 2;
        while (seenSlugs.has(`${slug}-${n}`)) n++;
        slug = `${slug}-${n}`;
      }
      seenSlugs.add(slug);

      const entityId = `person_${slug}`;
      people.push({ id: entityId, slug, name });

      const parsed = parseTipnrRefs(refsStr);
      if (!parsed.length) withoutRefs++;
      for (const r of parsed) {
        const key = `${entityId}|${r.book}|${r.chapter}|${r.verse}`;
        if (!refs.has(key)) {
          refs.set(key, { entityType: 'person', entityId, book: r.book, chapter: r.chapter, verse: r.verse });
        }
      }
    }

    i = k;
  }

  people.sort((a, b) => a.slug.localeCompare(b.slug));
  const refRows = [...refs.values()].sort(
    (a, b) =>
      canonicalBookOrder(a.book) - canonicalBookOrder(b.book) ||
      a.chapter - b.chapter ||
      a.verse - b.verse ||
      a.entityId.localeCompare(b.entityId),
  );

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(PEOPLE_FILE, JSON.stringify(people));
  writeFileSync(PERSON_REFS_FILE, JSON.stringify(refRows));

  console.log(`Wrote ${people.length.toLocaleString()} people → ${PEOPLE_FILE}`);
  console.log(`Wrote ${refRows.length.toLocaleString()} person→verse edges → ${PERSON_REFS_FILE}`);
  console.log(`  people with no parseable refs: ${withoutRefs.toLocaleString()}`);
}

main();
