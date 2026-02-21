# Edit & Create UX/UI Change

This document describes the major UX/UI change in how users **edit** and **create** content (spaces, threads, notes). The update replaces the previous square "More" and "Add" buttons with a persistent **action strip** and a dedicated **"Add a note"** button, and unifies panel close behavior with **Back** buttons.

---

## Overview

**Before:** A square "More" button in the additional column opened a menu (Edit, People, Erase, etc.). A square "Add" button opened the new-note or new-thread panel. On mobile, both appeared in a footer row.

**After:**
- **Action strip** — Text labels (Edit, People, Erase, etc.) live in a cream-colored **dock** that peeks out from behind the main content card. Tapping a label slides out the corresponding panel. No separate "More" menu.
- **Add a note** — A single large primary blue button at the bottom of the main content area. It opens the New Note panel. The "Create Thread" button was removed.
- **Back instead of Close** — Panel footers use the same Back (chevron) button as other panels instead of an X close button, with icon orientation matching layout (left on desktop, down on mobile).

---

## Action Strip & Dock

### Desktop

- The **dock** is a cream-colored panel (`#ebe8e0`) that sits **behind** the main content card, with the right edge peeking out.
- It extends **24px under the card** (matching the card’s border radius) so the card visually sits on top.
- The **action strip** is a vertical list of text labels (e.g. N001, Threads, Tags, Lock, Share, Erase, Note) inside the dock, with **12px (0.75rem) padding** top and bottom.
- **Animation:** The entire dock (background + strip) slides in from the left on load (0.35s ease-out). It starts fully behind the card, then moves right so the tabs are visible.
- Tabs use the same hover/active behavior as before: default opacity 0.5, hover 0.8, active 1.
- The dock is **hidden** when any side panel is open (e.g. Edit Space, New Note).

**Layout:** The dock lives inside the main column (`main-column__body`), in a container `action-strip-dock`, positioned absolutely to the right of the scroll area. The scroll area has `z-index: 1` so the card sits on top; the dock has `z-index: 0`.

### Mobile

- The **dock** is a cream panel at the **bottom** of the screen, behind the main content card, with the bottom edge peeking out.
- Same color and border radius (bottom corners only). **Same padding as desktop:** 0.75rem (12px) on the action strip on all sides; strip items also use 0.75rem padding.
- The strip is a **horizontal** row of text labels.
- **Animation:** The dock slides up from behind the card (0.35s ease-out). It starts fully behind the card, then moves down so the strip is visible.
- **Positioning:** No bottom padding on the app layout on mobile so the dock can sit closer to the screen edge. The main column reserves space for the dock via `mobile-main--with-dock` margin-bottom.

### Where the action strip appears

The action strip (desktop dock and mobile dock) is shown only on **thread**, **note**, and **space** content. It is **not** shown on:

- Dashboard
- Profile
- Search (find)
- New space

Controlled in `Layout.astro` with `showActionStrip = contentType === 'thread' || contentType === 'note' || contentType === 'space'`.

### Key files

- `src/components/react/ActionStrip.tsx` — Renders the strip items and handles actions (dispatch events, erase/leave confirmations).
- `src/components/ActionStrip.astro` — Astro island wrapper.
- `src/styles/action-strip.css` — Strip and item styles (desktop vertical, mobile horizontal, padding, overflow).
- `src/styles/layout.css` — `.action-strip-dock` (desktop) and `.mobile-action-strip-dock` (mobile), animations, `main-column__body` / `mobile-main__body` structure.

---

## "Add a note" Button

### Behavior

