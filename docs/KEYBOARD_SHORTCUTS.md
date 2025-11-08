# Keyboard Shortcuts Documentation

This document describes the keyboard shortcuts system implemented in Harvous for power users. All shortcuts are context-aware and designed to not interfere with normal typing.

## Overview

The keyboard shortcuts system provides quick access to common actions throughout the application. Shortcuts are automatically disabled when typing in text inputs, textareas, or contenteditable elements to prevent conflicts with normal text entry.

## Available Shortcuts

### Primary Actions

| Shortcut | Action | Description |
|----------|--------|-------------|
| **Cmd/Ctrl + N** | Create New Note | Opens the NewNotePanel to create a new note<br>**Context-aware**: Only works when app is focused (browser "New Window" works when address bar is focused) |
| **Cmd/Ctrl + Shift + N** | Create New Thread | Opens the NewThreadPanel to create a new thread<br>**Note**: Changed from Cmd/Ctrl + T to avoid conflict with browser's "New Tab" |
| **Cmd/Ctrl + F** | Find | Navigates to the Find page, or focuses the Find input if already on the Find page |
| **Esc** | Close Panel | Closes any currently open panel (NewNotePanel, NewThreadPanel, NoteDetailsPanel, EditThreadPanel) |

### Navigation Shortcuts

