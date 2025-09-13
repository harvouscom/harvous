# Harvous

A note-taking and thread management application designed specifically for Bible study. 
Aka our approach to a Bible notes app.

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

- **Inbox Content**: Unassigned items that appear in the "For You" view
  - Notes in the unorganized thread
  - Threads without a spaceId
- **Organized Content**: Items assigned to spaces, shown in the "Full list" section

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

Space: "For You" (count: 3) - Paper color
├── Note: "Prayer Request" (unorganized)
├── Note: "John 3:16 Reflection" (unorganized)
└── Thread: "Psalm 23 Study" (unorganized) - Green color
```

### ID Format Examples

- **Notes**: `note_1756318000001`, `note_1756318000003`
- **Threads**: `thread_1756318000000`, `thread_1756318000004`
- **Spaces**: `space_1756318000006`

## Core Logic & Data System

### Real Database System

- **Production Ready**: Uses Turso database for all data storage
- **User Authentication**: All data is scoped to authenticated Clerk users
- **Real-time Updates**: Content updates immediately after creation
- **Data Persistence**: All notes, threads, and spaces are stored in the remote database
- **User Isolation**: Each user only sees their own content

### Database Schema & Relationships

The system uses a hybrid approach for note-thread relationships:

- **Primary Relationship**: Each note has a required `threadId` field pointing to its primary thread
- **Many-to-Many Support**: `NoteThreads` junction table allows notes to belong to multiple threads
- **Unorganized Thread**: Special thread with ID `thread_unorganized` serves as default for unassigned notes
- **Thread Deletion Logic**: When a thread is deleted, notes with that thread as primary `threadId` are moved to unorganized thread
- **Junction Cleanup**: Many-to-many relationships are removed from `NoteThreads` table when threads are deleted
- **Data Integrity**: No notes are ever deleted - they are always preserved and moved to unorganized thread

### Color System

- **Threads**: Use their unique `color` property in CardStack headers and navigation
- **Spaces**: Always use `var(--color-paper)` in CardStack headers and navigation
- **Navigation**: Active items reflect their respective colors (thread color or paper color)

### Navigation Logic

- **"For You"**: Shows inbox count of unassigned items
- **Spaces**: Show total item count, use paper color, highlight when active
- **Pinned Threads**: Show note count, use thread color, highlight when active

### Page Routing (`src/pages/[id].astro`)

- **Thread Routes** (`/thread_*`): Display thread with notes, use thread color in header
- **Space Routes** (`/space_*`): Display space with threads, use paper color in header  
- **Note Routes** (`/note_*`): Display individual note, use paper color in header

## Features

- **Flexible Organization**: Mix threads and individual notes within spaces
- **Visual Counts**: Quick indicators showing item counts in each space/thread
- **Rich Note Support**: Notes can include titles, content, and images
- **Bible Study Focused**: Designed specifically for Bible study workflows
- **Robust Data System**: Reliable sample data for development, database for production

## Development

This project is built with Astro and uses TypeScript for type safety.

### Development Server

- **Port**: Always use port 4321 for development
- **URL**: http://localhost:4321/
- **Configuration**: Set in `astro.config.mjs` to ensure consistency

### Astro MCP Integration

This project is configured to use the **Astro MCP (Model Context Protocol)** for enhanced development assistance:

- **MCP Server**: Astro docs MCP server is configured and available
- **Documentation Access**: Real-time access to official Astro documentation
- **Development Assistance**: Use the Astro MCP for:
  - Component development guidance
  - API reference lookups
  - Best practices and patterns
  - Framework-specific troubleshooting
- **Always Check Astro MCP**: When working on Astro-specific features, always consult the Astro MCP for the most up-to-date information and recommendations

### Development Rules

- **ALWAYS use Astro MCP**: Consult the Astro MCP for component development, API usage, and best practices
- **ALWAYS follow Alpine.js best practices**: Use proper Alpine.js syntax with `x-data`, `x-on:click`, `x-show`, etc. - NO inline `onclick` handlers
- **ALWAYS double-check your work**: Test functionality before declaring it complete
- **Verify ID consistency**: Ensure IDs match between sample data and component usage
- **Test navigation flows**: Click through all links to ensure they work properly
- **Check color variables**: Only use existing CSS color variables
- **Validate data structure**: Ensure sample data matches expected component interfaces

### Development Workflow

- **Development Server**: Always runs on port 4321 (configured in `astro.config.mjs`)
- **Real Database Mode**: All development uses the real Turso database
- **User Authentication**: Sign in with Clerk to access your personal data
- **Note Creation**: Create notes and threads that persist in the database
- **Data Persistence**: All content is automatically saved and available across sessions

### Troubleshooting

#### Dashboard Not Showing Content

If the dashboard appears empty or doesn't load content:

1. **Check Browser Console**: Look for JavaScript errors or database connection issues
2. **Check Terminal**: Look for `SQLITE_BUSY` or database connection errors
3. **Database Issues**: If you see `SQLITE_BUSY: database is locked`, restart the dev server
4. **Panel State Issues**: If panels open by default, check localStorage in browser dev tools
5. **Port Conflicts**: Ensure port 4321 is available and not being used by other processes

#### Common Issues

- **Port 4321 in use**: Kill other processes using the port or restart your terminal
- **Database locked**: Restart the development server to clear database locks
- **Panels opening by default**: Clear browser localStorage or check panel state initialization
- **Empty dashboard**: Check console for database connection errors

#### Thread Deletion Issues

- **SQLITE_CONSTRAINT_PRIMARYKEY Error**: This occurs when trying to create a thread that already exists. The "Unorganized" thread always exists by default, so deletion logic should not attempt to create it
- **Notes Not Moving to Unorganized**: Ensure the unorganized thread exists and has the correct ID `thread_unorganized`
- **Many-to-Many Relationship Issues**: Check that `NoteThreads` junction table relationships are properly cleaned up when threads are deleted

### Key Files

- `src/utils/dashboard-data.ts`: Database queries for dashboard content
- `src/pages/dashboard.astro`: Main dashboard with inbox/organized content
- `src/pages/[id].astro`: Dynamic routing for threads, spaces, and notes
- `src/components/CardStack.astro`: Header component with color logic
- `src/pages/api/threads/delete.ts`: Thread deletion API with note preservation logic
- `src/actions/threads.ts`: Thread actions including safe deletion
- `src/components/SquareButton.astro`: Context-aware button with menu functionality
- `src/components/ContextMoreMenu.astro`: Context-aware menu for different content types
- `src/utils/menu-options.ts`: Utility for determining available menu options

## Alpine.js Integration

### Official Documentation

**ALWAYS consult the official Alpine.js documentation**: [https://alpinejs.dev/start-here](https://alpinejs.dev/start-here)

The Alpine.js documentation provides comprehensive guidance on:
- **Core Directives**: `x-data`, `x-init`, `x-show`, `x-bind`, `x-on`, `x-text`, `x-html`, `x-model`, `x-for`, `x-transition`, `x-effect`, `x-ignore`, `x-ref`, `x-cloak`, `x-teleport`, `x-if`, `x-id`
- **Magic Properties**: `$el`, `$refs`, `$store`, `$watch`, `$dispatch`, `$nextTick`, `$root`, `$data`, `$id`
- **Best Practices**: Proper syntax, event handling, state management, and component patterns
- **Common Patterns**: Dropdowns, modals, form handling, and reactive data binding

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

### SquareButton Component (`src/components/SquareButton.astro`)

- **Menu Functionality**: Uses Alpine.js for dropdown menu behavior
- **Global Alpine.js**: Loaded via CDN in `src/layouts/Layout.astro` for all pages
- **Menu Variants**: Supports both "Add" and "More" variants with menu integration
- **Positioning Logic**: Automatically calculates menu position (left/right) based on screen space
- **State Management**: Uses `isOpen` and `menuPosition` Alpine.js data properties

### MoreMenu Component (`src/components/MoreMenu.astro`)

- **Menu Content**: Contains "New Thread" and "New Note" options
- **Styling**: White rounded container with shadow and hover effects
- **Icons**: Uses FontAwesome icons for visual consistency

### ContextMoreMenu Component (`src/components/ContextMoreMenu.astro`)

- **Context-Aware Options**: Shows different menu options based on content type (thread/note/space)
- **Alpine.js Best Practices**: Uses `x-data` for state management and `x-on:click` for event handling
- **Delete Functionality**: Implements erase actions with API calls and toast notifications
- **Async Operations**: Properly handles async/await for API requests within Alpine.js
- **Event System**: Dispatches custom events for edit actions and toast notifications

### SquareButton Component Context-Aware Menus

The SquareButton component supports context-aware menus through the `ContextMoreMenu` component:

- **Content Type Detection**: Automatically shows appropriate menu options based on `contentType` prop (thread/note/space/dashboard)
- **Dynamic Menu Options**: Uses `getMenuOptions()` utility to determine which actions are available for each content type
- **Thread Deletion**: Includes "Erase Thread" option that safely moves notes to unorganized thread
- **Note Deletion**: Includes "Erase Note" option for individual note removal
- **Space Deletion**: Includes "Erase Space" option for space removal
- **Edit Actions**: Provides edit options for threads, notes, and spaces
- **Menu Positioning**: Automatically positions menus to avoid screen overflow

### Alpine.js Setup

- **CDN Loading**: Alpine.js 3.x loaded via CDN in Layout.astro
- **No Plugins**: Uses vanilla Alpine.js without additional plugins to avoid conflicts
- **Global Availability**: Available on all pages through Layout.astro
- **Toast System**: Simple vanilla JS toast implementation (no Alpine.js dependency)

### Common Issues & Solutions

- **Menu Not Showing**: Ensure Alpine.js CDN is loaded in Layout.astro
- **Menu Overlapping**: Check for duplicate Alpine.js loading or conflicting CSS
- **Menu Positioning**: Verify `menuPosition` calculation logic in SquareButton
- **State Conflicts**: Avoid `x-init` directives that might interfere with menu state
- **Syntax Errors**: Always check [Alpine.js documentation](https://alpinejs.dev/start-here) for proper syntax
- **Expression Errors**: Use simple expressions in Alpine.js directives, move complex logic to separate scripts

## View Transitions Integration

### Overview

This project uses Astro's View Transitions for smooth client-side navigation. View Transitions provide seamless page transitions but require special handling for JavaScript functionality that needs to persist across navigation.

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

### Common View Transitions Issues

#### Issue: Functionality Works on Initial Load but Breaks After Navigation

**Symptoms:**
- Tabs, menus, or interactive elements work on first page load
- After navigating away and back, functionality stops working
- Requires page refresh to restore functionality

**Root Cause:**
Scripts only initialize once, but View Transitions update the DOM without re-running initialization scripts.

**Solution:**
Wrap initialization in `astro:page-load` event listener:

```javascript
document.addEventListener('astro:page-load', initFunctionality);
```

#### Issue: Duplicate Event Listeners

**Symptoms:**
- Functionality works but triggers multiple times
- Console errors about duplicate listeners
- Performance degradation

**Root Cause:**
Event listeners accumulate across View Transitions without cleanup.

**Solution:**
Clean up existing listeners before re-initializing:

```javascript
// Clone elements to remove all event listeners
const newElement = element.cloneNode(true);
element.parentNode?.replaceChild(newElement, element);
```

#### Issue: State Not Persisting Across Navigation

**Symptoms:**
- Form data, scroll position, or component state resets
- User preferences don't persist

**Root Cause:**
View Transitions replace DOM elements, losing component state.

**Solution:**
Use `transition:persist` directive or store state in localStorage/sessionStorage:

```astro
<!-- Persist component state -->
<MyComponent transition:persist="unique-name" />

