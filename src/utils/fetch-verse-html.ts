/**
 * Fetch verse HTML for a reference + translation (browser; Clerk cookies sent automatically).
 * Responses are cached in memory for the session; concurrent requests for the same key are deduped.
 */

const verseHtmlCache = new Map<string, string>();
const verseHtmlInFlight = new Map<string, Promise<string | null>>();

function verseCacheKey(reference: string, translation: string): string {
  return `${reference.trim()}::${translation.trim()}`;
}

/** Synchronous read of a cached passage (null if not yet fetched). */
export function getCachedVerseHtml(reference: string, translation: string): string | null {
  return verseHtmlCache.get(verseCacheKey(reference, translation)) ?? null;
}

export async function fetchVerseHtml(reference: string, translation: string): Promise<string | null> {
  const key = verseCacheKey(reference, translation);
  const cached = verseHtmlCache.get(key);
  if (cached !== undefined) return cached;

  const pending = verseHtmlInFlight.get(key);
  if (pending) return pending;

  const promise = (async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/scripture/fetch-verse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reference, translation }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { text?: string };
      if (data.text && typeof data.text === 'string') {
        verseHtmlCache.set(key, data.text);
        return data.text;
      }
    } catch {
      /* ignore */
    }
    return null;
  })();

  verseHtmlInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    verseHtmlInFlight.delete(key);
  }
}
