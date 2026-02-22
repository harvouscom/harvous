# Bug: Wrong thread shown in nav after closing threads (multi-thread note)

**Summary**: When a note belongs to multiple threads, opening it from the correct thread works, but after closing out all threads the remaining thread shown/highlighted in the navigation is the wrong one (the thread that wasn’t used to open the note).

## Root cause

- **Opening**: Clicking a note from a thread uses `idToUrl(note.id, threadId)` (e.g. `src/components/react/ThreadNotesList.tsx` line 1371), so the URL is `/note/xyz?thread=threadA`. The correct thread (A) is in the URL.
- **SPA ignores it**: The SPA never reads `?thread=`. It derives the "parent" thread from `currentNote?.threads?.[0]` in `spa/src/layouts/AppLayout.tsx` (lines 208–209) and `spa/src/pages/NotePage.tsx` (lines 30–32). The note-details API returns threads in DB order (no explicit ordering in `src/pages/api/notes/[id]/details.ts` junction query around 199–214), so `threads[0]` can be a different thread (e.g. B).
- **Result**: `data-parent-thread-id` and `activeThread` are set to the wrong thread. History tracker and close logic use DOM `data-parent-thread-id`, so when you close all threads, the remaining thread shown/highlighted in the nav is the wrong one.

SSR is already correct: `[...slug].astro` uses URL param and referrer to set `selectedThreadId`, and `src/layouts/Layout.astro` passes that as `currentThread` and sets `data-parent-thread-id`. The bug is SPA-only (production).

## Fix strategy

Use **URL `?thread=`** as the source of truth for "which thread context this note is open in" in the SPA, with fallbacks to API/cache when the param is missing or invalid.

## Implementation outline

1. **Single source for "parent thread" on note pages (SPA)**  
   In both AppLayout and NotePage:
   - **Priority 1**: If `location.search` has `thread=threadId` and the note’s `threads` array includes that id, use that as parent thread id.
   - **Priority 2**: `currentNote?.threads?.[0]?.id` (or `note?.threads?.[0]?.id` in NotePage).
   - **Priority 3**: `getCachedNoteParentThreadId(noteId)` (AppLayout).

   Use this resolved id for `activeThread` in AppLayout and for `data-parent-thread-id` (and related data attributes) on the note wrapper in NotePage. Optionally update the note parent-thread cache when the resolved id comes from the URL.

2. **AppLayout.tsx**  
   Read `search` (already available via `useRouterState`). Parse `?thread=`; if present and in `currentNote?.threads`, set `noteParentThreadId` from it; else keep current logic. Optionally update cache when from URL.

3. **NotePage.tsx**  
   Read search; resolve parent thread (URL param if valid, else `note?.threads?.[0]`). Set `data-parent-thread-id`, `data-parent-thread-title`, `data-parent-thread-background-gradient` from the resolved parent (look up full thread from `note.threads` by id when using URL param).

4. **useNote.ts**  
   Export `setCachedNoteParentThread` if not already; optionally add `setCachedNoteParentThreadId` for AppLayout to call when parent comes from URL.

5. **No API change required**  
   The note-details API does not need to accept `?thread=` or reorder threads.

6. **NavigationContext and vanilla nav scripts**  
   No change needed. `getCurrentActiveItemId()` and `public/scripts/navigation/history-tracker.js` / `persistent-navigation.js` already read `data-parent-thread-id` from the DOM; fixing the SPA to set it from the URL thread is sufficient.

## Files to touch

| File | Change |
|------|--------|
| `spa/src/layouts/AppLayout.tsx` | Derive `noteParentThreadId` from `search` param `thread` when present and in `currentNote?.threads`; else `threads[0]` then cache. Optionally update cache when from URL. |
| `spa/src/pages/NotePage.tsx` | Read search; resolve parent thread (URL param if valid, else `note.threads[0]`); set data attributes from resolved parent. |
| `spa/src/hooks/queries/useNote.ts` | Export `setCachedNoteParentThread` if not already; optionally add `setCachedNoteParentThreadId` for AppLayout. |

## Edge cases

- **Invalid `?thread=`**: If `thread=xyz` but the note is not in that thread, ignore param and use fallbacks (threads[0], cache).
- **No `?thread=`**: Unchanged behavior: use first thread from API or cache (may still be arbitrary; acceptable).
- **Direct load with `?thread=`**: e.g. bookmark or share. Validate against `note.threads`; if valid, show that thread as active and set DOM/cache accordingly.
