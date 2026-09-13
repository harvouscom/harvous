import { safeRenderHtml } from '@/utils/content-renderer';
import { canonicalizeNoteHtmlLineBreaks } from '@/utils/note-html-linebreaks';
import { stripStudyHighlightMarkInlineBackground } from '@/utils/note-html-highlight-marks';
import {
  repairCorruptedScriptureQuoteAttributes,
  withScripturePillDisplayLabels,
} from '@/utils/scripture-pill-display';

/** Read-only note body HTML — canonicalize blank lines before pill labels / highlight strip. */
export function prepareReadOnlyNoteBodyHtml(html: string): string {
  // Sanitize before pill DOM transforms; callers may safeRenderHtml again (idempotent).
  const sanitized = safeRenderHtml(repairCorruptedScriptureQuoteAttributes(html));
  return stripStudyHighlightMarkInlineBackground(
    withScripturePillDisplayLabels(canonicalizeNoteHtmlLineBreaks(sanitized)),
  );
}
