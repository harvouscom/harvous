---
name: ""
overview: ""
todos: []
isProject: false
---

# Fix excess space above TabNav and mobile Create Note button placement

## Overview

1. **Excess space above TabNav** when loading another space: fix by not injecting the 64px spacer into an empty card (CreateNoteButton inject logic).
2. **Mobile Create Note button and ActionStrip**: move the "Add a note" button back inside the card (`card-stack__inner-content`) on mobile so it sits at the bottom of the card; ActionStrip dock stays in layout below the card.

---

## 1. Excess space above TabNav (unchanged from prior plan)

**Cause:** During Space (or similar) loading, `card-stack__inner-content` is empty. CreateNoteButton injects a 64px spacer into it. When content loads, React adds the real children but does not remove the injected spacer, so DOM order is `[injected spacer][wrapper with TabNav + list]` → 64px gap above the tabs.

**Fix:** In [src/components/react/CreateNoteButton.tsx](src/components/react/CreateNoteButton.tsx), in `inject()`, only inject when the card already has real content: require `.content-tabs` **or** `[data-cta-spacer]` before injecting. If neither is present, return `false` (and rely on MutationObserver until content appears). This prevents injecting into the empty loading state.

---

## 2. Mobile: Create Note button inside the card

**Current (wrong):** CreateNoteButton is rendered by AppLayout inside `mobile-main__body` as a sibling of `main-column__scroll`. DOM: `mobile-main__body` > `main-column__scroll` (card), `create-note-button-wrapper` (button), `mobile-action-strip-dock` (Edit/Erase). So the button sits at the bottom of the whole main body, and the ActionStrip is below it.

**Desired:** The "Add a note" button should be **inside** the card’s scrollable content, at the bottom of `card-stack__inner-content`, like it used to be. The ActionStrip dock stays in the layout (below the scroll area).

**Approach**

- **On mobile only:** For Space, Thread, and Dashboard pages, render CreateNoteButton **inside** the card (last child of CardStack content, after the existing spacer). AppLayout will **not** render CreateNoteButton in the mobile layout when `contentType` is `'space'` | `'thread'` | `'dashboard'`, so the only button on those routes is the one inside the card.
- **On desktop:** Keep current behavior: AppLayout keeps rendering CreateNoteButton in `main-column__body` for space/thread/dashboard (no change).
- **Other pages (e.g. note, profile):** AppLayout continues to render the appropriate CTA in the mobile block (e.g. NotePageAddButton for note; no CTA for profile).

**Implementation steps**

1. `**card-stack__inner-content` as positioning context**
  In [src/styles/cards.css](src/styles/cards.css), add `position: relative` to `.card-stack__inner-content` so the absolutely positioned Create Note button (and its wrapper) can sit at the bottom of the card.
2. **Mobile-only CreateNoteButton inside the card**
  - **SpacePage** ([spa/src/pages/SpacePage.tsx](spa/src/pages/SpacePage.tsx)): After the existing spacer, render CreateNoteButton when on mobile (e.g. `useMediaQuery` or `window.innerWidth < 1160`). Pass `addToSpaceSpaceId={spaceId}`.  
  - **ThreadPage** ([spa/src/pages/ThreadPage.tsx](spa/src/pages/ThreadPage.tsx)): Same: after the spacer, render CreateNoteButton only on mobile (no `addToSpaceSpaceId`).  
  - **DashboardPage** ([spa/src/pages/DashboardPage.tsx](spa/src/pages/DashboardPage.tsx)): Same: after the spacer, render CreateNoteButton only on mobile.
   Use a shared hook (e.g. `useIsMobile()` with breakpoint 1160) so the three pages don’t duplicate logic.
3. **AppLayout: do not render CreateNoteButton on mobile for space/thread/dashboard**
  In [spa/src/layouts/AppLayout.tsx](spa/src/layouts/AppLayout.tsx), in the **mobile** layout block (the one that contains `mobile-main__body` and `mobile-action-strip-dock`), change the condition for rendering CreateNoteButton so it is **not** rendered when `contentType === 'space' || contentType === 'thread' || contentType === 'dashboard'`. Keep all other conditions (e.g. `layoutDataReadyForContent`, `canShowAddNote`, exclude profile/search/new-space/note).  
   Desktop layout block is unchanged: keep rendering CreateNoteButton for space/thread/dashboard.
4. **CreateNoteButton spacer injection when button is in-card**
  When the button is rendered inside the card, the spacer is already in the DOM (the explicit `create-note-cta-spacer` div). CreateNoteButton’s inject logic should not double-inject (the guard from section 1 ensures we don’t inject when `[data-cta-spacer]` or `.content-tabs` exists). No extra change needed for the in-card case.
5. **Styling**
  The existing `.create-note-button-wrapper` and `.create-note-button` rules (position absolute, bottom/left/right) will position the button at the bottom of `card-stack__inner-content` once that element has `position: relative`. Confirm on mobile that the button appears at the bottom of the white card and the ActionStrip dock remains below the card.

---

## 3. Verification

- **Excess space:** Switch between spaces; confirm no 64px gap above the TabNav when the new space loads.
- **Mobile:** On a space/thread/dashboard page, confirm the "Add a note" button is inside the card (DOM under `card-stack__inner-content`) and at the bottom of the card; ActionStrip (Edit/Erase) remains below the card in the layout.
- **Desktop:** Unchanged; button still in main column for space/thread/dashboard.

---

## Implementation order

1. Fix CreateNoteButton inject guard (section 1).
2. Add `position: relative` to `.card-stack__inner-content`.
3. Add `useIsMobile` (or equivalent) and use it in SpacePage, ThreadPage, DashboardPage to render CreateNoteButton at the bottom of CardStack on mobile only.
4. In AppLayout mobile block, skip rendering CreateNoteButton when `contentType` is space, thread, or dashboard.
5. Test excess space fix and mobile/desktop button placement.

