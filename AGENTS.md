# Harvous for AI Agents

## Quick Commands

```bash
npm run dev              # Hono API (3001) + SPA (4322) — full-stack dev (API must be running for /api)
npm run dev:spa          # SPA only on port 4322 (proxies /api to 3001). API must be running or /api returns 500.
npm run dev:all          # Same as dev: API + SPA
npm run build            # Production build: inject SW version + build:api + build:spa (no Astro)
npm run build:api        # Bundle Hono API to netlify/functions/api.cjs
npm run db:sync          # Drizzle Kit push (sync schema to Supabase)
npm run db:push          # Drizzle Kit push (apply server/db/schema.ts to Supabase)
npm run db:check         # Pre-commit schema check (server/db/schema.ts)
npm run test:e2e         # Playwright e2e (join/invite flows)
npm run test:e2e:setup   # Seed e2e data then run e2e
npm run lighthouse:a11y  # Build SPA, vite preview, Lighthouse accessibility (must score 100); use `-- --skip-build` to skip build
npm run bible:generate -- NASB     # Generate NASB.json (NASB 1995) via Claude (needs ANTHROPIC_API_KEY in .env); resumes from partial
npm run bible:generate:all         # Generate NASB 1995 / CSB / AMP / MSG in sequence via Claude
npx tsx server/scripts/seed-bible-verses.ts NASB   # Import server/data/bibles/NASB.json (NASB 1995) into Supabase BibleVerses
npx tsx server/scripts/backfill-collections-from-threads.ts --dry-run   # Preview thread titles → Notes.primaryCollection / secondaryCollections; omit --dry-run after staging
npm run native:xcodegen           # Optional: force XcodeGen; usually runs via postinstall / precommit
```

**Clean new user (manual only):** The automatic dev-reset middleware was removed so production user data is never erased. To get "new user" state locally, call `POST /api/test/reset-to-new-user` (test route) when the API is running.

## Architecture Overview

**Harvous** is a Bible study notes app. Three-level hierarchy: Spaces → Threads → Notes. Data: Supabase Postgres (Drizzle ORM), schema in `server/db/schema.ts`.

