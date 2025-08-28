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

### Robust Sample Data System (`src/utils/sample-data.ts`)

- **Development Mode**: Uses clean, consistent sample data by default
- **Production Mode**: Uses database with fallback to sample data
- **Data Mode Toggle**: In development, toggle between sample data and real database using the indicator in the top-right corner
- **URL Parameter**: Add `?useRealData=true` to any URL to force real database usage
- **No Duplicates**: Carefully crafted to avoid content duplication
- **Consistent Formatting**: Proper TypeScript interfaces and helper functions
- **Time-Based IDs**: All IDs use timestamp format (e.g., `note_1756318000001`, `thread_1756318000000`)
- **Available Colors**: Use only existing CSS variables: blessed-blue, graceful-gold, caring-coral, mindful-mint, peaceful-pink, pleasant-peach, lovely-lavender

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

### Development Rules

- **ALWAYS double-check your work**: Test functionality before declaring it complete
- **Verify ID consistency**: Ensure IDs match between sample data and component usage
- **Test navigation flows**: Click through all links to ensure they work properly
- **Check color variables**: Only use existing CSS color variables
- **Validate data structure**: Ensure sample data matches expected component interfaces

### Development Workflow

- **Sample Data Mode** (default): Use for consistent development and testing UI components
- **Real Database Mode**: Use to test full data flow and note creation
- **Toggle Indicator**: Look for the data mode indicator in the top-right corner during development
- **URL Parameter**: Add `?useRealData=true` to any URL to force real database usage
- **Note Creation**: When testing note creation, switch to real database mode to see notes appear in the UI

### Key Files

- `src/utils/sample-data.ts`: Centralized sample data system
- `src/pages/dashboard.astro`: Main dashboard with inbox/organized content
- `src/pages/[id].astro`: Dynamic routing for threads, spaces, and notes
- `src/components/CardStack.astro`: Header component with color logic

## Alpine.js Integration

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
