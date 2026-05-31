# Lay of the land: classic web (1.0), `/prototype` web shell, and native apps

This document describes how the **production SPA** split works today: classic routes versus the **`/prototype` shell**, how data reaches both from the same API, how that compares to **native** SwiftData clients, and what moving toward a unified “2.0” product implies for users and engineering.

**See also:** [ARCHITECTURE_DIAGRAM.md](./ARCHITECTURE_DIAGRAM.md) (combined Mermaid diagram of clients, API, DB, and folders-vs-threads usage by surface), [SIMPLIFIED_WEB_PROTOTYPE.md](./SIMPLIFIED_WEB_PROTOTYPE.md) (quick entry and file pointers), [design-parity/PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md](./design-parity/PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md) (menu and surface parity checklist), [native-prototype/NATIVE_2_0_PLATFORM_STRATEGY.md](./native-prototype/NATIVE_2_0_PLATFORM_STRATEGY.md) (migration, auth, data, and billing options — draft for review).

---

## 1. Two surfaces in one SPA

| Surface | Route prefix | Role |
|--------|--------------|------|
| **Classic (1.0 production)** | `/`, `/note/*`, `/thread/*`, `/space/*`, etc. | Full hierarchy: spaces, threads in UI, `?thread=` on notes, dashboard and management flows. Wired through `spa/src/router.tsx` under `appLayoutRoute`. |
| **Prototype (2.0-style web)** | `/prototype/*` | Parallel **native-like shell** (toolbar, glass sidebar, inspector, bottom docks). **No thread UI**; same Clerk session, React Query, and `spa/src/lib/api.ts` as classic. |

**Entry layout:** `spa/src/layouts/SimplifiedPrototypeLayout.tsx` — auth gate, `ProtoShellProvider`, `SyncManagerIsland`, prototype CSS tokens, `NativeToolbar` + `PrototypeSidebar`.

---

## 2. How `/prototype` changed vs the earlier web prototype

The short-lived **space-in-URL** prototype used routes like `/prototype/space/{spaceId}` and `/prototype/space/{spaceId}/n/{noteId}`.

**Current routing** (`spa/src/router.tsx`):

- **`/prototype` / `/prototype/`** — Inbox-style home: empty state + new note; sidebar lists notes for **My Home** only (see `usePrototypeHomeSpaceId`).
- **`/prototype/n/$noteId`** — Canonical note editor (`PrototypeNotePage`). Optional search param `?studyThread=` for highlight/scripture chrome alignment with docks.
- **`/prototype/search`** — Pick a space, then **note-only** full-text search (`validateSearch` may include `space`).
- **Legacy redirects** (bookmark preservation): `/prototype/space/$id` → `/prototype/`; `/prototype/space/$id/n/$noteId` → `/prototype/n/$noteId`.

**Rationale:** URLs are **note-centric**; list scope and “new note” target the user’s **personal home space** from navigation data, similar to native’s default-around-personal-home behavior.

**Space switcher** (`spa/src/pages/prototype/SpaceSwitcherMenu.tsx`): Chrome matches native sectioning, but **only “My Home” is selectable inside the prototype**. Create, join, and manage flows **link out to classic** (`/new-space`, `/`, etc.).

---

## 3. Shell state and UI composition

**Global prototype UI state** (`spa/src/layouts/proto-shell-context.tsx`):

- Sidebar: mobile drawer vs pinned column; desktop collapse (`proto-shell--sidebar-collapsed`).
- **List modes:** `notes` | `folders` | `highlights` | `scripture` (beyond the older notes/collections-only story).
- **Standalone scripture passage** — `openStandaloneScripturePassage` drives the main pane on home: `PrototypeStandaloneScripturePassagePane` inside `PrototypeMainPaneShell`.
- Inspector visibility; **folder chip** on the toolbar from note collection metadata (`setPrototypeFolderChip`).

**Note page** (`spa/src/pages/prototype/PrototypeNotePage.tsx`): Reuses shared **`CardFullEditable`** (same save and scripture processing as production); prototype-only **bottom chrome hosts** (format / scripture / highlight portaled to the column); `PrototypeInspectorPane`; `PrototypeNoteActionBar`. **`effectiveSpaceId`** comes from the note (or falls back to home space).

---

## 4. Data layer: shared API, prototype-oriented queries

**Unchanged backbone**

- Notes, spaces, and threads live in **Postgres** (`server/db/schema.ts`). Classic and prototype call the same bundled Hono API (`netlify/functions/api.cjs`).
- New notes in prototype still use **`POST /api/notes/create`** with `threadId: ''` and a `spaceId`; the server still attaches **`thread_unorganized`** internally.
- Sidebar lists use **`GET /api/spaces/:spaceId/notes`** (`useSpaceNotes` in `spa/src/hooks/queries/useSpace.ts`), not thread list routes.

