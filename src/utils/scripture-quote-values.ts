/**
 * The two values a scripture-quote blockquote stores: its accent key and its reference.
 *
 * Pure, and kept out of `insert-scripture-quote.ts` on purpose. That module inserts quotes into
 * a live editor and imports TipTap; the Home cards that build seed HTML for a new note only need
 * these two, and importing them from there put TipTap in the initial payload of every route.
 */
import { normalizeScriptureReference } from '@/utils/scripture-detector';
import { isStudyHighlightAccentKey, type StudyHighlightAccentKey } from '@/utils/study-highlight-accents';

export function scriptureQuoteAccentKey(accent: string | null | undefined): StudyHighlightAccentKey {
  if (accent && isStudyHighlightAccentKey(accent)) return accent;
  return 'neutral';
}

/**
 * Reduce a reference candidate to plain text.
 *
 * The second replace is the one that matters: an attribute value that was corrupted with pill
 * markup parses back as a *truncated* tag (`<span data-scripture-reference=`), because the HTML
 * parser ended the attribute at the markup's first inner quote. That fragment has no closing
 * `>` for the first replace to find.
 */
function plainReferenceText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/<[^>]*$/, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The value `data-scripture-quote-reference` may hold: a reference string, never markup.
 *
 * A pill's rendered HTML contains double quotes, so storing one here ends the attribute at its
 * first inner quote and spills the rest of the blockquote tag into the page as visible text.
 * Notes carrying exactly that damage exist (written by a highlighter pass that has since been
 * guarded), and they load back into the editor with a broken value in this attribute — so the
 * coercion protects the round-trip as much as the first write.
 *
 * Returns null when nothing usable survives, which drops the attribute rather than storing junk:
 * a quote with no reference degrades to a plain quote, one holding markup corrupts the document.
 */
export function scriptureQuoteReferenceValue(reference: string | null | undefined): string | null {
  if (reference == null) return null;
  const text = plainReferenceText(String(reference));
  if (!text) return null;
  return normalizeScriptureReference(text) ?? text;
}
