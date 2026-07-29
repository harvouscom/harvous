# Harvous for AI Agents

## Quick Commands

```bash
npm run dev              # Hono API (3001) + SPA (4322) — full-stack dev (API must be running for /api)
npm run dev:spa          # SPA only on port 4322 (proxies /api to 3001). API must be running or /api returns 500.
npm run dev:all          # Same as dev: API + SPA
npm run build            # Production build: inject SW version + build:api + build:spa (no Astro)
npm run build:api        # Bundle Hono API to netlify/functions/api.cjs
npm run db:sync          # Drizzle Kit push (sync schema to Supabase) + auto-enable RLS
npm run db:push          # Drizzle Kit push (apply server/db/schema.ts to Supabase) + auto-enable RLS
npm run db:rls           # Enable RLS on all public tables (dynamic; runs automatically after db:push)
npm run shared-spaces:db:push -- --apply # Guarded Shared Spaces final reconciliation + RLS
npm run db:check         # Pre-commit schema check (server/db/schema.ts)
npm run check:thread-terminology       # Enforce user-facing Thread/Threads labels
npm run test:shared-spaces:offline     # Terminology + non-live Shared Spaces release checks
npm run test:e2e:shared-spaces         # Disposable-DB release gate; requires the full safe E2E env
npm run test:e2e                       # General Playwright suite
npm run lighthouse:a11y  # Build SPA, vite preview, Lighthouse accessibility (must score 100); use `-- --skip-build` to skip build
npm run bible:generate -- NASB     # Generate NASB.json (NASB 1995) via Claude (needs ANTHROPIC_API_KEY in .env); resumes from partial
npm run bible:generate:all         # Generate NASB 1995 / CSB / AMP / MSG in sequence via Claude
npx tsx server/scripts/seed-bible-verses.ts NASB   # Import server/data/bibles/NASB.json (NASB 1995) into Supabase BibleVerses
npx tsx server/scripts/backfill-collections-from-threads.ts --dry-run   # Preview thread titles → Notes.primaryCollection / secondaryCollections; omit --dry-run after staging
npm run native:xcodegen           # Optional: force XcodeGen; usually runs via postinstall / precommit
```

**Versioning:** Shipped web semver is **2.x** (Harvous 2.0 from July 2026). Pre-commit `bump-version.js` advances only on `feat:` (minor) or `fix:` (patch) commits — not on every `chore:`. User release notes: `release-notes/`; technical log: `Changelog/`.

**Clean new user (manual only):** The automatic dev-reset middleware was removed so production user data is never erased. To get "new user" state locally, call `POST /api/test/reset-to-new-user` (test route) when the API is running.

## Architecture Overview

**Harvous** is a Bible study notes app. Three-level hierarchy: Spaces → Threads → Notes. Data: Supabase Postgres (Drizzle ORM), schema in `server/db/schema.ts`.

**Shared Spaces:** My Home remains the complete canonical aggregate for every authored note. `SpaceNotes`
associates one canonical note with one or more shared contexts; folders, pins, Threads, and responses remain
space-specific. Safe migration order is backup/quiesce → additive dry/apply → preflight → backfill dry/apply →
verifier → guarded Shared Spaces db push/RLS → verifier → deploy/smoke/resume. Never run the Shared Spaces release E2E against
production; see `docs/SHARED_SPACES_TESTING.md`.

