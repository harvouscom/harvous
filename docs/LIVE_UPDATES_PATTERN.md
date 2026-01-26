# Live Updates Pattern for Edit Panels

## Problem

When edit panels (like `EditThreadPanel`, `EditSpacePanel`) are used in BottomSheet on mobile, they receive `initialTitle` and `initialColor` props from server-rendered Astro components. These props can be **stale** because:

1. Server renders the page with data from the database at page load time
2. User makes changes and saves them
3. Changes are persisted to the database
4. But the Astro page's `currentThread`/`currentSpace` objects don't update (they're server-rendered)
5. When the panel reopens, it receives stale props
6. Panel shows old values instead of saved ones

Additionally, browser caching can serve stale API responses, making the problem worse.

## Solution Pattern

The solution involves three key strategies:

### 1. Key Props for Remounting

**Problem**: React may reuse component instances when panels close/reopen, causing refs to persist and skip necessary fetches.

**Solution**: Add a `key` prop based on `panelKey` to force remount when the panel opens.

```typescript
// In BottomSheet.tsx
<EditThreadPanel 
  key={`mobile-edit-thread-${panelKey}`}
  threadId={currentThread.id}
  initialTitle={currentThread.title}
  initialColor={currentThread.color}
  // ...
/>
```

**Why**: When `panelKey` increments, React sees a new key and creates a fresh component instance, resetting all refs and state.

### 2. Fetch Fresh Data on Mount

**Problem**: Relying solely on props means using potentially stale data.

**Solution**: Always fetch the latest data from the API on mount, regardless of props.

```typescript
// Track if we've fetched for this ID to avoid unnecessary refetches
const lastFetchedIdRef = useRef<string | null>(null);
const hasFetchedDataRef = useRef(false);

useEffect(() => {
  if (!id || lastFetchedIdRef.current === id) {
    return; // Skip if invalid or already fetched
  }
  
  lastFetchedIdRef.current = id;
  hasFetchedDataRef.current = false;
  
  const fetchData = async () => {
    try {
      // Cache-busting to ensure fresh data
      const cacheBuster = `?t=${Date.now()}`;
      const response = await fetch(`/api/items/${id}${cacheBuster}`, {
        credentials: 'include',
        cache: 'no-store' // Bypass browser cache
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Always update formData with fetched data
        // API is the source of truth, not stale props
        setFormData(prev => ({
          ...prev,
          title: data.title || '',
          selectedColor: data.color || 'paper'
        }));
        
        // Update initialValues to match
        setInitialValues(prev => ({
          ...prev,
          title: data.title || '',
          color: data.color || 'paper'
        }));
        
        hasFetchedDataRef.current = true;
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      // Silently fail - props will be used as fallback
    }
  };
  
  fetchData();
}, [id]);
```

**Key Points**:
- Use refs to track fetch state (avoids unnecessary refetches)
- Always update formData with fetched data (don't check if it matches initial props)
- The API is the source of truth, not the props
- Cache-busting ensures fresh data

### 3. Prevent Props from Overwriting Fetched Data

**Problem**: Props sync useEffect might overwrite freshly fetched data.

**Solution**: Skip props sync if we've already fetched data.

```typescript
// Sync formData with props, but only if we haven't fetched data yet
useEffect(() => {
  // Skip if we've already fetched fresh data
  if (hasFetchedDataRef.current) {
    return;
  }
  
  setFormData(prev => {
    if (prev.title !== initialTitle || prev.selectedColor !== initialColor) {
      return {
        ...prev,
        title: initialTitle,
        selectedColor: initialColor
      };
    }
    return prev;
  });
}, [initialTitle, initialColor]);
```

**Why**: Props are used as initial values, but once we fetch from the API, the API data takes precedence.

## Complete Example: EditThreadPanel

See `src/components/react/EditThreadPanel.tsx` for the full implementation:

1. **Refs for tracking**:
   - `lastFetchedThreadIdRef`: Tracks which threadId we've fetched
   - `hasFetchedThreadDataRef`: Prevents props from overwriting fetched data

2. **Fetch on mount**:
   - Only fetches if threadId changed or we haven't fetched yet
   - Uses cache-busting (`?t=${Date.now()}` and `cache: 'no-store'`)
   - Always updates formData with fetched data

3. **Props sync guard**:
   - Skips updating if we've already fetched data
   - Props are fallback only

4. **Key prop in BottomSheet**:
   - Forces remount when panel opens
   - Ensures fresh state and refs

## Complete Example: EditSpacePanel

See `src/components/react/EditSpacePanel.tsx` for a similar implementation with auto-save:

1. **Auto-save with debouncing**: Title changes are debounced, color changes are immediate
2. **SessionStorage for pending saves**: Tracks unsaved changes across component remounts
3. **Event dispatching**: Dispatches `spaceUpdated` events with complete data
4. **Navigation DOM updates**: Updates various DOM elements for immediate visual feedback

## When to Apply This Pattern

Apply this pattern when:

1. **Component receives props from server-rendered Astro components**
   - Props might be stale after saves
   - Component is used in BottomSheet (mobile)

2. **Component needs to show latest saved data**
   - User makes changes, saves, closes panel
   - When reopening, should show saved values, not stale props

3. **API endpoint exists to fetch fresh data**
   - Can fetch the latest data for the entity
   - Endpoint should be cacheable or support cache-busting

4. **Component remounts when panel opens**
   - Uses key prop based on panelKey
   - Ensures fresh state on each open

## When NOT to Apply

Don't apply this pattern when:

1. **Props are always fresh**
   - Props come from client-side state that updates immediately
   - No server-rendered data involved

2. **No API endpoint exists**
   - Can't fetch fresh data
   - Must rely on props (but document the limitation)

3. **Component doesn't remount**
   - Key prop not available or not appropriate
   - Need alternative strategy (event listeners, etc.)

## Related Patterns

### React State Management vs DOM Manipulation

For server-rendered components that need live updates (like CardStack headers), use **React state management** instead of DOM manipulation:

- **DOM manipulation fails** because:
  - View Transitions reset server-rendered HTML
  - Inline styles from server override JavaScript-set properties
  - Timing issues on mobile with animations

- **React state works** because:
  - State persists across View Transitions
  - Reactive updates trigger re-renders
  - No timing issues

See `docs/PROFILE_HEADER_UPDATE_SOLUTION.md` for the profile page example using `ProfileCardStackHeader`.

### Event-Driven Updates

For components that need to update when other components make changes:

1. **Dispatch events with data**: Include updated values in event detail
2. **Listen for events**: Components listen and update their state
3. **Prioritize event data**: Use event detail over DOM reads for immediate updates
4. **Prevent overwrites**: Use refs to track recent event updates and prevent sync effects/DOM reads from overwriting them

Example from `EditThreadPanel`:
```typescript
window.dispatchEvent(new CustomEvent('threadUpdated', {
  detail: { 
    threadId,
    title: title.trim(),
    color: color,
    backgroundGradient: getThreadGradientCSS(color)
  }
}));
```

#### Preventing State Overwrites

**Problem**: When components update state from events, sync effects or DOM reads might overwrite the fresh event data with stale values.

**Solution**: Use a ref to track recent event updates and prevent overwrites for a short period.

Example from `MobileNavigation.tsx`:
```typescript
// Track recent event updates to prevent sync effect and DOM reads from overwriting them
const lastEventUpdateRef = useRef<{ spaceId: string; timestamp: number } | null>(null);

// In event handler - set the ref when updating from event
if (isSelectedSpace) {
  const newSpace = { /* ... */ };
  lastEventUpdateRef.current = { spaceId: spaceIdForUpdate, timestamp: Date.now() };
  setUpdatedCurrentSpace(newSpace);
}

// In sync effect - check ref before overwriting
useEffect(() => {
  // Don't sync if we just updated from an event (within last 2 seconds)
  if (lastEventUpdateRef.current && 
      lastEventUpdateRef.current.spaceId === currentSpace?.id &&
      Date.now() - lastEventUpdateRef.current.timestamp < 2000) {
    return; // Skip sync to preserve event update
  }
  // ... rest of sync logic
}, [currentSpace]);

// In DOM read functions - check ref before overwriting
const readActiveSpaceFromDom = () => {
  if (lastEventUpdateRef.current && 
      lastEventUpdateRef.current.spaceId === itemId &&
      Date.now() - lastEventUpdateRef.current.timestamp < 2000) {
    return; // Skip DOM read to preserve event update
  }
  // ... rest of DOM read logic
};
```

**Key Points**:
- Track event updates with spaceId and timestamp
- Use a 2-second window to prevent overwrites (enough for React to re-render)
- Check ref in sync effects, DOM reads, and any other code that might overwrite state
- After 2 seconds, normal syncing resumes for navigation/other changes

## Best Practices

1. **Always fetch fresh data on mount** when props might be stale
2. **Use cache-busting** for critical data fetches
3. **API is source of truth**, not props
4. **Use refs to track fetch state** to avoid unnecessary refetches
5. **Key props for remounting** in BottomSheet components
6. **Prevent props from overwriting** fetched data
7. **Mark data as fresh after saves** (update refs to indicate we have latest data)
8. **Prevent state overwrites from sync effects**: Use refs to track recent event updates and block overwrites for a short period (2 seconds)
9. **Prioritize event data in useMemo**: When computing derived state, prioritize event-updated state over props or other sources
10. **Dispatch complete event data**: Include all necessary fields in event detail so listeners don't need to fetch or read DOM

## Files Using This Pattern

- `src/components/react/EditThreadPanel.tsx` - Full implementation with data fetching
- `src/components/react/EditSpacePanel.tsx` - Full implementation with data fetching and auto-save
- `src/components/react/BottomSheet.tsx` - Key props for remounting
- `src/components/react/ThreadCardStackHeader.tsx` - React state management for server-rendered header
- `src/components/react/SpaceCardStackHeader.tsx` - React state management for server-rendered space header
- `src/components/react/navigation/MobileNavigation.tsx` - Event-driven updates with overwrite prevention
- `src/components/react/navigation/NavigationColumn.tsx` - Event-driven updates for desktop navigation
- `src/components/react/navigation/NavigationContext.tsx` - Event-driven updates for navigation history
- `src/components/react/navigation/PersistentNavigation.tsx` - Event-driven updates for persistent nav

## Mobile Navigation Specific Pattern

For mobile navigation components that display space/thread information:

1. **Maintain local state**: Use `localSpaces` or `localThreads` state that gets updated from events
2. **Update from events**: Listen for `spaceUpdated`/`threadUpdated` events and update local state
3. **Prevent overwrites**: Use refs to track recent event updates and prevent sync effects from overwriting
4. **Prioritize event data**: In useMemo computations, prioritize `updatedCurrentSpace`/`updatedCurrentThread` over props

Example pattern from `MobileNavigation.tsx`:
- `localSpaces` state updated from `spaceUpdated` events
- `updatedCurrentSpace` state updated from events (with overwrite prevention)
- `selectedSpace` useMemo prioritizes `updatedCurrentSpace` over `filteredSpaces` or props
- Ref-based protection prevents sync effects and DOM reads from overwriting event updates
