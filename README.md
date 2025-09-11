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

### Key Files

- `src/utils/dashboard-data.ts`: Database queries for dashboard content
- `src/pages/dashboard.astro`: Main dashboard with inbox/organized content
- `src/pages/[id].astro`: Dynamic routing for threads, spaces, and notes
- `src/components/CardStack.astro`: Header component with color logic

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
