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

## Key Issues Encountered

### 1. Mobile vs Desktop Timing Differences

**Problem:** Mobile browsers process events differently than desktop, causing timing issues.

**Attempted solutions:**
- Mobile-specific delays
- Multiple verification checks
- Conservative injection logic

**Result:** Never fully resolved.

### 2. Transaction Processing Race Conditions

**Problem:** Multiple ProseMirror transactions (pill creation, cursor positioning, stored marks clearing) happening simultaneously interfered with keyboard input.

**Attempted solutions:**
- Set flag after transactions settle
- Use `requestAnimationFrame` to ensure processing
- Simplify transaction logic

**Result:** Partially resolved on desktop, never on mobile.

### 3. Event Propagation Issues

**Problem:** Keyboard events not reaching ProseMirror after pill creation, especially in form contexts.

**Attempted solutions:**
- Document-level event listeners
- Fallback injection mechanism
- Focus restoration

**Result:** Worked on desktop, unreliable on mobile.

### 4. Flag Timing Race Conditions

**Problem:** `justCreatedPill` flag cleared or checked at wrong times, causing missed injections.

**Attempted solutions:**
- Store flag value immediately
- Don't clear flag prematurely
- Use longer flag duration (500ms)

**Result:** Improved but not fully resolved.

---

## What We Learned

### 1. Real-Time Detection is Complex

Creating pills while typing introduces many edge cases:
- Transaction timing
- Event propagation
- Mobile browser differences
- Race conditions

### 2. Mobile Browsers Are Different

Mobile browsers (especially iOS Safari) handle:
- Keyboard events differently
- Transaction processing differently
- Focus management differently

This made it extremely difficult to create a solution that worked reliably on both desktop and mobile.

### 3. Form Contexts Add Complexity

Form contexts (like `NewNotePanel`) add additional complexity:
- Event propagation through form elements
- Focus management
- Multiple event handlers competing

### 4. ProseMirror Transactions Are Async

Even though `dispatch(tr)` appears synchronous, the actual processing and DOM updates are async, making timing critical.

### 5. Simpler is Better

The original button-only approach is simpler and more reliable:
- No timing issues
- No race conditions
- Works consistently on all platforms
- Easier to maintain

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

