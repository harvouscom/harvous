/**
 * Text read off a photo → paragraphs, with every Scripture reference in them located.
 *
 * `detectScriptureReferences` answers "which references are in this text" — one entry per
 * distinct reference, in pass order rather than reading order, with no positions. A scanned
 * handout needs more than that: the same verse cited twice must be a pill twice, and a
 * translation printed beside one citation ("Romans 8:28 ESV") belongs to that citation, not to
 * the last one on the page. So the detector decides *what* is a reference, and this finds
 * *where* each one is and what translation was printed next to it.
 */
import { detectScriptureReferences, normalizeScriptureReference } from '@/utils/scripture-detector';
import { TRANSLATION_ORDER } from '@/data/translations';
import { normalizeOcrScriptureWithRepairs } from './normalize-ocr-scripture';

export type OcrSegment =
  | { kind: 'text'; text: string }
  | {
      kind: 'reference';
      /** As it reads in the text, without the translation code ("Romans 8:28"). */
      text: string;
      /** Normalised key — the same citation written two ways is one row in the review. */
      key: string;
      /** Printed beside this citation, or null to use the reader's default. */
      translation: string | null;
      /** The translation code as it appeared, so a reference the reader un-pills keeps it. */
      translationText: string;
    };

export type OcrParagraph = OcrSegment[];

export type OcrReferenceSummary = {
  key: string;
  /** First spelling seen. */
  text: string;
  /** First printed translation seen for this reference, if any. */
  translation: string | null;
  occurrences: number;
  /**
   * How the scan actually read it, when that took a guess to repair ("Jn. 3;l6") — the
   * references worth checking against the photo. Null when it was read cleanly.
   */
  readAs: string | null;
  /** The words around its first citation, so a card can say where on the page it came from. */
  context: string;
};

export type OcrScriptureResult = {
  /** The repaired text, one paragraph per blank-line-separated block. */
  text: string;
  paragraphs: OcrParagraph[];
  references: OcrReferenceSummary[];
};

const TRANSLATION_CODES = [...TRANSLATION_ORDER].sort((a, b) => b.length - a.length);
/** Only ever the canonical " CODE" that `normalizeOcrScripture` leaves after a reference. */
const TRANSLATION_SUFFIX = new RegExp(`^ (${TRANSLATION_CODES.join('|')})(?![A-Za-z0-9])`);

/** Bullets, numbered items, and "Q:" style labels start their own line in a handout. */
const LIST_LINE = /^(?:[•·▪◦*–—-]\s|\d{1,2}[.)]\s|[A-Za-z][.)]\s)/;

/**
 * Lines → paragraphs. A scan breaks lines where the page did, not where the writer did, so
 * lines are rejoined into running text — except a short line (a heading, a list item, a
 * reference on its own line), which ends its paragraph, and a list item, which starts one.
 * A word hyphenated across a line break is mended.
 */
