# Navigation Hierarchy Redesign - Design Document

## Overview
This document captures the exploration and proposed solution for improving the visual hierarchy between Spaces and Threads in the navigation, addressing user feedback that Spaces and Threads currently appear at the same level despite their hierarchical relationship.

**Date:** January 2025  
**Status:** Design Phase - Pending Figma mockups

---

## The Problem

### Original Feedback
> "My only feedback atm is SPACE should show a bit more hierarchy in some way. Right now on the left the SPACES and THREADS are equal. But i'm assuming your threads go into your space and notes into your threads"

**Key Issues:**
- Spaces and Threads appear at the same visual level in navigation
- The hierarchical relationship (Spaces → Threads → Notes) is not clear
- Users need better visual indication of which threads belong to which spaces

---

## Initial Exploration

### Early Options Considered

1. **Visual Indentation (Nested)**
   - Threads indented under parent spaces
   - Clear hierarchy but can get deep

2. **Visual Separator/Grouping**
   - Keep same level but group with visual separators
   - Less vertical space but less obvious

3. **Icon/Prefix Indicators**
   - Small icons/prefixes to show relationship
   - Minimal layout change but requires learning

4. **Collapsible Groups**
   - Spaces are collapsible, expand to show threads
   - Saves space but hides content

5. **Color Coding/Grouping**
   - Matching colors to visually group
   - Subtle, may not work for colorblind users

---

## The Big Idea: Space Switcher

### Core Concept
Replace "My Home" button with an **Active Space button** that functions as a switcher, consolidating space management into a single, prominent control.

### Key Components

#### 1. Active Space Button (Replaces "My Home")
- Shows current active space (or "My Home" if on dashboard)
- Functions like thread combobox - click to open dropdown
- "My Home" always at top (priority)
- Default active space is "My Home"

#### 2. Space Switcher Dropdown
**Desktop:**
- Dropdown pattern (like thread combobox)
- Shows:
  - "My Home" (always first, highlighted if active)
  - All user spaces (with colors, counts)
  - "New Space" button at bottom
- Replaces `MySpacesPanel.tsx` functionality

**Mobile:**
- Bottom sheet (recommended) or enhanced dropdown
- Same content organization
- More screen space for scrolling

#### 3. Search Bar (Desktop)
- Replaces "New Space" button location in nav column
- Full-width search bar (like `find.astro`)
- Profile avatar on right side
- Press Enter → navigates to find page with query
- No inline results (keeps it simple)

---

## Active Space Logic

### How Active Space is Determined
- **User-selected**: Active space is determined by which space the user chooses
- **Default**: "My Home" is default active space
- **Auto-switch**: When viewing content that doesn't belong to a space, auto-switch to "My Home"

### Auto-Switch Behavior (Option B - Recommended)
**When to auto-switch:**
- User navigates to a thread/note that doesn't belong to the current active space
- Automatically switches to "My Home" (catch-all for unorganized content)

**Making it less jarring:**
- Smooth animation/transition (200-300ms)
- Only switch on explicit navigation (not rapid browsing)
- Visual indicator before switching (subtle highlight/badge)
- Smart logic: Don't switch if user is rapidly navigating within same context

---

## Mobile Navigation Structure

### Current State
- Mobile nav has dropdown that includes:
  - Active space button (triggers dropdown)
  - "My Home"
  - All opened threads (from persistent navigation)
- Dropdown covers significant portion of screen

### Proposed Structure

#### Option: Bottom Sheet (Recommended)
**Layout:**
```
┌─────────────────────────┐
│ [Drag handle]            │
├─────────────────────────┤
│ SPACES                   │
│ ┌─────────────────────┐  │
│ │ My Home        [0]  │  │
│ │ O' Holy Night  [20]│  │
│ │ Space 2        [5]  │  │
│ └─────────────────────┘  │
│ [+ New Space]            │
├─────────────────────────┤
│ THREADS IN [ACTIVE SPACE]│
│ ┌─────────────────────┐  │
│ │ Thread 1        [3] │  │
│ │ Thread 2        [5] │  │
│ │ Thread 3        [2] │  │
│ └─────────────────────┘  │
└─────────────────────────┘
```

**Key Features:**
- Two clear sections: Spaces and Threads
- Only shows threads from active space (not all threads)
- Scrollable if needed
- Drag to dismiss
- More screen space than dropdown

---

## Search as Discovery Mechanism

### The Insight
Users typically work within "My Home" or 1-2 other spaces. Threads from other spaces are only needed when **searching**.

