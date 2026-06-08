# Classic → new.harvous.com migration

How existing Classic SPA users move to the 2.0 web prototype without export/import.

**See also:** [native-prototype/NATIVE_2_0_PLATFORM_STRATEGY.md](./native-prototype/NATIVE_2_0_PLATFORM_STRATEGY.md), [PROTOTYPE_2_0_ARCHITECTURE.md](./PROTOTYPE_2_0_ARCHITECTURE.md)

---

## Decision: organizational threads → folders only (Option 1)

**Decided:** Classic colored thread piles map to **folder/collection labels** on notes (`primaryCollection`, `secondaryCollections`). They do **not** auto-create `NoteConnections` graph edges.

Prototype **Threads** sidebar (connected-note study chains) remains for intentional note-to-note links via Connect.

| Classic concept | 2.0 surface | Mechanism |
|-----------------|-------------|-----------|
| Thread pile title | Folder label (primary pinned) | `backfill-collections-from-threads` / per-user API |
| Multi-thread membership | Secondary folders | Same backfill (secondaries may auto-update from content) |
| Highlight parent link | Connected thread | `linkedFromNoteId` → `NoteConnections` |
| Highlights / study rows | Highlights sidebar | Already shared (`StudyThreadEntries`) |

---

## User experience

1. Sign in on `new.harvous.com` with the **same Clerk account** — same Postgres rows, no file import.
2. **First prototype session:** silent `POST /api/user/migrate-to-prototype` (thread titles → folders; parent links → graph).
3. If folders were created from thread titles, a **one-time banner** explains Folders vs Connected Threads.
4. All notes appear in the **Notes** list immediately; organization appears in **Folders** after backfill.

Classic thread pages remain on `app.harvous.com` (not `/prototype`) until host cutover. Early adopters use `new.harvous.com`.

---

## Data preservation (non-negotiable)

Migration is **additive only** for users still on Classic:

- **Creates** missing `NoteThreads` rows when `Notes.threadId` already points at a real thread (restores Classic thread lists).
- **Sets** `primaryCollection` / `secondaryCollections` only when `primaryCollection IS NULL` and no manual folder override.
- **Never deletes** thread rows, **never overwrites** existing folder labels, **never changes** `Notes.threadId` during folder backfill.
- Classic UI reads `NoteThreads`; pre-provisioning folder labels on Classic-only users does not change their experience until the 2.0 shell is default.

Per-user migration runs from [`SimplifiedPrototypeLayout`](../spa/src/layouts/SimplifiedPrototypeLayout.tsx) via [`ProtoMigrationProvider`](../spa/src/layouts/proto-migration-context.tsx). Server `needsCollectionBackfill` is authoritative; `localStorage` done flag is a cache hint only.

---

## Schema prerequisites (production)

Before rollout, apply Drizzle schema to Supabase:

```bash
npm run db:push
```

Required objects:

- Table **`NoteConnections`**
- Columns on **`Notes`:** `studyThreadTitle`, `studyThreadUserOverride`, `studyThreadPinned`, `studyThreadLastAutoSuggestedAt`
- Collection columns (already on Classic): `primaryCollection`, `secondaryCollections`, `collectionPinned`

Backfill sets **`collectionPinned: true`** on the migrated **primary** folder so open/edit auto-suggest cannot replace a Classic thread title. Secondary folders from other thread memberships are not pinned and may still refresh from note content.

Verify locally:

```bash
npm run db:check
```

---

## Backfill mechanisms

### Per-user (automatic on first prototype visit)

| Endpoint | Role |
|----------|------|
| `POST /api/user/migrate-to-prototype` | Idempotent: folders + `NoteConnections` from `linkedFromNoteId` |
| `GET /api/user/migrate-to-prototype/status` | Whether folder backfill may still be needed |

Implementation: [server/utils/prototype-user-migration.ts](../server/utils/prototype-user-migration.ts)

Client: [`ProtoMigrationProvider`](../spa/src/layouts/proto-migration-context.tsx) runs `POST /api/user/migrate-to-prototype` on prototype layout mount when `GET /status` reports `needsCollectionBackfill`. [`PrototypeMigrationBanner`](../spa/src/pages/prototype/PrototypeMigrationBanner.tsx) is informational only (folders vs connected threads).

### Admin batch (optional pre-launch)

```bash
# Staging dry-run — point .env at target Supabase
npx tsx server/scripts/backfill-collections-from-threads.ts --dry-run

# Production (all users)
npx tsx server/scripts/backfill-collections-from-threads.ts

# Single user
npx tsx server/scripts/backfill-collections-from-threads.ts --userId=user_xxx

# Repair pins on notes already backfilled before pin support shipped
npx tsx server/scripts/backfill-collections-from-threads.ts --repair-pins --dry-run
npx tsx server/scripts/backfill-collections-from-threads.ts --repair-pins
```

`--repair-pins` targets notes whose `primaryCollection` matches their Classic `threadId` title but `collectionPinned` is still false. Safe to run idempotently after deploy.

Legacy endpoint (connections only): `POST /api/notes/migrate-connections`

---

## Sync / offline

`NoteConnections` are included in:

- `GET /api/sync/bootstrap` → `noteConnections[]`
- `GET /api/sync/changes` → `noteConnections[]` (by `createdAt`)

Offline IndexedDB (Dexie v4): `noteConnections` table in [src/utils/offline-db.ts](../src/utils/offline-db.ts).

---

## What is not migrated

- Classic **`Threads` / `NoteThreads` rows** — kept as hidden plumbing (`thread_unorganized` sentinel); not shown in 2.0 UI.
- Thread co-membership → **not** synthesized into `NoteConnections` (Option 2 rejected).
- Multi-space sidebar scope — prototype still lists **My Home** only (see [SIMPLIFIED_WEB_PROTOTYPE.md](./SIMPLIFIED_WEB_PROTOTYPE.md)).

---

## Rollout checklist

- [ ] `npm run db:push` on production Supabase
- [ ] Dry-run `npx tsx server/scripts/backfill-collections-from-threads.ts --dry-run` — confirm zero overwrites of existing `primaryCollection`
- [ ] Optional: batch backfill before host cutover (safe for Classic-only users); `GET /api/admin/check-link-integrity?dryRun=true` for junction repair preview
- [ ] Deploy API + SPA with layout-mount migration (`ProtoMigrationProvider`)
- [ ] Smoke-test Classic user on app.harvous.com: thread notes visible; note content unchanged
- [ ] Smoke-test prototype: folders match thread titles; `collectionPinned` on migrated primaries
- [ ] Host cutover: set `DEDICATED_PROTOTYPE_HOST` to `app.harvous.com` in [`src/lib/prototype-path.ts`](../src/lib/prototype-path.ts); sunset Classic `/thread` routes
- [ ] Communicate: thread piles → folders; Threads = connected notes
