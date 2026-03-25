import { normalizeScriptureReference } from '@/utils/scripture-detector';

/**
 * Gets an existing scripture note or creates a new one if it doesn't exist.
 * Ensures scripture notes are never duplicated by checking for existing notes first.
 *
 * @param reference - The scripture reference (e.g., "John 3:16")
 * @param parentThreadId - Optional thread ID to add the note to
 * @returns Object with noteId and isNew flag, or null noteId if creation failed
 */
export async function getOrCreateScriptureNote(
  reference: string,
  parentThreadId?: string,
  translation: string = 'NET'
): Promise<{ noteId: string | null; isNew: boolean }> {
  const normalizedRef = normalizeScriptureReference(reference);

  // Check if note exists (for this translation)
  const checkResponse = await fetch('/api/scripture/check-existing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference: normalizedRef, translation }),
    credentials: 'include'
  });

  if (checkResponse.ok) {
    const checkResult = await checkResponse.json();
    if (checkResult.exists && checkResult.noteId) {
      // If parent thread is provided, add existing note to that thread
      if (parentThreadId && parentThreadId !== 'thread_unorganized') {
        try {
          const addThreadResponse = await fetch(`/api/notes/${checkResult.noteId}/add-thread`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threadId: parentThreadId }),
            credentials: 'include'
          });

          // Note: We don't show an error if it's already in the thread (400 status)
          // This is expected behavior and handled silently
          if (addThreadResponse.ok) {
            const result = await addThreadResponse.json();
            if (result.success) {
              // Note was successfully added to thread
              // Optionally show a subtle toast, but keep it quiet to avoid spam
            }
          }
        } catch (error) {
          // Silently fail - note exists, just couldn't add to thread
          // This is non-critical since the note already exists
          console.error('Error adding existing scripture note to thread:', error);
        }
      }

      return { noteId: checkResult.noteId, isNew: false };
    }
  }

  // Fetch verse text first
  let verseText = reference; // Fallback to reference if fetch fails
  try {
    const verseResponse = await fetch('/api/scripture/fetch-verse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference: normalizedRef, translation }),
      credentials: 'include'
    });

    if (verseResponse.ok) {
      const verseData = await verseResponse.json();
      verseText = verseData.text || reference;
    }
  } catch (error) {
    // If verse fetch fails, use reference as fallback
    console.error('Error fetching verse text:', error);
  }

  // Create new note with verse text as content
  // Use parentThreadId if provided, otherwise default to thread_unorganized
  const targetThreadId = parentThreadId || 'thread_unorganized';
  const payload = {
    content: verseText,
    title: reference,
    threadId: targetThreadId,
    noteType: 'scripture',
    scriptureReference: normalizedRef,
    scriptureVersion: translation,
  };

  const createResponse = await fetch('/api/notes/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include'
  });

  if (createResponse.ok) {
    const result = await createResponse.json();
    if (result.note && result.note.id) {
      // Dispatch noteCreated event so OrganizedContentList can refresh
      // This ensures the scripture note appears in the scripture tab immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('noteCreated', {
          detail: {
            note: result.note,
            actualThreadId: targetThreadId
          }
        }));
      }

      // Show success toast
      if (typeof window !== 'undefined' && (window as any).toast) {
        (window as any).toast.success(`Scripture note created: ${reference}`);
      }
      return { noteId: result.note.id, isNew: true };
    }
  }

  // Show error toast
  if (typeof window !== 'undefined' && (window as any).toast) {
    (window as any).toast.error(`Error creating scripture note: ${reference}`);
  }

  return { noteId: null, isNew: false };
}
