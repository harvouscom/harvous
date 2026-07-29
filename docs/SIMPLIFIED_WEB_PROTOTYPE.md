# Production web shell

Native-like web layout for Harvous — the **sole authenticated web client** (Classic 1.0 retired June 2026). Same auth, API, and Postgres data.

**Full architecture (web vs native):** [PROTOTYPE_2_0_ARCHITECTURE.md](./PROTOTYPE_2_0_ARCHITECTURE.md)  
**Native menu and surface parity:** [design-parity/PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md](./design-parity/PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md)

## Routes (current)

On dedicated hosts (`localhost`, `new.harvous.com`, `app.harvous.com`), routes live at `/` (not `/prototype`):

- **`/`** — Home dashboard; compose is a shell session here (no `/new` path) until first persist idle-replaces to `/{id}`.
- **`/{noteId}`** — TipTap note editor via shared `CardFullEditable`. Optional `?space=` / `?studyThread=` for shared context and dock alignment.
- **`/n/{noteId}`** — forever redirect to `/{noteId}` (search preserved). `/n/new` and `/new` start compose on `/`.
- **`/settings/…`, `/admin/…`** — nested product namespaces (reserved first segments are never notes).

On non-dedicated hosts, the same tree is under `/prototype` (flat `/{noteId}` under that prefix). See [PROTOTYPE_2_0_ARCHITECTURE.md](./PROTOTYPE_2_0_ARCHITECTURE.md).

## Scope: My Home in the sidebar

The prototype **space switcher** only treats **My Home** as an in-shell selectable space. Create/join/manage shared spaces use **classic routes** from the switcher (see `SpaceSwitcherMenu.tsx`).

## Thread assumptions (backend unchanged)

- Lists use **`GET /api/spaces/:spaceId/notes`** (notes by `spaceId`), not thread list routes.
- New notes use **`POST /api/notes/create`** with `threadId: ''` and My Home `spaceId`; the server still attaches **`thread_unorganized`** internally.
- Cache seeding uses **`thread_unorganized` + My Pile title** so shared `seedNoteFromList` / editor metadata stay valid without showing threads in the UI.
- Search uses **`useSearch(..., { spaceId }, 'notes')`** only; result links go to **`/prototype/n/...`** and never add `?thread=`.

## Native design parity (web tokens)

- `spa/src/styles/prototype-tokens.css` — accent, radius, shadow, type scale (aligned with `HarvousColors` / `HarvousShape` / typography in native).
- `spa/src/styles/prototype-shell.css` — responsive split + mobile drawer.
- `spa/src/styles/prototype-components.css`, `spa/src/styles/prototype-editor.css` — component and editor chrome.

## Key files

| Area | Location |
|------|----------|
| Shell + auth gate | `spa/src/layouts/SimplifiedPrototypeLayout.tsx` |
| Shell UI state | `spa/src/layouts/proto-shell-context.tsx` |
| Routes | `spa/src/router.tsx` (`simplifiedPrototypeRoute` tree) |
| Pages | `spa/src/pages/prototype/*.tsx` |
| My Home space id | `spa/src/hooks/usePrototypeHomeSpaceId.ts` |
| Create note | `spa/src/hooks/mutations/useCreateSimpleNote.ts` |
| Space notes list | `spa/src/hooks/queries/useSpace.ts` — `useSpaceNotes` reads `{ notes }` from the API |
| Scripture index / highlights / by-scripture | `spa/src/hooks/queries/usePrototypeSpace*.ts` |
| Pin note | `spa/src/hooks/mutations/usePinSpaceNote.ts` |

A fuller file map lives in [PROTOTYPE_2_0_ARCHITECTURE.md](./PROTOTYPE_2_0_ARCHITECTURE.md#appendix-code-map-for-prototype).
