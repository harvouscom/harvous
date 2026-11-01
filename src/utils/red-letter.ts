/**
 * Red letter: which characters of a chapter are the words of Jesus, in any translation we carry.
 *
 * None of our sources mark them — bolls.life serves no words-of-Jesus tags and every importer
 * strips markup anyway. So the marking comes from one public-domain Bible that does carry it, the
 * World English Bible (`\wj` in its USFM), reduced to a per-verse pattern: of the quotations in
 * this verse, in order, which are His. Most translations punctuate speech the same way WEB does,
 * so the pattern carries across by counting quotations — "Jesus replied, “…”" is one quotation in
 * NET, ESV and NASB alike, and narration around it stays black.
 *
 * Translations with no quotation marks (KJV, Douay-Rheims) can't be counted, so the build gives
 * them explicit character ranges instead. When a translation's quotations don't line up with
 * WEB's, the verse stays black: a missing red word is a smaller error than a red Pharisee.
 *
 * Built by `server/data/bibles/_build_red_letter.ts`; the data lives in `src/data/red-letter/`
 * and is loaded only while the reader has red letter switched on.
 */

/** `[start, end)` character offsets into a verse's text. */
export type RedRange = readonly [number, number];

/** "Book chapter:verse", the corpus's English numbering — `"John 3:16"`. */
export type VerseKey = string;

export interface RedLetterData {
  /**
   * WEB's quotations per verse, in order. Bit 1 (value & 1): the quotation is Jesus speaking.
   * Bit 2 (value & 2): it opened in an earlier verse. Only verses with any of His.
   */
  patterns: Record<VerseKey, number[]>;
  /** Exact ranges for translations without quotation marks, by translation id. */
  ranges: Record<string, Record<VerseKey, [number, number][]>>;
  /**
   * Hand corrections, keyed `"NASB|John 4:17"`: a mask (`[0, 1]`) replaces WEB's pattern for that
   * translation's quotations; ranges (`[[12, 40]]`) replace detection outright; `[]` blanks it.
   */
  overrides: Record<string, number[] | [number, number][]>;
}

export const verseKey = (book: string, chapter: number, verse: number): VerseKey =>
  `${book} ${chapter}:${verse}`;

/**
 * A top-level quotation within one verse. `carried` means it opened in an earlier verse. `parts`
 * are the quoted stretches themselves: one, unless the quotation was interrupted by its speech tag
 * (“Seven,” they said, “and a few fish.”), which is one speaker and one quotation for counting but
 * leaves the tag between the parts uncoloured.
 */
export interface QuoteSegment {
  start: number;
  end: number;
  carried: boolean;
  parts: [number, number][];
}

/**
 * How a chapter punctuates speech, read off the chapter itself rather than a per-translation table
 * so a new translation needs no entry here. Curly first: a curly-quoted text still has ASCII
 * apostrophes in places, and MSG (straight double) is full of straight apostrophes.
 */
export type QuoteStyle = 'curly' | 'double' | 'single' | 'none';

