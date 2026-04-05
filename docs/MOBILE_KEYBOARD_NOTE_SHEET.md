# Mobile Keyboard + New Note Bottom Sheet

This doc describes how we keep the note editor usable when the virtual keyboard is open on mobile (iOS Safari and Android Chrome). The goal: toolbar stays 12px above the keyboard, the editor body fills the space above the toolbar and scrolls, and the sheet itself stays the standard bottom sheet (no resizing).

**Shell:** The mobile panel host uses **[Vaul](https://github.com/emilkowalski/vaul)** ([`src/components/ui/drawer.tsx`](../src/components/ui/drawer.tsx)) on top of Radix Dialog, with Harvous classes (`sheet-overlay`, `.bottom-sheet-content`, etc.). Drawer motion follows Vaul’s defaults; layout and keyboard behavior below are Harvous-specific. UI direction credits **[Emil Kowalski](https://emilkowal.ski/)** (Vaul; we also use his **[Sonner](https://github.com/emilkowalski/sonner)** for toasts).

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

The sheet remains the standard bottom sheet (capped height via `.bottom-sheet-content` / `bottom-sheet--full-height` in [`panels.css`](../src/styles/panels.css), Vaul + Radix positioning). All keyboard-specific behavior is driven by `window.visualViewport` and applies only when the keyboard is detected as open.

### Vaul + Harvous CSS (whole drawer lift)

Vaul’s `repositionInputs` path sets an **inline `bottom`** on the drawer content when the virtual keyboard opens (`visualViewport` resize) so the sheet sits above the keyboard. **Do not use `bottom: … !important` on `[data-side="bottom"]` in global CSS** — author `!important` overrides non-`!important` inline styles, so Vaul’s lift is ignored and the drawer stays behind the keyboard on iOS. The rule lives in [`src/styles/global.css`](../src/styles/global.css) (`[data-side="bottom"]`: default `bottom: 0` without `!important`).

## Key Pieces

### 1. Scroll lock: `#layout-root` instead of `body`

**Why:** On iOS, scrolling is broken inside `position: fixed` elements. We used to lock `body`, which contained the sheet portal, so the editor could not scroll. We now lock only the main content wrapper (`#layout-root`). The sheet is rendered in a portal as a sibling of `#layout-root`, so it is not inside a fixed container and its inner scroll works.

**Where:**

- [spa/src/layouts/AppLayout.tsx](../spa/src/layouts/AppLayout.tsx) – The main shell div has `id="layout-root"` and class `app-layout`.
- [src/components/react/BottomSheet.tsx](../src/components/react/BottomSheet.tsx) – When the sheet is open, adds `bottom-sheet-open` to `#layout-root` and sets `style.top` to preserve scroll position; on close restores. (We do **not** strip `.app-layout` top padding via global CSS — that caused the nav to sit flush with the viewport while the sheet was open.)
- [src/styles/global.css](../src/styles/global.css) – Documents the `bottom-sheet-open` class only (no `padding-top: 0` override on `#layout-root`).

### 2. Toolbar 12px above keyboard

**When keyboard is open** (note/resource sheet on mobile), we set on the sheet content element:

- `--toolbar-bottom`: `(window.innerHeight - visualViewport.height) + 12` px.

**CSS:** When the sheet has `data-keyboard-open`, the bottom toolbar (`.tiptap-toolbar--bottom`) is switched to `position: fixed` and `bottom: var(--toolbar-bottom)`. So the toolbar floats 12px above the keyboard. No sheet resizing.

**Where:**

- [src/components/react/BottomSheet.tsx](src/components/react/BottomSheet.tsx) – Effect for note/resource sheet on mobile: reads `visualViewport`, sets `--toolbar-bottom` and `data-keyboard-open` when `viewport.height < window.innerHeight * 0.75`; clears on close. Runs on `resize`/`scroll` and on `focusin` (100ms, 300ms; on iOS also 400ms and 600ms so layout updates after the keyboard animation). On iOS, an estimated viewport height (55% of `innerHeight`) is applied at 50ms on focus so vars are usable before `visualViewport` resize fires.
- [src/styles/panels.css](src/styles/panels.css) – `.bottom-sheet-content[data-keyboard-open] .tiptap-toolbar--bottom` with `position: fixed !important`, `bottom: var(--toolbar-bottom, 12px) !important`, `left/right: 12px`, `z-index: 21`.

### 3. Editor scroll area and footer

**When keyboard is open** we set on the sheet:

- `--editor-scroll-max-height`: `Math.max(120, viewport.height - 130)` px. The reserve (130px) leaves room for thread picker + note title; the rest is the scrollable editor height so multiple lines are visible.
- `data-keyboard-open`: existing CSS hides the Create button footer to free space.

**CSS:**

- `.bottom-sheet-content .new-note-panel--in-sheet .tiptap-content` uses `max-height: var(--editor-scroll-max-height, none)` so the editor body scrolls when the var is set.
- `.bottom-sheet-content[data-keyboard-open] .new-note-panel--in-sheet .tiptap-editor-container` gets `max-height: var(--editor-scroll-max-height)` so the editor wrapper does not grow past the scroll area; this removes the gap between the bottom of the content and the fixed toolbar.
- `.bottom-sheet-content[data-keyboard-open] .new-note-panel--in-sheet .panel__footer--buttons` hides the footer.
- `.bottom-sheet-content[data-keyboard-open] .new-note-panel--in-sheet .tiptap-content` gets `padding-bottom: 56px` so the last line can scroll above the fixed toolbar.
- `.bottom-sheet-content[data-keyboard-open] .new-note-panel--in-sheet .tiptap-content .ProseMirror` gets `scroll-margin-bottom: 60px` so when the selection is scrolled into view, it stays above the fixed toolbar.

**Where:**

- Same BottomSheet effect sets `--editor-scroll-max-height` and `data-keyboard-open`.
- [src/styles/panels.css](src/styles/panels.css) – Rules above for `.tiptap-content`, `.tiptap-editor-container`, `.ProseMirror` scroll-margin, and footer.

### 4. Viewport meta (Android)

- [src/layouts/Layout.astro](src/layouts/Layout.astro) – Viewport meta includes `interactive-widget=resizes-content`. On Android/Chrome the layout viewport shrinks with the keyboard; we don’t rely on it for the sheet, but it helps elsewhere. Not supported on iOS Safari.

### 5. Toolbar placement

- The formatting toolbar is at the **bottom** of the editor (above the keyboard) for both mobile and desktop in the new-note panel: [src/components/react/NewNotePanel.tsx](src/components/react/NewNotePanel.tsx) passes `toolbarAtBottom={true}` and `inBottomSheet={inBottomSheet}` to DefaultNoteForm/ScriptureNoteForm, and [src/components/react/TiptapEditor.tsx](src/components/react/TiptapEditor.tsx) renders the toolbar below the scroll area when `toolbarAtBottom` is true.

### 6. Scroll selection into view (iOS / keyboard open)

- When the editor is in the bottom sheet (`inBottomSheet`) with the bottom toolbar, TiptapEditor scrolls the selection/caret into view so it stays above the fixed toolbar: on focus (after 350ms, once `data-keyboard-open` is set) and on `selectionUpdate`. The CSS `scroll-margin-bottom: 60px` on `.ProseMirror` ensures the caret is not hidden behind the toolbar when scrolled into view.

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

- In BottomSheet effect: `RESERVE_EDITOR_PX = 130`. Smaller value = more editor height (more lines visible); larger = more reserved for header/title. Adjust if one line is cut off, there’s too much gap, or content is still covered by the toolbar.
- In panels.css: toolbar `left/right: 12px`; editor `padding-bottom: 56px` when keyboard open; `.ProseMirror` `scroll-margin-bottom: 60px` when keyboard open. Change if layout or toolbar height changes.

## Files Summary

| File | Role |
|------|------|
| [spa/src/layouts/AppLayout.tsx](../spa/src/layouts/AppLayout.tsx) | `id="layout-root"` on main shell |
| [src/components/react/BottomSheet.tsx](../src/components/react/BottomSheet.tsx) | Toggles `bottom-sheet-open` + `style.top` on `#layout-root`; note/resource sheet: `--toolbar-bottom`, `--editor-scroll-max-height`, `data-keyboard-open` from `visualViewport` |
| [src/styles/global.css](../src/styles/global.css) | Comment for `bottom-sheet-open`; `.sheet-overlay` safe-area; no zeroing `#layout-root` top padding |
| [src/styles/panels.css](src/styles/panels.css) | Toolbar fixed when `data-keyboard-open`; editor and container max-height; padding-bottom and scroll-margin-bottom; footer hidden when `data-keyboard-open` |
| [src/components/react/TiptapEditor.tsx](src/components/react/TiptapEditor.tsx) | Toolbar at bottom when `toolbarAtBottom`; 12px spacing; when `inBottomSheet`, scrolls selection into view above toolbar on focus and selection update |
| [src/components/react/NewNotePanel.tsx](src/components/react/NewNotePanel.tsx) | Passes `toolbarAtBottom={true}` and `inBottomSheet` to note forms; iOS focusin scroll reset |
