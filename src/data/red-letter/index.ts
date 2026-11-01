/**
 * Red letter in one module — the data and the code that applies it — so turning it on costs one
 * chunk and leaving it off costs nothing. Imported only dynamically (see `useRedLetter`); a
 * static import of this or of `@/utils/red-letter` from the reader would put it all back in the
 * initial bundle, which `npm run perf:check` will say.
 * Rebuilt by `npx tsx server/data/bibles/_build_red_letter.ts`; overrides.json is hand-kept.
 */
import { decorateRedLetter, redLetterRanges, type RedLetterData } from '@/utils/red-letter';
import patterns from './patterns.json';
import ranges from './ranges.json';
import overrides from './overrides.json';

const data: RedLetterData = {
  patterns: patterns as unknown as RedLetterData['patterns'],
  ranges: ranges as unknown as RedLetterData['ranges'],
  overrides: overrides as unknown as RedLetterData['overrides'],
};

export interface RedLetterKit {
  ranges: (
    book: string,
    chapter: number,
    translation: string,
    verses: readonly { number: number; text: string }[],
  ) => ReturnType<typeof redLetterRanges>;
  decorate: typeof decorateRedLetter;
}

const kit: RedLetterKit = {
  ranges: (book, chapter, translation, verses) => redLetterRanges(book, chapter, translation, verses, data),
  decorate: decorateRedLetter,
};

export default kit;
