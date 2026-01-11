# Pinned Threads Feature

## Overview

This document outlines the proposal to fully utilize the existing `isPinned` field on threads to ensure pinned threads always appear at the top of lists, with pinned threads sorted by `lastVisited` among themselves.

## Current State

### What Already Works

1. **Database Schema**: The `Threads` table already has an `isPinned` boolean field (default: false)
2. **Database Queries**: Thread-only queries already sort by `isPinned` first:
   - `getAllThreadsWithCounts()` - line 160 in `dashboard-data.ts`
   - `getThreadsForSpace()` - line 313 in `dashboard-data.ts`
3. **Sorting Function**: `sortThreadsByLastVisited()` in `sorting.ts` correctly handles pinned threads
4. **Toggle Action**: `threads.togglePin()` action exists in `src/actions/threads.ts`

### What's Missing

1. **Mixed Lists**: When threads are combined with notes in lists, `isPinned` is not preserved:
   - `getContentItems()` in `dashboard-data.ts` - doesn't include `isPinned` in thread mapping (line 1065)
   - `SpaceContentList.tsx` - doesn't include `isPinned` when mapping threads (line 299)
2. **Sorting**: Mixed lists use `sortByLastVisited()` which doesn't respect `isPinned`:
   - `getContentItems()` uses `sortByLastVisited()` instead of a pinned-aware function (line 1317)
   - `SpaceContentList.tsx` uses `sortByLastVisited()` (line 327)

## Proposed Solution

### Behavior

1. **Pinned threads always appear first** in any list that contains threads
2. **Pinned threads are sorted by `lastVisited`** among themselves (newest first)
3. **Non-pinned threads and notes follow**, also sorted by `lastVisited` (newest first)
4. **Visual indicator** should show which threads are pinned (UI consideration, not in scope of this doc)

### Sorting Logic

```
Priority 1: isPinned (pinned threads first)
  ├─ Priority 2: lastVisited (newest first among pinned)
  └─ Priority 3: ID tiebreaker (deterministic)
  
Priority 1: !isPinned (non-pinned threads and notes)
  ├─ Priority 2: lastVisited (newest first)
  └─ Priority 3: ID tiebreaker (deterministic)
```

## Implementation Plan

### Step 1: Add Mixed Sorting Function

**File**: `src/utils/sorting.ts`

Add a new function `sortMixedThreadsAndNotes()` that:
- Identifies threads by `type: "thread"`, `itemType: "thread"`, or presence of `threadId`
- Puts pinned threads first, sorted by `lastVisited`
- Then puts non-pinned threads and notes, sorted by `lastVisited`

```typescript
/**
 * For mixed threads and notes: pinned threads first (sorted by lastVisited), 
 * then non-pinned threads and notes (sorted by lastVisited)
 */
export function sortMixedThreadsAndNotes<T extends {
  type?: string;
  itemType?: string;
  threadId?: string;
  isPinned?: boolean;
  lastVisited?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
  id?: string;
}>(items: T[]): T[]
```

### Step 2: Update `getContentItems()`

**File**: `src/utils/dashboard-data.ts`

1. **Include `isPinned` in thread mapping** (line ~1065):
   ```typescript
   const threadItems = threadsToUse.map(thread => ({
     // ... existing fields ...
     isPinned: thread.isPinned, // Add this
   }));
   ```

2. **Update import** to include `sortMixedThreadsAndNotes`:
   ```typescript
   import { sortByLastVisited, sortMixedThreadsAndNotes } from "./sorting";
   ```

3. **Replace sorting** (line ~1317):
   ```typescript
   // Change from:
   const allItems = sortByLastVisited(allItemsArray)
   
   // To:
   const allItems = sortMixedThreadsAndNotes(allItemsArray)
   ```

### Step 3: Update `SpaceContentList.tsx`

**File**: `src/components/react/SpaceContentList.tsx`

1. **Update import**:
   ```typescript
   import { normalizeDate, sortMixedThreadsAndNotes } from '@/utils/sorting';
   ```

2. **Update `sortItemsByLastVisited` callback** to use `sortMixedThreadsAndNotes`:
   ```typescript
   const sortItemsByLastVisited = useCallback((items: SpaceItem[]): SpaceItem[] => {
     const itemsWithUpdatedAt = items.map(item => ({
       ...item,
       updatedAt: item.lastUpdated
     }));
     
     const sorted = sortMixedThreadsAndNotes(itemsWithUpdatedAt);
     
     return sorted.map(({ updatedAt, ...item }) => item);
   }, []);
   ```

3. **Include `isPinned` in thread mapping** (line ~299):
   ```typescript
   ...threads.map((thread: any) => ({
     // ... existing fields ...
     isPinned: thread.isPinned, // Add this
   }))
   ```

### Step 4: Update Type Definitions

Ensure type definitions include `isPinned` where needed:

- `SpaceItem` interface in `SpaceContentList.tsx`
- Content item types in `OrganizedContentList.tsx` (if threads appear there)
- Any other interfaces that represent threads in mixed lists

### Step 5: Verify Offline Support

**File**: `src/utils/offline-read-layer.ts`

