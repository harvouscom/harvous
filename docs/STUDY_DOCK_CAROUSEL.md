# Per-note study dock carousel

Scripture pill docks, painted-highlight docks, and resource chips share one **ordered stack per note** on web (`/prototype`, production `/note/*`) and native (macOS/iOS). Reference (Easton's) and URL-pill docks are **not** in the carousel.

## Behavior

- **Open order:** Each pill tap or highlight activation appends or focuses an entry (stable key dedupes re-taps).
- **Carousel row:** Every open entry is a **card** in a horizontal scroller. Inactive cards stay **collapsed** (width ≈ track ÷ 3.25 so ~3 full cards + a peek show at once; equal flex when all collapsed). The active **expanded** card takes the remaining row width (card chrome caps at `--study-dock-max-width`, same as pre-carousel). Collapsed siblings keep the compact slot width beside it.
- **Activate:** Tap a collapsed card → that entry becomes active and expanded; others collapse.
- **Reorder:** Drag the vertical line handle on the left of any card to change stack order (web + native). Horizontal scroll is disabled while dragging on native.
- **Explicit dismiss (X):** Removes only that entry; activates the most recently opened remaining entry (expanded).
- **Incidental events:** Outside click / caret leaving a scripture pill does **not** remove entries; leaving a pill **collapses** the active scripture dock only.
- **Note switch:** Clears the stack.
- **Prune:** Entries whose anchor disappeared (deleted pill, removed highlight) are dropped on editor update (web) or highlight reconcile (native).
- **Cap:** 8 entries; oldest dropped when exceeded.

### Collapsed-only kinds

`resource` entries (Resource Library items — see [RESOURCE_LIBRARY.md](future/RESOURCE_LIBRARY.md) §5.2) never expand. A resource points at something *outside* Harvous, so there is nothing the dock can render better than the destination itself; the chip's job is to keep the link in reach while writing. `dockKindSupportsExpanded()` in `study-dock-stack.ts` is the single source of that rule — activation, deserialization, and the card shell all read it, so a hand-edited localStorage payload can't produce a half-rendered card. Activating a resource chip still makes it the active entry (for roving focus and reorder); it just has no expanded body. Tapping opens the destination in a new tab and leaves the chip docked.

Native currently has no resource kind. An X.com-style treatment — pinned source chip over a full in-app browser — is sketched in RESOURCE_LIBRARY.md §5.2 as a native-only exploration.

## Web

- Stack logic: [`src/utils/study-dock-stack.ts`](../src/utils/study-dock-stack.ts)
- UI shell: [`src/components/react/StudyDockCarouselWeb.tsx`](../src/components/react/StudyDockCarouselWeb.tsx) (`renderEntry`, drag handle + `moveDockEntryToIndex`)
- Card chrome: [`src/components/react/StudyDockCardShell.tsx`](../src/components/react/StudyDockCardShell.tsx) — scripture (`ScripturePillChromeWeb`), highlight (`HighlightDockWeb`), resource (`ResourceDockChipWeb`, `collapsedOnly`)
- State owner: [`src/components/react/TiptapEditor.tsx`](../src/components/react/TiptapEditor.tsx) (`studyDockStack`)
- Portal host: `studyDockCarouselPortalTarget` on note pages (single slot in dock layer)
- Inactive cards: `interactionActive={false}` skips passage / study-thread API loads until the card is active and expanded.

## Native

- Stack logic: [`native/Harvous/Models/StudyDockStack.swift`](../native/Harvous/Models/StudyDockStack.swift)
- UI shell: [`native/Harvous/Views/StudyDockCarouselView.swift`](../native/Harvous/Views/StudyDockCarouselView.swift) — inactive slots use [`StudyDockCarouselCollapsedCard.swift`](../native/Harvous/Views/StudyDockCarouselCollapsedCard.swift); only the active entry mounts full `Active*Dock` chrome. Thin line drag handle + `StudyDockStack.moveEntry`; `ScrollViewReader` centers the expanded active card (immediate + ~340ms after width animation).
- **Track width:** `NoteEditorView` passes the editor column width into `StudyDockCarouselView.containerTrackWidth` (macOS overlay uses the centered `GeometryReader` column; iOS uses `min(window, 794)`). Do not rely on horizontal `ScrollView` content width. `widthForEntry` mirrors web flex: one dock spans the track; expanded takes the remainder; all collapsed share equally; compact-min uses the 3.25-slot viewport when space is tight.
- **Dock fill:** `ActiveScripturePillDock` / `ActiveHighlightDock` use `maxWidth: .infinity` when `harvousStudyDockInCarousel` so card chrome fills the centered 768pt cap instead of shrinking to intrinsic width.
- **Card chrome:** Expanded and single-dock slots center card content at [`StudyDockLayoutMetrics.maxCardWidth`](../native/Harvous/DesignSystem/StudyDockLayoutMetrics.swift) (768pt, same as web `--study-dock-max-width`).
- Wired in: [`native/Harvous/Views/NoteEditorView.swift`](../native/Harvous/Views/NoteEditorView.swift) (`@State studyDockStack`, `renderActiveEntry` + collapsed title/accent helpers)

## Parity

See [PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md](design-parity/PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md) § Dock layout.
