# Real-Time Scripture Detection Attempts - Post-Mortem

## Overview

This document details all attempts made to implement real-time scripture detection (creating pills while typing) and why we ultimately reverted to button-only creation.

## Original Behavior (Before Attempts)

- User types note content
- User clicks "Create Note" button
- Server processes scripture references via `processScriptureReferences()`
- Server returns HTML with `<span class="scripture-pill">` tags
- Editor converts HTML spans to Tiptap marks on load/after save
- Pills appear after save, not during typing

**Status**: ✅ Working perfectly on both desktop and mobile

## Goal

Implement real-time detection so pills appear while typing (debounced), providing immediate visual feedback.

## Attempts Made

### Attempt 1: Basic Real-Time Detection

**What we tried:**
- Added debounced detection in `onUpdate` callback (600ms delay)
- Called `detectAndCreateScriptureNotes()` after typing stopped
- Created pills with `noteId: null` (pending state)

**What worked:**
- ✅ Pills appeared while typing on desktop
- ✅ Detection worked correctly

**What didn't work:**
- ❌ Typing blocked after pill creation in `NewNotePanel.tsx` (but worked in `CardFullEditable.tsx`)
- ❌ Keyboard events not reaching ProseMirror after pill creation

**Root cause:** Form's `onKeyDown` handler was interfering with ProseMirror's event system.

**Fix attempted:** Removed form's `onKeyDown` and `onKeyPress` handlers.

**Result:** Still didn't work.

---

### Attempt 2: Fallback Injection Mechanism

**What we tried:**
- Added document-level `keydown` event listener in `NewNotePanel.tsx`
- Detected when ProseMirror didn't process keyboard events
- Manually injected characters using `editor.commands.insertContent()`
- Tracked injected events to prevent duplicates

**What worked:**
- ✅ Typing worked after pill creation on desktop
- ✅ Deletion (Backspace/Delete) worked

**What didn't work:**
- ❌ On iOS, typing caused immediate character duplication ("M" → "mmmmm")
- ❌ Mobile timing differences caused false positives

**Root cause:** Fallback injection fired even when ProseMirror had already processed input, due to timing differences on mobile.

**Fix attempted:** 
- Added mobile device detection
- Made injection logic more conservative (required multiple checks)
- Added event tracking to prevent duplicates

**Result:** Still had duplication issues on mobile.

---

### Attempt 3: Conservative Injection with Mobile-Specific Logic

**What we tried:**
- More strict `shouldInject` condition
- Mobile-specific delays and checks
- Event tracking with unique keys
- Multiple verification stages before injection

**What worked:**
- ✅ Reduced duplication on mobile
- ✅ Desktop still worked

**What didn't work:**
- ❌ Still occasional duplication on mobile
- ❌ Complex logic that was hard to maintain

---

### Attempt 4: Context Validation for False Positives

**What we tried:**
- Added `isValidScriptureContext()` function
- Validated detected references before creating pills
- Prevented false positives like "John 3 years ago"

**What worked:**
- ✅ Reduced false positives
- ✅ Better detection accuracy

**What didn't work:**
- ❌ Mobile typing still had issues

---

### Attempt 5: Flag-Based Immediate Injection

**What we tried:**
- Added `justCreatedPill` flag set immediately after pill creation
- Fallback injection checked flag and injected immediately if true
- Used `requestAnimationFrame` for desktop, `setTimeout` for mobile

**What worked:**
- ✅ Desktop typing worked reliably

**What didn't work:**
- ❌ Mobile typing still blocked after pill creation
- ❌ Flag timing issues (race conditions)

**Root cause:** Flag was set immediately, but transactions were still processing, causing interference.

---

### Attempt 6: Flag After Transactions Settle

**What we tried:**
- Set flag AFTER all cursor positioning transactions completed
- Added 50ms delay to ensure transactions settled
- Set flag synchronously after last transaction

**What worked:**
- ✅ Desktop still worked

**What didn't work:**
- ❌ Mobile typing still blocked
- ❌ Flag set too late, user already tried to type

---

### Attempt 7: Flag with requestAnimationFrame

**What we tried:**
- Set flag using `requestAnimationFrame` after `dispatch(tr)`
- Ensured transaction was processed before flag set
- Reduced debounce delay to 250ms for faster detection

**What worked:**
- ✅ Faster detection (250ms vs 600ms)

**What didn't work:**
- ❌ Mobile typing still blocked
- ❌ User had to type more before pill appeared

---

### Attempt 8: Skip ScripturePill Keyboard Handler

**What we tried:**
- Added check in `ScripturePill` keyboard handler to skip logic when `justCreatedPill` is true
- Prevented interference from pill handler

**What worked:**
- ✅ Reduced interference

**What didn't work:**
- ❌ Mobile typing still blocked
- ❌ Complex interactions between multiple handlers

