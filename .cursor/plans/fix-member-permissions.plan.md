# Fix: Member permissions — remove note from thread + add/remove tags

## Overview

Three permission areas for space members viewing content they don't own:

1. **Remove note from thread**: Members could attempt (and sometimes see) removing a note from a thread when the note isn't theirs. Backend already rejects; UI should hide the action and expose ownership in thread-notes API.
2. **Add/remove tags**: Members can currently add or remove tags on notes they didn't create. Backend does **not** enforce note ownership for tag assign/remove; UI shows tag controls for any note. Fix requires both API and UI.
3. **Erase thread / erase note**: Members should not see or use Erase Thread or Erase Note on content they don't own. Backend already enforces ownership. UI bug: when `contentOwnerId` is undefined (e.g. before data loads), menu shows Erase; fix is to require both `contentOwnerId` and `currentUserId` and equality before showing edit/erase for thread and note.
4. **Lock / Remove lock note**: Same UI fix — Lock and Remove lock are already gated by `canEditContent` in menu-options; the strict ownership check for notes (Part C) will ensure only the note owner sees these options. No separate change needed.

---

## Part A: Remove note from thread (existing plan)

### Root cause

- **API** `POST /api/notes/[id]/remove-thread`: Correctly enforces ownership (`note.userId === userId`). No change.
- **UI**: Shows "remove from thread" for every note/thread without ownership check. Thread notes API doesn't return `userId`, and NoteDetailsPanel doesn't use `data.note.userId` to gate actions.

### Changes

| Area | Change |
|------|--------|
| [src/utils/dashboard-data.ts] | Add `userId` to note selects in `getNotesForThread` and `getNotesForThreadForMember`. |
| [src/components/react/EditThreadPanel.tsx] | Add `userId` to Note type; show remove-from-thread button only when `note.userId === userId`. |
| [src/components/react/NoteDetailsPanel.tsx] | Store `noteUserId` from details API; use `usePersistedUserId()`; show remove-from-thread and add-to-thread only when `noteUserId === currentUserId`. |

---

## Part B: Add/remove tags only for note owner (new)

### Root cause

- **API**  
  - `POST /api/note-tags/assign`: Checks only that the **tag** belongs to the user; does **not** check that the **note** belongs to the user. A member can assign their tag to the owner's note.  
  - `DELETE /api/note-tags/remove`: Does **not** check note ownership; deletes any note–tag link by `noteId` and `tagId`. A member can remove any tag from any note.
- **UI**: NoteDetailsPanel Tags tab shows remove (X) on each tag and the NewTagPanel (add tag) for any note. No ownership gating.

### Approach

1. **Backend**: Enforce note ownership in both note-tags endpoints (assign and remove). Only the note owner may add or remove tags on that note.
2. **UI**: In NoteDetailsPanel, gate Tags tab write actions (remove tag, add tag) on `noteUserId === currentUserId`, reusing the same `noteUserId` / `usePersistedUserId()` used for threads.

---

### B1. API: Enforce note ownership for assign and remove

**File: [src/pages/api/note-tags/assign.ts](src/pages/api/note-tags/assign.ts)**

- After validating `noteId` and before creating the NoteTags row, verify the note exists and belongs to the current user:
  - Query: `db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, userId))).get()`.
  - If no note, return 404 (e.g. "Note not found").
- Keep existing tag ownership check (tag must belong to user). Result: only the note owner can assign tags to that note.

**File: [src/pages/api/note-tags/remove.ts](src/pages/api/note-tags/remove.ts)**

- After parsing `noteId` and `tagId`, verify the note exists and belongs to the current user:
  - Same query as above: note by id and `Notes.userId === userId`.
  - If no note, return 404.
- Then perform the existing delete on NoteTags. Result: only the note owner can remove tags from that note.

Use the same pattern as [src/pages/api/notes/[id]/remove-thread.ts](src/pages/api/notes/[id]/remove-thread.ts) (note lookup by id + userId). You’ll need to import `Notes` and `and`, `eq` from `astro:db` in both files.

---

### B2. UI: Gate Tags tab write actions in NoteDetailsPanel

**File: [src/components/react/NoteDetailsPanel.tsx](src/components/react/NoteDetailsPanel.tsx)**

