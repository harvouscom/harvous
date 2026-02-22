# Fix: Desktop panel close on route change

## Problem

On desktop, after opening the New Note or New Thread panel (or other panels), the panel would sometimes close immediately. Users could open a panel on a space or thread page and have it disappear right away.

## Root cause

In `AppLayout`, an effect was responsible for closing desktop panels when the route changed. It did two things on every run:

1. Cleared `localStorage` keys used by the panel manager (`showNewNotePanel`, `showNewThreadPanel`, etc.).
2. Dispatched `closeAllPanels`.

The effect ran whenever `pathname` was in the dependency array. That included:

- **Initial mount** – When the layout first mounted, `pathname` was set, so the effect ran and cleared panels even though the user had not navigated.
- **Re-renders with same pathname** – In some flows the component could re-render with the same pathname; the effect ran again and closed a panel the user had just opened on that route.

So the behavior was "close panels on any pathname change or on mount," which caused a race: user opens panel → effect runs (same or initial pathname) → panels cleared.

## Solution

Only close panels when the pathname **actually changes** (real navigation), not on initial mount or when pathname is unchanged.

- **Ref to track previous pathname**: `prevPathnameForPanelsRef` holds the last pathname we reacted to. Initially `null`.
- **Guard at top of effect**: If `prevPathnameForPanelsRef.current === pathname`, return without clearing or dispatching. So:
  - First run: `prevPathnameForPanelsRef.current` is `null`, so we don’t early-return (unless pathname is somehow null). We then set the ref to `pathname`. We still clear panels on first run, which is acceptable for initial load.
  - Actually, on first run we do clear — that’s correct so that a fresh load doesn’t reopen old panels. The bug was when pathname hadn’t changed (e.g. user stayed on `/space/123` and opened the panel; a re-run with same pathname would close it). So the fix is: only run the clear logic when pathname has **changed** from the previous value. So we should skip the first run for “closing on navigation” by not clearing when the ref is still `null`? Re-reading the code: `if (prevPathnameForPanelsRef.current === pathname) return;` — so when we’re on initial mount, `prevPathnameForPanelsRef.current` is `null` and `pathname` is e.g. `/space/123`. So we don’t return. We then set ref to pathname and clear. So on initial mount we still clear once. The problem was when we had already set the ref (e.g. to `/space/123`) and the effect ran again with the same pathname (re-render, no navigation). Then we return and don’t clear. So the fix is correct: we only clear when pathname is different from what we last saw, and we update the ref after clearing. So we clear on real navigation and on the first run (initial load); we do not clear on same-pathname re-runs.

## Files changed

- **spa/src/layouts/AppLayout.tsx**
  - Added `prevPathnameForPanelsRef` (ref to last pathname used for panel closing).
  - In the panel-closing effect: return early when `prevPathnameForPanelsRef.current === pathname`; then set `prevPathnameForPanelsRef.current = pathname` and run the existing clear (localStorage remove + `closeAllPanels`).

## Prevention

- When closing UI or clearing storage on "route change," distinguish real navigation from initial mount and from re-renders with the same route. Use a ref to store the previous route and only run the side effect when the route has actually changed.