- **Production frontend**: React SPA in `spa/src/`, built with Vite. Uses TanStack Router, React Query, Clerk React. Deployed as static `index.html` + hashed JS/CSS. This is what users see in production and in the PWA.
- **Marketing site**: [harvous.com](https://harvous.com) — separate repo [harvouscom/harvous.com](https://github.com/harvouscom/harvous.com) (Astro). Not in this monorepo.
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
- **Routing**: TanStack Router in `spa/src/router.tsx`. Use `router.navigate()`. Shared code that calls `safeNavigate()` uses the shim in `spa/src/shims/astro-transitions.ts` to drive the router. **Simplified prototype** (native-like shell): on dedicated hosts (`localhost`, `new.harvous.com`, `app.harvous.com`) routes live at **`/`** (e.g. `/`, `/{id}`, `/settings`) — **not** `/prototype`. Compose stays on `/` until first persist, then idle-replaces to `/{id}`. Legacy `/n/{id}` forever-redirects to `/{id}`. Local dev: open `http://localhost:4322/`. Legacy `/prototype` prefix remains only on non-dedicated hosts; see `src/lib/prototype-path.ts`. Architecture: [docs/SIMPLIFIED_WEB_PROTOTYPE.md](docs/SIMPLIFIED_WEB_PROTOTYPE.md), [docs/PROTOTYPE_2_0_ARCHITECTURE.md](docs/PROTOTYPE_2_0_ARCHITECTURE.md).
- **Data fetching**: React Query hooks in `spa/src/hooks/queries/`. API calls via `spa/src/lib/api.ts`.
- **Note IDs**: Never reuse deleted IDs; track highest via `UserMetadata.highestSimpleNoteId`.
- **Events**: CustomEvents for cross-component updates (e.g. `noteAddedToThread`).

## Important Files

- **Before building web/native UI:** Start with `docs/design-parity/HARVOUS_DESIGN_SYSTEM.md` (style direction + checklist), then `docs/design-parity/HARVOUS_BUILD_CONVENTIONS.md` (tokens, component seams, naming). Policy in `docs/design-parity/HARVOUS_DESIGN_PARITY_SPEC.md`; known seams/debt in `docs/design-parity/ARCHITECTURE_READINESS_AUDIT.md`. Live gallery: `http://localhost:4322/__dev/design-system` (dev). Use `/design-agent` for cohesion reviews.
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

The protected Shared Spaces release specs are `e2e/shared-space-join.spec.ts`,
`e2e/shared-spaces-collaboration.spec.ts`, and `e2e/space-invites.spec.ts`. They seed current `SpaceInvites`,
`SpaceMemberships`, `SpaceNotes`, and versioned-note fixtures in a per-run namespace. The retired
`invitation-accept.spec.ts`, password-based setup, and fixed legacy seed claims are not part of the active gate.

- **Generic suite:** `npm run test:e2e` intentionally ignores the protected release specs. It must not trigger
  their fail-closed destructive setup.
- **Protected suites:** `npm run test:e2e:join`, `npm run test:e2e:shared-spaces`, and
  `npm run test:e2e:setup` set `HARVOUS_SHARED_SPACES_RELEASE_GATE=1`. The collaboration alias resolves to the
  same protected full suite.
- **Required safety identity:** exact disposable marker
  `HARVOUS_E2E_DISPOSABLE_DB=HARVOUS_SHARED_SPACES_E2E_DISPOSABLE_V1`, `E2E_SUPABASE_DATABASE_URL`, matching
  `HARVOUS_E2E_EXPECTED_PROJECT_REF`, distinct `HARVOUS_E2E_PRODUCTION_PROJECT_REF`, unique
  `HARVOUS_E2E_RUN_ID`, and `HARVOUS_E2E_EXPECTED_DB_ROLE` naming a dedicated least-privilege role. The database
  itself must carry the exact disposable comment and report that exact role; owner roles are rejected.
- **Clerk test identity:** two distinct test users via `TEST_USER_A_EMAIL`, `TEST_USER_A_CLERK_ID`,
  `TEST_USER_B_EMAIL`, and `TEST_USER_B_CLERK_ID`, plus test-instance `CLERK_SECRET_KEY` and
  `PUBLIC_CLERK_PUBLISHABLE_KEY`.
- **Routes:** verify the native-like shell at `http://localhost:4322/` and notes at `/{id}`, never
 `/prototype` on localhost.

## Shared Spaces migration

Every migration command must use the same reviewed direct Supabase target:

```bash
export SHARED_SPACES_MIGRATION_DATABASE_URL='<direct Supabase URL on port 5432>'
export SHARED_SPACES_MIGRATION_EXPECTED_PROJECT_REF='<target project ref>'
export SHARED_SPACES_MIGRATION_PRODUCTION_PROJECT_REF='<known production project ref>'
export SHARED_SPACES_MIGRATION_ENVIRONMENT='staging' # staging|production
export SUPABASE_DIRECT_URL="$SHARED_SPACES_MIGRATION_DATABASE_URL"
# Production only; exact value required:
# export SHARED_SPACES_MIGRATION_PRODUCTION_ACK='I_ACKNOWLEDGE_SHARED_SPACES_PRODUCTION_MIGRATION'
```

The production ref is mandatory in staging and production. A target matching it is rejected in staging mode;
production requires that exact target, `environment=production`, and the exact acknowledgement. After a verified
backup, quiesce note/Thread/shared-space writers, then run this exact order:

1. `npm run shared-spaces:schema:additive`, then
   `npm run shared-spaces:schema:additive -- --apply`;
2. `npm run shared-spaces:preflight`;
3. `npm run shared-spaces:backfill -- --batch-size=200`, then
   `npm run shared-spaces:backfill -- --apply --batch-size=200`;
4. `npm run shared-spaces:verify -- --batch-size=200`;
5. `npm run shared-spaces:db:push`, review its dry-run, then
   `npm run shared-spaces:db:push -- --apply` for final schema reconciliation and RLS;
6. `npm run shared-spaces:verify -- --batch-size=200` again;
7. deploy, smoke-test `/` and `/{id}`, then resume writers.

## Database

Supabase Postgres via Drizzle ORM. Schema in `server/db/schema.ts`. Env: `SUPABASE_DATABASE_URL` (pooler, port
6543 — used at runtime), `SUPABASE_DIRECT_URL` (port 5432 — used by drizzle-kit for migrations). For ordinary
schema changes, run `npm run db:push` pre-deploy and `npm run db:check` pre-commit. The Shared Spaces canonical
migration must use the staged sequence and guarded `shared-spaces:db:push` wrapper above. Generic `npm run
db:push` remains general project tooling and is not approved for the Shared Spaces cutover.

`npm run db:push` now also runs `scripts/run-enable-rls.ts`, which enables Row-Level Security on every public table (Drizzle creates new tables with RLS off by default). This is automatic — no manual SQL-editor step is needed to clear Supabase's `rls_disabled_in_public` advisory. The app's API uses the service-role key (bypasses RLS) and the browser anon client uses Realtime Broadcast only, so RLS with no policies is safe.

**Cross-device instant sync (Realtime):** After mutations, the API broadcasts on Supabase Realtime channel `sync-{userId}` when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set. Web uses `useRealtimeSync` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, Clerk template `supabase`). Native uses `HarvousRealtimeSync` (`HARVOUS_SUPABASE_*` in xcconfig). See [docs/SUPABASE_REALTIME_SETUP.md](docs/SUPABASE_REALTIME_SETUP.md). HTTP sync remains authoritative; 5-minute background poll is still a fallback.

