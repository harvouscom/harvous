# Harvous for AI Agents

## Quick Commands

```bash
npm run dev              # Astro SSR dev server on port 4321 (NOT what production serves)
npm run dev:spa          # SPA dev server on port 4322 (proxies /api to 3001). API must be running or /api requests return 500.
npm run dev:all          # Hono API (3001) + SPA (4322) — use this for full-stack dev so /api works
npm run build            # Production build (astro build + vite build; dist-spa/ copied over dist/; prebuild injects version into public/sw.js)
npm run db:sync          # Sync database schema
npm run db:push          # Push schema to remote
npm run db:check         # Pre-commit schema check
npm run test:e2e         # Playwright e2e (join/invite flows)
npm run test:e2e:setup   # Seed e2e data (local + remote) then run e2e
```

**Clean new user on dev (opt-in):** The dev-reset middleware only runs when `DEV_RESET_ENABLED=1` (or `true`) is set in `.env`. It is never set in production/Netlify, so user data is never erased there. To get "new user" state on each `dev:all` run, add `DEV_RESET_ENABLED=1` to `.env` locally.

## Architecture Overview

**Harvous** is a Bible study notes app. Three-level hierarchy: Spaces → Threads → Notes. Data: Astro DB (Turso), schema in `db/config.ts`.

- **Production frontend**: React SPA in `spa/src/`, built with Vite. Uses TanStack Router, React Query, Clerk React. Deployed as static `index.html` + hashed JS/CSS. This is what users see in production and in the PWA.
- **API backend**: Hono server in `server/` bundled as a single Netlify Function (`netlify/functions/api.mjs`). All `/api/*` requests are routed there by `public/_redirects`. The `src/pages/api/` Astro routes are legacy and not used in production.
- **Astro SSR app** (`src/pages/*.astro`, `src/layouts/Layout.astro`): Development-only. Works with `npm run dev` but is NOT served in production. Netlify build copies `dist-spa/` over `dist/`, so the SPA's `index.html` is what gets served.
- **Shared React components**: `src/components/react/` are imported by both the SPA and the Astro SSR app. UI changes that must ship to production should be made in `spa/src/` or these shared components. Changes only in `src/pages/*.astro` or `src/layouts/Layout.astro` do NOT affect production.
- **Auth**: Clerk. In the SPA, `@clerk/clerk-react`; env var `VITE_CLERK_PUBLISHABLE_KEY`. Astro middleware in `src/middleware.ts` for SSR.
- **Rich Text**: Tiptap editor in `src/components/react/TiptapEditor.tsx`.

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
    shims/                   # Astro module shims (e.g. astro:transitions/client for safeNavigate)
src/
  pages/api/                 # Legacy Astro API (not used in production; API is Hono in server/)
  pages/*.astro              # SSR pages (development only — NOT served in production)
  layouts/                   # Layout.astro, EmptyLayout.astro (SSR only)
  components/react/          # Shared React components (used by BOTH SPA and SSR)
  utils/                     # Shared utilities
  actions/                   # Server actions for CRUD
  styles/                    # Vanilla CSS (imported by both SPA and SSR)
db/config.ts                 # Database schema & relationships
public/                      # Static assets, sw.js, manifest.json
```

## Code Style

- **TypeScript**: Strict mode, `@/` path aliases for imports (in both `src/` and `spa/` via vite resolve alias).
- **React Components**: Use hooks; shared ones in `src/components/react/` (PascalCase.tsx); SPA-specific in `spa/src/`.
- **Astro Components**: Used only in the SSR app; name as `PascalCase.astro`.
- **CSS**: Semantic classes (no Tailwind), CSS variables for colors, organized by component.
- **Formatting**: Prettier (2 spaces, 120 char line width, trailing commas off).

## Key Patterns

- **CRITICAL — Production = SPA, not SSR.** For UI changes that must appear in production, edit `spa/src/` (e.g. `spa/src/layouts/AppLayout.tsx`, `spa/src/pages/*.tsx`) or shared `src/components/react/`. Changes only to `src/pages/*.astro` or `src/layouts/Layout.astro` affect `npm run dev` only and will NOT appear in production.
- **Netlify build**: `astro build` (API + SSR output) then `vite build` (SPA → dist-spa/) then `cp -r dist-spa/. dist/`. The SPA's index and assets overwrite Astro's in `dist/`.
- **Production routing** (`public/_redirects`): List SPA routes (e.g. `/`, `/note/*`, `/thread/*`, `/dashboard`, …) → `/index.html` 200. Include the root `/` so the dashboard at `/` loads the SPA. Do **not** add a rule for `/api/*` — leave it unmatched so the Netlify SSR function (path: `/*`) handles API requests. A catch-all `/*` → `/index.html` would make API calls return HTML and break the app.
- **Routing**: TanStack Router in `spa/src/router.tsx`. Use `router.navigate()`. Shared code that calls `safeNavigate()` uses the shim in `spa/src/shims/astro-transitions.ts` to drive the router.
- **Data fetching**: React Query hooks in `spa/src/hooks/queries/`. API calls via `spa/src/lib/api.ts`.
- **Note IDs**: Never reuse deleted IDs; track highest via `UserMetadata.highestSimpleNoteId`.
- **Events**: CustomEvents for cross-component updates (e.g. `noteAddedToThread`).
- **Inline Scripts** (Astro SSR only): Use `is:inline` only when embedding third‑party scripts from CDNs or when you need a literal inline script in the HTML.

## Important Files

- `docs/ARCHITECTURE.md` - Data structures, database schema, relationships
- `docs/CLEAR_SPLIT_MIGRATION.md` - Plan to simplify to Node API + SPA (no Astro in the middle)
- `docs/REACT_ISLANDS_STRATEGY.md` - Astro SSR / React islands (legacy); production is SPA
- `docs/PROJECT_STRUCTURE.md` - Directory layout, naming conventions, imports
- `docs/MOBILE_KEYBOARD_NOTE_SHEET.md` - Mobile keyboard + new-note bottom sheet (toolbar 12px above keyboard, editor scroll, layout-root scroll lock)

## E2E Testing

Playwright tests for **join** and **invite** flows live in `e2e/shared-space-join.spec.ts` and `e2e/invitation-accept.spec.ts`. Before each run, global setup runs **idempotent** `db/seed-e2e.ts` for both local and remote DB so tests pass whether the dev server uses local or remote.

- **Prerequisites**: `.env` (or `.env.local`) with `TEST_USER_A_EMAIL`, `TEST_USER_A_PASSWORD`, `TEST_USER_B_EMAIL`, `TEST_USER_B_PASSWORD`, and `TEST_USER_A_CLERK_ID` (Clerk user ID of User A, so space_test_2 is owned by the right account). `PUBLIC_CLERK_PUBLISHABLE_KEY` required.
- **Run**: `npm run test:e2e` (all e2e) or `npm run test:e2e:join` (join/invite only, 1 worker for order). For a fresh data state: `npm run test:e2e:setup` (seeds both DBs then runs join/invite tests). Some tests skip when the dev server’s DB doesn’t have the seeded data or TEST_USER_A_CLERK_ID doesn’t match User A.

## Database

[Astro DB (Turso)](https://docs.astro.build/en/guides/astro-db/) with remote in production. Schema defined in `db/config.ts`. Run `db:push` pre-deploy, `db:check` pre-commit.

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
