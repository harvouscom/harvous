/** Bridge router redirects (`/n/new`, `/new`) into a shell compose session on `/`. */
const PENDING_COMPOSE_SESSION_KEY = 'harvous_pending_compose_session';

export function markPendingComposeSession(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(PENDING_COMPOSE_SESSION_KEY, '1');
}

export function consumePendingComposeSession(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  if (sessionStorage.getItem(PENDING_COMPOSE_SESSION_KEY) !== '1') return false;
  sessionStorage.removeItem(PENDING_COMPOSE_SESSION_KEY);
  return true;
}
