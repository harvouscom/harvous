/**
 * Port of native `ThreadEditorSnippet.deriveFocus(from:)` — first line, max 120 chars.
 */
export function deriveHighlightFocusTitle(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return '';
  const firstLine = trimmed.split('\n').find((line) => line.trim().length > 0) ?? trimmed;
  const capped = firstLine.trim().slice(0, 120);
  return capped;
}
