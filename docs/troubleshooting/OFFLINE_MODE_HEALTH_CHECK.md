# Offline Mode Health Check (Web SPA)

**Date:** July 3, 2026  
**Scope:** Prototype shell at `/` on localhost / app.harvous.com (not native iOS).

This report combines a code/architecture audit, unit-test verification, programmatic scenario tests, and an attempted Playwright browser pass. Use it to decide what to fix first.

---

## Executive summary

**Verdict:** Offline mode is **solid for core note CRUD, tags, folder moves, highlights, pin, and the study-thread connect graph**, with good low-level test coverage. Remaining gaps are narrower: sharing, by-name tag removal, study-thread title/member-order edits, and folder-registry labels.

| Area | Status |
|------|--------|
| Note create / edit / delete offline | Good |
| Tag add offline | Good |
| Tag remove offline | Partial (by-name without `tagId` not queued) |
| Thread+note create offline | Good (queue + sync) |
| Folder assignment offline | **Fixed** (July 2026) — collection fields queued via `useUpdateNote` |
| Highlights (`useCreateHighlight` / `useUpdateHighlight` / `useDeleteHighlight`) | **Fixed** (July 2026) — queued via `studyThreadEntry` sync entity |
| Pin (`usePinSpaceNote`) | **Fixed** (July 2026) — queued via note `update` with `isPinned` |
| Study-thread connect graph (`useConnectNote` / `useDisconnectNote` / `useRemoveNoteFromThreadCluster`) | **Fixed** (July 2026) — queued via new `noteConnection` sync entity |
| Share, study-thread title/member-order, folder registry | **Not supported** offline |
| Sync chip UX | Good (offline / Saving / error + Retry) |
| Orphan `noteThread` queue ops | **Fixed** (July 2026) |
| Bloated queue recovery (>100 ops) | Works but **silently drops all unsynced work** |

---

## Architecture (prototype shell)

The prototype is **online-first for reads**, **offline-capable for writes**:

```
User action → React Query mutation
  → online: POST /api/...
  → offline (fetch throws / navigator.onLine false):
       offline-mutations.ts → IndexedDB row + syncQueue
       → triggerImmediateSync (2s debounce) → pushQueue → POST /api/sync/push
```

- **Reads:** React Query against the server. [`src/utils/offline-read-layer.ts`](../src/utils/offline-read-layer.ts) is **not imported by `spa/`** — intentional; IDB exists for the write queue, not list/detail rendering.
- **Sync init:** [`src/utils/sync-init.ts`](../src/utils/sync-init.ts) — prototype runs **push-only** (no bootstrap/pull into IDB on load).
- **UI:** [`spa/src/components/PrototypeSyncChip.tsx`](../spa/src/components/PrototypeSyncChip.tsx) via [`spa/src/hooks/useSyncQueueStatus.ts`](../spa/src/hooks/useSyncQueueStatus.ts). Classic [`OfflineIndicator`](../src/components/react/OfflineIndicator.tsx) is hidden on prototype (`hideOfflineIndicator` in [`SimplifiedPrototypeLayout.tsx`](../spa/src/layouts/SimplifiedPrototypeLayout.tsx)).

---

## What’s already solid

1. **Always-on offline mode** — [`src/utils/offline-mode.ts`](../src/utils/offline-mode.ts) returns `true` (no feature-flag risk).
2. **Dexie schema + sync queue** — dependency-ordered push (space → thread → note → noteThread → noteConnection → studyThreadEntry → tag → noteTag), batched at 50 ops, idempotent `clientMutationId`.
3. **Core mutations wired:** `useCreateSimpleNote`, `useUpdateNote`, `useDeleteNote`, `useAddTagToNote`, `useRemoveTagFromNote` (partial), `useCreateHighlight`, `useUpdateHighlight`, `useDeleteHighlight`, `usePinSpaceNote`, `useConnectNote`, `useDisconnectNote`, `useRemoveNoteFromThreadCluster`.
4. **Self-healing:** auto-retry on reconnect; `clearStaleSyncingIfIdle` clears stuck “Saving…” when queue is empty.
5. **Unit tests:** `offline-mutations.test.ts`, `sync-manager.test.ts`, `withOfflineQueue.test.ts`, `prototype-sync-chip-copy.test.ts`, `sync-cache-bridge.test.ts`, plus [`offline-health-scenarios.test.ts`](../src/utils/__tests__/offline-health-scenarios.test.ts).

---

## Browser QA results

### Automated Playwright pass

**Harness:** [`e2e/offline-mode-health.spec.ts`](../../e2e/offline-mode-health.spec.ts) + [`e2e/offline-health-helpers.ts`](../../e2e/offline-health-helpers.ts)

