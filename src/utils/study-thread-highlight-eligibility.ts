/** Fields needed to decide Highlights sidebar list eligibility (mirrors native + web fallbacks). */
export type StudyThreadHighlightListEntry = {
  entryKindRaw: string;
  anchorLocation?: number | null;
  anchorLength?: number | null;
  sourceSnippet?: string | null;
  anchorTextSnapshot?: string | null;
  scripturePassageExcerpt?: string | null;
  scripturePassageTranslation?: string | null;
  linkedNoteId?: string | null;
};

/** Matches native StudyHighlightList eligibility (passage underline vs anchored mini/link/scripture rows). */
export function studyThreadEligibleForHighlightList(entry: StudyThreadHighlightListEntry): boolean {
  const passageHighlight =
    entry.entryKindRaw === 'scriptureLink' &&
    (entry.scripturePassageExcerpt ?? '').trim() !== '' &&
    (entry.scripturePassageTranslation ?? '').trim() !== '';

  const anchoredHighlight =
    ['miniNote', 'linkedNote', 'scriptureLink', 'reference'].includes(entry.entryKindRaw) &&
    entry.anchorLocation != null &&
    entry.anchorLocation >= 0 &&
    entry.anchorLength != null &&
    entry.anchorLength > 0;

  /** Web prototype historically POSTed miniNotes with snippet/snapshot but omitted anchors — still user-visible highlights. */
  const proseSnippetMiniNote =
    entry.entryKindRaw === 'miniNote' &&
    ((entry.sourceSnippet ?? '').trim() !== '' || (entry.anchorTextSnapshot ?? '').trim() !== '');

  /** Reference saved from a scripture passage (dictionary word) — no note anchor, but carries the
   *  word as its excerpt. Mirrors `passageHighlight` so these surface in the highlights list. */
  const referenceHighlight =
    entry.entryKindRaw === 'reference' &&
    ((entry.scripturePassageExcerpt ?? '').trim() !== '' || (entry.sourceSnippet ?? '').trim() !== '');

  /** Connected-note highlight — snippet identifies the anchor text even when anchor columns were omitted. */
  const linkedNoteHighlight =
    entry.entryKindRaw === 'linkedNote' &&
    (entry.linkedNoteId ?? '').trim() !== '' &&
    ((entry.sourceSnippet ?? '').trim() !== '' || (entry.anchorTextSnapshot ?? '').trim() !== '');

  return passageHighlight || anchoredHighlight || proseSnippetMiniNote || referenceHighlight || linkedNoteHighlight;
}