### Search Experience

#### Desktop
- Search bar in nav column (replaces New Space button location)
- Full-width, profile avatar on right
- Press Enter → navigates to find page with query
- No inline results

#### Mobile
- Search icon/button accessible
- Opens search interface (modal/bottom sheet)

#### Search Results Panel
**When searching:**
- Results open in **additional column as panel** (desktop)
- Or bottom sheet (mobile)
- Each result shows:
  - Item name/type
  - Which space it belongs to (badge/indicator)
  - Action buttons:
    - "Add to [Current Space]"
    - "Go to Item"

**Benefits:**
- Search becomes the discovery mechanism for cross-space content
- Quick actions without full navigation
- Contextual (shows what space items belong to)
- Non-destructive (can preview before adding)

---

## Key Design Decisions

### 1. Focused Thread List
- **Decision**: Only show threads from active space in navigation
- **Rationale**: Users typically work within 1-2 spaces, so showing all threads is overwhelming and unnecessary
- **Exception**: Search provides access to threads from other spaces

### 2. "My Home" Priority
- **Decision**: "My Home" always appears first in space switcher
- **Rationale**: It's the catch-all for unorganized content and default workspace

### 3. Search as Discovery
- **Decision**: Use search to discover content from other spaces
- **Rationale**: Matches actual usage patterns - users don't need to see all threads from all spaces while working

### 4. Bottom Sheet for Mobile
- **Decision**: Use bottom sheet instead of dropdown for mobile space switcher
- **Rationale**: More screen space, better for scrolling, familiar mobile pattern

### 5. Auto-Switch to "My Home"
- **Decision**: Automatically switch active space to "My Home" when viewing unorganized content
- **Rationale**: Keeps active space contextually accurate
- **Mitigation**: Smooth transitions and smart logic to prevent jarring switches

---

## Implementation Considerations

### Desktop Changes
1. Replace "My Home" button with Active Space button
2. Add space switcher dropdown (like thread combobox)
3. Replace New Space button location with search bar
4. Update persistent navigation to show only threads from active space
5. Remove/consolidate `MySpacesPanel.tsx` functionality

### Mobile Changes
1. Replace active space button in top bar
2. Convert dropdown to bottom sheet (or enhance existing dropdown)
3. Reorganize content: Spaces section + Threads section (active space only)
4. Add search functionality

### Data/State Changes
1. Track `activeSpaceId` in navigation context
2. Add `spaceId` to `NavigationItem` interface (for threads)
3. Update `refreshNavigationCounts` to include `spaceId` when refreshing threads
4. Filter persistent navigation by active space

---

## Open Questions / Decisions Needed

### 1. Threads in Space Switcher
- Should threads be nested under active space visually?
- Or shown as separate "Threads in [Space Name]" section?

### 2. Search Panel Behavior
- Should search panel be persistent or dismiss after action?
- Should it stay open for multiple actions?

### 3. "Add to Space" Action
- Does this move the thread/note or create a copy/link?
- (Assumption: Move, based on current architecture)

### 4. Mobile Search UI
- Should search open as bottom sheet panel?
- Or different pattern?

### 5. Unlimited Threads
- Should we add a limit to persistent navigation (e.g., max 10 threads)?
- Or rely on "active space only" filtering to keep it manageable?

### 6. Visual Hierarchy
- How exactly should threads be visually nested/grouped under spaces?
- Indentation? Color coding? Icons? Combination?

---

## Next Steps

1. **Design Phase** (Current)
   - Create Figma mockups for:
     - Desktop space switcher dropdown
     - Desktop search bar in nav
     - Mobile bottom sheet
     - Search results panel
   - Explore visual hierarchy options
   - Test different grouping/nesting patterns

2. **Implementation Phase** (After design approval)
   - Update NavigationItem interface
   - Implement space switcher component
   - Update navigation context to track active space
   - Filter persistent navigation by active space
   - Implement search bar in nav column
   - Convert mobile dropdown to bottom sheet
   - Implement search results panel

3. **Testing Phase**
   - Test auto-switch behavior
   - Verify smooth transitions
   - Test with many spaces/threads
   - Mobile usability testing

---

## Related Files

- `src/components/react/navigation/NavigationContext.tsx` - Navigation state management
- `src/components/react/navigation/PersistentNavigation.tsx` - Persistent navigation component
- `src/components/react/navigation/NavigationColumn.tsx` - Desktop nav column
- `src/components/react/MySpacesPanel.tsx` - Current spaces panel (to be replaced)
- `src/pages/find.astro` - Search/find page (reference for search UI)
- `src/components/react/navigation/MobileNavigation.tsx` - Mobile navigation

