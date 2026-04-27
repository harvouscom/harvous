# Multi-space thread: wrong space context or close feels stuck

**Area:** Web SPA left rail (persistent navigation), `?space=` on `/thread/*` and `/note/*`, navigation history in `localStorage`.

## Problem

- A thread that exists in **more than one** space appears tied to the **first** space you opened it from (shell label, scope, or history).
- The **close** control on a persistent thread pill (desktop left rail) may seem to do nothing, navigate oddly, or only behave correctly in one space.

## Mental model

- On thread and note routes, **`?space=space_…`** in the URL is the primary signal for “which space you opened this from.”
- **Close** on a thread in the left rail is **space-scoped**: it uses the current URL’s `?space=` as `fromSpaceId` (not the space switcher’s stored id alone). See [`PersistentNavigation` — `spaceIdForClose`](../../src/components/react/navigation/PersistentNavigation.tsx) (derived from `liveSearch` on thread/note routes).
- Persistent nav history stores, per thread id, an `openedInSpaceIds` list (and legacy `openedInSpaceId`). Space-scoped close **strips** the matching scope from that list. See [`removeFromNavigationHistory`](../../src/components/react/navigation/NavigationContext.tsx) (space-scoped thread branch) and [Persistent Navigation Debug](./PERSISTENT_NAVIGATION_DEBUG.md).
- “Implicit” URL scope for history merges (without falling back to storage) uses [`getSpaceIdForImplicitHistoryScope`](../../src/utils/current-space-for-links.ts); that avoids leaking a stale `harvous-selected-space-id` when the URL has no `?space=`.

## Root cause (stale ref)

If code snapshots `?space=` (or `?thread=` on notes) into a `ref` only when **the thread id or note id** changes, the snapshot stays on the **first** open. Then:

- History can record **openedInSpaceIds** that do not include the **current** URL space.
- Close tries to strip the **current** `fromSpaceId` (from the URL). If that id was never recorded in `openedInSpaceIds`, the partial strip is a no-op; behavior depends on the full-remove path, which feels wrong or “stuck.”

**Fix (application code):** Re-capture URL space when the **search** context changes for the same thread/note—implemented in `ThreadPage`, `NotePage`, and `NavigationColumn` (`spaceIdForHistoryRef` + `addToNavigationHistory` effect deps) so history and close stay aligned.

## What to check when debugging

1. **Full URL** in the address bar, especially `?space=` and on notes `?thread=`.
2. **localStorage** key `harvous-navigation-history-v2` (raw array): find the `thread_…` entry and inspect `openedInSpaceIds` and `openedInSpaceId`. Compare with the URL’s space.
3. **Selected space** in storage: `harvous-selected-space-id` (can differ from URL; see [Active space changes unexpectedly](./ACTIVE_SPACE_CHANGES_UNEXPECTEDLY.md)).
4. Broader nav behavior: [Persistent Navigation Debug](./PERSISTENT_NAVIGATION_DEBUG.md).
5. Product context and link-building rules: [Open in current space — fixes and gaps](../fixes/04-open-in-current-space.md).

## Prevention (for future changes)

- Any `useEffect` that copies `?space=` or `?thread=` from `window` or the router into a ref should list **search-driven dependencies** (or a stable `urlSpaceId` / `urlThreadId` from `useMemo`) whenever the same route can change query params without changing path segment id.
- Prefer the same search resolution as [`routeSelectedSpaceId` / `getSpaceIdForImplicitHistoryScope`](../../src/utils/current-space-for-links.ts) for thread/note scope.
