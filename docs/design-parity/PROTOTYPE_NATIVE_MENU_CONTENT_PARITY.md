# Prototype ↔ Native Mac App — Menu & Content Parity Map

> Status markers: **✅ implemented** | **↗ linked to classic** (opens classic web app) | **⏳ deferred**

This document maps every native macOS Harvous surface, menu item, and action to its implementation status in the `/prototype` web shell.

---

## 1. Shell Structure

| Native surface | Prototype | Status |
|---|---|---|
| Split toolbar (sidebar column + detail column) | `PrototypeSidebarToolbar` + `NativeToolbar variant="detail"` | ✅ implemented |
| Unified toolbar (mobile / search route) | `NativeToolbar variant="unified"` | ✅ implemented |
| Sidebar (glass, left column) | `PrototypeSidebar` — 260px default, backdrop-filter | ✅ implemented |
| Editor / detail column | `PrototypeNotePage` — `proto-editor-surface` | ✅ implemented |
| Inspector pane (right) | `PrototypeInspectorPane` — inline flex in note page | ✅ implemented |
| Active-space footer identity | `SpacePillFooter` — space name + color tile (component exists; not mounted in shell) | ⏳ deferred |
| ⇧B sidebar collapse | Sidebar hide button (desktop cluster) / detail show-sidebar when collapsed | ✅ implemented |

---

## 2. Toolbar (top bar)

### Sidebar column toolbar (desktop, sidebar visible)

| Native button | Prototype | Status |
|---|---|---|
| Space switcher (grid icon) | Trailing cluster: `SpaceSwitcherMenu` | ✅ implemented |
| List mode menu (icon-only) | Trailing cluster: `ListViewMenu variant="icon-only"` | ✅ implemented |
| Hide sidebar | Trailing cluster: `table-columns` icon (⇧B) | ✅ implemented |

Narrow sidebar (&lt;210px): space switcher + mode menu hide; hide-sidebar remains (native parity).

### Detail column toolbar

| Native button | Prototype | Status |
|---|---|---|
| Show sidebar (when collapsed) | Left: mirrored `table-columns` (⇧B) | ✅ implemented |
| New note / compose | Left: pencil icon (⇧N) | ✅ implemented |
| Folder chip (note routes) | Center: folder chip | ✅ implemented |
| Find in note | Right: magnifier (⇧F on note routes) | ✅ implemented |
| Share / more | Right: share + overflow menu | ✅ implemented |
| Inspector toggle | Right: inspector icon (⇧D) | ✅ implemented |
| Profile / avatar | Right: `ProfileMenu` | ✅ implemented |

### Mobile unified toolbar

| Native button | Prototype | Status |
|---|---|---|
| Sidebar toggle (drawer) | Left: bars icon | ✅ implemented |
| Space switcher | Left: `SpaceSwitcherMenu` | ✅ implemented |
| New note / compose | Left: pencil icon | ✅ implemented |
| Full-width search route | Single toolbar spanning shell | ✅ implemented |

---

## 3. Space Switcher Menu

Matches native `SpaceSwitcherView` section ordering.

| Section | Native item | Prototype | Status |
|---|---|---|---|
| **Section 1 — Space list** | Space name with active checkmark | ✅ checkmark row, navigates to space | ✅ implemented |
| **Section 2 — Create/join** | New private shared… (lock icon) | Links to `/new-space?visibility=private` | ↗ linked to classic |
| | New public shared… (link icon) | Links to `/new-space?visibility=public` | ↗ linked to classic |
| | Join with token… (key icon) | Links to classic app home | ↗ linked to classic |
| **Section 3 — Manage** | Manage current space… (gear icon) | Links to `/space/$spaceId` in classic | ↗ linked to classic |

---

## 4. Sidebar — Notes Mode

Matches native `NoteListColumn` (macOS sidebar variant).