export function detectQuoteStyle(texts: readonly string[]): QuoteStyle {
  const all = texts.join('\n');
  if (all.includes('“')) return 'curly';
  if (all.includes('"')) return 'double';
  if (/(^|[\s(—–])'\S/m.test(all)) return 'single';
  return 'none';
}

type Mark = { kind: 'D' | 'S'; dir: 'open' | 'close' | 'either' };

const isLetter = (ch: string | undefined) => !!ch && /\p{L}|\p{N}/u.test(ch);
const OPENS_AFTER = /[\s([{—–“‘]/;

/**
 * Straight quotes say nothing about direction, so read it from the neighbours: a quote at the
 * start of a verse or after a space or dash, with a word after it, opens; anything else closes.
 * For single quotes a mark between letters is an apostrophe (don't), and `s'` before a space is a
 * possessive (disciples').
 *
 * Spaced marks are `either`, settled by what is open: AMP sets a space inside its opening quotes
 * (say, " Repent) and the NASB source sometimes before its closing ones (and walk '?).
 */
function classifyStraight(text: string, i: number, single: boolean): Mark['dir'] | 'none' {
  // A run of marks (STRAIGHT!'' closing two quotations) reads from what precedes the whole run.
  let k = i;
  while (k > 0 && (text[k - 1] === "'" || text[k - 1] === '"')) k--;
  const prev = text[k - 1];
  const next = text[i + 1];
  if (k === 0 || OPENS_AFTER.test(prev)) {
    if (k > 0 && /\s/.test(prev) && (next === undefined || /[\s?!.,;:—–-]/.test(next))) return 'either';
    if (next === undefined) return 'none';
    return 'open';
  }
  if (single) {
    if (isLetter(prev) && isLetter(next)) return 'none';
    if ((prev === 's' || prev === 'S') && (next === undefined || next === ' ')) return 'none';
  }
  return 'close';
}


/** The quotation mark at `i`, if it is one, in this chapter's style. */
function markAt(text: string, i: number, style: QuoteStyle): Mark | null {
  const ch = text[i];
  if (style === 'curly') {
    if (ch === '“') return { kind: 'D', dir: 'open' };
    if (ch === '”') return { kind: 'D', dir: 'close' };
    if (ch === '‘') return { kind: 'S', dir: 'open' };
    // ’ is mostly an apostrophe (father’s); between letters it can only be one.
    if (ch === '’') return isLetter(text[i - 1]) && isLetter(text[i + 1]) ? null : { kind: 'S', dir: 'close' };
    return null;
  }
  if (style === 'double' && (ch === '"' || ch === "'")) {
    const dir = classifyStraight(text, i, ch === "'");
    return dir === 'none' ? null : { kind: ch === '"' ? 'D' : 'S', dir };
  }
  if (style === 'single' && ch === "'") {
    const dir = classifyStraight(text, i, true);
    return dir === 'none' ? null : { kind: 'S', dir };
  }
  return null;
}

/**
 * Top-level quotations in each verse of a chapter, tracking open speech across verse boundaries.
 *
 * Quotations nest — Jesus telling a parable in which a king quotes his servants is “ ‘ “ ” ’ ” —
 * so this keeps a stack, and only the outermost quotation is a segment. A single mark with nothing
 * open is a term or scare quote (calls him ‘Lord’), never a speech.
 *
 * A double mark that opens while a double quotation is already the innermost one is the printed
 * convention for a speech running on into a new paragraph (each paragraph of the Sermon on the
 * Mount opens with “ and none closes), so it continues the speech rather than nesting. That is
 * also the forgiving reading of a source that dropped a closing mark. Single-quoted texts (NASB)
 * nest with the same mark, so there a reopening only continues at the start of a verse.
 */
export function quoteSegments(
  verses: readonly { number: number; text: string }[],
  style: QuoteStyle = detectQuoteStyle(verses.map((v) => v.text)),
): Map<number, QuoteSegment[]> {
  const out = new Map<number, QuoteSegment[]>();
  if (style === 'none') return out;
  const outer = style === 'single' ? 'S' : 'D';
  const stack: ('D' | 'S')[] = [];
  for (const { number, text } of verses) {
    const segs: QuoteSegment[] = [];
    let open: QuoteSegment | null =
      stack.length > 0 ? { start: 0, end: text.length, carried: true, parts: [] } : null;
    for (let i = 0; i < text.length; i++) {
      const mark = markAt(text, i, style);
      if (!mark) continue;
      const top = stack[stack.length - 1];
      const dir = mark.dir === 'either' ? (top === mark.kind ? 'close' : 'open') : mark.dir;
      if (dir === 'open') {
        if (stack.length === 0) {
          if (mark.kind !== outer) continue;
          stack.push(mark.kind);
          open = { start: i, end: text.length, carried: false, parts: [] };
        } else if (top === mark.kind) {
          const atVerseStart = text.slice(0, i).trim() === '';
          if (style === 'single' && !atVerseStart) stack.push(mark.kind);
        } else {
          stack.push(mark.kind);
        }
      } else {
        const at = stack.lastIndexOf(mark.kind);
        // A closing single with no single open is an apostrophe after all (disciples’ feet).
        if (at < 0 || (mark.kind === 'S' && top !== 'S')) continue;
        stack.length = at;
        if (stack.length === 0 && open) {
          open.end = i + 1;
          segs.push(open);
          open = null;
        }
      }
    }
    if (open) segs.push(open);
    for (const seg of segs) seg.parts = [[seg.start, seg.end]];
    const merged = mergeInterrupted(segs, text);
    if (merged.length > 0) out.set(number, merged);
  }
  return out;
}

/**
 * Join a quotation broken by its own speech tag: the first part ends on a comma inside the mark,
 * the tag ends on a comma, and the second part resumes in lower case — “But you,” he asked them,
 * “who do you say I am?” A part ending on ? or . (“…I am?” Peter answered, “You are…”) is a new
 * speaker and stays apart.
 */
function mergeInterrupted(segs: QuoteSegment[], text: string): QuoteSegment[] {
  const out: QuoteSegment[] = [];
  for (const seg of segs) {
    const prev = out[out.length - 1];
    const gap = prev ? text.slice(prev.end, seg.start) : '';
    if (
      prev &&
      /,\s*["”']$/.test(text.slice(prev.start, prev.end)) &&
      /,\s*$/.test(gap) &&
      gap.length <= 60 &&
      !/["“”‘']/.test(gap) &&
      // …and the sentence carries on: “From foreigners,” Jesus said, “Then…” is two people.
      /^\P{L}*\p{Ll}/u.test(text.slice(seg.start, seg.end))
    ) {
      prev.end = seg.end;
      prev.parts.push(...seg.parts);
    } else {
      out.push(seg);
    }
  }
  return out;
}

const isRangeList = (v: number[] | [number, number][]): v is [number, number][] =>
  v.length > 0 && Array.isArray(v[0]);

export const IS_HIS = 1;
export const CARRIED = 2;

/**
 * WEB's pattern laid over this translation's quotations. Same count → by position. A speech one
 * of them carries over from the previous verse and the other doesn't is set aside first — the
 * verses were divided differently, not the quotations. Different count but every WEB quotation is
 * His (a verse wholly inside a speech, punctuated differently) → all of them. Otherwise nothing.
 */
function applyMask(segs: readonly QuoteSegment[], mask: readonly number[]): RedRange[] {
  if (segs.length > 0 && mask.length > 0) {
    const maskCarried = (mask[0] & CARRIED) !== 0;
    // This translation thinks the verse opens mid-speech and WEB says it opens in narration: the
    // carried part would colour from the first word, so never trust it. That is also the
    // signature of a quote mark misread somewhere upstream, which this contains to one chapter.
    if (segs[0].carried && !maskCarried) segs = segs.slice(1);
    else if (maskCarried && !segs[0].carried && segs.length !== mask.length) mask = mask.slice(1);
  }
  const his = (m: number) => (m & IS_HIS) !== 0;
  if (segs.length === mask.length) return segs.filter((_, i) => his(mask[i])).flatMap((s) => s.parts);
  if (mask.length > 0 && mask.every(his)) return segs.flatMap((s) => s.parts);
  return [];
}

/** Red ranges for every verse of one chapter that has any. */
export function redLetterRanges(
  book: string,
  chapter: number,
  translation: string,
  verses: readonly { number: number; text: string }[],
  data: RedLetterData,
): Map<number, RedRange[]> {
  const out = new Map<number, RedRange[]>();
  const explicit = data.ranges[translation];
  // Only the quote walk needs the whole chapter, and only when the chapter has His words at all.
  const chapterHasPattern = verses.some((v) => data.patterns[verseKey(book, chapter, v.number)]);
  const segments = !explicit && chapterHasPattern ? quoteSegments(verses) : null;

  for (const { number, text } of verses) {
    const key = verseKey(book, chapter, number);
    const override = data.overrides[`${translation}|${key}`];
    let ranges: RedRange[] = [];
    if (override && isRangeList(override)) {
      ranges = override;
    } else if (explicit) {
      ranges = explicit[key] ?? [];
    } else {
      const mask = override ?? data.patterns[key];
      if (mask && segments) ranges = applyMask(segments.get(number) ?? [], mask);
    }
    const clamped = ranges
      .map(([s, e]) => [Math.max(0, s), Math.min(text.length, e)] as const)
      .filter(([s, e]) => e > s)
      .sort((a, b) => a[0] - b[0]);
    if (clamped.length > 0) out.set(number, clamped);
  }
  return out;
}

/**
 * Wrap the given ranges of a verse's decorated HTML in red-letter spans.
 *
 * Works on text nodes, so it runs after every other decorator (reference suggestions, saved
 * highlights) and never has to know about their markup: those only add elements, never text, so a
 * text-node offset is still an offset into `verse.text` once HTML entities are decoded.
 */
export function decorateRedLetter(html: string, ranges: readonly RedRange[]): string {
  if (ranges.length === 0) return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);

  let offset = 0;
  for (const node of nodes) {
    const start = offset;
    const end = offset + node.data.length;
    offset = end;
    // Pieces of this node, in order, each red or not.
    const cuts: { from: number; to: number; red: boolean }[] = [];
    let cursor = start;
    for (const [rs, re] of ranges) {
      const s = Math.max(rs, start);
      const e = Math.min(re, end);
      if (e <= s) continue;
      if (s > cursor) cuts.push({ from: cursor, to: s, red: false });
      cuts.push({ from: s, to: e, red: true });
      cursor = e;
    }
    if (!cuts.some((c) => c.red)) continue;
    if (cursor < end) cuts.push({ from: cursor, to: end, red: false });

    const frag = document.createDocumentFragment();
    for (const c of cuts) {
      const piece = document.createTextNode(node.data.slice(c.from - start, c.to - start));
      if (c.red) {
        const span = document.createElement('span');
        span.className = 'pds-reader__wj';
        span.appendChild(piece);
        frag.appendChild(span);
      } else {
        frag.appendChild(piece);
      }
    }
    node.replaceWith(frag);
  }
  return template.innerHTML;
}
