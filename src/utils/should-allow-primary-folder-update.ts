/**
 * Native parity (`NoteEditorView.shouldAllowPrimaryFolderUpdate`): defer primary
 * folder assignment during continuous body typing unless the edit is a title
 * change, first body content, newline, sentence end, or substantial growth (120+ chars).
 */
export function shouldAllowPrimaryFolderUpdate(
  previousTitle: string,
  nextTitle: string,
  previousBody: string,
  nextBody: string,
): boolean {
  if (previousTitle !== nextTitle) return true;
  if (!previousBody.length) return true;

  const previousNewlines = (previousBody.match(/\n/g) ?? []).length;
  const nextNewlines = (nextBody.match(/\n/g) ?? []).length;
  if (nextNewlines > previousNewlines) return true;

  const sentencePunctuation = /[.!?;]/g;
  const previousSentenceMarkers = (previousBody.match(sentencePunctuation) ?? []).length;
  const nextSentenceMarkers = (nextBody.match(sentencePunctuation) ?? []).length;
  if (nextSentenceMarkers > previousSentenceMarkers) return true;

  const growth = Math.max(0, nextBody.length - previousBody.length);
  return growth >= 120;
}
