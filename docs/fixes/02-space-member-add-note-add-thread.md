# Fix: Space member Add Note / Add Thread

## Problem

When viewing a space as a **member** (not owner), the context menu (and any UI that used the same menu options) did not offer "Add Note" or "Add Thread." Members could not open the New Note or New Thread panels from the space context menu or from the ActionStrip on the space page.

## Root cause

1. **Menu options**: `getMenuOptions()` in `src/utils/menu-options.ts` returns different options per `contentType` and `spaceRole`. For `contentType === "space"` and `spaceRole === "member"`, the list only included "About Space" and "Leave Space"; it did not include "Add Note" or "Add Thread."
2. **ActionStrip handling**: The ActionStrip component (`src/components/react/ActionStrip.tsx`) dispatches actions from the menu. It had special handling for actions like `openEditSpacePanelPeople` (CustomEvents) but did not handle `openNewNotePanel` or `openNewThreadPanel`. So even if those actions appeared in the menu, selecting them would not open the panels. (The main Menu component already dispatched those CustomEvents; the strip needed to do the same.)

## Solution

1. **Menu options for space members**  
   In `src/utils/menu-options.ts`, for `contentType === "space"` and `spaceRole === 'member'`, add two options at the top of the list:
   - `{ action: "openNewNotePanel", label: "Add Note" }`
   - `{ action: "openNewThreadPanel", label: "Add Thread" }`

2. **ActionStrip handling for panel-open actions**  
   In `src/components/react/ActionStrip.tsx`, in `dispatchAction()`, handle the two panel actions before other logic:
   - If `action === 'openNewNotePanel'`: dispatch `CustomEvent('openNewNotePanel')` on `window` and return.
   - If `action === 'openNewThreadPanel'`: dispatch `CustomEvent('openNewThreadPanel')` on `window` and return.

Existing listeners in `DesktopPanelManager` and `BottomSheet` (and elsewhere) already listen for `openNewNotePanel` and `openNewThreadPanel`, so no other changes were required for the panels to open.

3. **AppLayout comment**  
   In `spa/src/layouts/AppLayout.tsx`, the visibility of `CreateNoteButton` was clarified: it shows for dashboard, thread, and space (including when the user is a space member), and should not be gated on `spaceRole`.

## Files changed

- **src/utils/menu-options.ts** – Added "Add Note" and "Add Thread" options for space members.
- **src/components/react/ActionStrip.tsx** – Handle `openNewNotePanel` and `openNewThreadPanel` by dispatching the same CustomEvents used elsewhere.
- **spa/src/layouts/AppLayout.tsx** – Comment only: CreateNoteButton visibility for dashboard, thread, space (including as member).

## Prevention

- When adding a new role or context (e.g. space member), check that all relevant actions (Add Note, Add Thread, etc.) are present in the menu options for that context.
- When adding new panel-open actions, ensure every entry point that can show the menu (Menu component, ActionStrip, etc.) dispatches the same CustomEvents that the panel manager listens for.
