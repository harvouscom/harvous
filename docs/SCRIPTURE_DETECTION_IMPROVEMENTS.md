# Scripture Detection & Pill Functionality - Future Improvements

This document outlines potential improvements to the scripture detection and pill functionality that are not yet implemented. These are organized by priority level.

## Medium Priority Improvements

### 1. Incremental Detection
**Issue**: Detection runs on the entire document text every time, which is inefficient for large documents.

**Current Behavior**: When text changes, the entire document is sent to the detection API after a 2-second debounce.

**Proposed Solution**:
- Only detect in the changed region (track what text was added/modified)
- Use a diff algorithm to identify new text segments
- Only send new/changed text to the detection API
- Merge results with existing pills

**Files to Modify**:
- `src/components/react/TiptapEditor.tsx` - Track text changes incrementally
- `src/components/react/TiptapEditor.tsx` - Modify `detectAndCreateScriptureNotes` to handle incremental detection

**Benefits**:
- Faster detection for large documents
- Reduced API calls
- Better performance on slower networks

---

### 2. Visual Feedback During Detection
**Issue**: No indication when detection is running, which can be confusing if detection takes time.

**Current Behavior**: Detection happens silently in the background with no user feedback.

**Proposed Solution**:
- Add a subtle loading indicator (e.g., a small spinner or progress bar)
- Show a toast notification when detection completes
- Optionally disable detection UI during processing to prevent conflicts

**Files to Modify**:
- `src/components/react/TiptapEditor.tsx` - Add loading state
- Add UI component for loading indicator

**Benefits**:
- Better user experience
- Users know when detection is happening
- Prevents confusion about why pills aren't appearing

---

### 3. Code Duplication Reduction
**Issue**: Pill restoration logic is duplicated in two places in the click handler.

**Current Behavior**: The same note recreation logic exists in both the mark-based click handler and the element-based click handler.

**Proposed Solution**:
- Extract note restoration logic to a shared function
- Both click handlers call the shared function
- Reduces code duplication and maintenance burden

**Files to Modify**:
- `src/components/react/TiptapScripturePill.ts` - Extract restoration logic to helper function

**Benefits**:
- Easier maintenance
- Consistent behavior
- Single source of truth for restoration logic

---

### 4. API Call Batching
**Issue**: `convertNoteLinksToScripturePills` makes individual API calls for each note-link, which is inefficient.

**Current Behavior**: For each note-link found, a separate API call is made to check if it's a scripture note.

**Proposed Solution**:
- Batch API calls - collect all note IDs first
- Create a batch endpoint that accepts multiple note IDs
- Or use Promise.all with rate limiting
- Reduce number of network requests

**Files to Modify**:
- `src/components/react/TiptapEditor.tsx` - Modify `convertNoteLinksToScripturePills`
- `src/pages/api/notes/` - Create batch endpoint (if needed)

**Benefits**:
- Faster conversion of note-links to pills
- Reduced server load
- Better performance

---

## Low Priority Improvements

### 5. Manual Detection Trigger
**Issue**: Users can't manually trigger detection if automatic detection fails or is disabled.

**Current Behavior**: Detection only happens automatically after typing stops for 2 seconds.

**Proposed Solution**:
- Add a button or keyboard shortcut (e.g., Cmd/Ctrl + Shift + D) to manually trigger detection
- Useful for debugging or when automatic detection doesn't work
- Show feedback when manual detection completes

**Files to Modify**:
- `src/components/react/TiptapEditor.tsx` - Add manual trigger function
- Add UI button or keyboard shortcut handler

**Benefits**:
- User control
- Debugging capability
- Fallback if automatic detection fails

---

### 6. Remove Pill Without Deleting Text
**Issue**: Users can only delete pills by selecting and deleting the text, which removes the reference entirely.

**Current Behavior**: To remove a pill, users must delete the text, which removes the scripture reference from the document.

**Proposed Solution**:
- Add a context menu or hover action to remove the pill mark
- Keep the text but remove the pill styling and link
- Could be a right-click menu or a small "X" button on hover

**Files to Modify**:
- `src/components/react/TiptapScripturePill.ts` - Add remove action
- Add UI for context menu or hover button

**Benefits**:
- Better user control
- Preserve text while removing pill functionality
- More intuitive UX

