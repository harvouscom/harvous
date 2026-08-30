/**
 * Handing a guest's work to the account they just made.
 *
 * This is the promise the standing row makes, so it is the one part of guest mode that must not
 * be best-effort: someone who highlighted six verses and then signed up because we asked them to
 * has to find those six verses waiting.
 *
 * **Replayed through the real API, not migrated underneath it.** An earlier shape re-partitioned
 * IndexedDB rows and let the sync push queue carry them up, which is how the offline path works
 * for a member who lost signal. A guest is not that: they have no rows in that database at all
 * (see `guest-store.ts` for why), and inventing some so the queue could adopt them would mean
 * hand-writing sync ops that no code path has ever produced. Replaying the creates is slower by
 * a few requests and correct by construction — the server sees exactly what it would have seen
 * had the person been signed in the whole time.
 *
 * **Order matters at the end.** The store is cleared only after every write has succeeded, and
 * the guest session only after that: clearing the session first would flip the shell to account
 * mode while the work still lived in a store nothing was reading, which looks precisely like
 * losing it. A failed adoption leaves both in place and tries again on the next mount.
 */
import { clearGuestSession, hasGuestSession } from './guest-session';
import { clearGuestStore, guestHighlights, guestStoreCounts } from './guest-store';

/** One run at a time, and never twice for the same page. */
let running = false;

export interface GuestAdoptionResult {
  adoptedHighlights: number;
  failed: number;
}

async function adoptHighlight(
  highlight: ReturnType<typeof guestHighlights>[number],
  spaceId: string,
): Promise<boolean> {
  try {
    const res = await fetch('/api/scripture/highlights', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference: highlight.reference,
        accent: highlight.accent,
        excerpt: highlight.excerpt,
        spanKey: highlight.spanKey,
        translation: highlight.translation,
        spaceId,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Adopt everything this browser made as a guest into `spaceId`.
 *
 * Returns null when there was nothing to do or a run is already in flight, so the caller can
 * tell "adopted nothing" from "adopted zero of two and should say so".
 */
export async function adoptGuestWork(spaceId: string): Promise<GuestAdoptionResult | null> {
  if (running) return null;
  if (!hasGuestSession()) return null;

  const counts = guestStoreCounts();
  if (counts.total === 0) {
    // Nothing made, but the marker is still here — a look around that never wrote anything.
    // Clearing it is the whole job: otherwise the new member keeps the guest row.
    clearGuestSession();
    return null;
  }

  running = true;
  try {
    const highlights = guestHighlights();
    /*
     * Sequential, not `Promise.all`. These are upserts keyed on reference + span, and a guest
     * with two highlights in one verse would have them race for the same row. A handful of
     * requests in a row is also gentler on the write rate limit than a burst.
     */
    let adopted = 0;
    for (const highlight of highlights) {
      if (await adoptHighlight(highlight, spaceId)) adopted += 1;
    }
    const failed = highlights.length - adopted;

    if (failed === 0) {
      clearGuestStore();
      clearGuestSession();
    }
    return { adoptedHighlights: adopted, failed };
  } finally {
    running = false;
  }
}