**Run:** `npx playwright test offline-mode-health --workers=1`

**Outcome:** Blocked by **intermittent Clerk password sign-in** in headless Chromium (`Execution context was destroyed` / `Cannot read properties of undefined (reading 'loaded')`). Dev server responded (4322/3001). Re-run locally after a successful manual login session, or use stored auth state.

### Programmatic scenarios (passed)

Same logic as browser tests 2–4 and 6, without auth — [`src/utils/__tests__/offline-health-scenarios.test.ts`](../src/utils/__tests__/offline-health-scenarios.test.ts):

| Scenario | Result |
|----------|--------|
| Thread + note offline → note + noteThread queued | Pass |
| Folder move path → queued op includes `primaryCollection` | Pass |
| Delete-before-sync → orphan `noteThread` create no longer left behind | Pass (confirms fix) |
| Highlight create offline → `studyThreadEntry` create queued | Pass |
| Pin offline → note `update` op includes `isPinned` | Pass |
| Connect notes offline → `noteConnection` create queued | Pass |

### Manual repro steps (when Clerk auth works)

1. **Basic loop:** DevTools → Network → Offline. Start compose (toolbar or `/n/new` → `/`), type a title, blur editor. Chip: “You're offline — saved on this device”. Go online → “Saving…” → “All caught up”. Note appears in sidebar after push; URL idle-replaces to `/{id}`.
2. **Thread create:** Offline → create thread with a note (sidebar “New thread”). Reconnect → note appears under thread.
3. **Folder move:** Offline → move note to folder. Reconnect → folder label should persist on server.
4. **Race:** Offline → create note in thread → delete before reconnect. Inspect IDB `syncQueue` — no orphan `noteThread` create should remain.
5. **Failed sync:** Queue op with `retryCount >= 5` → chip “Couldn't save to the cloud” + Retry.
6. **Pin / highlight / connect:** Offline → pin a note, create a highlight, connect two notes → chip shows offline/saved state, ops appear in IDB `syncQueue` → reconnect → chip drains and changes persist on the server.

---

## Confirmed bugs (fix first)

### 1. Orphaned `noteThread` sync-queue ops — **Fixed (July 2026)**

**Files:** [`src/utils/offline-mutations.ts`](../src/utils/offline-mutations.ts) (`deleteNoteOffline`, `unlinkNoteFromThreadOffline`)

**Was:** Pending note delete/unlink left queued `noteThread` create ops behind.

**Fix:** Cancel pending `noteThread` queue rows and local link rows when deleting an offline-only note before sync, and when unlinking a still-pending link.

### 2. `runOfflineFirst` reports success when durable write fails — **Fixed (July 2026)**

**File:** [`spa/src/hooks/mutations/withOfflineQueue.ts`](../spa/src/hooks/mutations/withOfflineQueue.ts)

**Was:** IndexedDB write failures were logged but caller still got `{ queued: true }`.

**Fix:** Re-throw offline write errors (and the original network error when queueing is impossible) so mutation hooks roll back.

### 3. Server note-update sync op overwrote unrelated fields with `undefined` — **Fixed (July 2026)**

**File:** [`server/routes/sync.ts`](../server/routes/sync.ts) (`processNoteMutation`, `update` branch)

**Was:** The Drizzle `update().set()` payload always included `title`, `content`, `spaceId`, `isPublic`, `isFeatured`, `order` — even when a queued op only intended to change one field (e.g. pin-only). A pin-only sync op would have wiped title/content.

**Fix:** Build the payload as a true partial patch — only fields present on the queued op's `data` are included. This was needed to make pin-offline (below) safe, and hardens every other partial note-update op.

---

## Coverage gaps (by user impact)

### High — silent or misleading data loss

| Hook / flow | Offline behavior |
|-------------|------------------|
| `useAddNotesToFolder` / `useRemoveNoteFromFolder` | **Fixed** — collection fields queued via `useUpdateNote` offline path |
| `useConnectNote` / `useDisconnectNote` / `useRemoveNoteFromThreadCluster` | **Fixed** — queued via new `noteConnection` sync entity |
| `useCreateHighlight` / `useUpdateHighlight` / `useDeleteHighlight` | **Fixed** — queued via `studyThreadEntry` sync entity |
| `usePinSpaceNote` | **Fixed** — queued via note `update` op carrying `isPinned` |
| `useShareNote` | Not queued |

### Medium

| Hook | Gap |
|------|-----|
| `useRemoveTagFromNote` | Remove-by-name without resolved `tagId`: optimistic UI, **nothing queued** |
| `useUpdateStudyThreadTitle` / member order | Not queued |
| Folder registry (`useCreateFolderRegistryLabel`, etc.) | Not queued |