- **Label:** "Add a note" (large primary button: `btn btn--lg btn--primary`).
- **Placement:** Bottom of the main content area, **inside** the main column body so it overlays the card. It is absolutely positioned (`bottom: 1rem`, `left: 1rem`, `right: 1rem`) with `width: auto` so it stays within the card width and doesn’t overflow.
- **Action:** Dispatches `openNewNotePanel`. Respects note limit (free tier); shows a toast and does not open the panel if the limit is reached.
- **Visibility:** Shown on dashboard, space, thread, and note pages. **Not** shown on profile. **Hidden on desktop** when the New Note panel is open (so you don’t see two big blue buttons). On mobile it stays visible (panel is in a bottom sheet).
- **Spacer:** When the button is visible, a 64px-tall spacer is injected at the bottom of the card’s scrollable content (inside `card-stack__inner-content` or `card-full-editable`) so the last item can be scrolled above the button. When the button is hidden (edit mode or New Note panel open on desktop), the spacer is removed.

### Scroll behavior

- The **outer** main column scroll container has `overflow: hidden` so only the **card’s internal** scroll (e.g. `card-stack__inner` with `overflow-y: auto`) scrolls. This avoids the whole card scrolling and keeps the button floating at the bottom of the card area.
- Bottom spacing for the button is achieved via the injected spacer (handled in `CreateNoteButton.tsx`), not via padding on the scroll container.

### Key files

- `src/components/react/CreateNoteButton.tsx` — Button UI, `openNewNotePanel` / `closeNewNotePanel` / `closeAllPanels` and `contentEditModeChange` listeners, spacer injection/removal.
- `src/components/CreateNoteButton.astro` — Astro island wrapper.
- `src/styles/layout.css` — `.create-note-button` positioning.
- `src/layouts/Layout.astro` — Where the button is rendered (desktop and mobile main column, next to scroll area).

---

## Tab Nav (Content Tabs)

- **Spacing:** Removed the gap between the tab row (All, Threads, Notes, Scripture) and the content list below it on dashboard, space, and thread pages.
- **Height:** Content-tabs strip height was reduced: tab buttons use `height: 36px`, `padding-top: 0`, `padding-bottom: 8px` for a more compact strip. The active dot sits below the label with consistent spacing.
- **Styling:** `.tab-nav-container.content-tabs` in `src/styles/navigation.css`; tab dot is a `::after` on `button[data-active="true"]`.

---

## Panel Close → Back

- **New Note panel** and **New Thread panel** (when not using the back-button variant) previously used a **Close** (X) square button in the footer.
- They now use the same **Back** square button as other panels (e.g. Edit Space, Note Details).
- **Icon orientation:** Back uses the same rule as elsewhere — chevron **left** on desktop, chevron **down** on mobile (`inBottomSheet`), so the direction matches the panel’s slide direction.

**Files:**

- `src/components/react/note-panel/NoteFormFooter.tsx` — `variant="Close"` → `variant="Back"`, plus `inBottomSheet` prop.
- `src/components/react/NewNotePanel.tsx` — Passes `inBottomSheet` to `NoteFormFooter`.
- `src/components/react/NewThreadPanel.tsx` — Replaced Close with Back (single path; no `useBackButton` branching).

---

## Summary of Layout and CSS

| Area | Desktop | Mobile |
|------|---------|--------|
| Action strip | Right edge, behind card, vertical labels in cream dock | Bottom, behind card, horizontal labels in cream dock |
| Add a note button | Bottom of card area, absolute; hidden when New Note panel open | Bottom of card area; always visible when not edit mode |
| Main column scroll | `overflow: hidden`; card scrolls internally | Same |
| App layout bottom padding | 1.5rem (when ≥1160px) | 0 so dock can sit at screen edge |
| Panel footer close | Back (chevron left) | Back (chevron down in sheet) |

---

## Related Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Data model and content hierarchy.
- [MOBILE_KEYBOARD_NOTE_SHEET.md](./MOBILE_KEYBOARD_NOTE_SHEET.md) — Mobile keyboard and new-note sheet behavior.
- [REACT_ISLANDS_STRATEGY.md](./REACT_ISLANDS_STRATEGY.md) — How React islands are used in the app.
