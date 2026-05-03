# Simplified web prototype (`/prototype`)

Parallel SPA surface for experimenting with a Mac/iOS-inspired layout on the web **without thread UI**.

## Entry

- **`/prototype`** — Spaces list (merge of `spaces` + `memberOfSpaces` from `/api/navigation/data`).
- **`/prototype/space/{spaceId}`** — Split shell: note list + empty state (desktop) / list only (mobile until a note opens).
- **`/prototype/space/{spaceId}/n/{noteId}`** — TipTap note editor via shared `CardFullEditable` (same save + scripture processing as production Note page, without `?thread=` handling).
- **`/prototype/search`** — Pick a space first, then FTS **notes only** (`type=notes` + `spaceId`) with links into the prototype routes (no thread query params).

Classic app remains at `/` and unchanged.

## Thread assumptions (backend unchanged)

- Lists use **`GET /api/spaces/:spaceId/notes`** (notes by `spaceId`), not thread routes.
- New notes use **`POST /api/notes/create`** with `threadId: ''` and a `spaceId`; the server still attaches `thread_unorganized` internally.
- Cache seeding uses **`thread_unorganized` + My Pile title** so shared `seedNoteFromList` / editor metadata stay valid without showing threads.
- Search uses **`useSearch(..., { spaceId }, 'notes')`** only; result links go to `/prototype/space/.../n/...` and never add `?thread=`.

## Native design parity (web tokens)

CSS variables and utility classes live in:

- `spa/src/styles/prototype-tokens.css` — accent, radius, shadow, type scale (aligned with `HarvousColors` / `HarvousShape` / typography in native).
- `spa/src/styles/prototype-shell.css` — responsive split + mobile nav.

## Files

| Area | Location |
|------|----------|
| Shell + auth gate | `spa/src/layouts/SimplifiedPrototypeLayout.tsx` |
| Routes | `spa/src/router.tsx` (`simplifiedPrototypeRoute` tree) |
| Pages | `spa/src/pages/prototype/*.tsx` |
| Create note hook | `spa/src/hooks/mutations/useCreateSimpleNote.ts` |
| Space notes API fix | `spa/src/hooks/queries/useSpace.ts` — `useSpaceNotes` reads `{ notes }` from the API |
