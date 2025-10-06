# V1 Issues & Bug Tracking

## Mobile Note Creation Toolbar Visibility Issue

### Problem Description
When creating a new note on mobile, the TiptapEditor toolbar is not visible within the viewport. Users cannot access formatting options (bold, italic, underline, lists) because the toolbar is positioned outside the visible area.

### What's Working ✅
- **Desktop Experience**: Toolbar is visible and functional
- **Mobile Bottom Sheet**: Opens correctly and contains the editor
- **Editor Functionality**: TiptapEditor works properly when toolbar is accessible
- **Form Submission**: Note creation process completes successfully

### What's Not Working ❌
- **Mobile Toolbar Visibility**: TiptapEditor toolbar is positioned outside viewport
- **Formatting Access**: Users cannot access bold, italic, underline, list formatting
- **Mobile UX**: Poor user experience for note creation on mobile devices

### Root Cause Analysis
The issue appears to be related to the mobile bottom sheet layout and how the TiptapEditor toolbar is positioned within the constrained mobile viewport. The toolbar is positioned at the bottom of the editor but may be getting cut off or positioned outside the visible area.

### Technical Details

#### Current Implementation
- **Mobile Container**: `BottomSheet.tsx` with `h-[90vh]` height
- **Editor Container**: `NewNotePanel.tsx` with flex layout
- **Toolbar Position**: `TiptapEditor.tsx` toolbar positioned at bottom with `mt-2`
- **Viewport Issues**: Toolbar may be positioned below the visible area

#### Files Involved
- `src/components/react/BottomSheet.tsx` - Mobile container layout
- `src/components/react/NewNotePanel.tsx` - Note creation panel layout
- `src/components/react/TiptapEditor.tsx` - Editor with toolbar positioning

### Expected Behavior
On mobile note creation:
1. Bottom sheet should open with full viewport coverage ✅
2. TiptapEditor should be visible and functional ✅
3. **Toolbar should be visible within the viewport** ❌
4. Users should be able to access all formatting options ❌
5. Note creation should complete successfully ✅

### Solution Strategy

#### Option 1: Toolbar Repositioning
- Move toolbar to top of editor instead of bottom
- Adjust mobile layout to accommodate toolbar
- Ensure toolbar stays within viewport bounds

#### Option 2: Mobile-Specific Toolbar
- Create a mobile-optimized toolbar layout
- Use horizontal scrolling for toolbar buttons
- Implement sticky toolbar positioning

#### Option 3: Layout Adjustments
- Adjust bottom sheet height to accommodate toolbar
- Modify flex layout to ensure toolbar visibility
- Add padding/margins to prevent toolbar cutoff

### Implementation Plan

#### Phase 1: Quick Fix
- Adjust toolbar positioning in `TiptapEditor.tsx`
- Modify mobile layout in `NewNotePanel.tsx`
- Test on various mobile devices

#### Phase 2: Mobile Optimization
- Create mobile-specific toolbar component
- Implement responsive toolbar behavior
- Add mobile-specific styling

#### Phase 3: Testing & Polish
- Test on various mobile devices and screen sizes
- Ensure toolbar accessibility
- Optimize mobile user experience

### Files to Update

#### High Priority
- `src/components/react/TiptapEditor.tsx` - Toolbar positioning
- `src/components/react/NewNotePanel.tsx` - Mobile layout
- `src/components/react/BottomSheet.tsx` - Container height

#### Medium Priority
- Mobile-specific CSS adjustments
- Responsive toolbar behavior
- Mobile UX improvements

### Testing Strategy

#### Current Testing
- ✅ Desktop toolbar visibility
- ✅ Mobile bottom sheet functionality
- ❌ Mobile toolbar visibility
- ❌ Mobile formatting access

#### Future Testing
- [ ] Mobile toolbar visibility on various devices
- [ ] Toolbar functionality on mobile
- [ ] Mobile note creation workflow
- [ ] Cross-device consistency

### Related Issues
- Mobile user experience
- Mobile note creation workflow
- TiptapEditor mobile optimization
- Bottom sheet layout constraints

### Notes
- This issue affects mobile note creation usability
- High priority for mobile user experience
- Should be addressed before V1 release
- Consider mobile-first design approach

---

**Created**: January 2025  
**Status**: Open - Mobile toolbar visibility issue  
**Priority**: High  
**Assigned**: Mobile UX Team

---

## Additional V1 Issues

