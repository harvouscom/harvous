# Phase 0 — Data-model ADR (cross-platform sync foundation)

**Status:** Accepted (2026-06-10)
**Scope:** The Phase 0 row of [NATIVE_2_0_PLATFORM_STRATEGY.md §6](./NATIVE_2_0_PLATFORM_STRATEGY.md#6-phased-roadmap-options-not-mandates) — *"Canonical `userId`; note body format; sentinel `threadId` + folders; study id rules."*
**Resolves:** The open decisions in [native/docs/future/NATIVE_WEB_DATA_MODEL_GAP.md](../../native/docs/future/NATIVE_WEB_DATA_MODEL_GAP.md) and the "cross-cutting / roadmap-blocking" table in [design-parity/ARCHITECTURE_READINESS_AUDIT.md](../design-parity/ARCHITECTURE_READINESS_AUDIT.md#3-cross-cutting--roadmap-blocking-index-only--decide-elsewhere).
**Does not cover:** Auth *provider* choice (Clerk vs Supabase) — that's Phase 1. This ADR only fixes the *canonical `userId`* so rows don't churn regardless of provider.

---

## TL;DR — this is mostly ratification, not invention

The server sync contract **and the native client** already encode most of these decisions — the code is ahead of the older strategy docs, which still describe native as "not yet cloud-synced." Phase 0's job is to make the contract official and frozen so the remaining hardening (study parity, conflict policy, batch retry) and the editor-coupled body round-trip build on settled ground instead of re-litigating per PR.

| What's already in code | Where |
|---|---|
| `/api/sync/{bootstrap,push,changes}` already moves `content`, `threadId`, `primaryCollection`/`secondaryCollections`, `studyThread*`, `StudyThreadEntries`, `NoteConnections`, tags | [`server/routes/sync.ts`](../../server/routes/sync.ts) |
| Tombstone feed for deletes (`note \| studyThread \| thread`) | `SyncDeletedEntities`, [`server/db/schema.ts`](../../server/db/schema.ts) |
| **Native cloud sync is wired** — `pullAll` → `/api/sync/bootstrap` then `/api/sync/changes`; `flushPending` write path with `needsSync`; ingest/upsert for notes, spaces, connections, highlights | [`native/Harvous/Services/HarvousSyncService.swift`](../../native/Harvous/Services/HarvousSyncService.swift) |
| **D2 already live:** sync push defaults `threadId = 'thread_unorganized'` and only writes `NoteThreads` for real threads | [`server/routes/sync.ts`](../../server/routes/sync.ts) (note mutation) |
| **D3c already present:** `reconcileSimpleNoteId(from:)` reconciles native's provisional `simpleNoteId` against server metadata | [`HarvousSyncService.swift`](../../native/Harvous/Services/HarvousSyncService.swift) |
| Native preserves web HTML to avoid lossy round-trips (`serverContentHTML`) and has a server-id slot (`serverId`) | [`native/Harvous/Models/Note.swift`](../../native/Harvous/Models/Note.swift) |
| Web reference sync client | [`src/utils/sync-manager.ts`](../../src/utils/sync-manager.ts) |

---

## D1 — Canonical note body format

**Context.** Server `Notes.content` is `text NOT NULL` holding **TipTap HTML**. Native `Note.body` is **plain text** with scripture pills re-detected on open. Native *also* already carries `serverContentHTML: String?` with this exact comment in the model:

> *"web-authored formatting the plain-text `body` cannot represent… instead of a lossy regeneration. Regeneration only kicks in when `body` actually changed."*

**Options.** (a) Canonical HTML in DB; (b) canonical plain-text + optional HTML snapshot; (c) lossy subset.

**Decision (recommended): (a) — HTML is canonical in Postgres; native keeps a plain-text *projection* for editing and round-trips `serverContentHTML` when the body is unchanged.**

**Rationale.**
- The whole web app, sharing, OG, and scripture-pill processing already assume HTML. Flipping canonical to plain text would be a far larger migration than wiring native.
- Native already built the escape hatch (`serverContentHTML`): on pull, store HTML in `serverContentHTML` + derive `body`; on push, **only** regenerate HTML from `body` when `body` actually changed, otherwise send back `serverContentHTML` untouched. This makes a macOS edit to one paragraph non-destructive to web-only rich formatting elsewhere in the note.

**Consequences / follow-ups.**
- Define the **plain-text → HTML** generator on native (paragraphs, scripture pills, basic marks) and the **HTML → plain-text + pill** parser. The lossy boundary (e.g. tables, inline images) is explicitly *web-authored, native-preserved-not-edited* for v1.
- Scripture pills must survive the round-trip: a pill edited on native re-serializes to the same pill markup the server's `process-scripture-references` expects.

---

## D2 — Containment: `threadId` vs folders

**Context.** Server `Notes.threadId` is `text NOT NULL`. Native `Note` has **no `threadId`** — only `spaceId` (plus legacy `threadName`/`threadColor` display strings). [CLASSIC_TO_2_0_MIGRATION.md](../CLASSIC_TO_2_0_MIGRATION.md) already commits the product to **folders/collections only** in 2.0 (this checkbox is marked ✅ in the platform strategy).

**Options.** (a) Add first-class `threadId` to native; (b) sentinel `thread_unorganized` + folders; (c) native stays note-in-space and synthesizes `threadId` on push.

**Decision (recommended): (b)+(c) — `threadId` stays a server-side plumbing requirement; native never models it. On push, the server assigns `thread_unorganized` (the user's "My Pile") for the note's space.** Organization the user sees is **folders** (`primaryCollection` / `secondaryCollections`), which already sync today.

**Rationale.**
- Matches what `/prototype` already does (`ensureUnorganizedThread`) and what the migration runbook ships.
- Keeps the `NOT NULL` constraint satisfied with zero native concept of Classic threads — no UI, no sync field, no merge logic.

**Consequences / follow-ups.**
- Native push payload omits `threadId`; the push handler defaults it (already the prototype's behavior — confirm the sync push path does the same as `notes/create`).
- Making `threadId` nullable or dropping `Threads` from product logic is a **later, optional** cleanup — explicitly *not* required for Phase 0.

---

## D3 — Canonical identifiers (`note.id`, `userId`, `simpleNoteId`)

**Context.** Server `Notes.id` is a **text** UUID and is already the primary key across `StudyThreadEntries.parentNoteId`, `NoteConnections`, tombstones, share tokens, etc. Native `Note.id` is a local **`UUID`** but the model *also* has `serverId: String?` and `cloudId: UUID?` slots. Server `simpleNoteId` is allocated from `UserMetadata.highestSimpleNoteId`; native has a local `simpleNoteId` with a reconcile TODO. `userId` on every row is today the Clerk id (`user_…`).

**Decision (recommended):**
1. **`Notes.id` (server text id) is THE cross-platform primary key.** Native maps via its existing `serverId` field; the local SwiftData `UUID` stays a device-local handle only. First push of a native-origin note mints the server id and writes it back to `serverId`.
2. **Canonical `userId` = the existing Clerk id (Strategy A).** Even if auth provider changes in Phase 1, map `supabase_user_id → existing Clerk id` rather than rewriting every FK. Zero row churn; provider choice stays orthogonal to this ADR.
3. **`simpleNoteId` is server-authoritative.** Native may assign a provisional local label offline, but on sync the server allocation (`highestSimpleNoteId`) wins and native overwrites its local value. Human-readable labels (`N001`) are display sugar, never a key.

**Rationale.** Lowest-churn path; everything that references a note already uses the server text id; the native model already has the `serverId` seam to do this without schema change.

**Consequences / follow-ups.**
- Need an idempotency story for "native created note offline, pushed twice" — use a client-generated `operationId` (the push endpoint already takes `operationId` per mutation) keyed to the local UUID.
- `simpleNoteId` collisions across devices resolve server-side; native must tolerate its provisional label changing after first sync.

---

## D4 — Study rows (`StudyThreadEntries` ↔ native `StudyThread`)

**Context.** Server `StudyThreadEntries` already has the full shape (entryKind, highlightAccent, sourceSnippet, focusTitle, notesBody, miniNoteBody, anchor location/length/snapshot, scripture ref/translation/excerpt, archived, timestamps) and is in the bootstrap payload + tombstone feed. Native `StudyThread` uses **device UUIDs** and has a few extra fields (`suggestedQuestions`, `aiSuggestedQuestionsGenerated`, `resourceLines`). The parity map (§8) repeatedly notes web-created highlights don't appear on native and vice versa.

**Decision (recommended): server-issued ids only, after the parent note is linked. No blind merge of device-UUID study rows with server rows.** Native study rows get a `serverId` exactly like notes; sync only after the parent note has a `serverId`. Native-only fields (D5) ride along as overflow.

**Rationale.** This is the documented proposed rule and the only safe one — anchors (location/length) would duplicate or mis-target if two id spaces were unioned without a mapping table.

**Consequences / follow-ups.**
- Sync ordering constraint: **note first, then its study entries** (parent `serverId` must exist).
- Anchor stability: if the body changed since the highlight was made, re-anchor via `anchorTextSnapshot` on apply.

---

## D5 — Native-only fields

**Context.** Native carries data with no/partial server columns: `rating`, `vaultFilename`, `scripturePillAccentsJSON`, `detectedRefs` (server has `NoteScriptureReferences`), `NoteSnapshot` history, and the study extras in D4.

**Decision (recommended): sync a defined core subset; classify each extra as *shared*, *re-derived*, or *device-local*.**

| Field | Disposition | Why |
|---|---|---|
| `detectedRefs` | **Re-derive** both sides | Already produced by detection; `NoteScriptureReferences` is the server projection |
| `scripturePillAccentsJSON` | **Shared** — map to study/accent storage | Pill accent is a signature visible feature; reconcile with `StudyThreadEntries.highlightAccentRaw` / pill data-attrs so colors match cross-device |
| `rating` | **Add a column** *or* defer | Small, user-meaningful; cheap to add if we want it shared |
| `vaultFilename` | **Device-local** | iCloud/Markdown vault mirror is per-device by definition |
| `NoteSnapshot` history | **Device-local for v1** | Snapshots stay local until a `note_snapshots` table is justified (D6) |

**Rationale.** Avoids a schema-extension scope creep on the v1 sync while protecting the one user-visible item (pill accents) from drifting.

**Consequences / follow-ups.**
- One explicit decision needed from you: **is `rating` shared in v1 or not?** (Recommend: defer; add later — it doesn't block sync.)
- Lock down exactly how `scripturePillAccentsJSON` reconciles with server accent storage before Phase 4.

---

## D6 — Conflict + snapshot policy

**Context.** Sync needs a conflict rule; `NoteSnapshot` exists on native and "anticipates a future `note_snapshots` table."

**Decision (recommended):**
- **Conflict resolution = last-write-wins on `updatedAt`** for v1 (matches the native roadmap's stated Tier-2 policy). Field-level merge / CRDT is deferred to the realtime-collab phase, not Phase 0.
- **`NoteSnapshot` stays device-local for v1** — not synced. Revisit a `note_snapshots` table only when version-history-across-devices is an actual product goal.

**Rationale.** LWW is sufficient for single-user-multi-device (the v1 reality); collaborative editing is explicitly post-V1. Keeping snapshots local avoids a table + sync path nothing yet needs.

**Consequences / follow-ups.**
- LWW means a stale offline device can clobber a newer edit — acceptable for v1 single-user; document it. The tombstone feed (`SyncDeletedEntities`) already handles delete-vs-edit races.

---

## What Phase 0 explicitly does NOT decide

- **Auth provider** (Clerk-only vs Supabase vs deferred-connect+Apple) → Phase 1. D3 fixes canonical `userId` so this stays orthogonal.
- **Stripe / tier-in-DB** → parallel track, no data-model dependency here.
- **Realtime/collab merge model (OT/CRDT)** → post-V1; D6 only commits LWW for now.
- **Comments sync** → omit from native v1 (server `Comments` table stays web/shared-space only).

---

## Acceptance checklist — RATIFIED 2026-06-10

- [x] **D1** Canonical body = HTML in Postgres; native projects to plain text + preserves `serverContentHTML`
- [x] **D2** `threadId` = server plumbing only (`thread_unorganized` sentinel); folders are user-facing *(already live in sync push)*
- [x] **D3a** `Notes.id` (text) is the cross-platform key; native maps via `serverId`
- [x] **D3b** Canonical `userId` = existing Clerk id (Strategy A), regardless of future auth provider
- [x] **D3c** `simpleNoteId` is server-authoritative; native label is provisional *(`reconcileSimpleNoteId` present)*
- [x] **D4** Study rows: server ids only, after parent-note link; no blind UUID merge
- [x] **D5** Core subset synced; pill accents shared; **`rating` = deferred** (not shared in v1); vault + snapshots device-local
- [x] **D6** Conflict = LWW on `updatedAt`; snapshots device-local for v1

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-10 | Initial draft for founder review (grounds the gap-doc + platform-strategy Phase 0 in current schema/native model) |
| 2026-06-10 | **Accepted.** All eight decisions ratified (D1 HTML canonical, D3b Clerk id, D5 `rating` deferred). Updated "already in code" table to reflect that native cloud sync, the `threadId` sentinel, and `simpleNoteId` reconcile are already implemented. |
