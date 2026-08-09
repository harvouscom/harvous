/**
 * Bridge "open the planner *on this*" across the expand that follows.
 *
 * The compact plan pane in the church hub hands editing off to the expanded
 * planner, which mounts after `openExpandedSidebar('planner')` — so the pane
 * cannot set the planner's selection directly. Same shape as
 * `pending-note-focus.ts`: a one-shot flag the destination picks up itself,
 * rather than widening the shell's `openExpandedSidebar(tool)` signature with
 * an argument only one tool would ever read.
 *
 * Consumed once. A stale intent would reopen an editor over whatever the
 * pastor navigated to next, so reading it clears it.
 */
const PENDING_PLANNER_INTENT_KEY = 'harvous_pending_planner_intent';

export type PlannerIntent =
  /** A new entry. `date` null files it as an undated idea, as the editor does. */
  | { mode: 'create'; date: string | null; scopeSpaceId?: string }
  | { mode: 'edit'; serviceId: string; scopeSpaceId?: string }
  /**
   * Open on this room's plan and nothing else — what a space's Tools row sends.
   *
   * A scope is not an editor, so it is its own mode rather than a `create` with
   * no date: opening the planner from a room should land on that room's board,
   * not on an empty entry form.
   */
  | { mode: 'scope'; scopeSpaceId: string };

export function markPendingPlannerIntent(intent: PlannerIntent): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_PLANNER_INTENT_KEY, JSON.stringify(intent));
  } catch {
    /* Private mode, or a full quota. The planner still opens, just on nothing. */
  }
}

/** The pending intent, exactly once. Null when there is none, or it is malformed. */
export function consumePendingPlannerIntent(): PlannerIntent | null {
  if (typeof sessionStorage === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PENDING_PLANNER_INTENT_KEY);
    if (raw) sessionStorage.removeItem(PENDING_PLANNER_INTENT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PlannerIntent;
    const scope =
      typeof (parsed as { scopeSpaceId?: unknown })?.scopeSpaceId === 'string' &&
      (parsed as { scopeSpaceId: string }).scopeSpaceId
        ? (parsed as { scopeSpaceId: string }).scopeSpaceId
        : undefined;
    if (parsed?.mode === 'edit' && typeof parsed.serviceId === 'string' && parsed.serviceId) {
      return { mode: 'edit', serviceId: parsed.serviceId, scopeSpaceId: scope };
    }
    if (parsed?.mode === 'create') {
      return {
        mode: 'create',
        date: typeof parsed.date === 'string' ? parsed.date : null,
        scopeSpaceId: scope,
      };
    }
    /* A scope with no room to scope to is not a scope. */
    if (parsed?.mode === 'scope' && scope) return { mode: 'scope', scopeSpaceId: scope };
    return null;
  } catch {
    return null;
  }
}
