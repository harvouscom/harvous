---
name: ""
overview: ""
todos: []
isProject: false
---

# Scripture: Same Thread and Link-Existing (No Duplicates)

## Overview

Ensure scripture notes created from a note are placed in that note's thread and that existing scripture notes by reference are linked (no duplicates). The codebase already passes the parent note's thread and dedupes by normalized reference; a few server-side fixes are needed so new scripture notes get the correct threadId and the pasted-pill path also adds new scripture to the thread.

## Current behavior

- **Thread**: `processScriptureReferences` takes an optional `threadId` (parent note's thread). When creating a **new** scripture note it inserts with `Notes.threadId: 'thread_unorganized'` then, if `actualThreadId !== 'thread_unorganized'`, inserts a `NoteThreads` row only. It does **not** set `Notes.threadId` on the new note to `actualThreadId`, so the note stays "unorganized" in the legacy field. When **reusing** an existing scripture note, it does add the note to the thread and updates `Notes.threadId` (lines 601–615).
- **Dedupe**: The main loop already looks up by normalized reference (`normalizedScriptureMap` from `ScriptureMetadata` + `Notes.userId`), creates a junction entry, and adds the existing scripture note to the thread. No duplicate note is created. The pasted-pill branch (invalid/missing noteId) also checks by reference and links to existing or creates new; it does **not** add the new scripture note to the parent's thread.

Call sites already pass the correct thread when applicable: Create (body.threadId), Update (from NoteThreads), NotePage reprocess (note.threads[0].id), TiptapEditor paste (parentThreadId).

## Required changes

### 1. New scripture note: set `Notes.threadId` when adding to thread

**File:** [server/utils/process-scripture-references.ts](server/utils/process-scripture-references.ts)

In the **main creation path** (after inserting `NoteThreads` when `actualThreadId !== 'thread_unorganized'`, ~497–506): also update the new scripture note's `Notes.threadId` to `actualThreadId`.

- After the successful `db.insert(NoteThreads).values(...)` block, add:
  - `await db.update(Notes).set({ threadId: actualThreadId }).where(eq(Notes.id, scriptureNote.id));`

### 2. Pasted-pill branch: add new scripture note to parent's thread

**File:** [server/utils/process-scripture-references.ts](server/utils/process-scripture-references.ts)

In the **pasted-pill** branch where a new scripture note is created when the pill's noteId is invalid/missing (around 884–958): after creating the note and junction, if `actualThreadId !== 'thread_unorganized'`, insert into `NoteThreads` and set `Notes.threadId` to `actualThreadId`.

- After the junction insert and content replace (~944–958), before `results.push(...)`:
  - If `actualThreadId !== 'thread_unorganized'`: insert `NoteThreads` row for `newScriptureNote.id` and `actualThreadId`, then `db.update(Notes).set({ threadId: actualThreadId }).where(eq(Notes.id, newScriptureNote.id))`.

### 3. Duplicate/link behavior (verification only)

- Main loop: Already uses `normalizedScriptureMap`; no change.
- Pasted-pill: Already looks up by reference and uses existing note; no change.
- Optional: add a short comment in `processScriptureReferences` that duplicate detection is by normalized reference.

---

## Further refinements (scripture detection → pill → scripture note)

Optional improvements to the full flow beyond same-thread and dedupe.

### 4. Unify verse fetching in process-scripture-references

- **Now:** `process-scripture-references.ts` calls `https://labs.bible.org/api/...` directly (and again in the pasted-pill branch).
- **Change:** Call the app’s `**/api/scripture/fetch-verse`** (or a shared server helper that uses the same logic) from `process-scripture-references` instead of the external URL. That endpoint already has parsing, validation, verse ranges, and formatting. Single place for timeouts/retries and future translation support.
- **Scope:** Replace the two direct Bible.org fetches in `process-scripture-references.ts` with an internal call to the fetch-verse handler or shared helper.

### 5. Optional toast when linking (not creating) scripture

- **Now:** Toasts only for `action === 'created'`. When a reference is **linked** to an existing scripture note (`action === 'added'`), there’s no toast.
- **Change:** Optionally show a short info toast when scripture was linked, e.g. “Linked to scripture: John 3:16” (or “Linked to 2 scripture notes”). Additive; can be omitted to keep UI minimal.

### 6. Post-save pill sync without fixed delay

- **Now:** In CardFullEditable, after `setContent(saveResult.processedContent)` a `setTimeout(..., 200)` runs before `convertNoteLinksToScripturePills`.
- **Change:** Replace the 200 ms delay with a deterministic “editor ready” step (e.g. `editor.once('update', ...)` or a microtask/requestAnimationFrame) so pills appear as soon as the editor has applied the content.

### 7. Feedback when scripture processing fails

- **Now:** If `processScriptureReferences` throws, the API catches and logs; the note is still saved but `scriptureResults` is empty and pills can stay “pending.”
- **Change:** Return a flag or code when processing threw (e.g. `scriptureProcessingError: true`) and show a single toast: “Note saved. Some scripture links couldn’t be created.” so the user knows to retry or fix the ref.

### 8. Normalize reference before verse fetch (server)

- **Now:** Verse fetch uses the detected `reference` as-is; fetch-verse does its own cleaning.
- **Change:** In `process-scripture-references`, pass **normalized** references (via `normalizeScriptureReference`) into the verse fetch so main loop and pasted-pill use the same canonical form and “no verses found” is less likely.

### 9. Refresh thread/content when scripture is created or linked

- **Now:** After save, `noteUpdated` is dispatched; thread/space lists may not refetch.
- **Change:** When the save response includes `scriptureResults` with `created` or `added`, dispatch a small event (e.g. `scriptureNotesUpdated` with `{ noteId, threadId?, results }`) so lists can invalidate or refetch. Optional.

---

## Summary


| #   | Item                                                         | Type         |
| --- | ------------------------------------------------------------ | ------------ |
| 1   | Set `Notes.threadId` for new scripture when adding to thread | Required     |
| 2   | Pasted-pill branch: add new scripture to parent’s thread     | Required     |
| 3   | Verify/comment duplicate detection by normalized reference   | Verification |
| 4   | Unify verse fetch via fetch-verse endpoint/helper            | Refinement   |
| 5   | Optional toast when linking existing scripture               | Refinement   |
| 6   | Replace 200 ms delay with editor-ready callback              | Refinement   |
| 7   | Return + show “scripture processing failed” when it throws   | Refinement   |
| 8   | Normalize reference before verse fetch                       | Refinement   |
| 9   | Event for scripture created/linked for list refresh          | Refinement   |


