/**
 * Bridge "open Discover on this kind" across the expand that follows.
 *
 * The library panel's footer hands off to the expanded Discover surface, which
 * mounts after `openExpandedSidebar('discover')` — so the footer cannot set its
 * kind directly. Same shape and same reason as `pending-planner-intent.ts`: a
 * one-shot flag the destination picks up itself, rather than widening the
 * shell's `openExpandedSidebar(tool)` signature with an argument only one tool
 * would ever read.
 *
 * Consumed once. A stale kind would silently filter a later, unrelated open —
 * the reader would see an empty Discover and no reason for it — so reading it
 * clears it.
 */
const PENDING_DISCOVER_KIND_KEY = 'harvous_pending_discover_kind';

/** The kinds the panel can open filtered to. `resource` has no chip yet. */
export type PendingDiscoverKind = 'template' | 'note' | 'pack';

const VALID: readonly string[] = ['template', 'note', 'pack'];

export function markPendingDiscoverKind(kind: PendingDiscoverKind): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_DISCOVER_KIND_KEY, kind);
  } catch {
    /* Private mode, or a full quota. Discover still opens, just on everything. */
  }
}

/** The pending kind, exactly once. Null when there is none, or it is unknown. */
export function consumePendingDiscoverKind(): PendingDiscoverKind | null {
  if (typeof sessionStorage === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PENDING_DISCOVER_KIND_KEY);
    if (raw) sessionStorage.removeItem(PENDING_DISCOVER_KIND_KEY);
  } catch {
    return null;
  }
  return raw && VALID.includes(raw) ? (raw as PendingDiscoverKind) : null;
}