export function ocrTextToParagraphs(text: string): string[] {
  const blocks = text.split(/\n\s*\n/);
  const paragraphs: string[] = [];
  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const longest = Math.max(...lines.map((line) => line.length));
    let current = '';
    lines.forEach((line, i) => {
      const short = line.length < longest * 0.6;
      // A finished sentence followed by a short line is a heading or a label, not a wrap.
      const startsOwnLine = LIST_LINE.test(line) || (short && /[.!?:]["')\]]*$/.test(current));
      if (current && startsOwnLine) {
        paragraphs.push(current);
        current = '';
      }
      if (!current) current = line;
      else if (/[a-z]-$/.test(current) && /^[a-z]/.test(line)) current = current.slice(0, -1) + line;
      else current = `${current} ${line}`;
      const isLast = i === lines.length - 1;
      if (!isLast && short) {
        paragraphs.push(current);
        current = '';
      }
    });
    if (current) paragraphs.push(current);
  }
  return paragraphs;
}

function isBoundary(ch: string | undefined): boolean {
  return ch === undefined || !/[A-Za-z0-9]/.test(ch);
}

/** Every non-overlapping place a detected reference occurs, longest citation first. */
function locateReferences(paragraph: string): Array<{ start: number; end: number; text: string }> {
  const detected = detectScriptureReferences(paragraph);
  const texts = [...new Set(detected.map((ref) => ref.reference.trim()))].sort(
    (a, b) => b.length - a.length,
  );
  const lower = paragraph.toLowerCase();
  const spans: Array<{ start: number; end: number; text: string }> = [];
  for (const refText of texts) {
    const needle = refText.toLowerCase();
    let from = 0;
    while (from <= lower.length) {
      const at = lower.indexOf(needle, from);
      if (at === -1) break;
      const end = at + needle.length;
      from = at + 1;
      // "John 3" must not claim the front of "John 3:16", nor "John 1:1" the front of "John 1:14".
      if (!isBoundary(paragraph[at - 1]) || /[0-9:]/.test(paragraph[end] ?? '')) continue;
      if (spans.some((s) => at < s.end && s.start < end)) continue;
      spans.push({ start: at, end, text: paragraph.slice(at, end) });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

function segmentParagraph(paragraph: string): OcrParagraph {
  const segments: OcrParagraph = [];
  let cursor = 0;
  for (const span of locateReferences(paragraph)) {
    if (span.start < cursor) continue;
    if (span.start > cursor) segments.push({ kind: 'text', text: paragraph.slice(cursor, span.start) });
    const suffix = paragraph.slice(span.end).match(TRANSLATION_SUFFIX);
    segments.push({
      kind: 'reference',
      text: span.text,
      key: normalizeScriptureReference(span.text).toLowerCase(),
      translation: suffix ? suffix[1]! : null,
      translationText: suffix ? suffix[0] : '',
    });
    cursor = span.end + (suffix ? suffix[0].length : 0);
  }
  if (cursor < paragraph.length) segments.push({ kind: 'text', text: paragraph.slice(cursor) });
  return segments;
}

/** Repair, split, and locate — what the scan review and the note are both built from. */
/** About a line of text either side of a citation, cut at word boundaries. */
function contextAround(paragraph: OcrParagraph, index: number): string {
  const before = paragraph
    .slice(0, index)
    .map((s) => (s.kind === 'text' ? s.text : s.text + s.translationText))
    .join('');
  const after = paragraph
    .slice(index + 1)
    .map((s) => (s.kind === 'text' ? s.text : s.text + s.translationText))
    .join('');
  const self = paragraph[index]!;
  const head = before.length > 40 ? `…${before.slice(-40).replace(/^\S*\s/, '')}` : before;
  const tail = after.length > 40 ? `${after.slice(0, 40).replace(/\s\S*$/, '')}…` : after;
  return `${head}${self.kind === 'reference' ? self.text + self.translationText : ''}${tail}`.trim();
}

export function findScriptureInOcrText(rawText: string): OcrScriptureResult {
  const { text: repaired, repairs } = normalizeOcrScriptureWithRepairs(rawText);
  const readAsByKey = new Map(
    repairs.map((r) => [normalizeScriptureReference(r.reference).toLowerCase(), r.readAs] as const),
  );
  const paragraphTexts = ocrTextToParagraphs(repaired);
  const paragraphs = paragraphTexts.map(segmentParagraph);
  const byKey = new Map<string, OcrReferenceSummary>();
  for (const paragraph of paragraphs) {
    paragraph.forEach((segment, index) => {
      if (segment.kind !== 'reference') return;
      const existing = byKey.get(segment.key);
      if (existing) {
        existing.occurrences += 1;
        existing.translation ??= segment.translation;
        return;
      }
      byKey.set(segment.key, {
        key: segment.key,
        text: segment.text,
        translation: segment.translation,
        occurrences: 1,
        readAs: readAsByKey.get(segment.key) ?? null,
        context: contextAround(paragraph, index),
      });
    });
  }
  return {
    text: paragraphTexts.join('\n\n'),
    paragraphs,
    references: [...byKey.values()],
  };
}

/** Words of running text, for deciding whether a page is worth matching against the Bible. */
export function countProseWords(text: string): number {
  return text.split(/\s+/).filter((word) => /^[A-Za-z'"(]*[A-Za-z]{2,}/.test(word)).length;
}
