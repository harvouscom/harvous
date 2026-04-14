import { deleteThreadOffline } from '@/utils/offline-mutations';
import { safeFetch } from '@/utils/safe-fetch';
import { safeNavigate } from '@/utils/safe-navigate';
import { isNetworkError } from '@/utils/network';

export type ThreadEraseMode = 'keepNotes' | 'eraseAll';

/** Maps More menu / strip pending action to API mode. */
export function threadEraseModeFromMenuAction(action: string): ThreadEraseMode {
  return action === 'eraseThreadAndNotes' ? 'eraseAll' : 'keepNotes';
}

export function getThreadEraseConfirmCopy(mode: ThreadEraseMode): { title: string; body: string } {
  if (mode === 'keepNotes') {
    return {
      title: 'Erase this thread?',
      body:
        'The thread will be removed. Your notes stay in Harvous; any note that only belonged here moves to My Pile.',
    };
  }
  return {
    title: 'Erase thread and notes?',
    body:
      'This permanently deletes the thread and erases notes that only belong to this thread. Notes that also appear in other threads are not removed.',
  };
}

/**
 * Deletes a thread via API, optionally erasing all linked notes.
 * Dispatches threadDeleted and navigates to dashboard on success (matches ActionStrip thread flow).
 */
export async function performThreadErase(params: {
  threadId: string;
  threadEraseMode: ThreadEraseMode;
  userId: string | null;
}): Promise<void> {
  const { threadId, threadEraseMode, userId } = params;
  const skipThreadOffline = threadEraseMode === 'eraseAll';

  let apiUrl: string;
  let successMessage: string;
  if (threadEraseMode === 'eraseAll') {
    apiUrl = '/api/threads/erase-with-notes';
    successMessage = 'Thread and all notes erased!';
  } else {
    apiUrl = '/api/threads/delete';
    successMessage = 'Thread erased!';
  }
  const paramName = 'threadId';
  const fetchTimeoutMs = threadEraseMode === 'eraseAll' ? 120000 : 10000;

  let deletedOffline = false;
  try {
    if (userId && !skipThreadOffline) {
      try {
        await deleteThreadOffline(userId, threadId);
        deletedOffline = true;
      } catch {
        // Continue with server
      }
    }
    if (deletedOffline && (window as any).toast?.success) {
      (window as any).toast.success(successMessage);
    }

    const response = await safeFetch(`${apiUrl}?${paramName}=${encodeURIComponent(threadId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      retries: 3,
      timeout: fetchTimeoutMs,
    });

    if (response === null) {
      if (!deletedOffline && (window as any).toast?.error) {
        (window as any).toast.error(
          skipThreadOffline
            ? 'Connect to the internet to permanently erase the thread and its notes.'
            : "Couldn't erase. Please check your connection and try again."
        );
      }
      if (!deletedOffline) return;

      window.dispatchEvent(new CustomEvent('threadDeleted', { detail: { threadId } }));
      const query = deletedOffline ? '' : `?toast=success&message=${encodeURIComponent(successMessage)}`;
      await safeNavigate(query ? `/dashboard${query}` : '/dashboard', { history: 'replace' });
      return;
    }

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      if (data?.success && typeof data.success === 'string') {
        successMessage = data.success;
      }
      window.dispatchEvent(new CustomEvent('threadDeleted', { detail: { threadId } }));
      const toastQuery = deletedOffline ? '' : `?toast=success&message=${encodeURIComponent(successMessage)}`;
      await safeNavigate(`/dashboard${toastQuery}`, { history: 'replace' });
    } else if (deletedOffline) {
      window.dispatchEvent(new CustomEvent('threadDeleted', { detail: { threadId } }));
      const errQuery = `?toast=success&message=${encodeURIComponent(successMessage)}`;
      await safeNavigate(`/dashboard${errQuery}`, { history: 'replace' });
    } else if ((window as any).toast?.error) {
      (window as any).toast.error(data?.error || 'Failed to sync deletion with server');
    }
  } catch (error) {
    if (isNetworkError(error) && deletedOffline) {
      window.dispatchEvent(new CustomEvent('threadDeleted', { detail: { threadId } }));
      const catchQuery = deletedOffline ? '' : `?toast=success&message=${encodeURIComponent(successMessage)}`;
      await safeNavigate(catchQuery ? `/dashboard${catchQuery}` : '/dashboard', { history: 'replace' });
    } else if ((window as any).toast?.error) {
      (window as any).toast.error('Failed to erase item');
    }
  }
}
