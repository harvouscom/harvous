/**
 * Read-only. Every alteration this rung can produce across many verses and seeds, checked
 * against the containments — evidence rather than a spot-check.
 */
import 'dotenv/config';
import { fetchVerseText } from '../utils/fetch-verse-text';
import { stripHtml } from '../utils/review-service';
import { buildVerseAltered, alterationAllowed } from '../../src/utils/verse-altered';
import { neighbourVerseAddresses, formatVerseAddress } from '../../src/utils/verse-adjacency';

const REFS = [
  'John 15:5', 'John 3:16', 'Romans 8:28', 'Romans 6:23', 'Romans 12:2', 'Psalm 23:1',
  'Psalm 119:105', 'Ephesians 2:8', 'Genesis 1:1', 'Philippians 4:13', 'Isaiah 40:31',
  'Matthew 5:9', 'Matthew 28:19', 'Hebrews 11:1', '1 Peter 2:9', 'Galatians 2:20',
  'Proverbs 3:5', 'James 1:2', '2 Timothy 3:16', 'Colossians 3:2',
];
const SEEDS = ['a','b','c','d','e','f','g','h'];

let built = 0, skipped = 0;
const problems: string[] = [];
for (const ref of REFS) {
  const html = await fetchVerseText(ref, 'NET');
  if (!html) continue;
  const text = stripHtml(html);
  const texts: string[] = [];
  for (const a of neighbourVerseAddresses(ref, 8)) {
    const h = await fetchVerseText(formatVerseAddress(a), 'NET');
    if (h) texts.push(stripHtml(h));
  }
  for (const seed of SEEDS) {
    const ex = buildVerseAltered({ text, candidateTexts: texts, seed });
    if (!ex) { skipped++; continue; }
    built++;
    if (!alterationAllowed(ex.original)) problems.push(`${ref} removed a barred word: ${ex.original}`);
    if (!alterationAllowed(ex.substitute)) problems.push(`${ref} inserted a barred word: ${ex.substitute}`);
    if (/^\p{Lu}/u.test(ex.original)) problems.push(`${ref} altered a capitalised word: ${ex.original}`);
    // The sweep used to ask whether the *token* was allowed, which is how `him—bears` got past.
    if (!/^\p{L}+(?:['\u2019]\p{L}+)?$/u.test(ex.original))
      problems.push(`${ref} altered more than one word: ${ex.original}`);
    if (!/^\p{L}+(?:['\u2019]\p{L}+)?$/u.test(ex.substitute))
      problems.push(`${ref} inserted more than one word: ${ex.substitute}`);
    const before = text.split(/\s+/);
    const diff = ex.tokens.map((t, i) => (t === before[i] ? -1 : i)).filter((i) => i >= 0);
    if (diff.length !== 1) problems.push(`${ref} changed ${diff.length} words, not one`);
  }
}
console.log(`built ${built}, skipped ${skipped} (a skip is the rung falling through, which is fine)`);
console.log(problems.length ? `PROBLEMS:\n  ${problems.join('\n  ')}` : 'no containment breached');
process.exit(0);
