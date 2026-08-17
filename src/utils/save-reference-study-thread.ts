/**
 * Persisting a looked-up word as a reference, in one place.
 *
 * A saved reference is a study-thread entry, and it comes in two shapes because it can be
 * made from two places. Written from a note, it hangs off that note. Written from the Bible
 * reader, there is no note to hang it off — so it is saved parentless, against the passage
 * it was read in. Both are the same kind of row in the same table; only the anchor differs.
 *
 * The two live together here so that a change to what a saved reference *is* happens once,
 * and so the editor and the reader cannot drift into saving different things.
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

export type SaveReaderReferenceInput = {
  /** The looked-up word — both the snippet and the entry's title. */
  word: string;
  /** The passage it was read in; this is what the saved reference is anchored to. */
  reference: string;
  translation: string;
  /** Which space the reference belongs to — the reader is always read from one. */
  spaceId: string;
  accent?: string;
};

/**
 * The reader's version: keep the word without making a note to hold it.
 *
 * Separate endpoint rather than a `noteId`-less call to the one above, because the server
 * addresses these by passage instead of by note. Same row, different door.
 */
export async function saveReaderReferenceStudyThread(
  input: SaveReaderReferenceInput,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const word = input.word.trim();
  const spaceId = input.spaceId.trim();
  if (!word || !spaceId) return null;

  const raw = input.reference.trim();
  const reference = normalizeScriptureReference(raw) ?? raw;
  if (!reference) return null;

  try {
    const res = await fetchImpl('/api/scripture/references', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word,
        reference,
        translation: input.translation,
        spaceId,
        accent: input.accent ?? 'warmAmber',
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { reference?: { id?: string } };
    return data.reference?.id ?? null;
  } catch {
    return null;
  }
}
