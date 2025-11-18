# Scripture Pill Implementation Guide

## Overview

The scripture pill system in Harvous automatically detects Bible references in notes and converts them into interactive, styled pills. This document explains how the detection, creation, and formatting prevention systems work.

## Table of Contents

- [How It Works](#how-it-works)
- [Detection Flow](#detection-flow)
- [Pill Creation](#pill-creation)
- [Formatting Prevention](#formatting-prevention)
- [Technical Details](#technical-details)
- [Lessons Learned](#lessons-learned)

---

## How It Works

### User Experience

1. **User types a note** with scripture references (e.g., "I love John 3:16")
2. **User saves the note** (creates or updates)
3. **Server processes scripture references**:
   - Detects all Bible references in the content
   - Creates scripture notes for new references
   - Links existing references to the current note
   - Returns HTML with highlighted references
4. **Editor converts highlights to pills**:
   - HTML spans (`<span class="scripture-pill">`) are converted to Tiptap marks
   - Pills appear as styled, clickable elements
5. **Toasts notify user** of created/linked scripture notes

### Key Features

- ✅ **Post-save detection** - No interruption while typing
- ✅ **Automatic pill creation** - References become interactive pills
- ✅ **Formatting prevention** - Typing after a pill doesn't inherit formatting
- ✅ **Toast notifications** - User sees which scripture notes were created/added
- ✅ **Pill persistence** - Pills remain when editing and adding new references

---

## Detection Flow

### 1. Note Creation/Update

When a note is created or updated, the API endpoints call `processScriptureReferences`:

```typescript
// src/pages/api/notes/create.ts
const result = await processScriptureReferences(noteId, userId, content);

// src/pages/api/notes/update.ts
const result = await processScriptureReferences(noteId, userId, content, {
  contentOverride: capitalizedContent // Preserves existing pills
});
```

### 2. Scripture Processing

`processScriptureReferences` (in `src/utils/process-scripture-references.ts`) does:

1. **Extracts existing pills** from HTML to avoid re-processing
2. **Detects new references** using regex patterns
3. **Creates scripture notes** for new references
4. **Links existing references** to the current note
5. **Highlights all references** (new + existing) in HTML
6. **Returns results** with actions: 'created', 'added', 'skipped', 'unorganized'

### 3. HTML Highlighting

`highlightScriptureReferences` (in `src/utils/scripture-highlighter.ts`) wraps references in HTML:

```html
<span 
  class="scripture-pill" 
  data-scripture-reference="John 3:16"
  style="background: #FEF3C7; padding: 2px 6px; border-radius: 4px; ...">
  John 3:16
</span>
```

### 4. Pill Conversion

After saving, the editor converts HTML spans to Tiptap marks:

```typescript
// In CardFullEditable.tsx or NewNotePanel.tsx
await convertNoteLinksToScripturePills(editor, saveResult.processedContent);
```

This function:
- Finds all `<span class="scripture-pill">` elements
- Converts them to `scripturePill` marks in Tiptap
- Preserves the reference data

---

## Pill Creation

### Tiptap Mark Extension

The `ScripturePill` mark extension (`src/components/react/TiptapScripturePill.ts`) defines:

- **Rendering**: How pills appear in the editor
- **HTML serialization**: How pills are saved to HTML
- **Keyboard shortcuts**: Tab, Space, Backspace, Delete to exit pills
- **Formatting prevention**: Prevents mark inheritance after pills

### Mark Structure

Pills are stored as ProseMirror marks with attributes:

```typescript
{
  type: 'scripturePill',
  attrs: {
    reference: 'John 3:16',
    noteId: 'note_123'
  }
}
```

### Visual Styling

Pills have:
- Yellow background (`#FEF3C7`)
- Rounded corners
- Inner shadow for depth
- Clickable to navigate to scripture note

---

## Formatting Prevention

### The Problem

When typing immediately after a scripture pill, ProseMirror would inherit formatting marks (bold, highlight) from the pill, causing new text to appear formatted.

### The Solution

We implemented a multi-layered approach using ProseMirror plugins:

#### 1. `handleTextInput` (Primary Handler)

Intercepts text input at the ProseMirror level:

```typescript
handleTextInput(view, from, to, text) {
  // Check if we're at the end of a pill
  const currentHasPill = /* check position 'from' */;
  const nextHasPill = /* check position 'from+1' */;
  
  if (currentHasPill && !nextHasPill) {
    // We're at the end of a pill - insert text without marks
    const tr = state.tr;
    tr.setStoredMarks([]);
    const textNode = schema.text(text, []);
    tr.replaceWith(from, to, textNode);
    // Remove all formatting marks
    // ...
    view.dispatch(tr);
    return true; // Handled
  }
}
```

#### 2. `filterTransaction` (Prevention)

Clears stored marks before transactions are applied:

```typescript
filterTransaction(transaction, state) {
  if (isAtEndOfPill(state)) {
    transaction.setStoredMarks([]);
  }
  return true;
}
```

#### 3. `appendTransaction` (Cleanup)

Removes formatting marks from text after it's inserted:

```typescript
appendTransaction(transactions, oldState, newState) {
  if (isAtEndOfPill(newState) && hasFormattingMarks(newState)) {
    const tr = newState.tr;
    // Remove all formatting marks
    tr.removeMark(from, to, markType);
    return tr;
  }
}
```

#### 4. `view.update` (Monitoring)

Monitors state updates and removes marks immediately:

```typescript
view.update(view, prevState) {
  if (isAtEndOfPill(state) && hasFormattingMarks(state)) {
    const tr = state.tr;
    // Remove formatting marks
    view.dispatch(tr);
  }
}
```

### Detection Logic

**Critical insight**: ProseMirror marks are **inclusive at boundaries**. This means:
- If a pill ends at position 40, position 40 still has the pill mark
- Position 41 (after the pill) does NOT have the pill mark

So we detect "at end of pill" by checking:
- Position `from` has pill mark (`currentHasPill = true`)
- Position `from+1` does NOT have pill mark (`nextHasPill = false`)

This works because:
- When typing at position 40 (end of pill), `from = 40`
- `currentHasPill = true` (position 40 has pill)
- `nextHasPill = false` (position 41 doesn't have pill)
- Therefore: `currentHasPill && !nextHasPill` = we're at the end!

---

## Technical Details

### Mark Types

Pills can be stored as either:
- `scripturePill` - The primary mark type
- `noteLink` - Legacy/alternative mark type

Our detection checks for both:
```typescript
const hasPill = marks.some(m => 
  m.type.name === 'scripturePill' || m.type.name === 'noteLink'
);
```

### Position Resolution

ProseMirror uses `doc.resolve(position)` to get position information:

```typescript
const $pos = state.doc.resolve(from);
const marks = $pos.marks(); // Get all marks at this position
```

### Transaction Lifecycle

1. **User types** → `handleTextInput` intercepts
2. **Transaction created** → `filterTransaction` modifies it
3. **Transaction applied** → Document updated
4. **Append transaction** → `appendTransaction` adds cleanup
5. **View updates** → `view.update` monitors and fixes

### Error Handling

All detection logic is wrapped in try-catch blocks to prevent crashes if:
- Position is out of bounds
- Document structure is invalid
- Mark resolution fails

---

## Lessons Learned

### 1. ProseMirror Mark Boundaries

**Lesson**: Marks are inclusive at boundaries.

**Impact**: We can't check "previous position has pill, current doesn't" because the current position (at the end of a pill) still has the pill mark.

**Solution**: Check "current position has pill, next position doesn't" to detect the end of a pill.

### 2. Multiple Layers of Defense

**Lesson**: A single approach wasn't sufficient.

**Impact**: Formatting still persisted despite one fix.

**Solution**: Implemented 4 layers:
- `handleTextInput` - Intercept and prevent
- `filterTransaction` - Clear stored marks
- `appendTransaction` - Remove marks after insertion
- `view.update` - Monitor and fix

### 3. Post-Save Processing

**Lesson**: Processing during typing caused cursor issues.

**Impact**: Cursor got stuck inside pills, detection was unreliable.

**Solution**: Move all processing to post-save:
- User types freely
- On save, server processes references
- Editor converts HTML to pills
- User sees pills and can continue typing

### 4. Pill Persistence

**Lesson**: Existing pills disappeared when adding new ones.

**Impact**: User lost visual indication of previous references.

**Solution**: 
- Pass `contentOverride` to preserve existing pills
- Extract existing pills from HTML before processing
- Re-highlight all references (new + existing)

### 5. Toast Notifications

**Lesson**: Users need feedback on what happened.

**Impact**: Users didn't know if scripture notes were created.

**Solution**:
- Return `scriptureResults` from API
- Dispatch toasts for 'created' and 'added' actions
- Skip toasts for 'skipped' and 'unorganized'

### 6. Standard ProseMirror Patterns

**Lesson**: Use ProseMirror's built-in mechanisms.

**Impact**: Custom DOM handlers conflicted with ProseMirror.

**Solution**: Use `props.handleTextInput` instead of `handleDOMEvents.beforeinput` - this is the standard ProseMirror way to intercept text input.

---

## File Structure

```
src/
├── components/react/
│   ├── TiptapScripturePill.ts      # Mark extension + formatting prevention
│   ├── TiptapEditor.tsx            # Editor component
│   ├── CardFullEditable.tsx        # Inline editing component
│   └── NewNotePanel.tsx            # New note creation
│
├── utils/
│   ├── process-scripture-references.ts  # Main processing logic
│   └── scripture-highlighter.ts       # HTML highlighting
│
└── pages/api/
    ├── notes/create.ts             # Note creation endpoint
    └── notes/update.ts              # Note update endpoint
```

---

## Future Improvements

1. **Real-time detection** (optional) - Show pills as you type (with debouncing)
2. **Pill editing** - Click to edit the reference
3. **Multiple translations** - Show pills with different Bible translations
4. **Verse preview** - Hover to see verse text
5. **Bulk processing** - Process all notes for scripture references

---

## Related Documentation

- [ARCHITECTURE.md](../ARCHITECTURE.md) - Overall system architecture
- [README.md](../README.md) - Project overview
- [TYPESCRIPT_INLINE_SCRIPTS.md](./TYPESCRIPT_INLINE_SCRIPTS.md) - TypeScript in inline scripts

---

**Last Updated**: January 2025
**Status**: ✅ Production Ready

