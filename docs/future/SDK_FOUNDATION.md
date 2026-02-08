# SDK Foundation

This document describes the `@harvous/sdk` TypeScript package — the initial foundation for the Harvous SDK vision described in [HARVOUS_SDK_AND_FUTURE_ROADMAP.md](./HARVOUS_SDK_AND_FUTURE_ROADMAP.md).

> **Branch:** `sdk`
> **Package:** `/sdk` directory in the monorepo
> **Version:** 0.1.0 (foundation)

---

## 1. What this is

A typed TypeScript client library that wraps the existing Harvous REST API. It provides:

- **`HarvousClient`** class with namespaced resources (`client.notes`, `client.threads`, `client.spaces`, `client.tags`, `client.scripture`, `client.resources`, `client.search`, `client.user`)
- **Full type definitions** for all API request/response shapes, derived from the actual database schema and endpoint code
- **Bearer token authentication** via Clerk session tokens (static or dynamic via callback)
- **Typed error hierarchy** (`HarvousAuthError`, `HarvousNotFoundError`, `HarvousRateLimitError`, `HarvousValidationError`, `HarvousNetworkError`)
- **Retry with exponential backoff** on 5xx errors
- **Zero runtime dependencies** — uses native `fetch` (Node 18+)

## 2. What this is NOT (yet)

Per the roadmap, the following are **deferred** until the core product and learning features are strong:

- **Partner OAuth / API key system** — third-party apps authenticating on behalf of users
- **App registry** — marketplace for partner apps in Harvous
- **"Save to Harvous" UI component** — embeddable widget for partner websites
- **"From [App]" attribution cards** — showing which app sent content into Harvous
- **"Open back in [App]" deep links** — bi-directional linking with partner apps

## 3. Architecture

```
sdk/
  src/
    index.ts              Main entry point (re-exports)
    client.ts             HarvousClient class
    http.ts               HTTP client (fetch wrapper with auth, retry, timeout)
    errors.ts             Error class hierarchy
    types/                Type definitions (one file per domain)
      common.ts           Shared types (NoteType, HarvousClientConfig, etc.)
      notes.ts            Note, NoteDetails, CreateNoteParams, etc.
      threads.ts          Thread, ThreadListItem, CreateThreadParams, etc.
      spaces.ts           Space, CreateSpaceParams, AddItemsParams, etc.
      tags.ts             Tag, CreateTagParams, AssignTagParams, etc.
      scripture.ts        ScriptureDetection, FetchVerseResponse, etc.
      resources.ts        ResourceMetadataResponse, CheckDuplicateResponse
      search.ts           SearchParams, SearchResult, SearchResponse
      user.ts             UserProfile, XPData
      index.ts            Re-exports all types
    resources/            One class per API domain
      notes.ts            client.notes.* methods
      threads.ts          client.threads.* methods
      spaces.ts           client.spaces.* methods
      tags.ts             client.tags.* methods
      scripture.ts        client.scripture.* methods
      resources.ts        client.resources.* methods
      search.ts           client.search.* methods
      user.ts             client.user.* methods
  tests/                  Vitest test suite (70 tests)
  dist/                   Build output (ESM + CJS + .d.ts)
```

## 4. Key design decisions

### Zero runtime dependencies
The SDK uses only the native `fetch` API (available in Node 18+ and all modern browsers). No axios, no node-fetch. This keeps the package tiny and avoids dependency conflicts.

### FormData vs JSON abstracted away
The existing API endpoints use inconsistent request body formats — some parse `request.formData()` (notes/create, threads/create, spaces/create), others parse `request.json()` (tags/create, scripture/detect, etc.). The SDK abstracts this completely: consumers always pass plain objects, and each resource method internally knows whether to send FormData or JSON.

### Bearer token auth (not cookies)
The main Astro app uses cookie-based Clerk sessions (`credentials: 'include'`). The SDK uses `Authorization: Bearer <token>` headers instead, which works in non-browser contexts (scripts, server-side, partner apps). Clerk's middleware already supports both authentication methods.