### Minor Polish Items
**Priority**: Low  
**Current Issues**:
- Mobile avatar color updates (desktop works, mobile doesn't update in real-time)
- EditNameColorPanel navigation retention (shows empty placeholders after navigation)
- Various UI polish items

**Estimated Time**: 2-3 days

---

## Navigation System Real-time Updates Issue

### Problem Description
The thread synchronization system is working correctly for the NoteDetailsPanel, but the persistent navigation system is not updating when notes are added or removed from threads. This results in stale navigation counts and thread pages not reflecting real-time changes.

### What's Working ✅
- **Event System**: Custom events (`noteAddedToThread`, `noteRemovedFromThread`) are dispatched correctly
- **API Integration**: Database operations are successful
- **NoteDetailsPanel**: Shows correct thread assignments immediately after operations
- **Event Listeners**: Are properly attached to both thread page and navigation system

### What's Not Working ❌
- **Navigation Counts**: Thread note counts in the persistent navigation don't update
- **Thread Pages**: Don't refresh to show updated note lists
- **Real-time Updates**: Changes made in NoteDetailsPanel don't reflect in other parts of the app

### Root Cause Analysis
**PRIMARY ISSUE RESOLVED**: The main issue was in the `getNotesForThread` function in `src/utils/dashboard-data.ts`. It was only querying the primary `threadId` field but not the `NoteThreads` junction table for many-to-many relationships. This has been fixed.

**REMAINING ISSUE**: The navigation system and thread pages still don't update in real-time when changes are made via the NoteDetailsPanel. This is related to how event listeners are managed across page navigations in the current Astro-based system.

### Technical Details

#### Database Query Fix (RESOLVED ✅)
The core issue was in the `getNotesForThread` function in `src/utils/dashboard-data.ts`. The function was only querying notes where `Notes.threadId` equals the thread ID, but it wasn't checking the `NoteThreads` junction table for many-to-many relationships.

**Before (Broken)**:
```typescript
.where(and(eq(Notes.threadId, threadId), eq(Notes.userId, userId)))
```

**After (Fixed)**:
```typescript
// Get notes that are primarily in this thread (primary threadId)
const primaryNotes = await db.select(...).from(Notes)
  .where(and(eq(Notes.threadId, threadId), eq(Notes.userId, userId)));

// Get notes that are associated with this thread via junction table (many-to-many)
const junctionNotes = await db.select(...).from(Notes)
  .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
  .where(and(eq(NoteThreads.threadId, threadId), eq(Notes.userId, userId)));

// Combine both results and remove duplicates
const allNotes = [...primaryNotes, ...junctionNotes];
```

#### Event Flow
1. User adds/removes note from thread in NoteDetailsPanel
2. NoteDetailsPanel dispatches custom events with `noteId` and `threadId`
3. API calls succeed and database is updated
4. NoteDetailsPanel refreshes and shows correct data
5. **ISSUE**: Navigation system and thread pages don't receive/process events

#### Current Implementation
- **Event Dispatch**: `src/components/react/NoteDetailsPanel.tsx` (lines 135-137, 204-206)
- **Thread Page Listeners**: `src/pages/[id].astro` (lines 685-717)
- **Navigation Listeners**: `src/layouts/Layout.astro` (lines 1083-1097)

### Expected Behavior
When a note is added/removed from a thread:
1. NoteDetailsPanel should update immediately ✅
2. Navigation should show updated thread counts ❌
3. Thread pages should refresh to show updated note lists ❌
4. All changes should be reflected across the app ❌

### Solution Strategy for React Islands Migration

This issue should be resolved when implementing the persistent navigation with React Islands. The React Islands approach will provide:

1. **Better State Management**: React state can be shared across components
2. **Event System**: More reliable event handling within React components
3. **Real-time Updates**: React's reactivity system for automatic UI updates
4. **Component Communication**: Direct prop passing and context sharing

### Implementation Plan for React Islands

#### Phase 1: Navigation State Management
- Create a React context for navigation state
- Implement real-time thread count updates
- Add event listeners that properly update React state

#### Phase 2: Thread Page Integration
- Convert thread pages to React Islands
- Implement automatic refresh on thread changes
- Add loading states and error handling

#### Phase 3: Cross-Component Communication
- Implement shared state between NoteDetailsPanel and navigation
- Add real-time synchronization across all components
- Ensure consistent data across the entire app

### Files to Update During React Islands Migration

#### High Priority
- `src/components/PersistentNavigation.astro` → React Island
- `src/pages/[id].astro` → Add React Islands for thread pages
- `src/components/react/NoteDetailsPanel.tsx` → Update event system

#### Medium Priority
- `src/layouts/Layout.astro` → Update navigation event handling
- `src/components/MobileNavigation.astro` → React Island integration
- `src/components/NavigationColumn.astro` → React Island integration

### Testing Strategy

#### Current Testing
- ✅ NoteDetailsPanel updates correctly
- ✅ API calls succeed
- ✅ Events are dispatched
- ❌ Navigation doesn't update
- ❌ Thread pages don't refresh

#### Future Testing with React Islands
- [ ] Navigation updates in real-time
- [ ] Thread pages refresh automatically
- [ ] Cross-component state synchronization
- [ ] Event system reliability
- [ ] Performance with multiple components

### Related Issues
- Persistent navigation state management
- Cross-page component communication
- Real-time data synchronization
- Event system reliability in Astro/React hybrid

### Notes
- This issue is blocking the full thread synchronization feature
- The core functionality works, but the UI doesn't reflect changes
- React Islands migration should resolve this completely
- Consider this a high-priority item for the React Islands implementation

---

## Additional Fixes Completed ✅

### React Component Count Updates
- **Issue**: React `CardThread` components were showing default count of 2 instead of actual note counts
- **Root Cause**: API wasn't returning `count` property for threads in the NoteDetailsPanel
- **Solution**: Updated API to query both primary `threadId` and junction table relationships
- **Files Modified**: 
  - `src/pages/api/notes/[id]/details.ts` - Enhanced count query logic
  - `src/components/react/NoteDetailsPanel.tsx` - Added count property to Thread interface
- **Result**: React components now display correct note counts in real-time

---

**Last Updated**: January 2025  
**Status**: V1 Issues Tracking  
**Priority**: Mixed (High for mobile toolbar, Medium for navigation updates, Low for polish items)