---

---

## Additional Issue: Navigation Flow / Breadcrumbs

### Problem
When navigating: **Thread → Note → Scripture Note**, the back button (both browser/system back and navigation button) takes the user back to the Thread instead of the Note they came from.

**User Flow:**
1. User is in a Thread
2. Opens a Note (from that thread)
3. Opens a Scripture Note (from that note)
4. Clicks back → Goes to Thread (skips the Note)

**Expected Flow:**
Thread → Note → Scripture Note → (back) → Note → (back) → Thread

**Current Flow:**
Thread → Note → Scripture Note → (back) → Thread ❌

### Root Cause Analysis

**Potential Issues:**

1. **History Entry Not Created**
   - When clicking a scripture pill from a note, the navigation might not be creating a proper history entry
   - Scripture pills use `safeNavigate()` which defaults to 'push', but there might be cases where 'replace' is used instead

2. **Breadcrumb Navigation Logic**
   - `handleBreadcrumbNavigation()` in `navigation-breadcrumb.ts` uses `window.history.back()` when "in context"
   - This goes back one step in history, but if the scripture note navigation didn't create a proper entry, it skips the note

3. **Panel vs Page Navigation**
   - Scripture notes might be opening in a panel (NoteDetailsPanel) instead of navigating to a new page
   - Panels don't create browser history entries, so back button behavior is broken

4. **Navigation Method Inconsistency**
   - Different code paths use different navigation methods:
     - `TiptapScripturePill.ts` line 242: `safeNavigate(url)` (no history option specified)
     - `CardFullEditable.tsx` line 694: `safeNavigate(`/${noteId}`, { history: 'push' })`
     - Some might use 'replace' instead of 'push'

### Investigation Needed

**Files to Review:**
- `src/components/react/TiptapScripturePill.ts` - How scripture pills navigate
- `src/components/react/CardFullEditable.tsx` - How note links navigate
- `src/utils/navigation-breadcrumb.ts` - Breadcrumb navigation logic
- `src/utils/safe-navigate.ts` - Navigation utility
- `src/components/react/NoteDetailsPanel.tsx` - Panel back button behavior
- `src/components/react/DesktopPanelManager.tsx` - How panels are opened

**Questions:**
1. Are scripture notes opening as panels or navigating to new pages?
2. Is the navigation using 'push' or 'replace'?
3. Is the breadcrumb logic correctly detecting the navigation context?
4. Should scripture notes open as panels or navigate to pages?

### Proposed Solutions

#### Option 1: Ensure Proper History Entries
- Always use `history: 'push'` when navigating to scripture notes
- Ensure every navigation creates a browser history entry
- Fix any code paths using 'replace' when they should use 'push'

#### Option 2: Fix Breadcrumb Navigation Logic
- Update `handleBreadcrumbNavigation()` to track navigation stack
- Instead of using `window.history.back()`, maintain a custom navigation stack
- Navigate to specific URLs based on stack rather than relying on browser history

#### Option 3: Panel Navigation Stack
- If scripture notes open as panels, implement a panel navigation stack
- Track: Thread → Note (page) → Scripture Note (panel)
- Back button should close panel and return to Note page
- Browser back should also work correctly

#### Option 4: Always Navigate to Pages (Not Panels)
- Change scripture note opening to always navigate to a new page
- This ensures proper browser history entries
- Simpler than managing panel stacks

### Recommendation

**Hybrid Approach:**
1. **Ensure all navigation uses 'push'** - Fix any 'replace' usage when navigating to notes
2. **Implement navigation stack tracking** - Track the navigation path (Thread → Note → Scripture Note)
3. **Fix breadcrumb logic** - Use navigation stack instead of `window.history.back()` when context is unclear
4. **Consider panel vs page** - If scripture notes should open as panels, implement proper panel navigation stack

**Priority:** High - This affects core navigation UX and user expectations

---

## Notes

- This redesign addresses the original hierarchy feedback while also improving overall navigation UX
- The solution is informed by actual usage patterns (users work in 1-2 spaces, search for cross-space content)
- Key insight: Not everything needs to be visible at once - search can handle discovery
- Mobile and desktop can have different patterns optimized for each platform
- Navigation flow/breadcrumb issue needs to be addressed alongside the hierarchy redesign
