/**
 * Download a full Bible translation from API.Bible into Harvous JSON format.
 *
 * Prerequisites:
 *   - API key from https://scripture.api.bible (set API_BIBLE_KEY)
 *   - Bible version ID authorized for your key (set API_BIBLE_ID_<TRANSLATION> or pass as 2nd arg)
 *
 * Usage:
 *   API_BIBLE_KEY=... API_BIBLE_ID_NASB=<bibleId> node server/data/bibles/_download_api_bible.mjs NASB
 *   API_BIBLE_KEY=... node server/data/bibles/_download_api_bible.mjs NASB <bibleId>
 *
 * List bibles / IDs you can access:
 *   curl -sS -H "api-key: $API_BIBLE_KEY" "https://api.scripture.api.bible/v1/bibles?name=NASB"  # choose NASB 1995 from results
 *
 * Output: server/data/bibles/<TRANSLATION>.json — array of { book, chapter, verse, text }
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
loadEnv({ path: join(ROOT, '.env') });
const chaptersPath = join(ROOT, 'src/data/bible-chapters.json');

const BASE = 'https://api.scripture.api.bible/v1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getApiKey() {
  const k = process.env.API_BIBLE_KEY?.trim();
  if (!k) {
    console.error('Set API_BIBLE_KEY (see https://scripture.api.bible)');
    process.exit(1);
  }
  return k;
}

/** Map API.Bible book `name` (normalized) → Harvous canonical book name from bible-chapters.json */
function normalizeBookNameForMatch(apiName) {
  const n = apiName.trim().toLowerCase();
  const map = {
    'song of solomon': 'Song of Songs',
    'song of songs': 'Song of Songs',
    psalms: 'Psalms',
    '1 samuel': '1 Samuel',
    '2 samuel': '2 Samuel',
    '1 kings': '1 Kings',
    '2 kings': '2 Kings',
    '1 chronicles': '1 Chronicles',
    '2 chronicles': '2 Chronicles',
    '1 corinthians': '1 Corinthians',
    '2 corinthians': '2 Corinthians',
    '1 thessalonians': '1 Thessalonians',
    '2 thessalonians': '2 Thessalonians',
    '1 timothy': '1 Timothy',
    '2 timothy': '2 Timothy',
    '1 peter': '1 Peter',
    '2 peter': '2 Peter',
    '1 john': '1 John',
    '2 john': '2 John',
    '3 john': '3 John',
  };
  if (map[n]) return map[n];
  return apiName.trim();
}

