# Lay of the land: production web shell and native apps

This document describes how the **production SPA** works today: the prototype web shell (sole authenticated surface), how data reaches clients from the same API, how that compares to **native** SwiftData clients, and what native-first parity work remains.

**See also:** [ARCHITECTURE_DIAGRAM.md](./ARCHITECTURE_DIAGRAM.md) (combined Mermaid diagram of clients, API, DB, and folders-vs-threads usage by surface), [SIMPLIFIED_WEB_PROTOTYPE.md](./SIMPLIFIED_WEB_PROTOTYPE.md) (quick entry and file pointers), [CLASSIC_TO_2_0_MIGRATION.md](./CLASSIC_TO_2_0_MIGRATION.md) (Classic migration runbook — complete), [design-parity/PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md](./design-parity/PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md) (menu and surface parity checklist), [native-prototype/NATIVE_2_0_PLATFORM_STRATEGY.md](./native-prototype/NATIVE_2_0_PLATFORM_STRATEGY.md) (migration, auth, data, and billing options — draft for review).

---

## 1. Production web surface

| Surface | Route prefix | Role |
|--------|--------------|------|
| **Prototype (production web)** | `/` on dedicated hosts; `/prototype/*` elsewhere | **Native-like shell** (toolbar, glass sidebar, inspector, bottom docks). Folders replace Classic thread piles; connected-note threads for study chains. Same Clerk session, React Query, and `spa/src/lib/api.ts`. |
| **Public web** | `/shared/*`, `/spaces/join/*`, `/invitations/*`, auth, `/addon` | Share links, join/invite flows, billing — no authenticated Classic shell. |

**Classic 1.0** (`AppLayout`, `/thread/*`, dashboard hierarchy) was **retired June 2026**. Legacy Classic URLs redirect to prototype routes via [`spa/src/router.tsx`](../spa/src/router.tsx) `buildClassicRedirectRoutes()`.

**Entry layout:** `spa/src/layouts/SimplifiedPrototypeLayout.tsx` — auth gate, `ProtoShellProvider`, `SyncManagerIsland`, prototype CSS tokens, `NativeToolbar` + `PrototypeSidebar`.

---

## 2. Current native-like routing

On dedicated hosts (`localhost`, `new.harvous.com`, and `app.harvous.com`) the production shell is rooted at
`/`. The `/prototype` prefix remains only on non-dedicated hosts for compatibility.

**Current routing** (`spa/src/router.tsx` and `src/lib/prototype-path.ts`):

- **`/`** — My Home or the selected shared-space dashboard. Compose starts here as a shell session (no `/new` path); after first persist the URL idle-replaces to `/{id}`.
- **`/$noteId`** — canonical note editor (`PrototypeNotePage`). Notes own the bare first path segment.
- **`/n/$noteId`** — forever redirect to `/$noteId` (search preserved).
- **`/settings/…`, `/admin/…`** (and future product folders) — nested namespaces only. Reserved first segments never open as notes (`settings`, `search`, `admin`, `space`, `n`, `new`, `compose`, `church`, `challenges`, `compete`, `learn`, `org`, plus auth/share prefixes).
- **`?space=$spaceId`** — explicit shared-space read/organization context for a canonical note (bare id).

**URL rule:** notes are first-class at `/{id}`. Every new product surface adds a **folder**, not a flat id.

URLs remain note-centric. Space membership and note ownership are not encoded by moving notes between route
trees.

**Space switcher** (`spa/src/pages/prototype/SpaceSwitcherMenu.tsx`) selects My Home plus owned and joined Shared
Spaces. Create, join, people, about, and settings flows stay inside the native-like shell.

---

## 3. Shell state and UI composition

**Global prototype UI state** (`spa/src/layouts/proto-shell-context.tsx`):

- Sidebar: mobile drawer vs pinned column; desktop collapse (`proto-shell--sidebar-collapsed`).
- **Active context:** `null` for My Home or an owned/joined shared-space ID.
- **List modes:** `notes` | `folders` | `highlights` | `scripture` | `threads`.
- **Visible list scope inside shared shell:** `This space` or `My Home` without changing the active shell context.
- **Compose target:** My Home creates privately; This space creates canonically in My Home plus a space
  association.
