# Cross-platform sync (Mac, iOS, web prototype)

## Symptom

Notes created on one device do not appear on another; folder counts look stale; "Refresh from server" seems required or ineffective. UI freezes (beachball) during login or editing with large libraries.

## Most common cause: different API backends

| Xcode scheme | API target | Pairs with |
|--------------|------------|------------|
| **Debug** (default) | `http://localhost:3001` (Mac) / LAN IP (device) | Local `npm run dev` + web with `VITE_API_BASE_URL=http://localhost:3001` |
| **Debug-Prod** | `https://app.harvous.com` | Production `/prototype` on app.harvous.com |
| **Release** | `https://app.harvous.com` | Production |

If Mac uses **Debug** while web uses **production**, they are different databases. The Mac note will never show on web until Mac uses Debug-Prod (or Release) and uploads to production.

Native shows an orange footnote under Settings → My Data → Sync when connected to local dev. Web prototype Settings → My Data shows the active server URL and scheme guidance.

## Verification checklist (production)

1. Mac: **Harvous_macOS (Debug-Prod)** (or Release).
2. iPhone: **Harvous_iOS (Debug-Prod)** (or Release). Plain Debug cannot run full "Refresh from server" against production.
3. Web: `https://app.harvous.com/prototype` (same Clerk user).
4. Create a note on Mac — upload within ~2s; web sidebar should update within ~1–3s on other devices when **Supabase Realtime** is configured (see [SUPABASE_REALTIME_SETUP.md](../SUPABASE_REALTIME_SETUP.md)). Without Realtime env vars, expect ~10s native pull or tab-focus refetch on web.
5. Delete on web — Mac/iOS lists should update after Realtime pull (~0.5s debounce) or background sync / tab focus.

## Supabase Realtime (Phase 1)

When `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (API) and `VITE_SUPABASE_*` / `HARVOUS_SUPABASE_*` (clients) are set, the API broadcasts `invalidate` on channel `sync-{userId}` after writes. Web runs `useRealtimeSync` (React Query + optional IndexedDB `syncNow`); native runs `HarvousRealtimeSync` → `scheduleRealtimePull()` (~500ms). Requires Clerk JWT template **`supabase`** for client subscribe. Setup: [SUPABASE_REALTIME_SETUP.md](../SUPABASE_REALTIME_SETUP.md).

## Structural behavior (native)

- **`markDirty()`** → debounced **upload only** (~1.5s), then **pull only if upload succeeded** (~10s later). Avoids re-ingesting the full library on every autosave.
- **Realtime invalidation** → debounced **pull only** (~500ms), without flush.
- **Sign-in / foreground** → explicit flush → pull → flush; cancels any pending debounced scheduler work first.
- **Deletes** → `scheduleFullSync()` (flush → pull → flush).
- **Large libraries** → `ingestBootstrap` processes notes in chunks with `Task.yield()` between chunks; sign-in bootstrap with `notesTruncated` chains into `/api/sync/changes` paging until `hasMore` is false.
- **Editor** → `onChange(of: note?.updatedAt)` skips reload while autosave is pending or during note transition.

## Structural behavior (web prototype)

- Sidebar uses React Query (`useSpaceNotes`), not IndexedDB.
- Offline sync: `triggerImmediateSync` is **push-only** (2s debounce); dispatches `harvousRemoteSyncCompleted` after a successful push so prototype lists refetch without a full IndexedDB pull.
- **`/prototype` shell:** `initializeSync` does not run (no bootstrap into IndexedDB on load). Cross-device updates use **`useRealtimeSync`** when configured, plus React Query (`staleTime` refetch, tab visibility, and debounced `refreshPrototypeLists` when another tab completes offline push). Use **Prototype → Data → Refresh from server** for a full cache clear.
- Background `syncNow` (5m) + tab visibility still run full pull for IndexedDB.
- Returning to `/prototype` refetches active space/navigation queries.

## Incremental sync

`/api/sync/changes` may return `hasMore`; native and web clients page until complete. Deletions arrive via `deletedNoteIds` tombstones (`SyncDeletedEntities` table).

## Performance notes

- Login or foreground sync with 100+ notes may still take a few seconds while ingest runs, but should remain responsive (chunked ingest).
- If the beachball persists, check Console for repeated sync loops or `onChange` warnings.

## Database: deletion tombstones

If `GET /api/sync/changes` returns 500 with `relation "SyncDeletedEntities" does not exist`, run `npm run db:push` on the active Supabase project, then retry.

To investigate notes that vanished cross-device, list recent tombstones:

```bash
npx tsx server/scripts/list-recent-deleted-notes.ts --userId=user_xxx --hours=48
```

On native Mac, filter Console.app for `DeleteAudit` or `Sync prune note` to see local delete triggers (`autoSwitch`, `menu`, `swipe`, `syncPrune`).

Pending native tombstones (not yet flushed to server) live in UserDefaults key `harvous.tombstones.v1`.

## Related

- [native/Harvous/CLERK_SETUP.md](../../native/Harvous/CLERK_SETUP.md) — schemes and sync
- [SUPABASE_REALTIME_SETUP.md](../SUPABASE_REALTIME_SETUP.md) — Realtime env + Clerk JWT template
- [PROTOTYPE_AW_SNAP_ERROR_5.md](./PROTOTYPE_AW_SNAP_ERROR_5.md) — prototype tab crashes (separate from sync correctness)
