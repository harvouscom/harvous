# Harvous Architecture

This document describes the core functionality, data structures, and implementation details of the Harvous Bible study notes application.

## Content Organization

Harvous uses a hierarchical content organization system to help users structure their Bible study notes effectively:

### Data Structure

- **Spaces**: Top-level containers that can hold both threads and individual notes
  - Can contain multiple **Threads** (collections of related notes)
  - Can contain individual **Notes** (standalone items)
  - Display a count of total items (threads + notes) in the space
  - **Always use paper color** in CardStack headers and navigation

- **Threads**: Collections of related notes within a space
  - Can contain multiple **Notes**
  - Display a count of notes within the thread
  - **Use unique thread colors** in CardStack headers and navigation
  - Can be organized (assigned to a space) or unorganized (in inbox)

- **Notes**: Individual content items
  - Can be part of a thread or directly in a space
  - Support rich text content, titles, and optional images
  - Use the `CardNote` component for display

### Content Classification

- **Inbox Content**: Reserved for external content only
  - **NO user-generated content** (notes, threads, spaces) should appear in the inbox
  - Reserved for future content from Harvous team, shared content from other users, curated Bible study materials, and community highlights
  - **User-generated notes and threads should NEVER appear in the inbox section**
- **Organized Content**: Items assigned to spaces, shown in the "Full list" section
  - All threads (regardless of spaceId) appear in organized content
  - Individual notes assigned to spaces
  - Individual notes in unorganized thread (these are user-generated and belong in organized content, not inbox)

### Thread Deletion Behavior

When a thread is deleted, the system preserves all notes by moving them to the "Unorganized" thread:

- **Primary Thread Notes**: Notes that have the deleted thread as their primary `threadId` are moved to the "Unorganized" thread
- **Many-to-Many Relationships**: Notes that are in the deleted thread via the `NoteThreads` junction table have their relationship removed (but remain in other threads)
- **Note Preservation**: No notes are ever deleted when a thread is deleted - they are always preserved and moved to "Unorganized"
- **Unorganized Thread**: The "Unorganized" thread always exists by default (hidden from dashboard display)
- **Protection**: The "Unorganized" thread itself cannot be deleted to prevent data loss

### Example Structure

```
Space: "Bible Study" (count: 1) - Paper color
└── Thread: "Gospel of John" (count: 2) - Lovely-lavender color

Space: "For You" (count: 2) - Paper color
├── Note: "Prayer Request" (unorganized)
└── Note: "John 3:16 Reflection" (unorganized)

Organized Content:
├── Thread: "Psalm 23 Study" (unorganized) - Green color
└── Thread: "Gospel of John" (in Bible Study space) - Lovely-lavender color
```

## Note ID System

The system uses a dual ID approach for notes:

- **Database ID**: Unique timestamp-based ID (e.g., `note_1756318000001`) for internal database operations
- **User-Friendly ID**: Sequential simple ID (e.g., `N001`, `N002`, `N003`) for display and user reference

### Simple Note ID Logic

- **Sequential Generation**: Simple note IDs are generated sequentially (1, 2, 3, etc.)
- **No Reuse**: Deleted note IDs are never reused to maintain data integrity
- **Example**: If you have notes N001, N002, N003 and delete N003, the next note will be N004 (not N003)
- **Highest Ever Used**: The system tracks the highest simpleNoteId ever used per user
- **User-Scoped**: Each user has their own sequential numbering starting from N001

### Note ID Implementation - Final Working Solution ✅

**UserMetadata Approach for No-Reuse Requirement**: The current implementation uses a UserMetadata table to track the highest simpleNoteId ever used per user. This approach was chosen because the requirement is to **never reuse deleted note IDs**, which requires tracking the highest ID ever assigned, not just the highest currently existing.

**How It Works:**
1. **UserMetadata table** stores `highestSimpleNoteId` for each user
2. **Next ID calculation**: `highestSimpleNoteId + 1` (never reuses deleted IDs)
3. **On note creation**: Updates `highestSimpleNoteId` to the new value
4. **Result**: Deleted note IDs are never reused, maintaining sequential integrity

**Example Flow:**
- Create N001 → highestSimpleNoteId = 1
- Create N002 → highestSimpleNoteId = 2  
- Create N003 → highestSimpleNoteId = 3
- Delete N003 → highestSimpleNoteId = 3 (unchanged)
- Create new note → highestSimpleNoteId = 3 + 1 = 4 → **N004** ✅