**Production data verification (no user data showing):** The API reads from the same Supabase DB. If the app shows no data: (1) In Netlify, confirm `SUPABASE_DATABASE_URL` is set and points to the correct Supabase project. (2) Check Netlify function logs for `[api/content/load-more]` and `[api/user/get-profile]`: 401 = auth (cookies not sent or invalid), 0 items = DB empty or wrong user, 500 = exception. (3) Ensure Clerk cookies are valid for the production domain and that Netlify forwards the `Cookie` header to the function.

## Auth (Clerk)

- **Redirect URLs**: Do not set Clerk **Force redirect URL** to `/` (or app root) in Clerk Dashboard or via env vars (`CLERK_SIGN_IN_FORCE_REDIRECT_URL`, `CLERK_SIGN_UP_FORCE_REDIRECT_URL`). That would override the join/invite return flow; users must be sent back to `/spaces/join/[token]` or `/invitations/[token]` after sign-in when they came from those pages. Use **Fallback** redirect (e.g. `/`) only for when there is no `redirect_url` in the request.
- **Cold-start contract (prototype SPA):** Gate authenticated API calls on `useAuthReady()` (Clerk loaded + signed in + session JWT via `getToken`). Send requests through `spa/src/lib/api.ts` so Bearer is attached (cookies still sent). Do **not** retry 401s based on a Clerk cookie hint — that was a race-era workaround and spams the console. Cookie hint / `shellAuthReady` from `usePrototypeHomeSpaceId` is for chrome paint only while Clerk loads; never use it to enable data queries. Shell redirect rules: `src/utils/prototype-shell-auth.ts`. See [docs/troubleshooting/CLERK_SESSION_SIGN_OUT.md](docs/troubleshooting/CLERK_SESSION_SIGN_OUT.md).

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
