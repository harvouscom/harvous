# Prototype ↔ Native Mac App — Menu & Content Parity Map

> Status markers: **✅ implemented** | **↗ linked to classic** (opens classic web app) | **⏳ deferred**

This document maps every native macOS Harvous surface, menu item, and action to its implementation status in the `/prototype` web shell.

---

## 1. Shell Structure

| Native surface | Prototype | Status |
|---|---|---|
| Unified title bar (toolbar) | `NativeToolbar` — 44px top bar | ✅ implemented |
| Sidebar (glass, left column) | `PrototypeSidebar` — 280px, backdrop-filter | ✅ implemented |
| Editor / detail column | `PrototypeNotePage` — `proto-editor-surface` | ✅ implemented |
| Inspector pane (right) | `PrototypeInspectorPane` — inline flex in note page | ✅ implemented |
| Active-space footer identity | `SpacePillFooter` — space name + color tile | ✅ implemented |
| `⌘\` sidebar collapse | Toolbar sidebar-toggle button | ✅ implemented |

---

## 2. Toolbar (top bar)

| Native button | Prototype | Status |
|---|---|---|
| Sidebar toggle (`⌘\`) | Left: sidebar icon button | ✅ implemented |
| Space switcher (grid icon) | Left: `SpaceSwitcherMenu` | ✅ implemented |
| New note / compose | Left: pencil icon — creates note in active space | ✅ implemented |
| Search | Right: magnifier icon → `/prototype/search` | ✅ implemented |
| Inspector toggle | Right: right-sidebar icon — toggles `PrototypeInspectorPane` | ✅ implemented |
| Profile / avatar | Right: `ProfileMenu` popover | ✅ implemented |

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
| Search bar (top of sidebar) | Pill-shaped search input | ✅ implemented |
| Notes / Collections mode toggle | `proto-sidebar-mode` toggle buttons | ✅ implemented |
| Note row — title (15pt/500) | `pds-list-title` | ✅ implemented |
| Note row — time + excerpt (12pt/400) | `pds-list-preview` + `protoRelativeCaption()` | ✅ implemented |
| Row selection highlight (glass) | `proto-note-row[data-active]` background | ✅ implemented |
| Load more (pagination) | "Load more" button | ✅ implemented |
| Back to spaces button | `proto-sidebar-back-btn` with chevron | ✅ implemented |
| Delete swipe (mobile) | ⏳ Not implemented in prototype | ⏳ deferred |

---

## 5. Sidebar — Collections Mode

Matches native `SidebarPanelView` collections section.

| Native element | Prototype | Status |
|---|---|---|
| Collection list with note count | `proto-collection-row` with count | ✅ implemented |
| Drill-down into collection | Click row → shows filtered notes | ✅ implemented |
| Back from collection to list | `proto-sidebar-back-btn` | ✅ implemented |
| Collection → search filter | Shared `q` state filters both | ✅ implemented |
| "No collection" bucket | Shown as "No collection" row | ✅ implemented |

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
| Note type, thread, visibility | Shown when non-default | ✅ implemented |

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
| Highlight bottom dock (accent / remove) | `HighlightDockWeb` portaled in prototype + classic note bottom bar when `chromeMode === 'highlight'` | ✅ implemented |
| Scripture pill dock — accent swatches + passage-highlight list | `ScripturePillChromeWeb` + `GET /api/study-threads/by-scripture` | ✅ implemented |

**Cross-client identity (web Postgres vs native SwiftData):** The macOS/iOS apps store study rows in SwiftData with UUIDs generated on device. The web app persists the same *conceptual* model in Postgres (`StudyThreadEntries`) with server-issued string IDs. Until native reads and writes the shared API, **highlight and scripture-thread rows created on web will not appear in native and vice versa**; merging both sources without a migration would duplicate or mismatch anchors. Treat Postgres as the future shared source of truth only after a deliberate native sync migration.

---

## 9. Search Surface (`/prototype/search`)

| Native element | Prototype | Status |
|---|---|---|
| Search input (full-width, 15pt) | `PrototypeSearchInput` — `proto-search-input` | ✅ implemented |
| Result rows (title + excerpt) | `PrototypeSearchResultRow` — PDS classes only | ✅ implemented |
| Scripture badge on result | `proto-chip-scripture` | ✅ implemented |
| Space picker before search | Space list before query input | ✅ implemented |
| Thread results | ⏳ Note-only in prototype | ⏳ deferred |

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
