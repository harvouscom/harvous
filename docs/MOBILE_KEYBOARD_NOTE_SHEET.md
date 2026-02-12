# Mobile Keyboard + New Note Bottom Sheet

This doc describes how we keep the note editor usable when the virtual keyboard is open on mobile (iOS Safari and Android Chrome). The goal: toolbar stays 12px above the keyboard, the editor body fills the space above the toolbar and scrolls, and the sheet itself stays the standard bottom sheet (no resizing).

## Problem

On mobile, when the user focuses the note editor in the new-note bottom sheet:

- The virtual keyboard covers the lower part of the screen.
- Without special handling: the editor and toolbar can sit behind the keyboard, only one line is visible, or the sheet resizes in brittle ways and leaves gaps/artifacts.
- iOS Safari does not support `interactive-widget=resizes-content` (layout viewport does not shrink with the keyboard), and scrolling inside `position: fixed` (e.g. body) is broken on iOS.

## Solution Overview

We use three targeted mechanisms and leave the sheet layout alone:

1. **Scroll lock on layout root, not body** – So the sheet (in a portal) is outside the fixed container and inner scroll works on iOS.
2. **Toolbar fixed 12px above the keyboard** – One CSS variable (`--toolbar-bottom`) positions the formatting toolbar; the sheet is not resized.
3. **Editor scroll area constrained when keyboard is open** – One CSS variable (`--editor-scroll-max-height`) so the editor body has a max height and scrolls; footer is hidden to free space.

The sheet remains the standard bottom sheet (90vh, Radix positioning). All keyboard-specific behavior is driven by `window.visualViewport` and applies only when the keyboard is detected as open.

## Key Pieces

### 1. Scroll lock: `#layout-root` instead of `body`

**Why:** On iOS, scrolling is broken inside `position: fixed` elements. We used to lock `body`, which contained the sheet portal, so the editor could not scroll. We now lock only the main content wrapper (`#layout-root`). The sheet is rendered in a portal as a sibling of `#layout-root`, so it is not inside a fixed container and its inner scroll works.

**Where:**

- [src/layouts/Layout.astro](src/layouts/Layout.astro) – The main content div has `id="layout-root"`.
- [src/components/react/BottomSheet.tsx](src/components/react/BottomSheet.tsx) – When the sheet is open, we add `bottom-sheet-open` to `#layout-root` and set its `style.top` to preserve scroll position; on close we restore.
- [src/styles/global.css](src/styles/global.css) – `#layout-root.bottom-sheet-open` gets `position: fixed`, `overflow: hidden`, etc. (not `body`).
- [src/components/react/navigation/MobileNavigation.tsx](src/components/react/navigation/MobileNavigation.tsx) – Uses the same pattern for its sheet (lock `#layout-root`).

### 2. Toolbar 12px above keyboard

**When keyboard is open** (note/resource sheet on mobile), we set on the sheet content element:

- `--toolbar-bottom`: `(window.innerHeight - visualViewport.height) + 12` px.

**CSS:** When the sheet has `data-keyboard-open`, the bottom toolbar (`.tiptap-toolbar--bottom`) is switched to `position: fixed` and `bottom: var(--toolbar-bottom)`. So the toolbar floats 12px above the keyboard. No sheet resizing.

**Where:**

- [src/components/react/BottomSheet.tsx](src/components/react/BottomSheet.tsx) – Effect for note/resource sheet on mobile: reads `visualViewport`, sets `--toolbar-bottom` and `data-keyboard-open` when `viewport.height < window.innerHeight * 0.75`; clears on close. Also runs on `resize`/`scroll` and on `focusin` (with short delays) so it updates when the keyboard opens.
- [src/styles/panels.css](src/styles/panels.css) – `.bottom-sheet-content[data-keyboard-open] .tiptap-toolbar--bottom` with `position: fixed !important`, `bottom: var(--toolbar-bottom, 12px) !important`, `left/right: 12px`, `z-index: 21`.

### 3. Editor scroll area and footer

**When keyboard is open** we set on the sheet:

- `--editor-scroll-max-height`: `Math.max(120, viewport.height - 130)` px. The reserve (130px) leaves room for thread picker + note title; the rest is the scrollable editor height so multiple lines are visible.
- `data-keyboard-open`: existing CSS hides the Create button footer to free space.