### Low / expected network-only

Visit tracking, scripture reprocess, auto-tags, join/invite/import, profile/church settings.

---

## Sync queue behavior notes

| Topic | Detail |
|-------|--------|
| Retries | Transient failures: `retryCount++` until 5. Permanent: `retryCount = 999`, stays until Retry or wipe. |
| Prototype stale ops | Note update/delete + `not_found` dropped intentionally (server is read source). |
| Bloated queue | `recoverPrototypeSyncQueueIfBloated`: if pending > 100, **entire queue deleted** — unsynced work lost. |
| `simpleNoteId` | Prototype skips bootstrap → offline notes usually `simpleNoteId: null`; server assigns on push. Exhaustion → null (correct). |
| Conflict UI | None — conflicts become permanent failures or stale-op drops. |

---

## Test coverage summary

| File | Covers |
|------|--------|
| `src/utils/__tests__/offline-mutations.test.ts` | CRUD, tags, noteThread on create, coalescing, highlights, pin, connect/disconnect |
| `src/utils/__tests__/sync-manager.test.ts` | Push batching, retries, bloat recovery, `noteConnection`/`studyThreadEntry` dependency order and id-reconciliation |
| `src/utils/__tests__/offline-health-scenarios.test.ts` | Health-check scenarios 2–4 and 6 |
| `spa/src/hooks/mutations/__tests__/withOfflineQueue.test.ts` | `runOfflineFirst` semantics |
| `e2e/offline-mode-health.spec.ts` | Full browser QA (auth-blocked in CI-like run) |

**No Playwright e2e** for offline in default `npm run test:e2e` (join/invite only). The full `npx vitest run` suite (167 files / 1478 tests) is green — the 2 `sync-manager.test.ts` failures noted in an earlier draft of this report were fixed by mocking a non-dedicated prototype host for the "classic route" cases (jsdom's default test hostname, `localhost`, is itself a dedicated prototype host, so pathname alone couldn't simulate a classic route in tests).

---

## Prioritized punch list

### P0 — Correctness (small, do soon)

1. ~~Fix orphan `noteThread` ops on delete-before-sync and pending unlink~~ **Done**
2. ~~Fix `runOfflineFirst` to surface offline write failures~~ **Done**

### P1 — High-impact offline coverage

3. ~~Extend `useUpdateNote` offline path to include `primaryCollection`, `secondaryCollections`, `collectionUserOverride` (fixes folder moves).~~ **Done**
4. ~~Add offline writers + hooks for highlights (`studyThreadEntry`) and pin (`isPinned`).~~ **Done**
5. ~~Wire study-thread connect graph offline: `connectNotesOffline` / `disconnectNotesOffline` / `removeNoteFromThreadClusterOffline` + `noteConnection` sync entity, wired into `useConnectNote` / `useDisconnectNote` / `useRemoveNoteFromThreadCluster`.~~ **Done** (supersedes the originally-planned "wire `linkNoteToThreadOffline`" item — the prototype UI uses the study-thread **graph**, i.e. `NoteConnections`, not the classic `NoteThreads` junction table that `linkNoteToThreadOffline` targets; that function remains unused by prototype UI and is only exercised by legacy/classic-thread tests.)

### P2 — UX and resilience

6. Per-item sync failure detail (which notes failed) — chip is generic today.
7. Revisit bloat recovery: drain in batches instead of wiping entire queue when pending > 100.
8. Add Playwright offline spec to CI once Clerk auth storage state is stable.
9. `useShareNote`, by-name tag removal (no resolved `tagId`), `useUpdateStudyThreadTitle` / member order, and folder-registry label creation remain unqueued offline — lowest-traffic remaining gaps.

### P3 — Architecture clarity

10. Document prototype push-only read strategy in [`docs/future/OFFLINE_MODE_IMPLEMENTATION.md`](../future/OFFLINE_MODE_IMPLEMENTATION.md) (read layer not used in `spa/`).
11. Shared optimistic-update + rollback helper for mutations ([`ARCHITECTURE_READINESS_AUDIT.md`](../design-parity/ARCHITECTURE_READINESS_AUDIT.md) W8).

---

## Related docs

- [OFFLINE_MODE_IMPLEMENTATION.md](../future/OFFLINE_MODE_IMPLEMENTATION.md) — architecture reference
- [CROSS_PLATFORM_SYNC.md](./CROSS_PLATFORM_SYNC.md) — prototype push-only sync behavior
- Run browser QA: `npx playwright test offline-mode-health --workers=1`
- Run programmatic scenarios: `npx vitest run src/utils/__tests__/offline-health-scenarios.test.ts`