- **Standalone scripture passage** — `openStandaloneScripturePassage` drives the main pane on home: `PrototypeStandaloneScripturePassagePane` inside `PrototypeMainPaneShell`.
- Inspector visibility; **folder chip** on the toolbar from note collection metadata (`setPrototypeFolderChip`).

**Note page** (`spa/src/pages/prototype/PrototypeNotePage.tsx`): Reuses shared **`CardFullEditable`** (same save
and scripture processing as production); prototype-only bottom chrome hosts; `PrototypeInspectorPane`; and
note actions. `contextSpaceId` is explicit. Persistent shared response overlays render only with that shared
context; My Home exposes the same responses through Note Activity grouped by space.

---

## 4. Data layer: shared API, prototype-oriented queries

**Unchanged backbone**

- Notes, spaces, and threads live in **Postgres** (`server/db/schema.ts`). Classic and prototype call the same bundled Hono API (`netlify/functions/api.cjs`).
- **My Home is canonical:** every authored note remains in the author's private aggregate.
- **Shared space is context:** `SpaceNotes` associates a canonical note with one or more shared/public spaces and
  stores per-space folders, pins, order, and removal state.
- New notes use **`POST /api/notes/create`**. A shared target resolves to the author's My Home canonical
  `spaceId` plus a `SpaceNotes` association.
- `NoteVersions` stores immutable author-owned checkpoints. Durable anchored responses reference a version;
  version history is author-only.
- Sidebar lists use **`GET /api/spaces/:spaceId/notes`** (`useSpaceNotes`). Shared lists resolve active
  associations, while My Home remains the complete authored aggregate.

**Prototype-heavy endpoints and hooks**

| Capability | Endpoint / hook | Role |
|------------|-----------------|------|
| Space scripture index (books → passages → notes) | `GET /api/spaces/:spaceId/scripture-index` | `usePrototypeSpaceScriptureIndex`; built via `server/utils/build-space-scripture-index.ts` in `server/routes/spaces.ts`. |
| Anchored response rows for a passage across a space | `GET /api/spaces/:spaceId/study-threads/by-scripture` | Internal endpoint retained for `StudyThreadEntries`; UI labels remain Thread/response language. |
| Highlights list (space scope) | `usePrototypeSpaceStudyThreadHighlights` | Internal hook used by sidebar **highlights** mode. |
| Per-note anchored responses | `server/routes/study-threads.ts` | Internal CRUD + by-scripture routes for `StudyThreadEntries`. |
| Note Activity | `GET /api/notes/:noteId/activity` | Per-note response index; grouped across spaces in My Home and constrained inside a space. |
| Shared Threads | `server/routes/threads.ts`, `useSpaceGroupThreads` | Owner start/current pin; member view and own-note attachment. |
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

## 6. Current 2.x user model

**Stays familiar**

- Same Clerk account and Postgres source of truth across web clients.
- Notes remain authored objects with stable IDs.
- My Home remains the complete private aggregate.

**Shared-space behavior**

- **Ownership:** Shared Spaces reuse canonical notes through `SpaceNotes`; a note can be visible in several spaces.
- **Compose:** My Home is private; This space creates a Home note and an association.
- **Organization:** folders, pins, Threads, order, and responses are isolated per space.
- **Responses:** persistent overlays exist only in explicit space context; Note Activity groups them by space in
  My Home.
- **Lifecycle:** leave/removal archives authored associations but preserves responses on other authors' notes;
  deleted spaces are recoverable for 30 days.
- **URLs:** dedicated hosts use `/` and `/{id}` with optional `?space=`. Legacy `/n/{id}` forever-redirects.

**Native users:** Visual alignment with the web shell is intentional; full canonical-association, response,
Thread, lifecycle, and offline parity still requires deliberate shared-API migration.

---

## 7. What 1.0 → 2.0 means for engineering

**Product / routing**

- The native-like shell has replaced Classic under `/` on dedicated hosts. Preserve Clerk return URLs for
  join/invite flows; do not force all sign-ins to `/`.
