# Scripture Notes – Future Improvements

This document outlines planned improvements to the scripture note experience: overlapping-passage handling (surfacing + merge), related backend/UX improvements, and a Bible reader / “collected verses” view. These are forward-looking and not yet implemented.

**Related docs:** [SCRIPTURE_DETECTION_IMPROVEMENTS.md](../SCRIPTURE_DETECTION_IMPROVEMENTS.md) (detection, pills, performance), [ARCHITECTURE.md](../ARCHITECTURE.md) (data model).

---

## Current behavior (brief)

- **Exact match reuse:** If you already have a scripture note for “John 3:16” and type that reference in another note, the app reuses that note and links the new note to it via `NoteScriptureReferences`.
- **Overlap gap:** “John 3:16” and “John 3:16-17” are different normalized references, so they become two separate scripture notes with no link between them.
- **Scripture notes today:** Shown in lists (dashboard/thread/space) with filter “Scripture”; no Bible-wide view of “what I’ve saved.”

---

## 1. Overlapping passages: surfacing + merge (Solution 5)

Goal: don’t change creation behavior; instead **show** overlapping scripture notes and let users **merge** them when they want one note per passage.

### 1.1 Surfacing overlapping passages

**Where:** On the **scripture note view** (the page/sheet for a single scripture note).

**Behavior:**

- Add a section such as **“Overlapping passages”** or **“Related scripture notes”**.
- List other **scripture notes** (same user) whose verse range overlaps this note’s range.
- **Overlap rule:** Same `book` + `chapter`, and verse ranges share at least one verse (e.g. [16,16] and [16,17] overlap; [16,17] and [18,20] do not).

**Implementation notes:**

- **Data:** This note’s `ScriptureMetadata`: `book`, `chapter`, `verse`, `verseEnd`. Query other rows in `ScriptureMetadata` (joined to `Notes` for `userId`) with same book/chapter and overlapping verse range. Helper: e.g. `rangesOverlap(aStart, aEnd, bStart, bEnd)` ↔ `aStart <= bEnd && bStart <= aEnd` (treat single verse as `verseEnd = verse`).
- **UI:** Only render the section if there is at least one overlapping note. Each item: reference (or title), link to open that scripture note.
- **Copy:** e.g. “You also have notes for: John 3:16” when viewing John 3:16-17, or “This passage overlaps: John 3:16”.

**Files to touch:**

- API: endpoint or existing scripture-note payload that returns overlapping scripture notes for a given `noteId` (or pass book/chapter/verse/verseEnd).
- SPA: scripture note detail page/component — add “Overlapping passages” block and call the API.

### 1.2 Merge action

**Where:** Same scripture note view; optionally from the overlapping list (e.g. “Merge into this note”).

**Behavior:**

- User chooses a **keeper** note (e.g. the one they’re on) and **merges** another overlapping note into it.
- All references to the merged note (pills, junction rows) are redirected to the keeper; the merged note is removed.

**Flow (conceptual):**

1. User is on **Note A** (e.g. John 3:16-17). “Overlapping passages” shows **Note B** (John 3:16).
2. User clicks “Merge John 3:16 into this note” (or “Merge here” from the list).
3. **Backend:**
   - **Keeper** = Note A. **Merged** = Note B.
   - **Junction table:** For every `NoteScriptureReferences` row with `scriptureNoteId = B`, update to `scriptureNoteId = A` (and dedupe so we don’t create duplicate (noteId, scriptureNoteId) for the same note).
   - **Note content (all notes that referenced B):** Replace pills with `data-note-id="B"` (and same or equivalent reference) so they point to A: set `data-note-id="A"` and optionally keep or normalize the reference string to the keeper’s (e.g. “John 3:16-17”). This requires parsing note HTML, updating pill attributes, and saving each affected note.
   - **Delete** Note B and its `ScriptureMetadata` row(s). (Any junction rows that pointed to B are already reassigned to A.)
4. **Response:** Success; client can refresh the scripture note and overlapping list (B disappears).

**UX details:**

- Confirmation: e.g. “Merge John 3:16 into John 3:16-17? All links to John 3:16 will point to this note.”
- After merge: short success message; overlapping list updates.

**Files to touch:**

- API: new endpoint e.g. `POST /api/scripture/merge` (keeper noteId, merged noteId); validates both are scripture notes, same user, overlapping range; performs DB and content updates.
- SPA: scripture note view — merge button(s) in the overlapping list and confirmation dialog.

**Dependencies:**

- Overlap detection (same logic as surfacing) must be available on the backend for merge validation and for the “overlapping passages” list.

---

## 2. Related improvements (recommended with Solution 5)

These support a consistent “one passage → one note” experience and reduce duplicate pills.

### 2.1 Overlap-aware reuse at creation (Solution 1)

**Idea:** When creating a new scripture note, if an existing scripture note (same user) has an **overlapping** verse range (same book+chapter, ranges overlap), reuse that note instead of creating a second one.

- **Effect:** Fewer duplicate notes (e.g. typing “John 3:16” when “John 3:16-17” exists links to the existing note).
- **Where:** `processScriptureReferences` (and any other path that creates scripture notes). After building the exact-match map, for each pending reference parse (book, chapter, verseStart, verseEnd) and check for an existing note with overlapping range; if found, use it and create junction + update content as today.
- **Policy:** e.g. “reuse if any existing note’s range overlaps; if multiple, pick one consistently (e.g. smallest containing range or most recently created).”

