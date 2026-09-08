/**
 * Safari private browsing and non-secure contexts throw DOMException instead of
 * returning undefined for storage / workers / WebSocket. Accessing the getter is
 * enough — optional chaining does not catch it.
 */

export function isStorageSecurityError(error: unknown): boolean {
  if (error == null) return false;
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : '';
  const message = error instanceof Error ? error.message : String(error);
  if (name === 'SecurityError') return true;
  return /the operation is insecure/i.test(message);
}

export function readServiceWorkerContainer(): ServiceWorkerContainer | null {
  if (typeof navigator === 'undefined') return null;
  try {
    return navigator.serviceWorker ?? null;
  } catch {
    return null;
  }
}

export function isBrowserSecureContext(): boolean {
  if (typeof window === 'undefined') return true;
  return window.isSecureContext !== false;
}