**Prototype-heavy endpoints and hooks**

| Capability | Endpoint / hook | Role |
|------------|-----------------|------|
| Space scripture index (books → passages → notes) | `GET /api/spaces/:spaceId/scripture-index` | `usePrototypeSpaceScriptureIndex`; built via `server/utils/build-space-scripture-index.ts` in `server/routes/spaces.ts`. |
| Study threads for a passage across a space | `GET /api/spaces/:spaceId/study-threads/by-scripture` | `usePrototypeSpaceStudyThreadsByScripture`. |
| Highlights list (space scope) | `usePrototypeSpaceStudyThreadHighlights` | Used by sidebar **highlights** mode. |
| Per-note study threads | `server/routes/study-threads.ts` | CRUD + by-scripture on a **parent note**. |
| Pin note in space | `POST /api/spaces/:spaceId/pin-item` | `usePinSpaceNote`; `server/routes/spaces.ts`. |

**Search:** Prototype search is **notes-only** with a chosen `spaceId`; thread hits are not in scope (see parity doc §9).

---

## 5. Native apps: design alignment vs data reality

**Design parity** is tracked in `docs/design-parity/PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md` (toolbar, sidebar, inspector, dock geometry; tokens in `spa/src/styles/prototype-tokens.css` vs `HarvousColors` / typography in native).

**Native sketch** (e.g. `native/Harvous/Services/SpaceStore.swift`): **SwiftData** as the local store, `selectedSpaceId` in `UserDefaults`, bootstrap/repair around a **personal home** UUID. UI reads local models first; query boundaries need not match web.

**Study / highlight gap** (parity doc §8):

- **Web:** `StudyThreadEntries` in Postgres, server-issued string IDs.
- **Native:** SwiftData rows, device UUIDs.
- **Until native uses the shared API for study data**, web-created highlights will not appear in native and vice versa; merging without a migration risks duplicates. **Postgres is the intended long-term source of truth** after a deliberate sync migration.

---

## 6. What 1.0 → 2.0 means for users

**Stays familiar**

- Same Clerk account and same database; `/prototype` is not a separate product database.
- A note edited in prototype is the same row as in classic.

**Differences today**

- **Threads:** absent from prototype chrome; classic still orients around threads.
- **URLs:** prototype bookmarks are `/prototype/n/...`; old space-scoped URLs redirect.
- **Sidebar scope:** list + default new note use **My Home**; other spaces are not first-class in the prototype list without future work (switcher sends users to classic for many flows).
- **Gaps:** collection/tag editing in inspector often deferred to classic; search has no thread results; some native interactions (e.g. mobile swipe delete) are deferred in parity doc.

**Native users:** Visual alignment with the web prototype is intentional; **study data parity** is not automatic until API sync exists.

---

## 7. What 1.0 → 2.0 means for engineering

**Product / routing**

- Choose whether **2.0** eventually **replaces** the classic tree under `/` or keeps a dedicated prefix — impacts SEO, deep links, and Clerk redirect behavior (`AGENTS.md`: avoid forcing sign-in redirect to `/` when join/invite return URLs must win).
- **Sign-in/up UI:** site-inspired custom auth (`HarvousAuthForm`) on **`new.harvous.com` only**; **`app.harvous.com`** and localhost use classic two-pane mesh + Clerk prebuilt (`isSiteInspiredAuthHost()` in [`src/lib/prototype-path.ts`](../src/lib/prototype-path.ts)).

**Data / shell**

- Today’s **implicit active space** (`usePrototypeHomeSpaceId`) may need to become an explicit **active space** in state if multi-space browsing stays in the 2.0 shell without leaving for classic.
- **Study sync:** plan SwiftData → API ID mapping, conflicts, and offline semantics.

**Features de-emphasized if thread UI stays hidden**

- First-class **thread routes** and thread-centric navigation in the 2.0 shell (unless reintroduced).
- Thread rows in search (already out of prototype scope).

**Features stronger or new in 2.0-style surfaces**

- **Scripture index** and **space-level by-scripture** aggregation.
- **Highlights** sidebar mode backed by server queries.
- **Standalone passage pane** from highlight flows.
- **Pin** via `pin-item` in the prototype sidebar.
- **Token-driven** chrome (toolbar, sidebar, inspector, docks).

---

## 8. System diagram

