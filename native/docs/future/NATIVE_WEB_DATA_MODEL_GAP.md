# Native and web data model gap

This document lists architectural decisions required before Supabase-backed sync, one-way import/hydration from the web SPA, or full cross-platform parity. It complements [ARCHITECTURE_ROADMAP.md](./ARCHITECTURE_ROADMAP.md) (Tier 2 cloud sync).

## Context

- **Web:** Supabase Postgres ([`server/db/schema.ts`](../../../server/db/schema.ts)), Clerk-authenticated users, hierarchy **Spaces → Threads → Notes** (notes require `threadId`; `NoteThreads` supports many-to-many).
- **Native:** Local SwiftData ([`HarvousApp.makeModelContainer`](../../Harvous/HarvousApp.swift)), [`Note`](../../Harvous/Models/Note.swift), [`StudyThread`](../../Harvous/Models/StudyThread.swift) (study branches on a note — not the web “thread” container), [`Space`](../../Harvous/Models/SpaceModels.swift) types, and [`HarvousLocalIdentity`](../../Harvous/Models/HarvousLocalIdentity.swift) until Clerk is wired.
- **Strategic fit:** For the same account to see data on web and Apple clients, **Supabase (and the existing API)** is the natural sync layer — not iCloud/CloudKit for the database. Optional **iCloud Drive** remains for the Markdown vault mirror ([`HarvousVaultLocation`](../../Harvous/Services/HarvousVaultLocation.swift)), not the canonical structured store.

## Decisions to resolve

### 1. Containment — web “Thread” vs native (largest structural gap)

On the server every note has a **`threadId`** pointing at [`Threads`](../../../server/db/schema.ts). There is also **`NoteThreads`** for many-to-many membership.

Native **`Note`** has **`spaceId`** but **no `threadId`**. It relates to **`StudyThread`** rows, which are *anchored study branches* on a note, not the web thread folder.

**Decide one of:**

- Add a **first-class `threadId`** (or equivalent) on native `Note` mirroring web; or
- On import/sync only, **collapse** membership (e.g. default “My Pile” / synthetic thread per space); or
- Keep native **note-in-space** as primary and **synthesize** server `threadId` when pushing to the API.

Until this is settled, there is no obvious stable “same note lives in the same place” across platforms.

### 2. Note body format — TipTap HTML vs plain text

Server **`Notes.content`** is the web body; native **`Note.body`** is **plain text** with scripture pills re-detected on open.

**Decide:**

- Canonical **HTML in DB** with strip/convert for native; or
- Canonical **plain text** plus optional HTML snapshot; or
- **Lossy subset** (sync minimal fields; accept differences in rich features).

This choice drives migrations, conflict resolution, and whether sync is full-fidelity or best-effort.

### 3. Identifiers and `simpleNoteId`

Both sides use **`simpleNoteId`**; native also assigns locally and needs **reconciliation** with server semantics (see TODO on `Note.simpleNoteId` in [`Note.swift`](../../Harvous/Models/Note.swift)).

**Decide:**

- Treat **`Notes.id`** (text UUID) as the **cross-platform primary key** everywhere; and
- How to **merge** `UserMetadata.highestSimpleNoteId` (web) with native backfill so human-readable labels (e.g. `N001`) do not collide.

### 4. Native-only fields vs schema extensions

Native carries (or will carry) data with **no** or **partial** server columns today, including:

- `tags`, `detectedRefs`, `rating`, `scripturePillAccentsJSON`, `vaultFilename`
- **Version history** via [`NoteSnapshot`](../../Harvous/Models/NoteSnapshot.swift) (snapshots anticipate a future `note_snapshots`-style table in Supabase)

**Decide:**

- **Add Postgres / API fields** for fields you want shared; or
- **Re-derive** on each side where possible; or
- **Sync a core subset** (title, body, ordering, pins) and accept divergence.

### 5. `StudyThreadEntries` vs `StudyThread`

[`StudyThreadEntries`](../../../server/db/schema.ts) maps closely to native **`StudyThread`**, but native has extra fields (`suggestedQuestions`, `aiSuggestedQuestionsGenerated`, `resourceLines`, …).

**Decide:** native-only extensions, **new columns**, or **JSON blobs** on the server for overflow.

### 6. Spaces and membership

Server: **`Spaces`**, **`Members`**, **`SpaceInvitations`**, string IDs, **Clerk `userId`**.

Native: **`Space`** visibility model, **`SpaceMember`**, joins/invites in SwiftData, **`HarvousLocalIdentity`** until real auth.

**Decide:**

- **Same space** = shared UUID/string id + **Clerk** as the canonical user key for shared data; or
- **Import** creates a **local parallel** graph until auth is implemented (explicitly not “live” shared state).

### 7. Junction and satellite tables

- **`NoteThreads`:** If web uses multi-thread membership, native must **gain parity** or you **flatten** relationships on import.
- **`Comments`:** Present on server; omit from v1 native sync or plan a native model later.

### 8. Conflict and snapshot policy

**Decide:**

- **Conflict resolution** (e.g. last-write-wins on `updatedAt` vs richer merge).
- Whether **`NoteSnapshot`** rows **sync** or remain **device-local** history.

## Suggested sequencing

Resolve **containment (1)** and **body format (2)** first; identifier strategy (**3**) and field-level parity (**4–5**) follow. For **tester-only, one-way hydration**, a **minimal projection** (space context, thread as metadata, title + body) may suffice temporarily — but **thread placement** and **HTML vs plain** still need explicit answers so imports are not arbitrary.

## Related files

| Area | Location |
|------|----------|
| Drizzle schema | [`server/db/schema.ts`](../../../server/db/schema.ts) |
| SwiftData models | [`native/Harvous/Models/`](../../Harvous/Models/) |
| Native sync roadmap | [ARCHITECTURE_ROADMAP.md](./ARCHITECTURE_ROADMAP.md) |