---

### 7. Overlapping References Handling
**Issue**: If "John 3:16" and "John 3:16-18" both exist, they might conflict or create duplicate pills.

**Current Behavior**: Both references would be detected, potentially creating overlapping pills.

**Proposed Solution**:
- Prioritize longer/more specific references
- When detecting, check if a reference is a subset of another
- Only create pill for the most specific match
- Or handle overlaps explicitly (e.g., merge or choose one)

**Files to Modify**:
- `src/utils/scripture-detector.ts` - Add overlap detection logic
- `src/components/react/TiptapEditor.tsx` - Handle overlapping references in pill creation

**Benefits**:
- Cleaner pill display
- No conflicting pills
- Better user experience

---

### 8. Book Name Matching False Positives
**Issue**: The `startsWith`/`endsWith` logic could match "John" when the text is "Johnny 3:16" (though unlikely with word boundaries).

**Current Behavior**: Book name matching uses word boundaries, but the normalization might still allow some false positives.

**Proposed Solution**:
- Use stricter word boundary matching
- Require exact matches after normalization for book names
- Add validation that the matched text is actually a book name, not part of a word

**Files to Modify**:
- `src/utils/scripture-detector.ts` - Improve book name matching in `parseReference`

**Benefits**:
- Fewer false positives
- More accurate detection
- Better reliability

---

### 9. Invalid Verse Number Validation
**Issue**: No validation that verse numbers are reasonable (e.g., Psalm 119:176 is valid, but Psalm 119:2000 is not).

**Current Behavior**: Any verse number is accepted, even if it doesn't exist in the Bible.

**Proposed Solution**:
- Add validation against known chapter/verse limits
- Requires a reference data file with max verses per chapter
- Could be optional - warn but don't block
- Or fetch from API and validate

**Files to Modify**:
- `src/utils/scripture-detector.ts` - Add verse validation
- Create reference data file or API endpoint for validation

**Benefits**:
- Catch typos
- Prevent invalid references
- Better data quality

**Note**: This requires maintaining a database of chapter/verse limits, which adds complexity.

---

### 10. Enhanced Error Handling
**Issue**: Some API failures are silently ignored, making debugging difficult.

**Current Behavior**: Errors are logged to console but not always shown to users.

**Proposed Solution**:
- Add retry logic for transient failures
- Show user-friendly error messages for critical failures
- Add error boundaries for detection failures
- Log errors to error tracking service

**Files to Modify**:
- `src/components/react/TiptapEditor.tsx` - Add error handling
- `src/components/react/TiptapScripturePill.ts` - Add error handling
- Add error tracking integration

**Benefits**:
- Better debugging
- User awareness of issues
- More resilient system

---

### 11. Type Safety Improvements
**Issue**: Some `any` types in helper functions reduce type safety.

**Current Behavior**: Some functions use `any` types, particularly in ProseMirror document handling.

**Proposed Solution**:
- Add proper TypeScript types for ProseMirror document structures
- Replace `any` with specific types
- Add type guards where needed

**Files to Modify**:
- `src/components/react/TiptapEditor.tsx` - Add types
- `src/components/react/TiptapScripturePill.ts` - Add types
- Create type definitions file if needed

**Benefits**:
- Better IDE support
- Catch errors at compile time
- Improved code quality

---

## Implementation Notes

### Priority Guidelines
- **High Priority**: Critical bugs or major UX issues (already implemented)
- **Medium Priority**: Performance improvements and code quality (worth implementing when time permits)
- **Low Priority**: Nice-to-have features (implement if user feedback indicates need)

### Testing Considerations
When implementing any of these improvements:
1. Test with various scripture reference formats
2. Test with large documents (1000+ words)
3. Test edge cases (overlapping references, invalid ranges, etc.)
4. Test on slow networks
5. Test with multiple pills in the same document

### Breaking Changes
Most improvements should be backward compatible. However:
- API changes (batching) may require backend updates
- UI changes (manual trigger, remove pill) are additive and shouldn't break existing functionality

---

## Related Documentation
- `ARCHITECTURE.md` - Overall system architecture
- `TYPESCRIPT_INLINE_SCRIPTS.md` - TypeScript usage guidelines
- `REACT_ISLANDS_STRATEGY.md` - React component patterns