| Native element | Prototype | Status |
|---|---|---|
| Search bar (top of sidebar body) | Pill-shaped search input; universal scope toggle when typing (`In [view]` / `Elsewhere`) | ✅ implemented |
| List mode menu (toolbar, icon-only) | `ListViewMenu` in `PrototypeSidebarToolbar` | ✅ implemented |
| Drill-in back row (plain, above search) | `proto-sidebar-back-row` | ✅ implemented |
| Notes / Collections mode toggle | Icon-only mode menu (desktop toolbar); full trigger on mobile drawer | ✅ implemented |
| Note row — title (15pt/500) | `pds-list-title` | ✅ implemented |
| Note row — time + excerpt (12pt/400) | `pds-list-preview` + `protoRelativeCaption()` | ✅ implemented |
| Row selection highlight (glass) | `proto-note-row[data-active]` background | ✅ implemented |
| Load more (pagination) | Auto load on scroll (intersection observer + loading dots) | ✅ implemented |
| Back to spaces button | `proto-sidebar-back-btn` with chevron | ✅ implemented |
| Daily passage pill (pinned below list) | `PrototypeDailyPassagePill` → Bible reader at the verse; `GET /api/votd/today` | ✅ implemented |
| Delete swipe (mobile) | ⏳ Not implemented in prototype | ⏳ deferred |

---

## 5. Sidebar — Collections Mode

Matches native `SidebarPanelView` collections section.

| Native element | Prototype | Status |
|---|---|---|
| Collection list with note count | `proto-collection-row` with count | ✅ implemented |
| Drill-down into collection | Click row → shows filtered notes | ✅ implemented |
| Back from collection to list | `proto-sidebar-back-btn` | ✅ implemented |
| Collection → search filter | Universal sidebar search; active folder section when drilled | ✅ implemented |
| "No collection" bucket | Shown as "No collection" row | ✅ implemented |
| New folder (empty registry) | **New folder** button + `PrototypeCreateFolderSheet` | ✅ implemented |
| Add notes to folder drilldown | **Add notes** in back row + empty-state CTA | ✅ implemented |
| Remove note from folder | Row menu in folder drilldown | ✅ implemented |
| Delete folder | Folder card menu | ✅ implemented |

---

## 5b. Sidebar — Threads Mode

| Native element | Prototype | Status |
|---|---|---|
| Thread cluster grid | `proto-collection-grid` thread cards | ✅ implemented |
| Drill-down into thread | Click card → connected notes list | ✅ implemented |
| New thread (name + notes) | **New thread** button + `PrototypeCreateThreadSheet` | ✅ implemented |
| Add notes to thread drilldown | **Add notes** in back row + empty-state CTA | ✅ implemented |
| Remove note from thread | Row menu in thread drilldown | ✅ implemented |
| Delete thread cluster | Thread card menu | ✅ implemented |
| Singleton titled thread (1 note) | `GET study-threads` includes manual single-note threads | ✅ implemented (web); ⏳ native deferred |

---

## 6. Profile Menu

Matches native `profileMenu` / settings flow.

| Native item | Prototype | Status |
|---|---|---|
| Display name / email header | Top of menu, non-interactive | ✅ implemented |
| Settings | Links to classic app `/` | ↗ linked to classic |
| Name & color | Links to classic app `/` | ↗ linked to classic |
| Manage account on web | External link to Clerk user dashboard | ✅ implemented |
| Classic Harvous app link | Links to `/` (SPA) | ✅ implemented |

---

## 7. Inspector Pane

Matches native `NoteInspectorView` sections.