**Benefits:**
- **Data Integrity**: Ensures deleted note IDs are never reused
- **User Experience**: Provides predictable sequential numbering
- **Performance**: Avoids querying all notes on every ID generation
- **Reliability**: Tracks the highest ID ever used, regardless of current database state

**Key Principle**: For "no reuse" requirements, tracking metadata is necessary. This approach ensures that once an ID is used, it's never used again, even if the note is deleted.

## Database Schema & Relationships

The system uses a hybrid approach for note-thread relationships:

- **Primary Relationship**: Each note has a required `threadId` field pointing to its primary thread
- **Many-to-Many Support**: `NoteThreads` junction table allows notes to belong to multiple threads
- **Unorganized Thread**: Special thread with ID `thread_unorganized` serves as default for unassigned notes
- **Thread Deletion Logic**: When a thread is deleted, notes with that thread as primary `threadId` are moved to unorganized thread
- **Junction Cleanup**: Many-to-many relationships are removed from `NoteThreads` table when threads are deleted
- **Data Integrity**: No notes are ever deleted - they are always preserved and moved to unorganized thread

### ID Format Examples

- **Notes**: `note_1756318000001`, `note_1756318000003`
- **Threads**: `thread_1756318000000`, `thread_1756318000004`
- **Spaces**: `space_1756318000006`

## Color System

- **Threads**: Use their unique `color` property in CardStack headers and navigation
- **Spaces**: Always use `var(--color-paper)` in CardStack headers and navigation
- **Navigation**: Active items reflect their respective colors (thread color or paper color)

## Navigation Logic

- **"For You"**: Shows inbox count (currently 0, reserved for external content only)
- **Spaces**: Show total item count, use paper color, highlight when active
- **Pinned Threads**: Show note count, use thread color, highlight when active
- **Persistent Navigation**: Simple localStorage-based system that tracks recently accessed items

## Page Routing (`src/pages/[id].astro`)

- **Thread Routes** (`/thread_*`): Display thread with notes, use thread color in header
- **Space Routes** (`/space_*`): Display space with threads, use paper color in header  
- **Note Routes** (`/note_*`): Display individual note, use paper color in header

## Real Database System

- **Production Ready**: Uses Turso database for all data storage
- **User Authentication**: All data is scoped to authenticated Clerk users
- **Real-time Updates**: Content updates immediately after creation
- **Data Persistence**: All notes, threads, and spaces are stored in the remote database
- **User Isolation**: Each user only sees their own content

## Alpine.js Integration

### Development Rules for Alpine.js