---

### Attempt 9: Synchronous Atomic Transactions & Mark Exclusion (SUCCESS)

**What we tried:**
- Moved detection from `onUpdate` to a synchronous `handleKeyDown` trigger on the `Space` key.
- Implemented a "Pending" state (`noteId: 'pending'`) to decouple UI feedback from server operations.
- Used **Atomic Transactions**: The space is inserted and pills are created in a coordinated sequence within the same event cycle.
- **Mark Exclusion**: Set `inclusive: false` and `excludes: '_'` on the `scripturePill` mark.
- Removed all complex background plugins (`handleTextInput`, `filterTransaction`, etc.) that were causing "gridlock".
- Applied `cursor: pointer !important` via global CSS to ensure consistent "link" feedback.

**What worked:**
- ✅ **Perfect Typing Flow**: Users can keep typing immediately after a pill is created without any dropped characters or blocking.
- ✅ **No Stickiness**: New text never inherits the pill formatting thanks to `excludes: '_'`.
- ✅ **Multi-word Detection**: Can detect "John 3:16" by looking back up to 60 characters on space press.
- ✅ **Reliable Navigation**: Pending pills are visually identical but don't trigger 404s when clicked.
- ✅ **Mobile Compatible**: By avoiding async `setTimeout` loops for core logic, it respects mobile event timings.

**The "Magic" Solves:**
1. **`inclusive: false`**: Prevents the mark from "stretching" as you type after it.
2. **`excludes: '_'`**: The "nuclear option" that prevents any other mark (including itself) from overlapping, which kills the "stickiness" that previously blocked the cursor.
3. **Synchronous Execution**: Creating the pill *immediately* after the space insertion in the `keydown` handler ensures ProseMirror's internal state is never "surprised" by async changes.

---

## Key Issues Encountered (and how they were finally solved)

### 1. Mobile vs Desktop Timing Differences
**Final Solution:** Eliminated `onUpdate` debouncing for creation. By using the `Space` key as a discrete trigger, we aligned with how both desktop and mobile browsers process "completed" words.

### 2. Transaction Processing Race Conditions
**Final Solution:** Unified pill creation into a single transaction dispatch. Instead of multiple small updates, we accumulate all changes and apply them at once, keeping the Undo/Redo history clean and the cursor stable.

### 3. Event Propagation Issues (Typing Blocked)
**Final Solution:** This was actually a "Mark Stickiness" issue. ProseMirror was getting stuck inside a mark that it thought should continue. `excludes: '_'` and `inclusive: false` solved this at the schema level rather than the event level.

---

## What We Learned (Updated)

1. **Schema over Scripts**: Solving "stickiness" via mark properties (`inclusive`, `excludes`) is 100x more reliable than trying to manage cursor positions with `setTimeout`.
2. **Pending States are King**: Visualizing the pill immediately but deferring the DB work to the "Save" action removes all latency and 404 risks.
3. **Atomic is Better**: If you change the document, do it all in one transaction or one `editor.chain()`. Split transactions lead to race conditions.

---

## Final Decision: Revert to Button-Only

After extensive attempts, we decided to revert to the original button-only approach because:

1. **Reliability**: Button-only works perfectly on all platforms
2. **Simplicity**: Much simpler codebase, easier to maintain
3. **User Experience**: The delay is minimal (only happens on save)
4. **No Edge Cases**: No timing issues, race conditions, or mobile-specific problems

---

## Code Removed

### From `TiptapEditor.tsx`:
- Real-time detection logic in `onUpdate` callback
- `debounceTimerRef`, `isDetectingRef`, `justCreatedPillRef` refs
- `lastContentHashRef`, `lastCursorPosRef` refs
- Flag setting logic after pill creation
- Flag checks in `handleDOMEvents.keydown`

### From `NewNotePanel.tsx`:
- Entire fallback injection `useEffect` (lines 858-1092)
- `editorInstanceRef` and `handleEditorInstanceReady` callback

### From `TiptapScripturePill.ts`:
- `justCreatedPill` flag check in `'*'` keyboard handler

### Kept:
- `detectAndCreateScriptureNotes()` function (for potential future use)
- `convertScriptureReferencesToPills()` function (used after save)
- `convertNoteLinksToScripturePills()` function (used on load)

---

## Future Considerations

If real-time detection is desired in the future, consider:

1. **Different Approach**: Instead of creating pills while typing, show a visual indicator (underline, highlight) that converts to a pill on save
2. **Mobile-First Design**: Design specifically for mobile, then adapt for desktop
3. **Simpler Detection**: Only detect on space key press, not continuously
4. **User Preference**: Make it optional, default to button-only

---

## Conclusion

Real-time scripture detection proved to be more complex than initially anticipated, especially on mobile devices. The button-only approach is simpler, more reliable, and provides a better overall user experience with minimal delay.

