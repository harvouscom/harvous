/**
 * Parser for STEPBible TIPNR abbreviated reference lists.
 *
 * TIPNR (Translators Individualised Proper Names with all References, Tyndale House, CC-BY)
 * lists each person's occurrences as a compact, abbreviated string in its `– Total` line, e.g.
 *   "Exo.4.14; Exo.4.27ff; 5.1ff; 7; 9.8,27; 10.3ff"
 * with these conventions:
 *   - STEPBible 3-letter book codes (Exo, Jhn, Jud=Jude, Jdg=Judges) — not OSIS.
 *   - book and chapter are inherited from the previous token when omitted ("5.1" after "Exo.4.27").
 *   - a bare number is a whole chapter ("7" = chapter 7, anchored at verse 1).
 *   - commas add more verses in the current chapter ("9.8,27").
 *   - "ff" means "and following" (unbounded) — we anchor at the stated verse only.
 *   - "(?)/(d)/(a)/(f)" suffixes are editorial markers and are stripped.
 *
 * The expander is conservative: it emits verses it can resolve confidently and validates each
 * against the canon, rather than guessing at unbounded "ff" spans. Pure + tested so the
 * people importer can rely on it. See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md.
 */

import { isValidVerse } from './scripture-osis';

/** STEPBible 3-letter book code → canonical Harvous book name. */
export const TIPNR_BOOK: Record<string, string> = {
  Gen: 'Genesis', Exo: 'Exodus', Lev: 'Leviticus', Num: 'Numbers', Deu: 'Deuteronomy',
  Jos: 'Joshua', Jdg: 'Judges', Rut: 'Ruth', '1Sa': '1 Samuel', '2Sa': '2 Samuel',
  '1Ki': '1 Kings', '2Ki': '2 Kings', '1Ch': '1 Chronicles', '2Ch': '2 Chronicles',
  Ezr: 'Ezra', Neh: 'Nehemiah', Est: 'Esther', Job: 'Job', Psa: 'Psalms', Pro: 'Proverbs',
  Ecc: 'Ecclesiastes', Sng: 'Song of Solomon', Isa: 'Isaiah', Jer: 'Jeremiah',
  Lam: 'Lamentations', Ezk: 'Ezekiel', Dan: 'Daniel', Hos: 'Hosea', Jol: 'Joel', Amo: 'Amos',
  Oba: 'Obadiah', Jon: 'Jonah', Mic: 'Micah', Nam: 'Nahum', Hab: 'Habakkuk', Zep: 'Zephaniah',
  Hag: 'Haggai', Zec: 'Zechariah', Mal: 'Malachi', Mat: 'Matthew', Mrk: 'Mark', Luk: 'Luke',
  Jhn: 'John', Act: 'Acts', Rom: 'Romans', '1Co': '1 Corinthians', '2Co': '2 Corinthians',
  Gal: 'Galatians', Eph: 'Ephesians', Php: 'Philippians', Col: 'Colossians',
  '1Th': '1 Thessalonians', '2Th': '2 Thessalonians', '1Ti': '1 Timothy', '2Ti': '2 Timothy',
  Tit: 'Titus', Phm: 'Philemon', Heb: 'Hebrews', Jas: 'James', '1Pe': '1 Peter', '2Pe': '2 Peter',
  '1Jn': '1 John', '2Jn': '2 John', '3Jn': '3 John', Jud: 'Jude', Rev: 'Revelation',
};

export interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

function clean(token: string): string {
  return token.replace(/\((\?|d|a|f)\)/g, '').replace(/[«»]/g, '').trim();
}

/** Expand a TIPNR abbreviated reference string into validated canonical verse references. */
export function parseTipnrRefs(allRefs: string): VerseRef[] {
  const out: VerseRef[] = [];
  const seen = new Set<string>();
  let curBook: string | null = null;
  let curChapter: number | null = null;

  for (const rawToken of allRefs.split(';')) {
    const token = clean(rawToken);
    if (!token) continue;

    const commaParts = token.split(',');
    for (let ci = 0; ci < commaParts.length; ci++) {
      let p = clean(commaParts[ci]);
      p = p.replace(/ff?$/i, '').trim(); // "and following" → anchor at the stated verse
      if (!p) continue;

      // Ranges: keep the start; expand only a short, same-chapter numeric end.
      let rangeEnd: number | null = null;
      if (p.includes('-')) {
        const [a, b] = p.split('-');
        p = a.trim();
        const bt = (b ?? '').trim();
        if (/^\d+$/.test(bt)) rangeEnd = Number(bt);
      }

      const segs = p.split('.');
      let book = curBook;
      let chapter = curChapter;
      let verse: number | null = null;

      if (segs.length === 3) {
        book = TIPNR_BOOK[segs[0]] ?? null;
        chapter = Number(segs[1]);
        verse = Number(segs[2]);
      } else if (segs.length === 2) {
        if (TIPNR_BOOK[segs[0]]) {
          book = TIPNR_BOOK[segs[0]]; // Book.chapter → whole chapter
          chapter = Number(segs[1]);
          verse = 1;
        } else {
          chapter = Number(segs[0]); // chapter.verse, inherited book
          verse = Number(segs[1]);
        }
      } else if (segs.length === 1) {
        if (ci === 0) {
          chapter = Number(segs[0]); // whole chapter, inherited book
          verse = 1;
        } else {
          verse = Number(segs[0]); // additional verse in the current chapter
        }
      } else {
        continue;
      }

      if (!book || !Number.isInteger(chapter as number) || !Number.isInteger(verse as number)) continue;
      curBook = book;
      curChapter = chapter;

      const push = (v: number) => {
        if (!isValidVerse(book as string, chapter as number, v)) return;
        const key = `${book}|${chapter}|${v}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ book: book as string, chapter: chapter as number, verse: v });
      };

      push(verse as number);
      if (rangeEnd && rangeEnd > (verse as number) && rangeEnd - (verse as number) <= 20) {
        for (let v = (verse as number) + 1; v <= rangeEnd; v++) push(v);
      }
    }
  }

  return out;
}
