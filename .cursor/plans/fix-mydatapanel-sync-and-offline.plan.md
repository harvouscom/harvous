# Fix My Data "Not yet synced" and offline sync

## Root cause: offline sync never runs

**SyncManagerIsland is never rendered in the production SPA.** It exists in [src/components/react/SyncManagerIsland.tsx](src/components/react/SyncManagerIsland.tsx) and calls `initializeSync(userId)` (bootstrap + `startBackgroundSync`), but nothing in [spa/](spa/) imports or mounts it. So:

- Bootstrap never runs → no sync state row (or row with null timestamps) in IndexedDB
- `getSyncState(userId)` returns `null` or a row with no `lastSyncTimestamp` / `lastBootstrapTimestamp`
- My Data panel always shows "Not yet synced" because there is no timestamp to display

The last sync date is only set when:

- [sync-manager.ts](src/utils/sync-manager.ts) `applyBootstrapData()` runs (lines 316–323), or
- `applyIncrementalChanges()` runs after a pull (lines 411–416)

Both happen only after `initializeSync` → `bootstrapSync()` or `syncNow()` runs, which today only happens if SyncManagerIsland is mounted.

## Fix 1: Mount SyncManagerIsland so offline sync runs

Mount [SyncManagerIsland](src/components/react/SyncManagerIsland.tsx) in the authenticated app so that:

1. On load (when signed in), `initializeSync(userId)` runs: bootstrap (or incremental sync) runs and writes `lastSyncTimestamp` / `lastBootstrapTimestamp` to IndexedDB.
2. Background sync runs every 5 minutes and on tab visibility/online.
3. My Data panel’s `getSyncState(userId)` will then return a row with timestamps and show "All synced as of …".

**Where to mount:** In [spa/src/layouts/AppLayout.tsx](spa/src/layouts/AppLayout.tsx), which is the authenticated layout and already has `useUser()` and `isLoaded` / `isSignedIn`. Add:

- Import: `import SyncManagerIsland from '@/components/react/SyncManagerIsland';`
- Render once when signed in: `{isLoaded && isSignedIn && user?.id && <SyncManagerIsland userId={user.id} />}`

Place it near other app-shell elements (e.g. after the redirect effect, before or after ReferralCreditInit if present). SyncManagerIsland is designed to run once per session and sets `window.__harvous_userId` and `persistUserId`; it does not render visible UI unless OfflineIndicator is shown, so it is safe to mount in the layout.

**Note:** [spa/src/App.tsx](spa/src/App.tsx) already has `UserIdSync` which sets `window.__harvous_userId` and `localStorage.setItem('harvous-user-id', user.id)`. SyncManagerIsland uses `persistUserId` (which writes `harvous_userId`). Both are fine; SyncManagerIsland will reinforce the same userId and start sync.

## Fix 2 (optional): My Data panel UX

So that the panel doesn’t show "Not yet synced" while the first sync is still loading or in progress:

1. **Loading state:** After mounting with `userId`, the first `checkSyncStatus()` is async. Add a small state (e.g. `hasCheckedSyncOnce`) and show something like "Checking sync…" until the first check completes, then show "Not yet synced" only when we’ve actually read state and there’s no timestamp.
2. **Syncing state:** If `syncState?.isSyncing === true` and there’s no timestamp yet, show "Syncing…" instead of "Not yet synced" in [MyDataPanel.tsx](src/components/react/MyDataPanel.tsx) (footer message logic around lines 109–114).

## Files to change

- **[spa/src/layouts/AppLayout.tsx](spa/src/layouts/AppLayout.tsx):** Import and render `<SyncManagerIsland userId={user.id} />` when `isLoaded && isSignedIn && user?.id`.
- **[src/components/react/MyDataPanel.tsx](src/components/react/MyDataPanel.tsx):** (Optional) Add `hasCheckedSyncOnce` and "Syncing…" so the footer reflects loading and in-progress sync.

## Summary

| Issue | Cause | Fix |
|-------|--------|-----|
| No last sync date | Sync never runs (SyncManagerIsland not mounted) | Mount SyncManagerIsland in AppLayout when signed in |
| "Not yet synced" before first check / during bootstrap | No loading/syncing state in footer | Optional: "Checking sync…" and "Syncing…" in MyDataPanel |

Implementing Fix 1 is sufficient for you to see the last sync date once bootstrap (or incremental sync) has run. Fix 2 improves the UX while that first sync is in progress.
