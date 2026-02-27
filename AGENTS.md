# Harvous for AI Agents

## Quick Commands

```bash
npm run dev              # Hono API (3001) + SPA (4322) — full-stack dev (API must be running for /api)
npm run dev:spa          # SPA only on port 4322 (proxies /api to 3001). API must be running or /api returns 500.
npm run dev:all          # Same as dev: API + SPA
npm run build            # Production build: inject SW version + build:api + build:spa (no Astro)
npm run build:api        # Bundle Hono API to netlify/functions/api.cjs
npm run db:sync          # Drizzle Kit push (sync schema to Turso)
npm run db:push          # Drizzle Kit push (apply server/db/schema.ts to Turso)
npm run db:check         # Pre-commit schema check (server/db/schema.ts)
npm run test:e2e         # Playwright e2e (join/invite flows)
npm run test:e2e:setup   # Seed e2e data then run e2e
```

**Clean new user (manual only):** The automatic dev-reset middleware was removed so production user data is never erased. To get "new user" state locally, call `POST /api/test/reset-to-new-user` (test route) when the API is running.

## Architecture Overview

**Harvous** is a Bible study notes app. Three-level hierarchy: Spaces → Threads → Notes. Data: Turso (Drizzle ORM), schema in `server/db/schema.ts`.

- **Production frontend**: React SPA in `spa/src/`, built with Vite. Uses TanStack Router, React Query, Clerk React. Deployed as static `index.html` + hashed JS/CSS. This is what users see in production and in the PWA.
- **API backend**: Hono server in `server/` bundled as a single Netlify Function (`netlify/functions/api.cjs`). All `/api/*` requests are routed there by `public/_redirects`.
- **Shared React components**: `src/components/react/` are imported by the SPA. UI changes that must ship to production should be made in `spa/src/` or these shared components.
- **Auth**: Clerk. In the SPA, `@clerk/clerk-react`; env var `VITE_CLERK_PUBLISHABLE_KEY`.
- **Rich Text**: Tiptap editor in `src/components/react/TiptapEditor.tsx`.

**Production API contract:** The API is built as a single file (`netlify/functions/api.cjs`); Netlify uses `node_bundler = "none"`, so there is no `node_modules` at function runtime. All dependencies must be bundled (do not add `--packages=external` to `build:api`). Use `@libsql/client/web` for Turso in `server/db/client.ts` (not the default Node client) so the function works without native bindings. Before merging API-affecting branches, see [docs/CLEAR_SPLIT_MERGE_DELTA.md](docs/CLEAR_SPLIT_MERGE_DELTA.md) (pre-merge checklist).

## Project Structure

```
spa/                         # PRODUCTION FRONTEND (Vite SPA)
  src/
    layouts/                 # AppLayout.tsx (authenticated), AuthLayout.tsx
    pages/                   # DashboardPage, NotePage, ThreadPage, SpacePage, etc.
    hooks/queries/           # React Query hooks (useNote, useThread, useSpace, ...)
    router.tsx               # TanStack Router route definitions
    main.tsx                 # Entry point, global CSS imports
    lib/api.ts               # API client wrapper
    shims/                   # Shims (e.g. app-navigate for safeNavigate)
src/
  components/react/          # Shared React components (used by SPA)
  utils/                     # Shared utilities
  styles/                    # Vanilla CSS (imported by SPA)
server/
  db/                        # Drizzle schema (schema.ts), client (Turso), dates
  routes/                    # Hono API routes
  utils/                     # Server-only utils (dashboard-data, user-cache, ...)
public/                      # Static assets, sw.js, manifest.json
```

## Code Style

- **TypeScript**: Strict mode, `@/` path aliases for imports (in both `src/` and `spa/` via vite resolve alias).
- **React Components**: Use hooks; shared ones in `src/components/react/` (PascalCase.tsx); SPA-specific in `spa/src/`.
- **CSS**: Semantic classes (no Tailwind), CSS variables for colors, organized by component.
- **Formatting**: Prettier (2 spaces, 120 char line width, trailing commas off).

## Key Patterns

- **CRITICAL — Production = SPA + Hono API.** For UI changes that must appear in production, edit `spa/src/` or shared `src/components/react/`.
- **Netlify build**: `npm run build` = inject SW + build:api + build:spa. Publish directory is `dist-spa/`.
- **Production routing** (`public/_redirects`): List SPA routes (e.g. `/`, `/note/*`, `/thread/*`, `/dashboard`, …) → `/index.html` 200. Include the root `/` so the dashboard at `/` loads the SPA. Do **not** add a rule for `/api/*` — leave it unmatched so the Netlify SSR function (path: `/*`) handles API requests. A catch-all `/*` → `/index.html` would make API calls return HTML and break the app.
- **Routing**: TanStack Router in `spa/src/router.tsx`. Use `router.navigate()`. Shared code that calls `safeNavigate()` uses the shim in `spa/src/shims/astro-transitions.ts` to drive the router.
- **Data fetching**: React Query hooks in `spa/src/hooks/queries/`. API calls via `spa/src/lib/api.ts`.
- **Note IDs**: Never reuse deleted IDs; track highest via `UserMetadata.highestSimpleNoteId`.
- **Events**: CustomEvents for cross-component updates (e.g. `noteAddedToThread`).

