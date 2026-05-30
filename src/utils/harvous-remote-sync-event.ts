/** Fired after web offline sync successfully pulls or bootstraps from the server. */
export const HARVOUS_REMOTE_SYNC_COMPLETED = 'harvousRemoteSyncCompleted';

export function dispatchRemoteSyncCompleted(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(HARVOUS_REMOTE_SYNC_COMPLETED));
}