| Native section | Prototype | Status |
|---|---|---|
| Collection section header | `pds-inspector-section-title` | ✅ implemented |
| Collection display (read-only) | Shows `primaryCollection` or "No collection" | ✅ implemented |
| Collection edit / keep toggle | ⏳ Edit in classic app | ⏳ deferred |
| Tags section | Shows tag chips | ✅ implemented |
| Tag editing | ⏳ Edit in classic app | ⏳ deferred |
| Info section (created/modified/words) | `InspectorRow` items | ✅ implemented |
| Added by (note source attribution) | `InspectorRow` + native `infoRow` via `formatNoteAddedBySource` / `addedBySourceLabel` | ✅ implemented |
| Note type, thread, visibility | Shown when non-default | ✅ implemented |
| Delete note (bottom destructive control) | `proto-inspector-delete-btn` | ✅ implemented |
| Connect note (linked notes) | `PrototypeConnectNoteSheet` — shared add-notes picker (scoped list, selection orbs, Connect footer); same visual system as New thread | ✅ implemented |

---

## 8. Editor Surface

| Native element | Prototype | Status |
|---|---|---|
| Note title field (22pt/600/rounded) | `proto-editor-surface .card-full-editable__title` override | ✅ implemented |
| Body text (16pt/400/SF) | `proto-editor-surface .ProseMirror` | ✅ implemented |
| Scripture pills (blue theme) | `--pds-scripture-*` vars, 7px radius | ✅ implemented |
| Loading shimmer (no SPA card-full) | `proto-editor-loading` PDS shimmer | ✅ implemented |
| Format toolbar (B/I/H/list/etc.) | Inherited from `CardFullEditable` | ↗ linked to classic |
| Note action bar (collection / thread chips) | ↗ Inherited from CardFullEditable chrome | ↗ linked to classic |
| Underline multicolor highlights (`StudyHighlightAccentToken`) | `mark[data-study-thread-id]` + `--pds-highlight-*` tokens; server `StudyThreadEntries` | ✅ implemented (web + API; native SwiftData not unified) |
| Highlight bottom dock (accent / remove) | `HighlightDockWeb` in per-note carousel | ✅ implemented |
| Scripture pill dock — accent swatches + passage-highlight list | `ScripturePillChromeWeb` + `GET /api/study-threads/by-scripture` | ✅ implemented |
| Study dock carousel (scripture + highlight stack) | `StudyDockCarouselWeb` / `StudyDockCarouselView` + `study-dock-stack` | ✅ implemented |

### Dock layout parity (native-aligned)

**Per-note carousel (scripture + painted highlights):** Open order stack (max 8). Horizontal row of **collapsed cards** (~3.25 visible across track width; fixed compact width when an expanded dock is open) with one **expanded** active card (fills remaining row width). Re-tap pill/mark focuses existing entry. **X** removes only that entry; outside click / caret leaving pill does not evict (scripture collapses only). Reference dock and URL-pill dock stay outside the carousel. See [STUDY_DOCK_CAROUSEL.md](../STUDY_DOCK_CAROUSEL.md).

Scripture pill dock (`ScripturePillChromeWeb` / native `ActiveScripturePillDock`) uses a **floating card** inside the bottom chrome host — not a single flat toolbar row.

**Scripture card structure**

- **Outer gutter:** `6px` top / `10px` bottom / `20px` horizontal (`scripture-pill-chrome__outer`).
- **Card chrome:** `18px` radius, glass fill, accent stroke (`--scripture-dock-accent` @ 55%), dual shadow (`12/4` + `3/1`).
- **Header row:** book-open icon, `{reference}` (14px semibold) + uppercase translation label (10px secondary), trailing **accent popover** (`DockAccentSwatchButton`), **collapse chevron**, **dismiss X** (no trailing Done text).
- **Reference bar** (expanded only): soft track (`--pds-bg-chip`, hairline `--pds-border-control-soft`, 10px radius) with horizontal scroll of **flat PDS capsule menu pills** (`--pds-bg-control`, no classic inset shadow) + **chapter:verse cluster** + **30×30** neutral range orb. Native uses flat `harvousReferencePickerPillBackdrop` for picker segments; connections bar keeps inner-shadow `harvousCapsulePillBackdrop`.
- **Passage** (expanded only): verse HTML only (no duplicate ref header); **Google Sans Flex** at **400** weight (regular), **1.6** line-height; content-fit height via `ResizeObserver`, capped at **`280px`** / **`min(400px, 40vh)`** at viewport **≥900px**; passage-highlight list below when present.
- **Collapse:** header-only when collapsed; title tap or chevron toggles expand.

