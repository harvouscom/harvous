# Keyboard Shortcuts

Learn how to work faster in Harvous with keyboard shortcuts. All shortcuts are context-aware and designed to not interfere with normal typing.

## Overview

Harvous provides keyboard shortcuts for common actions throughout the application. Shortcuts are automatically disabled when typing in text inputs, textareas, or contenteditable elements to prevent conflicts with normal text entry.

## Creating Content

### Create New Note

**Shortcut**: `Cmd/Ctrl + '` (apostrophe / single quote)

- Opens the NewNotePanel to create a new note
- **Two keys**: left hand on **Cmd** (Mac) or **Ctrl** (Windows/Linux), right hand on **'**—same row as **;**, next to **Enter** on US QWERTY
- Avoids **Cmd/Ctrl + N/T/R/O**, which browsers reserve for new window, tab, reload, open, etc.
- Works while the cursor is in the note editor (same global handling as Spotlight), so you don’t have to leave the editor first

### Create New Thread

**Shortcut**: `Cmd/Ctrl + ;` (semicolon)

- Opens the NewThreadPanel to create a new thread
- **Right hand on ;**—immediately beside **'** on US QWERTY so both create shortcuts sit together
- Works while the cursor is in the note editor

## Navigation

### Home

**Shortcut**: `Cmd/Ctrl + Shift + H`

- Navigates to the app home (root / dashboard route)
- Quick way to return to your main workspace

### Navigate Back

**Shortcut**: `Cmd/Ctrl + Left Arrow`

- Closes the top overlay or panel first (Spotlight, slide-out panels, etc.)
- If nothing app-owned is open, moves up the content hierarchy on note, thread, and space routes (note → previous note in thread if applicable, else thread → space if in context, else home)
- On other routes (e.g. search, profile), uses browser history, or home if there is no history

### Desktop nav column (when visible)

- **Cycle open items**: `Cmd/Ctrl + Option + [` / `]` — previous / next opened item in the left nav (active space + persistent strip). Uses brackets instead of arrow keys so shortcuts are less likely to conflict with browser tab switching.
- **Switch tab**: `Cmd/Ctrl + Option + Left Arrow` / `Right Arrow` — cycle content tabs on thread/space pages
- **Switch space**: `Cmd/Ctrl + Option + S` — open the space switcher

### Search (Spotlight)

**Shortcut**: `Cmd/Ctrl + K`

- Opens the Spotlight overlay to search across Harvous (works from the editor and other surfaces)

### Find / Search page

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

**Shortcut**: `Cmd/Ctrl + D`

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

- Uses `Cmd` (⌘) for most shortcuts, including new note (`⌘'`) and new thread (`⌘;`)
- Works with standard Mac keyboard shortcuts

### Windows/Linux

- Uses `Ctrl` for most shortcuts, including new note (`Ctrl+'`) and new thread (`Ctrl+;`)
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

This allows context-aware shortcuts like `Cmd/Ctrl + D` to open the correct panel based on what you're viewing.

### App Focus Detection

The system also detects whether the app is focused (vs. browser chrome like the address bar):

- **App focused**: `Cmd/Ctrl + '` and `Cmd/Ctrl + ;` create a new note or thread; Harvous does not use plain **Cmd/Ctrl + N** for create (browsers reserve that for a new window)
- **Browser chrome focused**: When the address bar or browser UI is focused, use the browser’s normal shortcuts

## Usage Examples

### Creating a New Note

1. Press `Cmd/Ctrl + '` from the app (including from the note editor)
2. The NewNotePanel opens
3. Type your note content
4. Press `Cmd/Ctrl + S` to save, or `Esc` to cancel

### Creating a New Thread

1. Press `Cmd/Ctrl + ;` from the app (including from the note editor)
2. The NewThreadPanel opens
3. Enter thread details
4. Press `Cmd/Ctrl + S` to save, or `Esc` to cancel

### Quick Navigation

1. Press `Cmd/Ctrl + F` to go to the Find page
2. If already on the Find page, `Cmd/Ctrl + F` focuses the search input
3. Press `Cmd/Ctrl + Shift + H` to return to home

### Editing a Note

1. Navigate to a note page
2. Press `Cmd/Ctrl + E` to enter edit mode
3. Make your changes
4. Press `Cmd/Ctrl + S` to save, or `Esc` to cancel

### Opening Details Panel

1. While viewing a note, press `Cmd/Ctrl + D` to open NoteDetailsPanel
2. While viewing a thread, press `Cmd/Ctrl + D` to open EditThreadPanel

## Best Practices

### Don't Interfere with Typing

- Most shortcuts are disabled when typing in inputs
- **New note** (`Cmd/Ctrl + '`) and **new thread** (`Cmd/Ctrl + ;`) still work from the note editor (same as Spotlight)
- For other shortcuts, click outside the input first if needed

### Context-Aware Usage

- Use shortcuts that match your current context
- `Cmd/Ctrl + D` opens different panels based on what you're viewing
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
| **Cmd/Ctrl + '** | Create New Note | Anywhere in app |
| `Cmd/Ctrl + ;` | Create New Thread | Anywhere in app |
| `Cmd/Ctrl + K` | Spotlight search | Anywhere |
| `Cmd/Ctrl + F` | Find / Search | Anywhere |
| `Cmd/Ctrl + Shift + H` | Home | Anywhere |
| `Cmd/Ctrl + Left Arrow` | Back | Anywhere |
| `Cmd/Ctrl + Alt + [ / ]` | Cycle open items | Desktop nav visible |
| `Cmd/Ctrl + Alt + ← / →` | Switch tab | Thread/space with tabs |
| `Cmd/Ctrl + Alt + S` | Switch space | Desktop |
| `Esc` | Close Panel | Panel open |
| `Cmd/Ctrl + D` | Open Details Panel | Note/Thread page |
| `Cmd/Ctrl + E` | Edit Note | Note page |
| `Cmd/Ctrl + S` | Save | Editing/Panel open |

## Related Guides

- **[Using Notes](using-notes.md)** - Learn about note creation and editing
- **[Using Threads](using-threads.md)** - Learn about thread management
- **[Tips and Best Practices](tips-and-best-practices.md)** - Advanced productivity tips

---

**Need help?** Check out the [FAQs](faqs.md) or [Troubleshooting](troubleshooting.md) guide.

