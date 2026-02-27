# Clear-Split Migration: Backend + SPA (No Astro in the Middle)

**Status: COMPLETED.** The migration is done. Production is React SPA + Hono API only. For current architecture see [AGENTS.md](../AGENTS.md), [TECH_STACK.md](./TECH_STACK.md), and [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md).

This document originally outlined the path to simplify the Harvous build by moving to a **clear split**: a standalone Node API backend plus the Vite React SPA as the only frontend, with Astro removed from the pipeline.

## Goal

- **Single frontend**: The SPA in `spa/` is the only UI. No Astro pages, no dual-build mental model.
- **Standalone API**: A Node server (or Netlify Functions written in plain Node) that serves `/api/*` and talks to Turso and Clerk.
- **Simpler build**: One production build for the frontend; one for the API. No `astro build` then `vite build` then copy-over.
- **Same capabilities**: All current API routes, auth (Clerk), DB (Turso), and static/PWA behavior preserved.

## Current vs Target

| Aspect | Current | Target (clear split) |
|--------|---------|------------------------|
| **Frontend** | Vite SPA in `spa/` (production) + Astro SSR pages (dev-only) | Vite SPA only; dev and prod use same UI |
| **API** | Astro SSR functions in `src/pages/api/` (Netlify) | Node API (e.g. Express/Fastify/Hono) or Netlify Functions with Node runtime |
| **DB** | Astro DB (Turso under the hood), schema in `db/config.ts` | Turso via `@libsql/client` (or similar); schema as SQL or type-safe layer |
| **Auth** | Clerk in Astro middleware + `@clerk/clerk-react` in SPA | Clerk backend in Node + same Clerk React in SPA |
| **Build** | `astro build` → `vite build` → `cp dist-spa/. dist/` | `vite build` (SPA) + API build (Node/Netlify) |
| **Deploy** | Netlify: single site, SSR function serves API + SPA overwrites output | Netlify: static SPA + Functions, or SPA + separate API service |

## Benefits

1. **Simpler mental model**  
   “This repo is a React SPA and a Node API.” No “Astro for layout” vs “SPA for production” split.

2. **Single frontend build**  
   Only Vite builds the UI. No Astro build for the app shell, no copy step, fewer moving parts and cache invalidation edge cases.

3. **Easier expansion**  
   Add API routes as plain Node handlers. Add frontend routes in TanStack Router. No need to remember which changes affect production.

4. **Performance**  
   - Smaller, focused API bundle (no Astro runtime in the API path).  
   - Frontend bundle unchanged; can continue current code-splitting (e.g. `vite.config.ts` manualChunks).  
   - Option to move API to a long-running Node service later for colder-start-sensitive paths if needed.

