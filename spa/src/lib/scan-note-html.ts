/**
 * Seed HTML for a note started from a scanned page.
 *
 * Built here, with the pills already in it, rather than left as plain text for the save pass
 * to find: the save pass would pill the references eventually, but in the reader's default
 * translation and only after the first autosave — so "Romans 8:28 ESV" on the handout would
 * open as plain text and later become an NET pill. Each pill carries the translation printed
 * beside it on the page, or the one the reader chose in the review.
 */
import type { OcrParagraph } from '@/utils/ocr/ocr-scripture';
import type { IdentifiedPassage } from '@/utils/ocr/passage-match';
import { buildScripturePillSpanHtml, buildScripturePillWithQuoteHtml } from './votd-scripture-pill-html';

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export type ScanReferenceChoices = {
  /** The reader's default, for a reference printed without one. */
  defaultTranslation: string;
  /** Per reference key, a translation the reader picked in the review. */
  translationOverrides?: ReadonlyMap<string, string>;
  /** Reference keys the reader un-pilled in the review — they stay as the words on the page. */
  excluded?: ReadonlySet<string>;
};

/** The translation a reference's pill will carry. Override → printed → default. */
export function resolveScanTranslation(
  key: string,
  printed: string | null,
  choices: ScanReferenceChoices,
): string {
  return choices.translationOverrides?.get(key) ?? printed ?? choices.defaultTranslation;
}

export function buildScannedTextNoteHtml(paragraphs: OcrParagraph[], choices: ScanReferenceChoices): string {
  const html = paragraphs
    .map((segments) => {
      const inner = segments
        .map((segment) => {
          if (segment.kind === 'text') return escapeHtmlText(segment.text);
          if (choices.excluded?.has(segment.key)) {
            return escapeHtmlText(`${segment.text}${segment.translationText}`);
          }
          return buildScripturePillSpanHtml(
            segment.text,
            resolveScanTranslation(segment.key, segment.translation, choices),
          );
        })
        .join('');
      const last = segments[segments.length - 1];
      // A pill closing a paragraph needs a no-break space after it, or the caret has nowhere
      // to land outside the pill (same reason as `buildVotdScripturePillHtml`).
      const endsWithPill = last?.kind === 'reference' && !choices.excluded?.has(last.key);
      return `<p>${inner}${endsWithPill ? ' ' : ''}</p>`;
    })
    .join('');
  // A line to start writing on under what was scanned.
  return `${html}<p></p>`;
}

/**
 * A recognised Bible page: the passage quoted from the corpus (never the scan), the pill under
 * it as its source — the same shape a Today's passage note opens with.
 */
export function buildScannedPassageNoteHtml(passage: Pick<IdentifiedPassage, 'reference' | 'translation' | 'text'>): string {
  return buildScripturePillWithQuoteHtml(passage.reference, passage.translation, {
    reference: passage.reference,
    text: passage.text,
  });
}