```mermaid
flowchart LR
  subgraph spa [SPA]
    classic [Classic routes]
    proto [Prototype shell]
  end
  subgraph api [Hono API]
    notes[Notes and spaces]
    study[Study threads and scripture index]
  end
  subgraph data [Postgres]
    pg[(Shared DB)]
  end
  subgraph native [Native apps]
    swift[SwiftData local]
  end
  classic --> api
  proto --> api
  api --> data
  swift -.->|future sync| api
```

---

## Appendix: Code map for `/prototype`

### Layout and context

| File | Purpose |
|------|---------|
| `spa/src/layouts/SimplifiedPrototypeLayout.tsx` | Auth, session return path, prototype root chrome, wraps `ProtoShellProvider`. |
| `spa/src/layouts/proto-shell-context.tsx` | Sidebar drawer/collapse, list mode, inspector, folder chip, standalone passage state. |

### Router

| File | Purpose |
|------|---------|
| `spa/src/router.tsx` | `simplifiedPrototypeRoute` and children: home, search, flat note route, legacy redirects. |

### Pages and components (`spa/src/pages/prototype/`)

| File | Purpose |
|------|---------|
| `PrototypeHomePage.tsx` | Inbox empty state, new note, standalone passage host when shell state set. |
| `PrototypeNotePage.tsx` | Note editor shell around `CardFullEditable`, inspector, bottom chrome hosts. |
| `PrototypeSearchPage.tsx` | Space-scoped note search. |
| `PrototypeSearchResultsList.tsx` | Result list wiring. |
| `PrototypeSidebar.tsx` | Notes / folders / highlights / scripture lists; pin/delete menus; navigation to `/prototype/n/...`. |
| `PrototypeInspectorPane.tsx` | Read-mostly metadata (collections, tags, info). |
| `PrototypeNoteActionBar.tsx` | Note-level actions in prototype chrome. |
| `PrototypeConnectNoteSheet.tsx` | Connect / link flows used from prototype. |
| `PrototypeMainPaneShell.tsx` | Main column wrapper (replaces former space layout wrapper). |
| `PrototypeStandaloneScripturePassagePane.tsx` | Full-width passage view from highlight navigation. |
| `NativeToolbar.tsx` | Top bar actions (sidebar, space switcher, new note, search, inspector, profile). |
| `SpaceSwitcherMenu.tsx` | My Home vs classic outbound links. |
| `SpacePillFooter.tsx` | Active space identity footer. |
| `ListViewMenu.tsx` | List chrome / overflow. |
| `ProtoHouseIcon.tsx` | Space switcher house icon. |
| `components/PrototypeSearchInput.tsx` | Search field styling. |
| `components/PrototypeSearchResultRow.tsx` | Search row UI. |
| `proto-route-slugs.ts` | Note ID slug helpers for router params. |
| `proto-time.ts` | Relative captions for list rows. |
| `proto-toolbar-tokens.ts` | Toolbar icon sizing constants. |
| `proto-highlight-subtitle.ts` | Highlight row subtitle / filtering helpers. |

### Prototype-specific hooks

| File | Purpose |
|------|---------|
| `spa/src/hooks/usePrototypeHomeSpaceId.ts` | Resolves personal “My Home” `spaceId` from navigation data. |
| `spa/src/hooks/queries/usePrototypeSpaceScriptureIndex.ts` | Scripture index query. |
| `spa/src/hooks/queries/usePrototypeSpaceStudyThreadsByScripture.ts` | Passage-scoped study threads for a space. |
| `spa/src/hooks/queries/usePrototypeSpaceStudyThreadHighlights.ts` | Highlights list for sidebar mode. |
| `spa/src/hooks/mutations/usePinSpaceNote.ts` | Pin/unpin mutation + cache invalidation. |

### Styles

| File | Purpose |
|------|---------|
| `spa/src/styles/prototype-tokens.css` | Design tokens (native-aligned). |
| `spa/src/styles/prototype-shell.css` | Split layout, drawer, responsive shell. |
| `spa/src/styles/prototype-components.css` | Component-level prototype styles. |
| `spa/src/styles/prototype-editor.css` | Editor column and dock overrides. |

### Shared components used heavily by prototype

Examples: `src/components/react/CardFullEditable.tsx`, `ScripturePillChromeWeb.tsx`, `HighlightDockWeb.tsx`, `SyncManagerIsland.tsx` — same as classic note editing, with prototype CSS and portal targets.

### Server

| Area | Purpose |
|------|---------|
| `server/routes/spaces.ts` | `scripture-index`, `study-threads/by-scripture`, `pin-item`, space notes. |
| `server/routes/study-threads.ts` | Note-scoped study thread CRUD and queries. |
| `server/utils/build-space-scripture-index.ts` | Scripture index aggregation for a space. |