## Important Files

- `docs/ARCHITECTURE.md` - Data structures, database schema, relationships
- `docs/CLEAR_SPLIT_MIGRATION.md` - Plan to simplify to Node API + SPA (no Astro in the middle)
- `docs/CLEAR_SPLIT_MERGE_DELTA.md` - What changed at merge, production API contract, pre-merge checklist
- `docs/REACT_ISLANDS_STRATEGY.md` - Astro SSR / React islands (legacy); production is SPA
- `docs/PROJECT_STRUCTURE.md` - Directory layout, naming conventions, imports
- `docs/MOBILE_KEYBOARD_NOTE_SHEET.md` - Mobile keyboard + new-note bottom sheet (toolbar 12px above keyboard, editor scroll, layout-root scroll lock)

## E2E Testing

Playwright tests for **join** and **invite** flows live in `e2e/shared-space-join.spec.ts` and `e2e/invitation-accept.spec.ts`. Before each run, global setup runs **idempotent** `tsx scripts/seed-e2e.ts` (Drizzle + Turso) so tests pass.

- **Prerequisites**: `.env` (or `.env.local`) with `TEST_USER_A_EMAIL`, `TEST_USER_A_PASSWORD`, `TEST_USER_B_EMAIL`, `TEST_USER_B_PASSWORD`, and `TEST_USER_A_CLERK_ID` (Clerk user ID of User A, so space_test_2 is owned by the right account). `PUBLIC_CLERK_PUBLISHABLE_KEY` required.
- **Run**: `npm run test:e2e` (all e2e) or `npm run test:e2e:join` (join/invite only, 1 worker for order). For a fresh data state: `npm run test:e2e:setup` (seeds both DBs then runs join/invite tests). Some tests skip when the dev server’s DB doesn’t have the seeded data or TEST_USER_A_CLERK_ID doesn’t match User A.

## Database

Turso via Drizzle ORM. Schema in `server/db/schema.ts`. Env: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (fallback: `ASTRO_DB_REMOTE_URL`, `ASTRO_DB_APP_TOKEN`). Run `npm run db:push` (drizzle-kit push) pre-deploy, `npm run db:check` pre-commit.

**Production data verification (no user data showing):** The API reads from the same Turso DB. If the app shows no data: (1) In Netlify, confirm `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (or `ASTRO_DB_*`) are set and point to the Turso DB that has your data. (2) Check Netlify function logs for `[api/content/load-more]` and `[api/user/get-profile]`: 401 = auth (cookies not sent or invalid), 0 items = DB empty or wrong user, 500 = exception. (3) Ensure Clerk cookies are valid for the production domain and that Netlify forwards the `Cookie` header to the function.

## Auth (Clerk)

- **Redirect URLs**: Do not set Clerk **Force redirect URL** to `/` (or app root) in Clerk Dashboard or via env vars (`CLERK_SIGN_IN_FORCE_REDIRECT_URL`, `CLERK_SIGN_UP_FORCE_REDIRECT_URL`). That would override the join/invite return flow; users must be sent back to `/spaces/join/[token]` or `/invitations/[token]` after sign-in when they came from those pages. Use **Fallback** redirect (e.g. `/`) only for when there is no `redirect_url` in the request.

## Best Practices

**Core Principle**: Follow best practices and avoid "robust" and "bandaid approaches"

### Event Handling and Navigation

- **Don't use arbitrary delays**: Avoid `setTimeout` delays to "wait" for events to process. This is unreliable and doesn't guarantee the event was actually processed.
- **Dispatch and navigate immediately**: When navigating away after an action, dispatch the event and navigate immediately. Don't block navigation waiting for event listeners.
- **Use fallback refresh**: Components should check `sessionStorage` on mount for recently created items. This handles cases where events weren't processed before navigation.
- **Pattern**: `dispatch event → navigate immediately → fallback refresh on return`

### Optimistic Updates vs Fallback Refresh

- **Optimistic updates**: Use when staying on the same page - provides instant feedback
- **Fallback refresh**: Use when navigating away - components check `sessionStorage` on mount to catch missed events
- **When navigating away**: Don't block navigation for optimistic updates the user won't see anyway

### Anti-Patterns to Avoid

- ❌ Arbitrary delays: `await new Promise(resolve => setTimeout(resolve, 100))`
- ❌ Blocking navigation waiting for events
- ❌ Complex retry logic when simpler fallback mechanisms exist
- ❌ "Robust" solutions that add complexity without solving the root problem