- **Sign-in/up UI:** site-inspired custom auth (`HarvousAuthForm`) on **`new.harvous.com` only**; **`app.harvous.com`** and localhost use classic two-pane mesh + Clerk prebuilt (`isSiteInspiredAuthHost()` in [`src/lib/prototype-path.ts`](../src/lib/prototype-path.ts)).

**Data / shell**

- Active shared-space context is explicit shell state; My Home remains the null/default context.
- Plan native SwiftData → API mapping for canonical notes, `SpaceNotes`, Threads, anchored responses, versions,
  conflicts, and offline semantics.

**Features in 2.0-style surfaces**

- **Scripture index** and **space-level by-scripture** aggregation.
- **Highlights** sidebar mode backed by server queries.
- **Threads** in shared-space dashboard and list/drilldown surfaces.
- **Note Activity** in the inspector.
- **Standalone passage pane** from highlight flows.
- **Pin** via `pin-item` in the prototype sidebar.
- **Token-driven** chrome (toolbar, sidebar, inspector, docks).

---

## 8. System diagram

```mermaid
flowchart LR
  subgraph spa [SPA]
    proto [Native-like production shell]
    public [Public and auth routes]
  end
  subgraph api [Hono API]
    notes[Notes and spaces]
    study[Anchored responses and scripture index]
  end
  subgraph data [Postgres]
    pg[(Shared DB)]
  end
  subgraph native [Native apps]
    swift[SwiftData local]
  end
  proto --> api
  public --> api
  api --> data
  swift -.->|future sync| api
```

---

## Appendix: code map for the native-like shell

### Layout and context

| File | Purpose |
|------|---------|
| `spa/src/layouts/SimplifiedPrototypeLayout.tsx` | Auth, session return path, prototype root chrome, wraps `ProtoShellProvider`. |
| `spa/src/layouts/proto-shell-context.tsx` | Sidebar drawer/collapse, list mode, inspector, folder chip, standalone passage state. |

### Router

| File | Purpose |
|------|---------|
| `spa/src/router.tsx` | Dedicated-host home, search, flat note routes, public routes, and legacy redirects. |

### Pages and components (`spa/src/pages/prototype/`)

| File | Purpose |
|------|---------|
| `PrototypeHomePage.tsx` | Inbox empty state, new note, standalone passage host when shell state set. |
| `PrototypeNotePage.tsx` | Note editor shell around `CardFullEditable`, inspector, bottom chrome hosts. |
| `PrototypeSearchPage.tsx` | Space-scoped note search. |
| `PrototypeSearchResultsList.tsx` | Result list wiring. |
| `PrototypeSidebar.tsx` | Notes / folders / highlights / scripture / Threads lists; contextual organization and navigation to `/{id}`. |
| `PrototypeInspectorPane.tsx` | Read-mostly metadata (collections, tags, info). |
| `PrototypeNoteActionBar.tsx` | Note-level actions in prototype chrome. |
| `PrototypeConnectNoteSheet.tsx` | Connect / link flows used from prototype. |
| `PrototypeMainPaneShell.tsx` | Main column wrapper (replaces former space layout wrapper). |
| `PrototypeStandaloneScripturePassagePane.tsx` | Full-width passage view from highlight navigation. |
| `NativeToolbar.tsx` | Top bar actions (sidebar, space switcher, new note, search, inspector, profile). |
| `SpaceSwitcherMenu.tsx` | My Home plus owned/joined Shared Spaces and creation entry. |
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
| `spa/src/hooks/queries/usePrototypeSpaceStudyThreadsByScripture.ts` | Internal hook for passage-scoped anchored response rows. |
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
| `server/routes/spaces.ts` | Associations, lifecycle, invites, activity preview, scripture index, internal by-scripture routes, and pinning. |
| `server/routes/study-threads.ts` | Internal `StudyThreadEntries` CRUD for anchored highlights and responses. |
| `server/routes/threads.ts` | Shared Thread creation, current pin, listing, and note attachment. |
| `server/utils/build-space-scripture-index.ts` | Scripture index aggregation for a space. |