| Shortcut | Action | Description |
|----------|--------|-------------|
| **Cmd/Ctrl + D** | Go to Dashboard | Navigates to the dashboard page |
| **Cmd/Ctrl + [`** or **Backspace** | Navigate Back | Goes back in browser history, or navigates to dashboard if no history |

### Context-Aware Shortcuts

| Shortcut | Action | Description |
|----------|--------|-------------|
| **Cmd/Ctrl + I** | Open Details Panel | Opens the appropriate details panel based on current context:<br>- **Note page**: Opens NoteDetailsPanel<br>- **Thread page**: Opens EditThreadPanel |
| **Cmd/Ctrl + E** | Edit Note | Enters edit mode for the current note (only works when viewing a note) |
| **Cmd/Ctrl + S** | Save | Saves the current note/thread when editing or when a panel is open<br>**Note**: Cmd/Ctrl + Enter is not used for saving because it's used by the editor to start a new line |

## Platform Support

- **Mac**: Uses `Cmd` (⌘) key
- **Windows/Linux**: Uses `Ctrl` key
- The system automatically detects the platform and uses the appropriate modifier key

## Smart Input Detection

The keyboard shortcuts system automatically detects when you're typing in:
- Text input fields (`input[type="text"]`, `input[type="search"]`, etc.)
- Textarea elements
- Contenteditable elements (like the TiptapEditor)

**Shortcuts are automatically disabled** when typing in these elements to prevent conflicts with normal text entry.

## Context Detection

The system intelligently detects the current page context:

- **Note pages**: URLs starting with `/note_`
- **Thread pages**: URLs starting with `/thread_` or other non-standard routes
- **Space pages**: URLs starting with `/space_`

This allows context-aware shortcuts like **Cmd/Ctrl + I** to open the correct panel based on what you're viewing.

### App Focus Detection

The system also detects whether the app is focused (vs. browser chrome like the address bar):

- **App focused**: When you're interacting with the app content, shortcuts like `Cmd/Ctrl + N` create a new note
- **Browser chrome focused**: When the address bar or browser UI is focused, browser shortcuts work normally (e.g., `Cmd/Ctrl + N` opens a new browser window)

This context-aware behavior follows the pattern used by Notion and Obsidian, allowing both browser and app shortcuts to work appropriately.

## Technical Implementation

### File Structure

- **Handler**: `src/utils/keyboard-shortcuts.ts` - Main keyboard shortcuts handler
- **Initialization**: `src/layouts/Layout.astro` - Initializes shortcuts on page load and after View Transitions

### Key Functions

#### `isTypingInInput()`
Checks if the user is currently typing in an input field. Returns `true` if the active element is:
- A text input field
- A textarea
- A contenteditable element

#### `isModifierPressed(event)`
Checks if the appropriate modifier key is pressed (Cmd on Mac, Ctrl on Windows/Linux).

#### `isAppFocused()`
Checks if the app is currently focused (not browser chrome like address bar). This allows context-aware shortcuts like `Cmd/Ctrl + N` to only override browser behavior when the app is focused.

#### `getPageContext()`
Detects the current page context (note, thread, or space) based on the URL pathname.

#### `isPanelOpen()`
Checks if any panel is currently open by:
- Checking localStorage for panel state
- Checking if the square buttons container is hidden (indicates a panel is open)

#### `navigateTo(path)`
Navigates to a path using Astro's View Transitions if available, otherwise falls back to standard navigation.

### Event System

The keyboard shortcuts system uses CustomEvents to communicate with components:

- `openNewNotePanel` - Opens the NewNotePanel
- `closeNewNotePanel` - Closes the NewNotePanel
- `openNewThreadPanel` - Opens the NewThreadPanel
- `closeNewThreadPanel` - Closes the NewThreadPanel
- `openNoteDetailsPanel` - Opens the NoteDetailsPanel
- `closeNoteDetailsPanel` - Closes the NoteDetailsPanel
- `openEditThreadPanel` - Opens the EditThreadPanel
- `closeEditThreadPanel` - Closes the EditThreadPanel
- `editNote` - Triggers edit mode for the current note
- `saveContent` - Triggers save action for the current content

### View Transitions Support

The keyboard shortcuts system is fully compatible with Astro's View Transitions:

- Shortcuts are re-initialized after each page transition
- Navigation uses Astro's `navigate()` function for smooth transitions
- Event listeners are properly cleaned up to prevent duplicates

## Usage Examples

### Creating a New Note
1. Press **Cmd/Ctrl + N** from anywhere in the app (when app is focused)
2. The NewNotePanel opens
3. Type your note content
4. Press **Cmd/Ctrl + S** to save, or **Esc** to cancel

### Creating a New Thread
1. Press **Cmd/Ctrl + Shift + N** from anywhere in the app
2. The NewThreadPanel opens
3. Enter thread details
4. Press **Cmd/Ctrl + S** to save, or **Esc** to cancel

### Quick Navigation
1. Press **Cmd/Ctrl + F** to go to the Find page
2. If already on the Find page, **Cmd/Ctrl + F** focuses the search input
3. Press **Cmd/Ctrl + D** to return to the dashboard

### Editing a Note
1. Navigate to a note page
2. Press **Cmd/Ctrl + E** to enter edit mode
3. Make your changes
4. Press **Cmd/Ctrl + S** to save, or **Esc** to cancel

### Opening Details Panel
1. While viewing a note, press **Cmd/Ctrl + I** to open NoteDetailsPanel
2. While viewing a thread, press **Cmd/Ctrl + I** to open EditThreadPanel

## Best Practices

1. **Don't interfere with typing**: All shortcuts are automatically disabled when typing in inputs
2. **Context-aware**: Use shortcuts that match your current context (e.g., Cmd+I opens different panels based on what you're viewing)
3. **Escape to cancel**: Press **Esc** to quickly close any open panel
4. **Save frequently**: Use **Cmd/Ctrl + S** to save your work when editing

## Troubleshooting

### Shortcuts Not Working

1. **Check if you're typing**: Shortcuts are disabled when typing in inputs. Click outside the input first.
2. **Check browser focus**: Make sure the browser window has focus
3. **Check for conflicts**: Some browser extensions may interfere with keyboard shortcuts

### Shortcuts Work After Page Load But Not After Navigation

This is normal - shortcuts are re-initialized after View Transitions. If they don't work after navigation, try:
1. Refreshing the page
2. Checking the browser console for errors

### Platform-Specific Issues

- **Mac**: Make sure you're using `Cmd` (⌘), not `Ctrl`
- **Windows/Linux**: Make sure you're using `Ctrl`, not `Cmd`

## Future Enhancements

Potential future improvements to the keyboard shortcuts system:

- Customizable shortcuts (user preferences)
- Shortcut help modal (press `?` to view all shortcuts)
- Additional shortcuts for specific actions
- Visual indicators when shortcuts are available
- Shortcut hints in tooltips

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall application architecture
- [REACT_ISLANDS_STRATEGY.md](./REACT_ISLANDS_STRATEGY.md) - React Islands pattern
- [TYPESCRIPT_INLINE_SCRIPTS.md](./TYPESCRIPT_INLINE_SCRIPTS.md) - TypeScript in inline scripts

---

**Last Updated**: January 2025  
**Version**: 1.0.0

