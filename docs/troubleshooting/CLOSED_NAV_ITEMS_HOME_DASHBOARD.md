# Closed navigation threads reappearing on Home / dashboard

## Symptoms

- User dismisses threads from the desktop persistent nav on **Home** (`/` or dashboard); after a short time or refresh, dismissed threads come back.
- Often reported as “only Home” or “only dashboard”; **space** views seemed fine.

## Root cause (2026)

`addToNavigationHistory` in [`src/components/react/navigation/NavigationContext.tsx`](../../src/components/react/navigation/NavigationContext.tsx) used to call **`removeFromClosedItems(item.id)`** unconditionally at the start of every add/update.

That function is invoked from many **non-navigation** paths:

- `NavigationColumn` effect syncing `activeThread` (including when **`noteCount`** changes from React Query refetches)
- `handleNoteCreated` / note-thread handlers
- `ThreadPage` / `NotePage` window shims
- Other internal callers

Each call **cleared the closed list for that thread id**, so dismissed threads were treated as “reopened” without the user actually navigating to them.

## Why it looked Home-only

[`PersistentNavigation.tsx`](../../src/components/react/navigation/PersistentNavigation.tsx) scopes visible pills by route:

- **Space page**: `openedInSpaceIds` must include that space id — many threads never match.
- **Home**: `openedInSpaceIds` must include **`null`** (opened from Home) — most threads match.

So the same bug (thread removed from `harvous-closed-navigation-items`) was **much more visible** on Home than inside a specific space.

## Correct behavior

- **`saveNavigationHistory`** strips any thread id that is still listed in `harvous-closed-navigation-items`, so an `addToNavigationHistory` that tries to persist a row **must** clear that id first when the user is actually viewing that thread—otherwise the save drops the row and persistent nav looks empty.
- **`addToNavigationHistory`** calls **`removeFromClosedItems(item.id)`** only when **`viewingThisThread`** matches **`trackNavigationAccess`**’s `isCurrentlyActive` rules: `item.id === getCurrentActiveItemId()` or (on a `/note/…` page, `item.id` is a `thread_` id). Background callers that pass a different thread id (e.g. stale refetch) do **not** clear closed state.
- **`trackNavigationAccess`** still performs its own `removeFromClosedItems` where appropriate when DOM-based tracking runs.

## Regression (2026): empty nav after “remove unconditional reopen”

Removing **`removeFromClosedItems`** from **`addToNavigationHistory`** entirely fixed spurious reopens from background sync, but **`saveNavigationHistory`** then **removed** every newly added row whose id was still in the closed list—including the thread the user had navigated to when **`trackNavigationAccess`** did not run first (e.g. SPA / missing DOM). Persistent pills disappeared on Home and spaces.

**Fix:** restore **`removeFromClosedItems(item.id)`** inside **`addToNavigationHistory`**, guarded by **`viewingThisThread`** as above—not unconditional.

Persistence still strips closed rows on save via **`saveNavigationHistory`** (closed-id filter), and the sidebar has extra defense via **`permanentlyClosedIds`** reading `harvous-closed-navigation-items`.

## Related storage keys

| Key | Role |
|-----|------|
| `harvous-navigation-history-v2` | Raw history blob (threads + spaces for switcher) |
| `harvous-closed-navigation-items` | String[] of dismissed ids |
| `harvous-recently-closed-items` | Session-only; short window to avoid races on close (see `NavigationColumn` + `PersistentNavigation`) |

Earlier investigations also addressed **localStorage vs sessionStorage** consistency for those keys; those fixes remain useful for quota/split-brain edge cases but were not the primary Home-only symptom.

## Related docs

- [`NAVIGATION_HISTORY_PERSISTENCE_LESSONS.md`](../NAVIGATION_HISTORY_PERSISTENCE_LESSONS.md) — timing and localStorage writes around new notes
- [`PERSISTENT_NAVIGATION_DEBUG.md`](./PERSISTENT_NAVIGATION_DEBUG.md) — older close-icon / duplication notes (partially superseded by SPA + context)

## If this regresses

1. Confirm `addToNavigationHistory` only calls `removeFromClosedItems` when **`viewingThisThread`** is true (same logic as `trackNavigationAccess` `isCurrentlyActive`).
2. Grep for `removeFromClosedItems(` — expect `addToNavigationHistory`, `trackNavigationAccess`, and other explicit flows (not unguarded on every internal sync).
3. Inspect `harvous-closed-navigation-items` in DevTools Application tab after dismissing; dismissed ids should remain until you navigate to that thread again.
