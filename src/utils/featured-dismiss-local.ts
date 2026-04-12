import type { QueryClient } from '@tanstack/react-query';

const DISMISS_KEY_PREFIX = 'dismissed_featured_';

/** sessionStorage: VOTD "Create note" opened; server dismiss deferred until note is saved */
export const VOTD_PENDING_CREATE_NOTE_SESSION_KEY = 'votdPendingCreateNoteFeaturedId';

/** Window event: pending VOTD create-note state changed (carousel should re-filter) */
export const VOTD_PENDING_CREATE_NOTE_CHANGED = 'votdPendingCreateNoteChanged';

function dismissKey(featuredItemId: string) {
  return `${DISMISS_KEY_PREFIX}${featuredItemId}`;
}

export function readDismissedFeaturedItem(featuredItemId: string): boolean {
  try {
    return localStorage.getItem(dismissKey(featuredItemId)) === '1';
  } catch {
    return false;
  }
}

export function writeDismissedFeaturedItem(featuredItemId: string) {
  try {
    localStorage.setItem(dismissKey(featuredItemId), '1');
  } catch {
    /* ignore */
  }
}

export function getVotdPendingCreateNoteFeaturedId(): string | null {
  try {
    const id = sessionStorage.getItem(VOTD_PENDING_CREATE_NOTE_SESSION_KEY);
    return id?.trim() ? id : null;
  } catch {
    return null;
  }
}

export function setVotdPendingCreateNoteFeaturedId(featuredItemId: string) {
  try {
    sessionStorage.setItem(VOTD_PENDING_CREATE_NOTE_SESSION_KEY, featuredItemId);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(VOTD_PENDING_CREATE_NOTE_CHANGED));
  } catch {
    /* ignore */
  }
}

export function clearVotdPendingCreateNoteFeaturedId() {
  try {
    sessionStorage.removeItem(VOTD_PENDING_CREATE_NOTE_SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(VOTD_PENDING_CREATE_NOTE_CHANGED));
  } catch {
    /* ignore */
  }
}

/**
 * After a note is successfully created from the VOTD "Create note" flow, mark VOTD complete
 * (server + local dismiss) and refresh featured / nav / XP queries.
 */
export async function completePendingVotdCreateNoteDismiss(queryClient: QueryClient, userId: string | null) {
  const featuredItemId = getVotdPendingCreateNoteFeaturedId();
  if (!featuredItemId) return;

  try {
    await fetch('/api/featured/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ featuredItemId, votdEngagement: 'create_note' }),
    });
  } catch {
    /* non-fatal */
  }

  writeDismissedFeaturedItem(featuredItemId);
  clearVotdPendingCreateNoteFeaturedId();
  window.dispatchEvent(new CustomEvent('featuredItemDismissed'));
  void queryClient.invalidateQueries({ queryKey: ['featured-items'] });
  void queryClient.invalidateQueries({ queryKey: ['navigation'] });
  if (userId) {
    void queryClient.invalidateQueries({ queryKey: ['xp', userId] });
  }
}
