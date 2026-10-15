/**
 * "Show this one" across the expand that follows.
 *
 * A resource click in the Library panel opens the Resources tool with that item already in
 * the viewer. The tool mounts after the shell swaps the panel for it, so the click cannot hand
 * it the selection directly — the same reason `pending-discover-kind.ts` exists. In memory
 * rather than sessionStorage: the handoff never outlives the click that made it, and a
 * selection surviving a reload would open a viewer nobody asked for.
 *
 * Read during render with `peek`, cleared from an effect with `clear`: StrictMode runs a
 * `useState` initializer twice, and a read that cleared would hand the second run nothing.
 * Cleared, so a later Expand starts on the plain list.
 */
import type { ResourceSelection } from '../PrototypeResourceLibraryList';

let pending: ResourceSelection | null = null;

export function markPendingResourceSelection(selection: ResourceSelection): void {
  pending = selection;
}

export function peekPendingResourceSelection(): ResourceSelection | null {
  return pending;
}

export function clearPendingResourceSelection(): void {
  pending = null;
}
