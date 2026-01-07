# Keyboard Shortcuts

Learn how to work faster in Harvous with keyboard shortcuts. All shortcuts are context-aware and designed to not interfere with normal typing.

## Overview

Harvous provides keyboard shortcuts for common actions throughout the application. Shortcuts are automatically disabled when typing in text inputs, textareas, or contenteditable elements to prevent conflicts with normal text entry.

## Creating Content

### Create New Note

**Shortcut**: `Cmd/Ctrl + N`

- Opens the NewNotePanel to create a new note
- **Context-aware**: Only works when app is focused (browser "New Window" works when address bar is focused)
- Works from anywhere in the app when the app has focus

### Create New Thread

**Shortcut**: `Cmd/Ctrl + Shift + N`

- Opens the NewThreadPanel to create a new thread
- **Note**: Changed from `Cmd/Ctrl + T` to avoid conflict with browser's "New Tab"
- Works from anywhere in the app

## Navigation

### Go to Dashboard

**Shortcut**: `Cmd/Ctrl + D`

- Navigates to the dashboard page
- Quick way to return to your main workspace

### Navigate Back

**Shortcut**: `Cmd/Ctrl + [` or `Backspace`

- Goes back in browser history
- Or navigates to dashboard if no history
- Useful for quick navigation

### Find / Search

**Shortcut**: `Cmd/Ctrl + F`

- Navigates to the Find page
- Or focuses the Find input if already on the Find page
- Quick access to search functionality

## Editing and Panels

### Close Panel

**Shortcut**: `Esc`

- Closes any currently open panel
- Works with:
  - NewNotePanel
  - NewThreadPanel
  - NoteDetailsPanel
  - EditThreadPanel
- Quick way to dismiss panels

### Open Details Panel

**Shortcut**: `Cmd/Ctrl + I`

- Opens the appropriate details panel based on current context:
  - **Note page**: Opens NoteDetailsPanel
  - **Thread page**: Opens EditThreadPanel
- Context-aware shortcut that adapts to what you're viewing

### Edit Note

**Shortcut**: `Cmd/Ctrl + E`

- Enters edit mode for the current note
- **Only works when viewing a note**
- Quick way to start editing without clicking buttons

### Save

**Shortcut**: `Cmd/Ctrl + S`

- Saves the current note/thread when editing or when a panel is open
- **Note**: `Cmd/Ctrl + Enter` is not used for saving because it's used by the editor to start a new line
- Standard save shortcut that works across the app

## Platform Support

### Mac

- Uses `Cmd` (⌘) key
- All shortcuts use the Command key
- Works with standard Mac keyboard shortcuts

### Windows/Linux

- Uses `Ctrl` key
- All shortcuts use the Control key
- Works with standard Windows/Linux keyboard shortcuts

The system automatically detects your platform and uses the appropriate modifier key.

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

This allows context-aware shortcuts like `Cmd/Ctrl + I` to open the correct panel based on what you're viewing.

### App Focus Detection

The system also detects whether the app is focused (vs. browser chrome like the address bar):

- **App focused**: When you're interacting with the app content, shortcuts like `Cmd/Ctrl + N` create a new note
- **Browser chrome focused**: When the address bar or browser UI is focused, browser shortcuts work normally (e.g., `Cmd/Ctrl + N` opens a new browser window)

This context-aware behavior follows the pattern used by Notion and Obsidian, allowing both browser and app shortcuts to work appropriately.

## Usage Examples

### Creating a New Note

1. Press `Cmd/Ctrl + N` from anywhere in the app (when app is focused)
2. The NewNotePanel opens
3. Type your note content
4. Press `Cmd/Ctrl + S` to save, or `Esc` to cancel

### Creating a New Thread

1. Press `Cmd/Ctrl + Shift + N` from anywhere in the app
2. The NewThreadPanel opens
3. Enter thread details
4. Press `Cmd/Ctrl + S` to save, or `Esc` to cancel

### Quick Navigation

1. Press `Cmd/Ctrl + F` to go to the Find page
2. If already on the Find page, `Cmd/Ctrl + F` focuses the search input
3. Press `Cmd/Ctrl + D` to return to the dashboard

### Editing a Note

1. Navigate to a note page
2. Press `Cmd/Ctrl + E` to enter edit mode
3. Make your changes
4. Press `Cmd/Ctrl + S` to save, or `Esc` to cancel

### Opening Details Panel

1. While viewing a note, press `Cmd/Ctrl + I` to open NoteDetailsPanel
2. While viewing a thread, press `Cmd/Ctrl + I` to open EditThreadPanel

## Best Practices

### Don't Interfere with Typing

- All shortcuts are automatically disabled when typing in inputs
- Click outside the input first if you need to use a shortcut

### Context-Aware Usage

- Use shortcuts that match your current context
- `Cmd/Ctrl + I` opens different panels based on what you're viewing
- `Cmd/Ctrl + E` only works when viewing a note

### Escape to Cancel

- Press `Esc` to quickly close any open panel
- Works with all panels and modals

### Save Frequently

- Use `Cmd/Ctrl + S` to save your work when editing
- Standard save shortcut that works across the app

## Troubleshooting

### Shortcuts Not Working

1. **Check if you're typing**: Shortcuts are disabled when typing in inputs. Click outside the input first.
2. **Check browser focus**: Make sure the browser window has focus
3. **Check for conflicts**: Some browser extensions may interfere with keyboard shortcuts
4. **Check platform**: Make sure you're using the correct modifier key (`Cmd` on Mac, `Ctrl` on Windows/Linux)

### Shortcuts Work After Page Load But Not After Navigation

This is normal - shortcuts are re-initialized after View Transitions. If they don't work after navigation, try:

1. Refreshing the page
2. Checking the browser console for errors
3. Making sure the app has focus (not the browser chrome)

### Platform-Specific Issues

- **Mac**: Make sure you're using `Cmd` (⌘), not `Ctrl`
- **Windows/Linux**: Make sure you're using `Ctrl`, not `Cmd`

## Quick Reference

| Shortcut | Action | Context |
|----------|--------|---------|
| `Cmd/Ctrl + N` | Create New Note | App focused |
| `Cmd/Ctrl + Shift + N` | Create New Thread | Anywhere |
| `Cmd/Ctrl + F` | Find / Search | Anywhere |
| `Cmd/Ctrl + D` | Go to Dashboard | Anywhere |
| `Cmd/Ctrl + [` or `Backspace` | Navigate Back | Anywhere |
| `Esc` | Close Panel | Panel open |
| `Cmd/Ctrl + I` | Open Details Panel | Note/Thread page |
| `Cmd/Ctrl + E` | Edit Note | Note page |
| `Cmd/Ctrl + S` | Save | Editing/Panel open |

## Related Guides

- **[Using Notes](using-notes.md)** - Learn about note creation and editing
- **[Using Threads](using-threads.md)** - Learn about thread management
- **[Tips and Best Practices](tips-and-best-practices.md)** - Advanced productivity tips

---

**Need help?** Check out the [FAQs](faqs.md) or [Troubleshooting](troubleshooting.md) guide.

