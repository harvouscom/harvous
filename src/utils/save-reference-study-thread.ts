/**
 * Persisting a looked-up word as a reference, in one place.
 *
 * A saved reference is a study-thread entry hanging off a note — there is no standalone
 * store for them — so every surface that offers "save this" has to POST the same shape to
 * the same endpoint. It used to exist only inside the editor, which is why the Bible reader
 * could show you a word's entry but not keep it: the reader has no editor to borrow the
 * call from. Extracted here so the reader and the editor save identically, and so a change
 * to what a saved reference *is* happens once.
 *
 * `noteId` is the only hard requirement, and it is the whole design constraint: a caller
 * without a note has nothing to save into and must get the user a note first.
 */

import { normalizeScriptureReference } from './scripture-detector';
import { withStudyThreadContext } from './study-dock-stack';

export type SaveReferenceInput = {
  /** The note the reference will belong to. */
  noteId: string;
  /** The looked-up word — both the snippet and the entry's title. */
  word: string;
  /** Where the word was read. */
  reference: string;
  translation: string;
  spaceId?: string | null;
  /** Defaults to the accent a fresh reference gets everywhere else. */
  accent?: string;
};

/** Resolves to the new study thread's id, or null if the save did not take. */
export async function saveReferenceStudyThread(
  input: SaveReferenceInput,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const word = input.word.trim();
  const noteId = input.noteId.trim();
  if (!word || !noteId) return null;

  const raw = input.reference.trim();
  // Normalized so "Rom 1:1" and "Romans 1:1" become the same anchor; the raw text is the
  // fallback rather than a hard failure, because an unparseable reference is still worth
  // keeping next to the word it came from.
  const reference = normalizeScriptureReference(raw) ?? raw;

  try {
    const res = await fetchImpl(`/api/notes/${noteId}/study-threads`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        withStudyThreadContext(
          {
            entryKind: 'reference',
            sourceSnippet: word,
            focusTitle: word,
            highlightAccentRaw: input.accent ?? 'warmAmber',
            scriptureReference: reference,
            scripturePassageTranslation: input.translation,
            scripturePassageExcerpt: word,
          },
          input.spaceId,
        ),
      ),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { studyThread?: { id?: string } };
    return data.studyThread?.id ?? null;
  } catch {
    // Offline or the endpoint is down. The caller keeps its pending state, so the save can
    // be tried again — losing the word silently would be worse than an unchanged button.
    return null;
  }
}
