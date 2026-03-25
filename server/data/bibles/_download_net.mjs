// Download NET Bible from labs.bible.org API and save as NET.json
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const chapters = JSON.parse(readFileSync(join(__dirname, '../../../src/data/bible-chapters.json'), 'utf8'));
const books = [...new Set(chapters.map(c => c.book))];

// Build a map of book -> [chapter numbers]
const bookChapters = {};
for (const c of chapters) {
  if (!bookChapters[c.book]) bookChapters[c.book] = [];
  bookChapters[c.book].push(c.chapter);
}

// Map canonical names to API names (most are the same, some differ)
const apiNameMap = {
  'Song of Solomon': 'Song of Songs',
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchChapter(book, chapter) {
  const apiBook = apiNameMap[book] || book;
  const passage = encodeURIComponent(`${apiBook} ${chapter}`);
  const url = `https://labs.bible.org/api/?passage=${passage}&type=json`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`  HTTP ${res.status} for ${book} ${chapter}, attempt ${attempt + 1}`);
        await sleep(2000);
        continue;
      }
      const text = await res.text();
      if (!text.trim()) {
        console.error(`  Empty response for ${book} ${chapter}, attempt ${attempt + 1}`);
        await sleep(2000);
        continue;
      }
      const data = JSON.parse(text);
      return data.map(v => ({
        book: book,  // Use canonical name
        chapter: parseInt(v.chapter),
        verse: parseInt(v.verse),
        text: v.text.replace(/<[^>]*>/g, '').trim()  // Strip any HTML tags
      }));
    } catch (e) {
      console.error(`  Error for ${book} ${chapter}: ${e.message}, attempt ${attempt + 1}`);
      await sleep(2000);
    }
  }
  console.error(`  FAILED: ${book} ${chapter} after 3 attempts`);
  return [];
}

async function main() {
  const allVerses = [];
  let totalBooks = books.length;

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const chapterNums = bookChapters[book];
    console.log(`[${i + 1}/${totalBooks}] ${book} (${chapterNums.length} chapters)`);

    for (const ch of chapterNums) {
      const verses = await fetchChapter(book, ch);
      allVerses.push(...verses);
      // Small delay to be polite to the API
      await sleep(150);
    }
  }

  console.log(`\nTotal verses: ${allVerses.length}`);
  writeFileSync(join(__dirname, 'NET.json'), JSON.stringify(allVerses, null, 2));
  console.log('Saved NET.json');
}

main().catch(console.error);