**CSS:**

- `.bottom-sheet-content .new-note-panel--in-sheet .tiptap-content` uses `max-height: var(--editor-scroll-max-height, none)` so the editor body scrolls when the var is set.
- `.bottom-sheet-content[data-keyboard-open] .new-note-panel--in-sheet .panel__footer--buttons` hides the footer.
- `.bottom-sheet-content[data-keyboard-open] .new-note-panel--in-sheet .tiptap-content` gets `padding-bottom: 56px` so the last line can scroll above the fixed toolbar.

**Where:**

- Same BottomSheet effect sets `--editor-scroll-max-height` and `data-keyboard-open`.
- [src/styles/panels.css](src/styles/panels.css) – Rules above for `.tiptap-content` and footer.

### 4. Viewport meta (Android)

- [src/layouts/Layout.astro](src/layouts/Layout.astro) – Viewport meta includes `interactive-widget=resizes-content`. On Android/Chrome the layout viewport shrinks with the keyboard; we don’t rely on it for the sheet, but it helps elsewhere. Not supported on iOS Safari.

### 5. Toolbar placement

- The formatting toolbar is at the **bottom** of the editor (above the keyboard) for both mobile and desktop in the new-note panel: [src/components/react/NewNotePanel.tsx](src/components/react/NewNotePanel.tsx) passes `toolbarAtBottom={true}` to DefaultNoteForm/ScriptureNoteForm, and [src/components/react/TiptapEditor.tsx](src/components/react/TiptapEditor.tsx) renders the toolbar below the scroll area when `toolbarAtBottom` is true.

## Flow When Keyboard Opens

1. User focuses the editor in the new-note sheet on mobile.
2. Browser shows the keyboard; `visualViewport` shrinks and may fire `resize`/`scroll` (and we also run our logic on `focusin` with short delays).
3. We detect keyboard open (`viewport.height < window.innerHeight * 0.75`), set on the sheet element:
   - `--toolbar-bottom`
   - `--editor-scroll-max-height`
   - `data-keyboard-open`
4. CSS: toolbar becomes fixed 12px above the keyboard; editor gets a max height and scrolls; footer is hidden; editor has padding-bottom so content can scroll above the toolbar.
5. When the keyboard closes, we clear those two variables and the attribute; the sheet and toolbar return to normal (sticky toolbar, no max height, footer visible).

## Why It Works on Different Screen Sizes

- **Keyboard detection** uses a ratio (`viewport.height < 0.75 * innerHeight`), not fixed pixels.
- **Toolbar position** is `(innerHeight - viewport.height) + 12`, so it stays 12px above the keyboard on any device.
- **Editor height** is `viewport.height - 130`; on larger phones or tablets the visible area is larger, so the editor gets more space. Same logic, scales with viewport.

## Constants You Might Tweak

- In BottomSheet effect: `RESERVE_EDITOR_PX = 130`. Smaller value = more editor height (more lines visible); larger = more reserved for header/title. Adjust if one line is cut off or there’s too much gap.
- In panels.css: toolbar `left/right: 12px`; editor `padding-bottom: 56px` when keyboard open. Change if layout or toolbar height changes.

## Files Summary

| File | Role |
|------|------|
| [src/layouts/Layout.astro](src/layouts/Layout.astro) | `id="layout-root"` on main content; viewport meta with `interactive-widget=resizes-content` |
| [src/components/react/BottomSheet.tsx](src/components/react/BottomSheet.tsx) | Scroll lock on `#layout-root`; when note/resource sheet on mobile, sets `--toolbar-bottom`, `--editor-scroll-max-height`, `data-keyboard-open` from `visualViewport` |
| [src/styles/global.css](src/styles/global.css) | `#layout-root.bottom-sheet-open` scroll lock (not body) |
| [src/styles/panels.css](src/styles/panels.css) | Toolbar fixed when `data-keyboard-open`; editor max-height and padding-bottom; footer hidden when `data-keyboard-open` |
| [src/components/react/TiptapEditor.tsx](src/components/react/TiptapEditor.tsx) | Toolbar at bottom when `toolbarAtBottom`; 12px spacing |
| [src/components/react/NewNotePanel.tsx](src/components/react/NewNotePanel.tsx) | Passes `toolbarAtBottom={true}` to note forms |
