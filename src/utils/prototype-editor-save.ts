/**
 * Prototype autosave: only apply server `processedContent` when the editor HTML still
 * matches what was sent — otherwise a follow-up flush must save newer typing.
 */
export function shouldInjectProcessedNoteContent(liveHtml: string | null, savedHtml: string): boolean {
  return liveHtml != null && liveHtml === savedHtml;
}