**Compare-in-dock:** deferred — native `dockMode == .compare` not yet ported; web keeps `ScriptureComparePanel` for compare.

**Highlight dock:** floating card chrome shared with scripture (`StudyDockCardShell` / `HighlightDockWeb`).

- **Card structure:** same outer gutter, 18px radius, glass fill, accent stroke from highlight color, dual shadow.
- **Header row:** highlighter icon, editable **focus title** (14px semibold), **accent popover** (`DockAccentSwatchButton`, no neutral), **trash**, **collapse chevron**, **dismiss X** (no Done text).
- **Expanded body:** optional **mini-note** textarea (`Note (optional)…`); **Respond** collapsible row with horizontal **prompt chips** (client-seeded from excerpt via `study-prompt-suggester.ts`; appends to mini-note on tap). Persisted fields PATCH `/api/study-threads/:id`.
- When portaled under **`.study-dock-carousel`**, dock roots stay transparent; the **card** supplies the bordered surface.

**Reference dock (Easton's):** separate portal slot (not in carousel); same floating card shell (`ReferenceDockWeb` + `StudyDockCardShell`).

- **Header row:** category icon, **headword**, category chip (Person / Place / Thing); when opened from a painted reference highlight, **accent popover** + **trash** in header (replaces flat swatch row).
- **Expanded body:** dictionary HTML (selectable for copy only), see-also chips; **chevron** + **X** dismiss (no Done text).

**Cross-client identity (web Postgres vs native SwiftData):** The macOS/iOS apps store study rows in SwiftData with UUIDs generated on device. The web app persists the same *conceptual* model in Postgres (`StudyThreadEntries`) with server-issued string IDs. Until native reads and writes the shared API, **highlight and scripture-thread rows created on web will not appear in native and vice versa**; merging both sources without a migration would duplicate or mismatch anchors. Treat Postgres as the future shared source of truth only after a deliberate native sync migration.

---

## 9. Search Surface (`/prototype/search`)

| Native element | Prototype | Status |
|---|---|---|
| Inline sidebar universal search | `PrototypeSidebarSearchResults` — scope toggle (`In [view]` / Elsewhere) + conditional type filter chips | ✅ implemented |
| Shift+K | Focus sidebar search (same as ⌘F) | ✅ implemented |
| Search input (full-width, 15pt) | `PrototypeSearchInput` — `/prototype/search` route (legacy) | ⏳ deprecated — use sidebar search |
| Result rows (title + excerpt) | `PrototypeSearchResultRow` — PDS classes only | ✅ implemented (sidebar + route) |
| Scripture badge on result | `proto-chip-scripture` | ✅ implemented |
| Space picker before search | Space list before query input on `/prototype/search` | ⏳ deferred |
| Thread results | ⏳ Note-only in legacy FTS route | ⏳ deferred |

---

## 10. Design System Coverage

| Token group | Source | Status |
|---|---|---|
| Brand accent & pressed colors | `HarvousColors.harvousAccent` | ✅ `--pds-accent` |
| Scripture chip colors (blue) | `HarvousColors.scriptureChip*(blue)` | ✅ `--pds-scripture-*` |
| Thread pastel fills | `Color.thread*` | ✅ `--pds-thread-*` |
| Card shadow | `CardShadow` (6%/8 + 3%/2) | ✅ `--pds-shadow-card` |
| Radii | `HarvousRadius.*` | ✅ `--pds-radius-*` |
| Typography scale | `HarvousTypography.*` | ✅ `pds-*` type classes |
| Fonts | SF Pro Text / SF Rounded | ✅ `--pds-font-body/display` |
| Shell dimensions | `HarvousRadius.sidebarGlassLeading` | ✅ `--pds-sidebar-w/toolbar-h/footer-h` |

---

_Last updated: May 2026_
