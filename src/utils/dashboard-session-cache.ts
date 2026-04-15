/**
 * SessionStorage keys for dashboard infinite-query hydration (`useDashboardContent`).
 * Keys look like `harvous-dashboard-cache-<filter>`.
 * Clear when list data may be stale across all filters (e.g. after visiting a thread).
 */
export function clearDashboardSessionCache(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('harvous-dashboard-cache-')) toRemove.push(k);
    }
    for (const k of toRemove) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
