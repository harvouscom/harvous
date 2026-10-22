import { safeRenderHtml } from '@/utils/content-renderer';
import { canonicalizeNoteHtmlLineBreaks } from '@/utils/note-html-linebreaks';
import { stripStudyHighlightMarkInlineBackground } from '@/utils/note-html-highlight-marks';
import {
  isResolvableScriptureReference,
  detectScriptureReferences,
  normalizeScriptureReference,
} from '@/utils/scripture-detector';
import { highlightScriptureReferences } from '@/utils/scripture-highlighter';
import {
  repairCorruptedScriptureQuoteAttributes,
  withScripturePillDisplayLabels,
} from '@/utils/scripture-pill-display';

export type ReadOnlyNoteBodyOptions = {
  /** Wrap bare references as pills for display. See `withDisplayScripturePills`. */
  displayPills?: DisplayScripturePillsOptions;
};

/** Read-only note body HTML — canonicalize blank lines before pill labels / highlight strip. */
export function prepareReadOnlyNoteBodyHtml(html: string, options: ReadOnlyNoteBodyOptions = {}): string {
  // Sanitize before pill DOM transforms; callers may safeRenderHtml again (idempotent).
  const sanitized = safeRenderHtml(repairCorruptedScriptureQuoteAttributes(html));
  const canonical = canonicalizeNoteHtmlLineBreaks(sanitized);
  const pilled = options.displayPills ? withDisplayScripturePills(canonical, options.displayPills) : canonical;
  return stripStudyHighlightMarkInlineBackground(withScripturePillDisplayLabels(pilled));
}

export type DisplayScripturePillsOptions = {
  /** Stamped on new pills the way a save would stamp the note's own id. */
  noteId: string;
  /** Used when the HTML has no pill of its own to borrow a translation from. */
  fallbackTranslation?: string | null;
};

const PILL_SPAN = /<span[^>]*data-scripture-reference[^>]*>[\s\S]*?<\/span>/gi;

/**
 * Wrap the references a stored body names in plain text as Scripture pills — for display only.
 *
 * Older versions, and the ones a `sync-update` wrote, hold "John 3:16" as words: the pill was
 * added by the server on a later save. Shown as stored, the past looks like a different kind of
 * note from the present one. This applies what that save would have applied, so the preview
 * reads like the note it was.
 *
 * Never write the result back. Restore keeps the stored HTML, and the server pills on save.
 *
 * Mirrors `transformCanonicalScriptureContent` (server/utils/process-scripture-references.ts),
 * except that existing pills are set aside first and put back byte for byte. The highlighter
 * matches through inline tags, so a reference that is pilled once and written bare again
 * re-wraps the pill too, and its accent goes with the old span. A preview of the past must not
 * restyle what the past already had.
 */
export function withDisplayScripturePills(html: string, options: DisplayScripturePillsOptions): string {
  if (!html) return html;
  const pills: string[] = [];
  // Private-use characters: plain text no reference can match through, and no tag either.
  const masked = html.replace(PILL_SPAN, (pill) => `\uE000${pills.push(pill) - 1}\uE001`);
  const outsidePills = masked.replace(/<[^>]*>/g, ' ').replace(/\uE000\d+\uE001/g, ' ');
  if (!outsidePills.trim()) return html;

  const seen = new Set<string>();
  const pairs: Array<{ reference: string; matchText: string }> = [];
  for (const detected of detectScriptureReferences(outsidePills)) {
    const reference = normalizeScriptureReference(detected.reference);
    if (!reference || !isResolvableScriptureReference(reference) || seen.has(reference)) continue;
    seen.add(reference);
    pairs.push({ reference, matchText: detected.reference });
  }
  if (pairs.length === 0) return html;

  // A note's pills share one translation; a new pill takes the one already on the page.
  const translation =
    /data-scripture-translation="([^"]+)"/.exec(html)?.[1] ?? options.fallbackTranslation ?? undefined;
  return highlightScriptureReferences(
    masked,
    pairs.map(({ reference, matchText }) => ({ reference, matchText, noteId: options.noteId, translation })),
  ).replace(/\uE000(\d+)\uE001/g, (_, index: string) => pills[Number(index)]);
}
