/**
 * "You've written on this passage before" — the quiet line on a scripture draft's peek.
 *
 * Reads `GET /api/scripture/passage-notes`, the same overlap query behind the scripture dock's
 * passage history, so the draft and the dock can never disagree about which notes count
 * (overlap, not exact match: a draft of John 3:16 finds a note on John 3:14-18).
 *
 * Informational only. Pills no longer create their own notes, so there is nothing to "reuse";
 * the full list is one tap away on the committed pill.
 */

export interface PassageHistory {
  /** Notes of yours, other than the one being edited, that cite a verse in the passage. */
  total: number;
  /** Title of the newest of them, when it has one. */
  newestTitle: string | null;
}

const historyCache = new Map<string, PassageHistory>();
const inFlight = new Map<string, Promise<PassageHistory | null>>();

function historyKey(reference: string, excludeNoteId: string | null): string {
  return `${reference.trim()}::${excludeNoteId ?? ''}`;
}

export function getCachedPassageHistory(
  reference: string,
  excludeNoteId: string | null,
): PassageHistory | null {
  return historyCache.get(historyKey(reference, excludeNoteId)) ?? null;
}

/**
 * Passage history for a reference, or null when it couldn't be had. Answers are kept for the
 * session; failures are not, so a later draft can still ask.
 */
export async function getPassageHistory(
  reference: string,
  excludeNoteId: string | null,
): Promise<PassageHistory | null> {
  const key = historyKey(reference, excludeNoteId);
  const known = historyCache.get(key);
  if (known) return known;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async (): Promise<PassageHistory | null> => {
    try {
      // `total` counts every match; one row is enough for the newest title.
      const params = new URLSearchParams({ reference: reference.trim(), limit: '1' });
      if (excludeNoteId) params.set('noteId', excludeNoteId);
      const res = await fetch(`/api/scripture/passage-notes?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        success?: boolean;
        total?: number;
        notes?: { title?: string | null }[];
      };
      if (!data?.success || typeof data.total !== 'number') return null;
      const title = data.notes?.[0]?.title?.trim();
      const history: PassageHistory = { total: data.total, newestTitle: title || null };
      historyCache.set(key, history);
      return history;
    } catch {
      return null;
    }
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

const MAX_TITLE_CHARS = 32;

/** The words on the peek: "also in “Night with Nicodemus”", "in 3 of your notes", or null. */
export function passageHistoryLabel(history: PassageHistory | null): string | null {
  if (!history || history.total <= 0) return null;
  if (history.total === 1) {
    const title = history.newestTitle;
    if (!title) return 'in 1 other note';
    const short = title.length > MAX_TITLE_CHARS ? `${title.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…` : title;
    return `also in “${short}”`;
  }
  return `in ${history.total} of your notes`;
}