async function apiFetch(path, apiKey) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const res = await fetch(url, { headers: { 'api-key': apiKey } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status} ${url}: ${t.slice(0, 400)}`);
  }
  return res.json();
}

/** Strip HTML and collapse whitespace. */
function plainText(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
}

/**
 * Parse verse text from chapter HTML (fallback when content-type=json is not structured).
 */
function parseVersesFromHtml(html, harvousBook, chapterNum) {
  const out = [];
  const re = /data-verse="(\d+)"/g;
  let m;
  const indices = [];
  while ((m = re.exec(html)) !== null) {
    indices.push({ verse: parseInt(m[1], 10), idx: m.index });
  }
  if (indices.length === 0) {
    // Some skins use class="verse" with verse number in child
    const re2 = /<span[^>]*class="[^"]*verse[^"]*"[^>]*data-verse="(\d+)"/gi;
    while ((m = re2.exec(html)) !== null) {
      indices.push({ verse: parseInt(m[1], 10), idx: m.index });
    }
  }
  if (indices.length === 0) {
    console.warn(`  No data-verse spans in ${harvousBook} ${chapterNum}; trying single block`);
    const txt = plainText(html);
    if (txt) out.push({ book: harvousBook, chapter: chapterNum, verse: 1, text: txt });
    return out;
  }
  for (let i = 0; i < indices.length; i++) {
    const { verse, idx } = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1].idx : html.length;
    const slice = html.slice(idx, end);
    const text = plainText(slice);
    if (text) out.push({ book: harvousBook, chapter: chapterNum, verse, text });
  }
  return out;
}

function parseVersesFromJsonContent(content, harvousBook, chapterNum) {
  if (content == null) return null;
  if (typeof content === 'string') {
    try {
      const j = JSON.parse(content);
      return parseVersesFromJsonContent(j, harvousBook, chapterNum);
    } catch {
      return null;
    }
  }
  if (Array.isArray(content)) {
    const out = [];
    for (const row of content) {
      if (row && typeof row.verse === 'number' && row.text != null) {
        out.push({ book: harvousBook, chapter: chapterNum, verse: row.verse, text: plainText(String(row.text)) });
      } else if (row && row.number != null && row.content != null) {
        out.push({
          book: harvousBook,
          chapter: chapterNum,
          verse: parseInt(String(row.number), 10),
          text: plainText(typeof row.content === 'string' ? row.content : JSON.stringify(row.content)),
        });
      }
    }
    return out.length ? out : null;
  }
  if (typeof content === 'object' && content.verses && Array.isArray(content.verses)) {
    return parseVersesFromJsonContent(content.verses, harvousBook, chapterNum);
  }
  return null;
}

async function fetchChapterVerses(bibleId, chapterId, harvousBook, chapterNum, apiKey) {
  const q = new URLSearchParams({
    'content-type': 'json',
    'include-verse-numbers': 'false',
  });
  const path = `/bibles/${encodeURIComponent(bibleId)}/chapters/${encodeURIComponent(chapterId)}?${q.toString()}`;
  const json = await apiFetch(path, apiKey);
  const data = json.data;
  if (!data || !data.content) {
    return [];
  }
  const fromJson = parseVersesFromJsonContent(data.content, harvousBook, chapterNum);
  if (fromJson && fromJson.length) return fromJson;
  return parseVersesFromHtml(String(data.content), harvousBook, chapterNum);
}

async function buildBookNameMap(bibleId, canonicalBooks, apiKey) {
  const json = await apiFetch(`/bibles/${encodeURIComponent(bibleId)}/books`, apiKey);
  const books = json.data || [];
  const map = new Map();
  for (const b of books) {
    const name = normalizeBookNameForMatch(b.name || '');
    if (canonicalBooks.has(name)) {
      map.set(name, b.id);
    }
  }
  for (const cb of canonicalBooks) {
    if (!map.has(cb)) {
      for (const b of books) {
        const n = normalizeBookNameForMatch(b.name || '');
        if (n.toLowerCase() === cb.toLowerCase()) {
          map.set(cb, b.id);
          break;
        }
      }
    }
  }
  return map;
}

async function main() {
  const translationId = (process.argv[2] || '').trim().toUpperCase();
  const bibleIdArg = (process.argv[3] || '').trim();
  if (!translationId || !/^[A-Z0-9]{2,8}$/.test(translationId)) {
    console.error('Usage: node _download_api_bible.mjs <TRANSLATION_ID> [bibleUuid]');
    console.error('Example: API_BIBLE_KEY=... node _download_api_bible.mjs NASB');
    process.exit(1);
  }

  const envKey = `API_BIBLE_ID_${translationId}`;
  const bibleId = bibleIdArg || process.env[envKey]?.trim();
  if (!bibleId) {
    console.error(`Set ${envKey} or pass bible UUID as second argument.`);
    console.error('Find IDs: GET /v1/bibles?name=... with your API key.');
    process.exit(1);
  }

  const apiKey = getApiKey();
  const chapters = JSON.parse(readFileSync(chaptersPath, 'utf8'));
  const canonicalBooks = new Set(chapters.map((c) => c.book));

  console.log(`Building book map for bible ${bibleId}...`);
  const bookIdMap = await buildBookNameMap(bibleId, canonicalBooks, apiKey);
  if (bookIdMap.size < 39) {
    console.warn(`Warning: only matched ${bookIdMap.size} books to Harvous canon names — check API book names.`);
  }

  const allVerses = [];
  let n = 0;
  const total = chapters.length;

  for (const row of chapters) {
    const { book: harvousBook, chapter: chapterNum } = row;
    const bookApiId = bookIdMap.get(harvousBook);
    if (!bookApiId) {
      console.error(`No API book id for "${harvousBook}" — skipping`);
      continue;
    }
    const chapterId = `${bookApiId}.${chapterNum}`;
    n++;
    process.stdout.write(`\r[${n}/${total}] ${harvousBook} ${chapterNum}    `);
    try {
      const verses = await fetchChapterVerses(bibleId, chapterId, harvousBook, chapterNum, apiKey);
      for (const v of verses) {
        allVerses.push(v);
      }
    } catch (e) {
      console.error(`\nFailed ${chapterId}:`, e.message || e);
    }
    await sleep(120);
  }

  console.log(`\n\nTotal verse rows: ${allVerses.length}`);
  const outPath = join(__dirname, `${translationId}.json`);
  writeFileSync(outPath, JSON.stringify(allVerses, null, 2));
  console.log(`Saved ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