- **Production frontend**: React SPA in `spa/src/`, built with Vite. Uses TanStack Router, React Query, Clerk React. Deployed as static `index.html` + hashed JS/CSS. This is what users see in production and in the PWA.
- **API backend**: Hono server in `server/` bundled as a single Netlify Function (`netlify/functions/api.cjs`). All `/api/*` requests are routed there by `public/_redirects`.
- **Shared React components**: `src/components/react/` are imported by the SPA. UI changes that must ship to production should be made in `spa/src/` or these shared components.
- **Auth**: Clerk. In the SPA, `@clerk/clerk-react`; env var `VITE_CLERK_PUBLISHABLE_KEY`.
- **Rich Text**: Tiptap editor in `src/components/react/TiptapEditor.tsx`.
- **Mobile bottom sheet**: [Vaul](https://github.com/emilkowalski/vaul) via `src/components/ui/drawer.tsx` (`BottomSheet.tsx`, `MobileNavigation.tsx`). Harvous keeps existing overlay/sheet CSS. Toast UI uses [Sonner](https://github.com/emilkowalski/sonner). Motion direction credits **[Emil Kowalski](https://emilkowal.ski/)**.

**Production API contract:** The API is built as a single file (`netlify/functions/api.cjs`); Netlify uses `node_bundler = "none"`, so there is no `node_modules` at function runtime. All dependencies must be bundled (do not add `--packages=external` to `build:api`). The DB client uses `postgres.js` which bundles cleanly for Netlify Functions. Before merging API-affecting branches, see [docs/CLEAR_SPLIT_MERGE_DELTA.md](docs/CLEAR_SPLIT_MERGE_DELTA.md) (pre-merge checklist).

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
  db/                        # Drizzle schema (schema.ts), client (Supabase), dates
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
- **Routing**: TanStack Router in `spa/src/router.tsx`. Use `router.navigate()`. Shared code that calls `safeNavigate()` uses the shim in `spa/src/shims/astro-transitions.ts` to drive the router. Optional **simplified prototype** (native-like shell, no thread UI): `/prototype` — see [docs/SIMPLIFIED_WEB_PROTOTYPE.md](docs/SIMPLIFIED_WEB_PROTOTYPE.md) and [docs/PROTOTYPE_2_0_ARCHITECTURE.md](docs/PROTOTYPE_2_0_ARCHITECTURE.md) (1.0 vs 2.0 vs native).
- **Data fetching**: React Query hooks in `spa/src/hooks/queries/`. API calls via `spa/src/lib/api.ts`.
- **Note IDs**: Never reuse deleted IDs; track highest via `UserMetadata.highestSimpleNoteId`.
- **Events**: CustomEvents for cross-component updates (e.g. `noteAddedToThread`).

## Important Files

- **Before building web/native UI:** `docs/design-parity/HARVOUS_BUILD_CONVENTIONS.md` - concrete design tokens, component seams, and naming for the `/prototype` shell and native apps (reuse before inventing). Policy in `docs/design-parity/HARVOUS_DESIGN_PARITY_SPEC.md`; known seams/debt in `docs/design-parity/ARCHITECTURE_READINESS_AUDIT.md`.
- `docs/ARCHITECTURE.md` - Data structures, database schema, relationships
- `docs/CLEAR_SPLIT_MIGRATION.md` - Plan to simplify to Node API + SPA (no Astro in the middle)
- `docs/CLEAR_SPLIT_MERGE_DELTA.md` - What changed at merge, production API contract, pre-merge checklist
- `docs/REACT_ISLANDS_STRATEGY.md` - Astro SSR / React islands (legacy); production is SPA
- `docs/PROJECT_STRUCTURE.md` - Directory layout, naming conventions, imports
- `docs/MOBILE_KEYBOARD_NOTE_SHEET.md` - Mobile keyboard + new-note bottom sheet (Vaul drawer shell; toolbar 12px above keyboard, editor scroll, layout-root scroll lock)
- `src/components/ui/drawer.tsx` - Vaul wrapper for mobile drawers; `src/components/ui/sheet.tsx` - Radix sheet primitives (retained for shadcn-style patterns)
- `docs/MAIN_COLUMN_LAYOUT.md` - Main-column and CTA layout rules (scroll fill, CardStack chain, button positioning)
- `docs/MACOS_UNIFIED_TOOLBAR_OVERFLOW.md` - macOS unified toolbar overflow (“more”) during split transitions: attempts, constraints, and facts for future work
- `release-notes/` - User-facing release notes (`/marketing-agent`). Plain text only: no emoji in titles, headings, or body (`release-notes/README.md`).

## Faith and AI (agent reference)

Harvous is a Bible study app. When implementing or reviewing features that touch Scripture, theology, or pastoral tone, use external community guidance alongside project skills (e.g. `/theologian-agent`, `/scripture-agent`).

- **[Unofficial Rules for AI Apps for Christians](https://faith.tools/posts/unofficial-rules-for-ai-apps-for-christians)** (faith.tools, Cam Pak) — practical norms for faith-oriented AI products: biblically accurate output; do not fabricate or misrepresent Scripture; clearly identify as AI, not human; do not replace human relationships or spiritual practices; balance grace and truth.

## E2E Testing

Playwright tests for **join** and **invite** flows live in `e2e/shared-space-join.spec.ts` and `e2e/invitation-accept.spec.ts`. Before each run, global setup runs **idempotent** `tsx scripts/seed-e2e.ts` (Drizzle + Supabase) so tests pass.

- **Prerequisites**: `.env` (or `.env.local`) with `TEST_USER_A_EMAIL`, `TEST_USER_A_PASSWORD`, `TEST_USER_B_EMAIL`, `TEST_USER_B_PASSWORD`, and `TEST_USER_A_CLERK_ID` (Clerk user ID of User A, so space_test_2 is owned by the right account). `PUBLIC_CLERK_PUBLISHABLE_KEY` required.
- **Run**: `npm run test:e2e` (all e2e) or `npm run test:e2e:join` (join/invite only, 1 worker for order). For a fresh data state: `npm run test:e2e:setup` (seeds both DBs then runs join/invite tests). Some tests skip when the dev server’s DB doesn’t have the seeded data or TEST_USER_A_CLERK_ID doesn’t match User A.

## Database

Supabase Postgres via Drizzle ORM. Schema in `server/db/schema.ts`. Env: `SUPABASE_DATABASE_URL` (pooler, port 6543 — used at runtime), `SUPABASE_DIRECT_URL` (port 5432 — used by drizzle-kit for migrations). Run `npm run db:push` (drizzle-kit push) pre-deploy, `npm run db:check` pre-commit.

**Cross-device instant sync (Realtime):** After mutations, the API broadcasts on Supabase Realtime channel `sync-{userId}` when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set. Web uses `useRealtimeSync` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, Clerk template `supabase`). Native uses `HarvousRealtimeSync` (`HARVOUS_SUPABASE_*` in xcconfig). See [docs/SUPABASE_REALTIME_SETUP.md](docs/SUPABASE_REALTIME_SETUP.md). HTTP sync remains authoritative; 5-minute background poll is still a fallback.

**Production data verification (no user data showing):** The API reads from the same Supabase DB. If the app shows no data: (1) In Netlify, confirm `SUPABASE_DATABASE_URL` is set and points to the correct Supabase project. (2) Check Netlify function logs for `[api/content/load-more]` and `[api/user/get-profile]`: 401 = auth (cookies not sent or invalid), 0 items = DB empty or wrong user, 500 = exception. (3) Ensure Clerk cookies are valid for the production domain and that Netlify forwards the `Cookie` header to the function.

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
- ❌ **Skeleton UI**: Never introduce skeleton loaders or skeleton placeholders. Use real loading states (e.g. existing parentIsLoading, empty states, or spinners) instead.