5. **Onboarding**  
   New contributors see “SPA + API” instead of “Astro + SPA + copy step.”

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Netlify (or SPA host)                                           │
│  • Static: index.html + hashed JS/CSS from Vite (spa/)          │
│  • Redirects: SPA routes → /index.html; /api/* → API             │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  API (Node)                                                      │
│  • Netlify Functions (Node runtime) or standalone Node server    │
│  • Routes: /api/notes/*, /api/threads/*, /api/spaces/*, etc.     │
│  • Auth: Clerk backend (verify JWT/session)                      │
│  • DB: Turso via @libsql/client                                 │
└─────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
            ┌───────────────┐               ┌───────────────┐
            │  Turso        │               │  Clerk        │
            │  (existing)   │               │  (existing)   │
            └───────────────┘               └───────────────┘
```

- **Frontend**: Current `spa/` tree (layouts, pages, hooks, router, `lib/api.ts`). Shared components in `src/components/react/` stay; they’re already consumed by the SPA. No Astro pages or Astro layout.
- **API**: All current behavior under `src/pages/api/` reimplemented as Node handlers (same URLs and request/response shapes so `spa/src/lib/api.ts` and existing hooks keep working).

## What Stays (Unchanged)

- **SPA**: `spa/` (Vite, React, TanStack Router, React Query, Clerk React). No structural change.
- **Shared React components**: `src/components/react/` (TiptapEditor, navigation, panels, etc.). SPA already imports them; only build config may need to point at `src` from the Vite root.
- **Public assets**: `public/` (PWA, manifest, sw.js, fonts). SPA build already uses them.
- **Turso**: Same database; only the access layer changes (Astro DB → direct Turso client).
- **Clerk**: Same frontend usage; backend uses Clerk’s Node SDK for auth in the API.
- **Env and secrets**: Same vars (Turso, Clerk, etc.); API reads them in Node.

## What Changes

1. **Remove Astro**  
   No `astro build`, no `astro.config.mjs` for the app, no Astro SSR pages or layouts. Optional: keep Astro only for a separate marketing/docs site in another directory if desired later.

2. **API implementation**  
   - **From**: Astro `APIRoute` handlers in `src/pages/api/**/*.ts` using `astro:db` and `locals.auth()`.  
   - **To**: Node handlers (Express/Fastify/Hono or Netlify Functions) using a Turso client and Clerk’s backend API to get `userId` (or equivalent).  
   - **Contract**: Keep the same URL paths and JSON request/response shapes so the SPA’s `api.get/post/put/delete` and all hooks remain valid.

3. **Database layer**  
   - **From**: Astro DB (`db/config.ts`, `astro:db` in API routes).  
   - **To**: Turso via `@libsql/client` (or a thin wrapper). Schema can be:  
     - Exported from current Astro DB as SQL (e.g. `astro db pull` or manual), or  
     - Maintained as SQL migrations and applied to Turso.  
   - Types: Generate TypeScript types from schema or keep a small type layer (e.g. Drizzle/Kysely) for type-safe queries if you want to avoid raw SQL everywhere.

4. **Auth in API**  
   - **From**: `locals.auth()` from `@clerk/astro`.  
   - **To**: In each Node handler (or middleware), verify the request (cookie or Bearer) with Clerk’s Node SDK and attach `userId` to the request context. Public routes (e.g. `/api/health`, `/api/shared/*`, webhooks) stay unauthenticated as today.

5. **Build and deploy**  
   - **From**: `npm run build` = astro build → vite build → copy `dist-spa/` → `dist/`; Netlify publishes `dist/`, with API served by Astro’s SSR function.  
   - **To**:  
     - **Option A (Netlify)**: `vite build` → output to `dist/` (or `dist-spa/`); Netlify Functions for API (each function or a single catch-all Node function that routes internally). Redirects: SPA routes → `/index.html`, `/api/*` → API.  
     - **Option B**: SPA hosted on Netlify (or similar); API as a separate Node service (e.g. Fly, Railway, or Netlify Functions with a single Node app).  
   - No more “copy SPA over Astro output”; the published site is just the SPA static assets plus the API.

6. **Dev workflow**  
   - **From**: `npm run dev` (Astro on 4321), `npm run dev:spa` (Vite on 4322, proxy `/api` to 4321).  
   - **To**: `npm run dev:api` (Node API on e.g. 4321) and `npm run dev:spa` (Vite on 4322, proxy `/api` to 4321). One less stack (no Astro dev server).

## Phased Migration (Suggested)

### Phase 1: Database and types (no user-facing change)

- Export current schema from Astro DB to SQL (or adopt existing migrations if any).
- Introduce `@libsql/client` (or similar) in a new `api/` or `server/` package/dir. Implement a minimal “db” module that connects to Turso and exposes a client.
- Optionally add a type-safe query layer (e.g. Drizzle with the same schema) and use it only in new code paths. Existing API still runs on Astro.

### Phase 2: One API route on Node

- Pick a simple route (e.g. `GET /api/health`). Implement it in the Node API with Clerk auth skipped for that path.
- Deploy as a Netlify Function (or single Node handler) and point a test URL at it. Confirm the SPA can call it.
- Then switch that route in production to the new implementation (e.g. via redirect or function ordering) so the SPA keeps using `/api/health` unchanged.

### Phase 3: Migrate API routes in batches

- Group routes by domain (e.g. notes, threads, spaces, user, webhooks). For each handler:  
  - Port logic to Node (same request/response).  
  - Use the new DB layer and Clerk backend for auth.  
- Run Astro and Node in parallel during migration: new Node routes take over for their paths; Astro routes shrink over time.  
- Keep `_redirects` and Netlify config so `/api/*` hits the Node API once all routes are moved.

### Phase 4: Remove Astro from app build and dev

- When all API routes live in Node, remove Astro from the main app:  
  - Delete or move `src/pages/*.astro` and `src/layouts/*.astro` (or archive in a branch).  
  - Remove Astro from `package.json` scripts and dependencies for the app.  
  - Build: only `vite build` for the SPA; API build = Node/Netlify Functions.  
- Simplify `netlify.toml`: build command = `npm run build` → vite build + any API bundle step; publish = SPA output; functions = Node API.
- Update `AGENTS.md`, `docs/PROJECT_STRUCTURE.md`, and this doc to describe the clear-split architecture.

### Phase 5: Cleanup and docs

- Move shared utilities that are API-only out of `src/utils` into the API package if desired.  
- Document the Node API (entry points, env, how to run locally).  
- Optional: consolidate `spa/` and top-level Vite config so that the only “app” build is the SPA (e.g. single `vite.config.ts` at root with root `spa` if you keep that structure).

## Technical Choices to Decide

- **Node API framework**: Express, Fastify, or Hono are all good fits. Hono is small and works well on Netlify Functions; Fastify is great for a standalone server.
- **Turso access**: Use `@libsql/client` directly with raw SQL, or add Drizzle/Kysely for type-safe queries and migrations. Astro DB’s schema can be recreated as Drizzle schema or SQL.
- **Netlify**: Use Netlify Functions with a single catch-all Node function that runs your Node app (e.g. Hono/Express), or one function per route group. Catch-all keeps a single codebase and avoids hundreds of function entries.
- **Clerk**: Use `@clerk/backend` (or current Node SDK) in the API to verify session/JWT and pass `userId` into handlers. No change to SPA Clerk usage.

## Risks and Mitigations

| Risk | Mitigation |
|------|-------------|
| Breaking API contract | Keep URL paths and JSON shapes identical; run e2e (e.g. join/invite) after each batch. |
| Astro DB–specific behavior | Document any Astro DB defaults (e.g. dates, nulls) and replicate in the new layer. |
| Cold starts | Same as today (serverless). If needed later, move hot paths to a long-running Node service. |
| Duplicate logic during migration | Migrate by domain; delete Astro route once Node route is verified. |

## Summary

Moving to a **clear split** (Node API + Vite SPA, no Astro in the middle) simplifies the build, clarifies “what runs in production,” and keeps expansion and performance on a single, well-understood path. This document is the plan to get there without big-bang rewrites: phase the DB and one route first, then migrate API routes in batches, then remove Astro from the app and update build/deploy and docs.
