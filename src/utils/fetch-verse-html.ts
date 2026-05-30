/**
 * Fetch verse HTML for a reference + translation (browser; Clerk cookies sent automatically).
 */

export async function fetchVerseHtml(reference: string, translation: string): Promise<string | null> {
  try {
    const res = await fetch('/api/scripture/fetch-verse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ reference, translation }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string };
    if (data.text && typeof data.text === 'string') return data.text;
  } catch {
    /* ignore */
  }
  return null;
}
