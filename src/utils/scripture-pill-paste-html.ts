import { normalizeScriptureReference } from '@/utils/scripture-detector';

const PILL_REF_FIRST =
  /<span[^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi;
const PILL_ID_FIRST =
  /<span[^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi;

function isResolvedPillNoteId(noteId: string): boolean {
  return !!(noteId && noteId !== 'pending' && noteId !== 'null' && noteId !== '');
}

/** Normalized references for scripture pills in HTML that already have a persisted note id. */
export function extractResolvedScripturePillReferencesFromHtml(html: string): Set<string> {
  const refs = new Set<string>();
  if (!html) return refs;

  let match: RegExpExecArray | null;
  PILL_REF_FIRST.lastIndex = 0;
  while ((match = PILL_REF_FIRST.exec(html)) !== null) {
    const reference = match[1];
    const noteId = match[2];
    if (isResolvedPillNoteId(noteId)) {
      refs.add(normalizeScriptureReference(reference));
    }
  }

  PILL_ID_FIRST.lastIndex = 0;
  while ((match = PILL_ID_FIRST.exec(html)) !== null) {
    const noteId = match[1];
    const reference = match[2];
    if (isResolvedPillNoteId(noteId)) {
      refs.add(normalizeScriptureReference(reference));
    }
  }

  return refs;
}

/** Skip references that already have a resolved pill in pasted or parsed HTML. */
export function filterReferencesWithoutExistingPills<T extends { reference: string }>(
  references: T[],
  existingNormalizedRefs: Set<string>,
): T[] {
  return references.filter((ref) => !existingNormalizedRefs.has(normalizeScriptureReference(ref.reference)));
}