Already uses `sortThreadsByLastVisited()` which handles pinned threads correctly. No changes needed.

## Edge Cases & Considerations

### 1. Multiple Pinned Threads

**Behavior**: All pinned threads appear first, sorted by `lastVisited` among themselves.

**Example**:
- Thread A (pinned, lastVisited: 2 hours ago)
- Thread B (pinned, lastVisited: 1 hour ago)
- Thread C (not pinned, lastVisited: 30 min ago)
- Note D (lastVisited: 10 min ago)

**Result**: B, A, C, D

### 2. Pinned Threads Without `lastVisited`

**Behavior**: Falls back to `updatedAt`, then `createdAt`, then sorts to end of pinned section.

**Implementation**: Already handled by existing `getSortTime()` logic in sorting functions.

### 3. Notes vs Non-Pinned Threads

**Behavior**: Notes and non-pinned threads are treated equally - sorted together by `lastVisited`.

**Rationale**: Only pinned threads get special treatment. Everything else follows normal `lastVisited` ordering.

### 4. Empty `lastVisited` for All Items

**Behavior**: Falls back to `updatedAt` → `createdAt` → ID tiebreaker, maintaining pinned threads first.

### 5. Performance

**Impact**: Minimal. The sorting function adds one boolean check per item. No additional database queries needed.

## Testing Checklist

### Unit Tests

- [ ] `sortMixedThreadsAndNotes()` with only threads
- [ ] `sortMixedThreadsAndNotes()` with only notes
- [ ] `sortMixedThreadsAndNotes()` with mixed threads and notes
- [ ] Pinned threads appear before non-pinned
- [ ] Pinned threads sorted by `lastVisited` among themselves
- [ ] Non-pinned items sorted by `lastVisited`
- [ ] Handles missing `lastVisited` (falls back to `updatedAt`/`createdAt`)
- [ ] ID tiebreaker works correctly

### Integration Tests

- [ ] Dashboard "All" tab shows pinned threads first
- [ ] Space content lists show pinned threads first
- [ ] Organized content list shows pinned threads first (if applicable)
- [ ] Pinning/unpinning updates list order immediately
- [ ] Visiting a pinned thread updates its position among pinned threads
- [ ] Visiting a non-pinned thread doesn't move it above pinned threads

### Edge Case Tests

- [ ] All threads pinned
- [ ] No threads pinned
- [ ] Pinned threads with no `lastVisited`
- [ ] Mixed items with missing dates
- [ ] Large lists (performance)

## Decision Criteria

### Should We Implement This?

**Pros:**
- ✅ Low implementation effort (mostly data mapping + sorting)
- ✅ Leverages existing infrastructure (`isPinned` field, toggle action)
- ✅ Improves UX for users who want to keep important threads accessible
- ✅ Consistent with common patterns (pinned chats, etc.)
- ✅ Pinned threads sorted by `lastVisited` keeps most relevant pinned thread first

**Cons:**
- ⚠️ Could clutter top of lists if users pin too many threads
- ⚠️ Adds another concept for users to understand
- ⚠️ May reduce clarity of "recently visited" ordering if overused

### Recommendation

**Yes, implement with considerations:**

1. **Visual Indicator**: Ensure pinned threads have clear visual distinction (separate task)
2. **User Education**: Consider tooltip or help text explaining pinned behavior
3. **Soft Limit**: Consider UI guidance suggesting 3-5 pinned threads max (not enforced)
4. **Monitoring**: Track how many users pin threads and how many they pin

## Migration Notes

### No Database Migration Needed

The `isPinned` field already exists. No schema changes required.

### Backward Compatibility

- Existing pinned threads will automatically appear at top after implementation
- Non-pinned threads behave exactly as before
- No breaking changes to APIs or data structures

## Related Files

### Core Implementation
- `src/utils/sorting.ts` - Add `sortMixedThreadsAndNotes()`
- `src/utils/dashboard-data.ts` - Update `getContentItems()`
- `src/components/react/SpaceContentList.tsx` - Update sorting and mapping

### Already Correct
- `src/utils/dashboard-data.ts` - `getAllThreadsWithCounts()`, `getThreadsForSpace()`
- `src/utils/offline-read-layer.ts` - Uses `sortThreadsByLastVisited()`
- `src/actions/threads.ts` - Toggle pin action exists

### Type Definitions (May Need Updates)
- `src/components/react/SpaceContentList.tsx` - `SpaceItem` interface
- `src/components/react/OrganizedContentList.tsx` - Content item types (if applicable)

## Future Enhancements (Out of Scope)

1. **Visual Indicators**: Pin icon/badge on pinned threads
2. **Pin Limit**: Enforce or suggest maximum pinned threads
3. **Pin Groups**: Separate section for pinned threads with divider
4. **Pin Ordering**: Allow manual reordering of pinned threads
5. **Pin Analytics**: Track pin usage patterns

## Questions to Resolve

1. Should pinned threads have a visual indicator? (UI/UX decision)
2. Should there be a limit on pinned threads? (Product decision)
3. Should pinned threads be in a separate section with divider? (UI/UX decision)
4. Should we track pin usage analytics? (Product decision)