### Two auth modes
- **Static token**: `new HarvousClient({ token: 'sess_...' })` — simple, for scripts
- **Dynamic token**: `new HarvousClient({ getToken: () => clerk.session.getToken() })` — for apps where tokens need refreshing

### Error hierarchy
Rather than returning error objects or raw responses, the SDK throws typed error classes. This enables idiomatic `try/catch` patterns with `instanceof` checks.

### Dual-format build
The package ships ESM (`dist/index.js`), CJS (`dist/index.cjs`), and TypeScript declarations (`dist/index.d.ts`) via tsup.

## 5. Endpoint mapping

| SDK Method | HTTP | Endpoint | Body Format |
|------------|------|----------|-------------|
| `notes.create(params)` | POST | `/api/notes/create` | FormData |
| `notes.get(id)` | GET | `/api/notes/{id}/details` | — |
| `notes.recent(limit?)` | GET | `/api/notes/recent` | query params |
| `notes.updateContent(id, params)` | POST | `/api/notes/{id}/update-content` | JSON |
| `notes.delete(id)` | DELETE | `/api/notes/delete` | query params |
| `notes.nextId()` | GET | `/api/notes/next-id` | — |
| `threads.create(params)` | POST | `/api/threads/create` | FormData |
| `threads.list()` | GET | `/api/threads/list` | — |
| `threads.update(params)` | POST | `/api/threads/update` | FormData |
| `threads.delete(id)` | DELETE | `/api/threads/delete` | query params |
| `threads.notes(id, opts?)` | GET | `/api/threads/{id}/notes` | query params |
| `spaces.create(params)` | POST | `/api/spaces/create` | FormData |
| `spaces.delete(id)` | DELETE | `/api/spaces/delete` | query params |
| `spaces.notes(id)` | GET | `/api/spaces/{id}/notes` | — |
| `spaces.addItems(id, params)` | POST | `/api/spaces/{id}/add-items` | JSON |
| `spaces.removeItems(id, params)` | POST | `/api/spaces/{id}/remove-items` | JSON |
| `tags.create(params)` | POST | `/api/tags/create` | JSON |
| `tags.list()` | GET | `/api/tags/list` | — |
| `tags.delete(id)` | DELETE | `/api/tags/delete` | query params |
| `tags.assign(params)` | POST | `/api/note-tags/assign` | JSON |
| `tags.remove(params)` | POST | `/api/note-tags/remove` | JSON |
| `scripture.detect(text)` | POST | `/api/scripture/detect` | JSON |
| `scripture.fetchVerse(ref)` | POST | `/api/scripture/fetch-verse` | JSON |
| `scripture.checkExisting(params)` | POST | `/api/scripture/check-existing` | JSON |
| `resources.metadata(url)` | POST | `/api/resource/metadata` | JSON |
| `resources.checkDuplicate(url)` | POST | `/api/resource/check-duplicate` | JSON |
| `search.query(params)` | GET | `/api/search` | query params |
| `user.profile()` | GET | `/api/user/get-profile` | — |
| `user.xp(opts?)` | GET | `/api/user/xp` | query params |

## 6. What comes next

When the core product and learning features are strong (per the roadmap), the SDK can be extended:

1. **Partner OAuth / API key system** — Add `POST /api/apps/register`, token exchange flow, and scoped permissions so third-party apps can authenticate users
2. **App registry** — `Apps` and `AppRegistrations` database tables, admin UI for managing registered partner apps
3. **"Save to Harvous" widget** — Embeddable JavaScript component (`<harvous-save>`) that partners drop into their apps
4. **Attribution and deep links** — Extend `Notes.addedBy` to store structured app metadata, add `ResourceMetadata.deepLinkUrl` for "Open back in [App]" support
5. **Webhooks** — Notify partner apps when users interact with content they sent

## 7. Related documentation

- [HARVOUS_SDK_AND_FUTURE_ROADMAP.md](./HARVOUS_SDK_AND_FUTURE_ROADMAP.md) — SDK vision and why it is deferred
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — Core app architecture
- [../API.md](../API.md) — API endpoint documentation
- [../../db/config.ts](../../db/config.ts) — Database schema
- [../../sdk/README.md](../../sdk/README.md) — SDK usage documentation
