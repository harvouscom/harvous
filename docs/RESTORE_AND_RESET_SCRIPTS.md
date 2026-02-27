# Restore and reset scripts

Scripts for restoring a user’s notes/threads from exported data and reconciling the note-ID counter. Use when recovering a user’s content (e.g. after a data loss or migration).

**Prerequisites:** From repo root, with DB credentials in `.env`: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (or `ASTRO_DB_REMOTE_URL` / `ASTRO_DB_APP_TOKEN`). All commands use `USER_ID=<Clerk userId>` (the Turso `userId` for the user you’re restoring).

---

## 1. Restore notes and threads

**Script:** `scripts/restore-user-notes-threads.ts`

Restores threads and notes for one user from JSON or CSV. Inserts into `Threads`, `Notes`, and `NoteThreads`. Creates `UserMetadata` for the user if missing. Does not change `highestSimpleNoteId`; run the reset script after a full restore.

### Usage

**Single file** (object with `threads`/`notes` or `Threads`/`Notes`, or root-level array of notes):

```bash
USER_ID=<userId> npx tsx scripts/restore-user-notes-threads.ts --file /path/to/recovered-data.json
```

**Separate thread and note files** (e.g. Drizzle single-table exports):

```bash
USER_ID=<userId> npx tsx scripts/restore-user-notes-threads.ts \
  --threads /path/to/threads.json \
  --notes /path/to/notes.json
```

**CSV** (column names should match schema):

```bash
USER_ID=<userId> npx tsx scripts/restore-user-notes-threads.ts --threads /path/to/threads.csv --notes /path/to/notes.csv
```

### Supported file formats

- **Single JSON:** `{ "threads": [...], "notes": [...] }` or `{ "Threads": [...], "Notes": [...] }` or a root-level array of note objects.
- **Separate JSON:** Each file can be an array of rows or a Drizzle-style object (`{ "Threads": [...] }` or `{ "Notes": [...] }`).
- **CSV:** First row = headers; names should match schema (camelCase).

### Expected columns

- **Threads:** `id`, `title`; optional: `subtitle`, `spaceId`, `createdAt`, `updatedAt`, `lastVisited`, `isPublic`, `isPinned`, `color`, `order`, `shareToken`, `shareTokenCreatedAt`.
- **Notes:** `id`, `threadId`, `content`; optional: `title`, `spaceId`, `simpleNoteId`, `noteType`, `addedBy`, `createdAt`, `updatedAt`, `lastVisited`, `isPublic`, `isFeatured`, `order`, `shareToken`, `shareTokenCreatedAt`, `contentEncrypted`.

`userId` is always set from `USER_ID`. Missing fields get defaults. Existing rows (same `id`) are skipped (`onConflictDoNothing`).

---

## 2. Reset / reconcile highestSimpleNoteId

**Script:** `scripts/reset-user-simple-note-id.ts`

Sets the user’s note-ID counter to match the data so the next new note gets a unique ID. Does not change existing note IDs.

### Usage

```bash
USER_ID=<userId> npx tsx scripts/reset-user-simple-note-id.ts
```

### Modes

- **Default (reconcile):** `highestSimpleNoteId = MAX(Notes.simpleNoteId)` for that user (or 0 if no notes). Use after a restore so the next created note doesn’t collide with restored IDs.
- **RESET_TO_ZERO=true:** Set `highestSimpleNoteId = 0`. Use only when the user has no notes.

### When to run

- After running the restore script (recommended).
- When a user’s counter is out of sync after merges or bad data.

---

## Clean restore workflow

1. Get recovered/exported data (e.g. JSON or CSV for threads and notes).
2. Run the restore script with the correct `USER_ID` and file path(s).
3. Run the reset script with the same `USER_ID` to reconcile `highestSimpleNoteId`.
4. User can open the app; no deploy is required (script writes to the DB your `.env` points at).