- **ALWAYS check Alpine.js docs**: Consult [https://alpinejs.dev/start-here](https://alpinejs.dev/start-here) for syntax and best practices
- **ALWAYS use proper Alpine.js syntax**: Follow official documentation patterns
- **NO inline onclick handlers**: Use `x-on:click` instead of `onclick` attributes
- **Use x-data for component state**: Define reactive data in `x-data` objects
- **Use x-on for event handling**: Prefer `x-on:click`, `x-on:submit`, etc. over inline handlers
- **NO try-catch in x-init**: Alpine.js expressions don't support complex control structures
- **NO const/let in x-init**: Use simple variable assignments only
- **Use separate scripts for complex logic**: Move complex JavaScript outside of Alpine.js expressions
- **Test Alpine.js functionality**: Verify all directives work as expected
- **Use async/await properly**: Alpine.js supports async functions in x-data methods

### SquareButton Component Context-Aware Menus

The SquareButton component supports context-aware menus through the `ContextMoreMenu` component:

- **Content Type Detection**: Automatically shows appropriate menu options based on `contentType` prop (thread/note/space/dashboard)
- **Dynamic Menu Options**: Uses `getMenuOptions()` utility to determine which actions are available for each content type
- **Thread Deletion**: Includes "Erase Thread" option that safely moves notes to unorganized thread
- **Note Deletion**: Includes "Erase Note" option for individual note removal
- **Space Deletion**: Includes "Erase Space" option for space removal
- **Edit Actions**: Provides edit options for threads, notes, and spaces
- **Menu Positioning**: Automatically positions menus to avoid screen overflow

## View Transitions Integration

### Key Concepts

- **Client-Side Navigation**: View Transitions intercept page navigation and update the DOM without full page reloads
- **Script Re-execution**: Bundled scripts only run once, but inline scripts can re-execute on navigation
- **Lifecycle Events**: Use Astro's lifecycle events to re-initialize functionality after navigation

### Essential Lifecycle Events

- **`astro:page-load`**: Fires after page navigation completes - use for re-initializing functionality
- **`astro:after-swap`**: Fires immediately after DOM replacement - use for theme/state updates
- **`DOMContentLoaded`**: Only fires on initial page load, not on View Transitions

### Best Practices for View Transitions

#### 1. Script Re-initialization Pattern

**ALWAYS** wrap functionality that needs to persist across navigation in lifecycle event listeners:

```javascript
// ❌ BAD: Only works on initial page load
document.addEventListener('DOMContentLoaded', initTabs);

// ✅ GOOD: Works on initial load AND after View Transitions
function initTabs() {
  // Your initialization logic here
}

// Initialize on initial load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTabs);
} else {
  initTabs();
}

// Re-initialize after View Transitions
document.addEventListener('astro:page-load', initTabs);
```

#### 2. Event Listener Management

**ALWAYS** clean up existing event listeners before re-initializing to prevent duplicates:

```javascript
function initTabs() {
  // Remove existing listeners to prevent duplicates
  const existingButtons = document.querySelectorAll('[data-tab-button]');
  existingButtons.forEach(function(button) {
    const newButton = button.cloneNode(true);
    button.parentNode?.replaceChild(newButton, button);
  });
  
  // Add fresh event listeners
  setupTabHandlers();
}
```

#### 3. State Management

**AVOID** flags that prevent re-initialization:

```javascript
// ❌ BAD: Prevents re-initialization after View Transitions
let tabsInitialized = false;
function initTabs() {
  if (tabsInitialized) return; // This breaks View Transitions!
  tabsInitialized = true;
  // ...
}

// ✅ GOOD: Allow re-initialization
function initTabs() {
  // Always allow re-initialization
  // ...
}
```

## Navigation Close Functionality - Critical Lessons

This section documents the fundamental lessons learned from implementing the navigation close functionality, which required extensive debugging and multiple approaches before finding the correct solution.

### Lesson 1: Work SMARTER, Not Harder - Preserve Component Integrity

**❌ WRONG APPROACH:**
- Destroying component structure by changing button to anchor tag
- Restructuring entire components to solve a simple event handling issue
- Making architectural changes that break existing functionality

**✅ CORRECT APPROACH:**
- Preserve existing component structure and behavior
- Make minimal, targeted fixes to specific functionality
- Test that existing functionality still works after changes

**Key Principle:** Never destroy working components to solve a single feature. Always work within the existing architecture.

### Lesson 2: Event Handling in Nested Interactive Elements

**The Problem:** When a button is wrapped in an anchor tag, clicking the button triggers both the button's click handler AND the anchor's navigation.

**The Solution:** Use proper event handling with `@click.stop.prevent` on the specific interactive element:

```astro
<!-- Close icon with proper event handling -->
<div 
    x-show="showClose"
    @click.stop.prevent="handleCloseFunction()"
    class="close-icon-container"
>
    <FaXmarkIcon />
</div>
```

**Key Principles:**
- `@click.stop` - Stops event bubbling to parent elements
- `@click.prevent` - Prevents default browser behavior (anchor navigation)
- Use specific selectors (`.close-icon-container`) to target exact click areas

### Lesson 3: Alpine.js Best Practices for Complex Interactions

**❌ WRONG:**
```astro
@click="if (showClose && event.target.closest('.close-icon-container')) { ... }"
```

**✅ CORRECT:**
```astro
@click.stop.prevent="handleCloseFunction()"
```

**Key Principles:**
- Keep Alpine.js expressions simple and readable
- Use proper event modifiers (`stop`, `prevent`) instead of complex conditional logic
- Separate complex logic into dedicated functions when needed

### Lesson 4: Astro View Transitions and Navigation

**The Challenge:** Using `window.location.replace()` doesn't work properly with Astro's View Transitions.

**The Solution:** Use Astro's built-in `navigate()` function:

```javascript
// Import and expose Astro's navigate function
import { navigate } from 'astro:transitions/client';
(window as any).astroNavigate = navigate;

// Use in navigation logic
if (window.astroNavigate) {
    window.astroNavigate('/dashboard');
} else {
    window.location.replace('/dashboard'); // Fallback
}
```

**Key Principles:**
- Always use Astro's `navigate()` function for View Transitions compatibility
- Provide fallbacks for environments where Astro navigation isn't available
- Use proper TypeScript casting for global window properties

### Lesson 5: Navigation Close Icon Implementation - Final Solution

**The Working Solution:** After extensive debugging, the final implementation uses a clean CSS-only approach with proper FontAwesome icons.

**Final Implementation Details:**
- **Inactive items only**: Close icons appear on hover for inactive navigation items
- **FontAwesome icons**: Uses proper FontAwesome xmark.svg with exact SVG path
- **CSS hover states**: Uses `:not(.active):hover` selectors for precise control
- **Perfect alignment**: Close icon positioned at `right-5` (20px from right edge) for seamless transition with badge count
- **Clean styling**: Uses `var(--color-deep-grey)` for consistent theming

**Key Technical Details:**
```css
.nav-item-container:not(.active):hover .badge-count {
  display: none !important;
}
.nav-item-container:not(.active):hover .close-icon {
  display: flex !important;
}
.close-icon {
  display: none;
}
```

**Why This Works:**
- **No Alpine.js complexity**: Pure CSS hover states are more reliable
- **Proper event handling**: Uses `@click.stop.prevent` for close functionality
- **Consistent theming**: Matches existing design system colors
- **Performance**: No JavaScript event listeners for hover states

## Navigation History System

The navigation history system uses a clean, single-file approach with proper deduplication and state management:

### Key Components

- **`public/scripts/navigation-history.js`**: Single file containing all navigation history logic
- **`src/components/PersistentNavigation.astro`**: Component that renders navigation history
- **`src/layouts/Layout.astro`**: Contains fallback functions and unorganized thread hiding logic
- **localStorage**: Simple key-value storage for navigation history data

### How It Works

1. **Tracking**: When users navigate to threads, spaces, or notes, the system automatically tracks the access
2. **Storage**: Navigation history is stored in localStorage as a JSON array with `firstAccessed` and `lastAccessed` timestamps
3. **Display**: Recently accessed items appear in the persistent navigation section
4. **Deduplication**: Items already visible in regular navigation are filtered out
5. **Close Functionality**: Users can close items from persistent navigation, removing them from history
6. **Unorganized Thread Management**: Special handling for the unorganized thread with localStorage-based hiding

### Critical Implementation Details

- **Blue Wave Duplication Fix**: Prevents Blue wave thread from being added to history when on unorganized thread
- **Position Retention**: Items maintain their original position in history (don't jump to bottom)
- **Unorganized Thread Closability**: Unorganized thread can be closed and stays closed via localStorage flag
- **Fallback Functions**: Layout.astro contains fallback functions to ensure navigation works even if main script fails
- **Cache Busting**: Script includes version parameters to prevent caching issues

### Benefits of Current Approach

- **Single Source of Truth**: All navigation logic in one file
- **No Complex Dependencies**: Uses only localStorage and vanilla JavaScript
- **Easy to Debug**: Clear, readable code with comprehensive logging
- **View Transitions Compatible**: Works seamlessly with Astro's View Transitions
- **Alpine.js Integration**: Properly integrates with Alpine.js for interactive elements
- **Robust Fallbacks**: Multiple fallback mechanisms ensure functionality even if main script fails

## Key Files

- `src/utils/dashboard-data.ts`: Database queries for dashboard content
- `src/pages/dashboard.astro`: Main dashboard with inbox/organized content
- `src/pages/[id].astro`: Dynamic routing for threads, spaces, and notes
- `src/components/CardStack.astro`: Header component with color logic
- `src/pages/api/threads/delete.ts`: Thread deletion API with note preservation logic
- `src/actions/threads.ts`: Thread actions including safe deletion
- `src/components/SquareButton.astro`: Context-aware button with menu functionality
- `src/components/ContextMoreMenu.astro`: Context-aware menu for different content types
- `src/utils/menu-options.ts`: Utility for determining available menu options
- `src/components/SpaceButton.astro`: Button component with close functionality
- `public/scripts/navigation-history.js`: Simplified navigation history system
- `src/components/PersistentNavigation.astro`: Simplified persistent navigation component
- `src/layouts/Layout.astro`: Alpine.js and View Transitions setup

## Component Dependencies

### FontAwesome Icons

- **Location**: `@fortawesome/fontawesome-free/svgs/solid/`
- **Usage**: Imported directly in components for optimal performance
- **Common Icons**: `plus.svg`, `xmark.svg`, `ellipsis.svg`, `angle-left.svg`, `layer-group.svg`, `note-sticky.svg`

### CSS Variables

- **Color System**: All colors defined as CSS custom properties
- **Thread Colors**: `--color-blessed-blue`, `--color-graceful-gold`, etc.
- **UI Colors**: `--color-paper`, `--color-stone-grey`, `--color-deep-grey`, etc.
- **Gradients**: `--color-gradient-gray` for button backgrounds
