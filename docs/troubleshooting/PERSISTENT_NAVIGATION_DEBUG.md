# Persistent navigation — troubleshooting

Operational notes for **space-scoped sidebar history**, **close + redirect**, and **Home-only threads** (onboarding welcome thread, My Pile). Production UI lives in the **React SPA** + shared components under `src/components/react/navigation/`.

## Architecture (current)

| Concern | Where it lives |
|--------|----------------|
| History blob, add/remove/close, migrations | [`src/components/react/navigation/NavigationContext.tsx`](../../src/components/react/navigation/NavigationContext.tsx) |
| Desktop pills + filter + close | [`src/components/react/navigation/PersistentNavigation.tsx`](../../src/components/react/navigation/PersistentNavigation.tsx) |
| Mobile sheet + filter + close | [`src/components/react/navigation/MobileNavigation.tsx`](../../src/components/react/navigation/MobileNavigation.tsx) |
| URL-only space for history merge (no storage fallback) | [`src/utils/current-space-for-links.ts`](../../src/utils/current-space-for-links.ts) — `getSpaceIdForImplicitHistoryScope` |
| Thread page → history sync | [`spa/src/pages/ThreadPage.tsx`](../../spa/src/pages/ThreadPage.tsx) (`addToNavigationHistory` via `window`) |

**localStorage keys**

| Key | Purpose |
|-----|---------|
| `harvous-navigation-history-v2` | Raw history (threads + space rows used by switcher) |
| `harvous-closed-navigation-items` | IDs dismissed from persistent nav |
| `harvous-selected-space-id` | Last space selection (can lag URL; see below) |
| `harvous-nav-repair-home-only-v1` | One-time flag: bad `openedInSpaceIds` on Home-only threads were scrubbed |

## `openedInSpaceIds` and multi-space threads

Each history row for a thread can list **where the user has opened that thread** for sidebar purposes: `null` = **Home** (dashboard / no space in URL), `space_*` = that space.

- **`addToNavigationHistory`** merges explicit caller scopes with **`getSpaceIdForImplicitHistoryScope()`** (URL `?space=` or `/space/...` only — **not** `harvous-selected-space-id`) so stale storage does not attach the wrong space when the URL has no space.
- **`removeFromNavigationHistory`** with **`fromSpaceId`** (from desktop/mobile close) **strips one scope** when the thread is still open elsewhere; otherwise it removes the row and uses the standard close + neighbor redirect path.

Related: [Closed nav items on Home / dashboard](./CLOSED_NAV_ITEMS_HOME_DASHBOARD.md) (dismissed rows vs `removeFromClosedItems`).

## Thread / note routes: URL-only filter and close scope

On **`/thread/...`** and **`/note/...`**, **`spaceIdForFilter`** and **`spaceIdForClose`** must **not** fall back to `harvous-selected-space-id` when there is no `?space=` in the URL.

**Why:** Home-only rows (`openedInSpaceIds: [null]`) — onboarding thread, My Pile — would disappear from the sidebar and close would use the wrong scope if we used a stale “last selected space” while the URL had no space. That looked like “onboarding missing” or “cannot close from nav.”

**Policy:** On thread/note pages without `?space=`, treat the view as **Home** for filtering and for `fromSpaceId` (null). Space pages and explicit `?space=` still scope correctly.

## Home-only threads (`thread_unorganized`, `thread_onboarding_*`)

These threads **cannot** belong to a space in the product model, but older scope-merging could still **`openedInSpaceIds`** with real `space_*` values (e.g. from implicit scope + storage bugs). Symptoms:

- Onboarding or My Pile **appeared in every space’s** sidebar.
- **Close** only stripped one scope at a time → felt “unable to close” or required closing once per space.

**Invariants (code):**

- **`isHomeOnlyThread(id)`** in `NavigationContext.tsx` — true for `thread_unorganized` and ids starting with `thread_onboarding_`.
- **`addToNavigationHistory`** forces **`openedInSpaceIds: [null]`** and **`openedInSpaceId: null`** for those ids (no space accumulation).
- **`removeFromNavigationHistory`** **skips** the partial strip branch for Home-only threads; they always get a **full** close (same as normal dismiss).
- **One-time repair** on load: if `harvous-nav-repair-home-only-v1` is unset, any Home-only row with non-Home scopes is rewritten to `[null]` and the flag is set.

If you need to **re-run** the repair after manual testing, clear `harvous-nav-repair-home-only-v1` in devtools and reload once.

## Quick diagnostics (browser console)

```js
// Raw history (includes space rows)
JSON.parse(localStorage.getItem('harvous-navigation-history-v2') || '[]');

// Dismissed ids
JSON.parse(localStorage.getItem('harvous-closed-navigation-items') || '[]');

// Find onboarding / My Pile scopes
JSON.parse(localStorage.getItem('harvous-navigation-history-v2') || '[]')
  .filter((r) => r?.id === 'thread_unorganized' || String(r?.id).startsWith('thread_onboarding_'))
  .map((r) => ({ id: r.id, openedInSpaceIds: r.openedInSpaceIds, openedInSpaceId: r.openedInSpaceId }));
```

Expect Home-only threads: **`openedInSpaceIds: [null]`** only (after repair / any new add).

## Related docs

- [Closed nav items on Home / dashboard](./CLOSED_NAV_ITEMS_HOME_DASHBOARD.md) — closed list vs `addToNavigationHistory` / `viewingThisThread`
- [Active space changes unexpectedly](./ACTIVE_SPACE_CHANGES_UNEXPECTEDLY.md) — `harvous-selected-space-id` vs URL; why “active space” can move without the switcher
- [Navigation history persistence lessons](../NAVIGATION_HISTORY_PERSISTENCE_LESSONS.md) — synchronous localStorage around new-note flows

## Close control vs link (RecentSearches)

Persistent nav close uses React **`badgeClose`** on [`SpaceButton`](../../src/components/react/navigation/SpaceButton.tsx) and calls **`removeFromNavigationHistory`** directly (no document-level capture listener). For a **different** close-inside-link issue, see [Close Icon Troubleshooting](./CLOSE_ICON_TROUBLESHOOTING.md) (`RecentSearches`).