<!-- Or use localStorage for state -->
<script>
  // Save state before navigation
  localStorage.setItem('myState', JSON.stringify(state));
  
  // Restore state after navigation
  document.addEventListener('astro:page-load', () => {
    const savedState = localStorage.getItem('myState');
    if (savedState) {
      state = JSON.parse(savedState);
    }
  });
</script>
```

### Development Workflow with View Transitions

1. **Test Navigation Flows**: Always test functionality after navigating away and back
2. **Check Console**: Look for duplicate event listener warnings
3. **Use Lifecycle Events**: Wrap all interactive functionality in `astro:page-load`
4. **Clean Up Listeners**: Remove existing listeners before re-initializing
5. **Avoid Initialization Flags**: Don't prevent re-initialization after View Transitions

### Debugging View Transitions

- **Console Logging**: Add logs to track when initialization occurs
- **Event Listener Count**: Check for duplicate listeners in browser dev tools
- **DOM Inspection**: Verify elements exist after View Transitions
- **Network Tab**: Confirm View Transitions are working (no full page reloads)

### Key Files Using View Transitions

- `src/layouts/Layout.astro`: Contains global tab functionality with View Transitions support
- `src/components/TabNav.astro`: Tab navigation component
- `src/pages/dashboard.astro`: Dashboard with tab functionality

## Core Development Lessons Learned

### Navigation Close Functionality - Critical Lessons

This section documents the fundamental lessons learned from implementing the navigation close functionality, which required extensive debugging and multiple approaches before finding the correct solution.

#### Lesson 1: Work SMARTER, Not Harder - Preserve Component Integrity

**❌ WRONG APPROACH:**
- Destroying component structure by changing button to anchor tag
- Restructuring entire components to solve a simple event handling issue
- Making architectural changes that break existing functionality

**✅ CORRECT APPROACH:**
- Preserve existing component structure and behavior
- Make minimal, targeted fixes to specific functionality
- Test that existing functionality still works after changes

**Key Principle:** Never destroy working components to solve a single feature. Always work within the existing architecture.

#### Lesson 2: Event Handling in Nested Interactive Elements

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

#### Lesson 3: Alpine.js Best Practices for Complex Interactions

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

#### Lesson 4: Astro View Transitions and Navigation

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

#### Lesson 5: Debugging Complex Event Flows

**Essential Debugging Steps:**
1. **Console Logging:** Add detailed logs at every step of the event flow
2. **Event Target Inspection:** Use `event.target.closest()` to verify click targets
3. **DOM State Verification:** Check that elements exist and have correct attributes
4. **Navigation State Tracking:** Log navigation attempts and their outcomes

**Debugging Template:**
```javascript
console.log('🔥 Event triggered:', event.type);
console.log('🔥 Target element:', event.target);
console.log('🔥 Closest container:', event.target.closest('.container'));
console.log('🔥 Navigation state:', navigationState);
```

#### Lesson 6: Component Architecture - Separation of Concerns

**The Right Structure:**
```astro
<!-- Navigation item wrapper -->
<div data-navigation-item={itemId}>
    <!-- Anchor tag for navigation -->
    <a href={`/${itemId}`}>
        <!-- Button component with close functionality -->
        <SpaceButton state="Close" itemId={itemId} />
    </a>
