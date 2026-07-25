/**
 * Desktop settings keep-alive: snapshot the shell main pane before the Outlet
 * swaps to settings, so the modal still sits over the previous home/note paint
 * instead of an empty main cell.
 */

export const FREEZE_MAIN_FOR_SETTINGS_EVENT = 'harvous:freeze-main-for-settings';

export function requestFreezeMainForSettings(): void {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(new CustomEvent(FREEZE_MAIN_FOR_SETTINGS_EVENT));
}

export function freezeMainInnerIntoLayer(
  mainInner: HTMLElement | null,
  freezeLayer: HTMLElement | null,
): void {
  if (!mainInner || !freezeLayer) return;
  // Already frozen (e.g. settings → settings child) — keep the first snapshot.
  if (freezeLayer.childNodes.length > 0) return;
  freezeLayer.replaceChildren();
  for (const node of Array.from(mainInner.childNodes)) {
    freezeLayer.appendChild(node.cloneNode(true));
  }
}

export function clearMainFreezeLayer(freezeLayer: HTMLElement | null): void {
  if (!freezeLayer) return;
  freezeLayer.replaceChildren();
}
