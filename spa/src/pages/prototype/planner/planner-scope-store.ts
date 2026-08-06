/**
 * Which plan the planner was last looking at, per church.
 *
 * Persisted so the compact pane and the expanded planner agree — switching to
 * the board should not silently drop you back onto the church plan when you
 * were three weeks into planning Youth. Keyed by org because a space id only
 * means anything inside its own church.
 *
 * `null` is the church's own plan, and is also what an unrecognised id falls
 * back to: a channel you have lost access to must not leave the planner
 * pointing at a plan it cannot load.
 */
const STORAGE_KEY = 'harvous-prototype-planner-scope';

type ScopeMap = Record<string, string>;

function readMap(): ScopeMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as ScopeMap) : {};
  } catch {
    return {};
  }
}

/**
 * The stored scope for this church, validated against the plans that actually
 * exist right now. Call it on mount, once `plannableSpaces` has landed.
 */
export function readPlannerScope(
  orgId: string | null,
  plannableSpaceIds: readonly string[],
): string | null {
  if (!orgId) return null;
  const stored = readMap()[orgId];
  if (!stored) return null;
  return plannableSpaceIds.includes(stored) ? stored : null;
}

export function writePlannerScope(orgId: string | null, planSpaceId: string | null): void {
  if (!orgId || typeof window === 'undefined') return;
  try {
    const map = readMap();
    if (planSpaceId) map[orgId] = planSpaceId;
    else delete map[orgId];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
