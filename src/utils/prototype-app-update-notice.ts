export const PROTO_APP_UPDATE_EVENT = 'harvous-prototype-app-update';

export type PrototypeAppUpdateMode = 'info' | 'reload';

export function showPrototypeAppUpdateNotice(mode: PrototypeAppUpdateMode = 'info'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PROTO_APP_UPDATE_EVENT, { detail: { mode } }));
}

export function reloadPrototypeAfterUpdate(): void {
  try {
    sessionStorage.removeItem('vite_preload_reload_attempted');
  } catch (_) {}
  window.location.reload();
}