- Reuse the same ownership state and hook as for threads: `noteUserId` from `data.note.userId` in `fetchNoteDetails`, and `usePersistedUserId()` for current user.
- **Tags tab – remove tag**: Only render the remove (X) control on each tag when `noteUserId === currentUserId`. When the user is not the owner, show tags as read-only (no X).
- **Tags tab – add tag**: Only render the NewTagPanel (or equivalent “add tag” UI) when `noteUserId === currentUserId`. When the user is not the owner, hide the add-tag section so members can see tags but not change them.

This matches the same ownership rule used for threads in the same panel (only note owner can change thread membership).

---

## Summary table

| Item | Action |
|------|--------|
| Thread notes API (dashboard-data) | Add `userId` to note objects in `getNotesForThread` and `getNotesForThreadForMember`. |
| EditThreadPanel | Show remove-from-thread only when `note.userId === userId`. |
| NoteDetailsPanel | Store `noteUserId`; use `usePersistedUserId()`; gate threads and tags write UI on `noteUserId === currentUserId`. |
| POST /api/note-tags/assign | Add note ownership check: note must exist and `note.userId === userId` before creating NoteTags row. |
| DELETE /api/note-tags/remove | Add note ownership check: note must exist and `note.userId === userId` before deleting NoteTags row. |
| menu-options.ts (erase thread/note) | For thread and note, require `contentOwnerId != null && currentUserId != null && contentOwnerId === currentUserId` before showing Edit Thread, Erase Thread, Erase Note, Lock note. |

No change to `POST /api/notes/[id]/remove-thread` or to `DELETE /api/threads/delete`, `DELETE /api/threads/erase-with-notes`, or `DELETE /api/notes/delete` (already enforce ownership).

---

## Part C: Erase thread / erase note only for owner

### Root cause

- **API**: Both `DELETE /api/threads/delete`, `DELETE /api/threads/erase-with-notes`, and `DELETE /api/notes/delete` already enforce ownership (`Threads.userId === userId` or `Notes.userId === userId`). No backend change needed.
- **UI**: Menu options (Edit Thread, Erase Thread, Erase Note) are gated by `canEditContent` in [src/utils/menu-options.ts](src/utils/menu-options.ts). Currently `canEditContent = contentOwnerId == null || currentUserId == null || contentOwnerId === currentUserId`. So when `contentOwnerId` is **undefined** (e.g. before thread/note data has loaded in the SPA), `canEditContent` is **true**, and Erase (and Edit) are shown. A member can briefly see Erase Thread or Erase Note on load, or in any path where `contentOwnerId` is not passed. Fix: for thread and note, only show edit/erase when we **know** the user is the owner (contentOwnerId and currentUserId both set and equal).

### Approach

**File: [src/utils/menu-options.ts](src/utils/menu-options.ts)**

- For **thread** and **note**, require both `contentOwnerId` and `currentUserId` to be set and equal before showing edit/erase options. So: when `contentType === 'thread'` or `contentType === 'note'`, use `canEditContent = (contentOwnerId != null && currentUserId != null && contentOwnerId === currentUserId)`. When contentOwnerId is still loading (undefined), we will not show Erase or Edit — only view-only options (e.g. Open Note Details Threads/Tags, Share).
- For **space** and other types, keep existing behavior: `canEditContent = contentOwnerId == null || currentUserId == null || contentOwnerId === currentUserId` (so space options still work when contentOwnerId is not passed).

Implementation: compute `canEditContent` per content type. For thread: use strict check. For note: use strict check. For space: keep current logic (spaceRole already gates member vs owner). So in getMenuOptions, replace the single `canEditContent` line with something like:

- `const canEditThreadOrNote = contentOwnerId != null && currentUserId != null && contentOwnerId === currentUserId;`
- For thread case: use `canEditThreadOrNote` instead of `canEditContent`.
- For note case: use `canEditThreadOrNote` for lock/erase (and any other owner-only options); keep Share and openNoteDetails* visible for all (they are view/navigate).

Result: Erase Thread, Erase Note, Edit Thread, and Lock/Remove lock note only appear when we have both IDs and they match. No more showing those options before data loads or when contentOwnerId is missing.