Implementing this reduces the number of overlapping pairs that users see and need to merge (Solution 5 still handles existing data and edge cases).

### 2.2 Check-existing API: overlap option (Solution 2)

**Idea:** Extend the “check existing scripture” API to optionally return an **overlapping** note when no exact match exists.

- **Effect:** UI can show “You already have a note for John 3:16-17. Link to it?” when the user types “John 3:16”.
- **Where:** Same overlap helper as above; API returns e.g. `{ exists, noteId, reference, overlapping?: true }` when an overlapping note is found.
- **Optional:** Implement only if you want this explicit prompt; overlap-aware reuse (2.1) already reduces duplicates without UI change.

### 2.3 Detection-time: prefer longer reference (Solution 3)

**Idea:** When detecting references in **one** document, if two detected refs overlap (e.g. “John 3:16” and “John 3:16-17” in the same sentence), create a single pill for the longer/more specific reference.

- **Effect:** Cleaner pills in a single note; no duplicate pills for overlapping refs in the same text.
- **Where:** `scripture-detector.ts` or the code that turns detected refs into pills (e.g. in TiptapEditor): filter or merge so overlapping refs in the same document become one pill.
- **Note:** This doesn’t fix “two separate notes” across the app; 2.1 and 2.2 address that.

---

## 3. Bible reader / “collected verses” view

**Idea:** A dedicated view that shows the Bible (or a book/chapter) and highlights which verses the user has **saved** as scripture notes — like “what I’ve collected” out of all available verses.

### 3.1 User value

- See at a glance which passages they’ve engaged with.
- Navigate by book/chapter like a Bible reader, with their notes visually distinguished.
- Encourage “filling in” passages (e.g. “I have 3:16 and 3:18; 3:17 is missing”).
- Optional: tap a verse to open the scripture note or create one.

### 3.2 UX concepts

- **Entry:** e.g. “Bible” or “My Scripture” in nav, or a link from the scripture filter / dashboard.
- **Scope options:**
  - **By book:** List or grid of books; tap a book → chapter list → chapter view with verses. Verses that have a scripture note are highlighted (e.g. background, dot, or icon).
  - **By chapter:** Single chapter view: verse numbers in order; saved verses clearly marked; tap opens the note or creates one.
- **Density:** Compact (verse numbers only, highlight saved) vs expanded (short verse text + highlight). Could toggle or default to compact for performance.
- **Reference data:** Verse counts per chapter already exist in code (`getChapterVerseRange(book, chapter)` in `scripture-detector.ts`); use for rendering the “grid” of verses and knowing valid ranges.

### 3.3 Data

- **Source of truth for “saved”:** User’s scripture notes via `ScriptureMetadata`: `book`, `chapter`, `verse`, `verseEnd`. For each verse in a chapter, check if it falls inside any (verse, verseEnd) range for that book/chapter.
- **API:** e.g. “for userId, return all (book, chapter, verse, verseEnd)” for scripture notes; or “for userId + book + chapter, return which verse ranges are covered.” Client can then map verses to “has note” / “no note.”
- **Book order:** Use a canonical book order (e.g. same as in `scripture-detector` or a shared constant) so the reader follows Bible order.

### 3.4 Implementation notes

- **New route:** e.g. `/bible` or `/scripture/reader`; optional `?book=John&chapter=3` for deep link.
- **Performance:** For “all my saved verses,” one query by userId is enough; for a single chapter view, filter by book+chapter. Paginate or lazy-load if showing many chapters.
- **Overlap handling:** If the user has both “John 3:16” and “John 3:16-17,” verse 16 can show as “saved” (and optionally “2 notes” tooltip); merge (Solution 5) and overlap-aware reuse (2.1) keep this simple over time.
- **Optional:** Verse text could come from the same Bible API used for scripture note creation (e.g. Bible.org), with caching; or start with verse numbers only and add text later.

### 3.5 Files to touch (when implemented)

- **API:** New or extended endpoint(s) to return user’s scripture coverage (by userId; optional book/chapter filter). Possibly reuse existing scripture-list logic with a “by location” shape.
- **SPA:** New page(s) and components for book list, chapter list, chapter/verse view; reuse or extend routing (e.g. TanStack Router).
- **Shared:** Book order and verse-range helpers (e.g. from `scripture-detector.ts`) so server and client agree on structure.

---

## 4. Summary and order

| Area | What | When |
|------|------|------|
| **Overlapping surfacing** | Show “Overlapping passages” on scripture note view | First step for Solution 5 |
| **Overlapping merge** | Merge action + backend redirect + content update | After surfacing |
| **Overlap-aware reuse** | Reuse existing note when new ref overlaps | Anytime; reduces new duplicates |
| **Check-existing overlap** | API returns overlapping note for UI prompt | Optional |
| **Detection longer ref** | Single pill for overlapping refs in one doc | Optional |
| **Bible reader view** | “Collected verses” by book/chapter/verse | After overlap UX is in place |

Implementing **overlap surfacing + merge** (Solution 5) gives users control over existing duplicates. Adding **overlap-aware reuse** (2.1) prevents new ones. The **Bible reader view** then becomes a natural place to see and navigate “what I’ve saved” once the underlying note set is cleaner.