</div>
```

**Key Principles:**
- Keep navigation logic in anchor tags
- Keep interactive functionality in button components
- Use data attributes for JavaScript targeting
- Maintain clear separation between navigation and interaction

#### Lesson 7: Session Storage for State Persistence

**The Challenge:** Navigation state needs to persist across page reloads and View Transitions.

**The Solution:** Use sessionStorage for temporary state:

```javascript
// Save closed state
window.saveClosedState = function() {
    const closedItems = Array.from(document.querySelectorAll('[data-navigation-item][data-closed="true"]'))
        .map(item => item.getAttribute('data-navigation-item'));
    sessionStorage.setItem('closedNavigationItems', JSON.stringify(closedItems));
};

// Restore closed state
function initializeNavigationState() {
    const closedItems = JSON.parse(sessionStorage.getItem('closedNavigationItems') || '[]');
    // Apply closed state to items
}
```

**Key Principles:**
- Use sessionStorage for temporary UI state (not localStorage)
- Always provide fallbacks for missing data
- Clear state when navigating to closed items

#### Lesson 8: The Importance of Incremental Testing

**The Process:**
1. **Start Simple:** Get basic functionality working first
2. **Test Each Change:** Verify each modification works before proceeding
3. **Isolate Issues:** Test individual components separately
4. **Build Up Complexity:** Add features incrementally

**Key Principle:** Never make multiple changes at once. Test each change individually to isolate issues.

#### Lesson 9: When to Stop and Reassess

**Warning Signs:**
- Making the same type of change multiple times without success
- Breaking existing functionality while trying to add new features
- Complex workarounds that feel "hacky"
- Spending excessive time on a single feature

**The Solution:** Step back, reassess the approach, and consider simpler alternatives.

#### Lesson 10: Documentation and Knowledge Transfer

**Why This Matters:** The time spent debugging this feature represents valuable institutional knowledge that should be preserved.

**Best Practices:**
- Document complex debugging processes
- Record successful solutions for future reference
- Share lessons learned with the team
- Update documentation with new patterns and solutions

#### Lesson 11: Active Button Close Icon Roadblock

**The Problem:** Close icons work perfectly on inactive navigation buttons but fail to appear on active buttons despite extensive debugging attempts.

**Attempted Solutions:**
1. **Alpine.js Event Handling**: Tried `@mouseenter/@mouseleave`, `@mouseover/@mouseout` on various elements
2. **Event Bubbling**: Attempted to move events to parent containers, anchor tags, and wrapper divs
3. **CSS Hover States**: Implemented pure CSS `:hover` pseudo-classes as alternative to JavaScript
4. **Z-index and Positioning**: Adjusted layering and positioning to ensure visibility
5. **Alpine.js Re-initialization**: Enhanced Alpine.js initialization with `destroyTree` and `initTree`
6. **Event Target Debugging**: Added extensive console logging to track event flow

**Root Cause Analysis:**
- **Active buttons** have background gradients that may interfere with event handling
- **Anchor tag navigation** may be intercepting mouse events on active states
- **Alpine.js initialization timing** may differ between active and inactive states
- **CSS specificity conflicts** between active button styles and hover states

**Current Solution:**
- **Inactive buttons only**: Close icons appear on hover for inactive navigation items
- **Clean implementation**: Uses `opacity-0 hover:opacity-100` with CSS transitions
- **No Alpine.js complexity**: Removed all Alpine.js hover state management
- **Proper event handling**: Uses `@click.stop.prevent` for close functionality

**Future Considerations:**
- **Alternative UX**: Consider different interaction patterns for active items
- **CSS-only approach**: Explore pure CSS solutions for active button hover states
- **Component restructuring**: May require architectural changes to support active button close icons
- **User testing**: Validate that inactive-only close functionality meets user needs

**Key Takeaway:** Sometimes the best solution is to simplify and focus on what works rather than forcing complex functionality that may not be necessary.

#### Lesson 12: Navigation Close Icon Implementation - Final Solution

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

**Icon Implementation:**
- **FontAwesome SVG**: Uses exact path from `@fortawesome/fontawesome-free/svgs/solid/xmark.svg`
- **Proper viewBox**: `viewBox="0 0 384 512"` for correct scaling
- **Color theming**: `fill-current` with `color: var(--color-deep-grey)`
- **Size**: `w-4 h-4` (16px) for optimal visibility

**Positioning for Seamless Transition:**
- **Badge count**: Positioned in flex container with `p-[20px]` padding
- **Close icon**: Positioned at `right-5` (20px from right edge) to align with badge count
- **Visual alignment**: Creates seamless transition when badge disappears and close icon appears

**Why This Works:**
- **No Alpine.js complexity**: Pure CSS hover states are more reliable
- **Proper event handling**: Uses `@click.stop.prevent` for close functionality
- **Consistent theming**: Matches existing design system colors
- **Performance**: No JavaScript event listeners for hover states

### Key Files for Navigation Close Functionality

- `src/components/SpaceButton.astro`: Button component with close functionality
- `src/pages/dashboard.astro`: Dashboard with navigation items
- `src/pages/[id].astro`: Dynamic pages with navigation items
- `public/scripts/navigation-close.js`: Core navigation close logic
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
