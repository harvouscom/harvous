# Harvous for AI Agents

## Quick Commands

```bash
npm run dev              # Dev server on port 4321
npm run build            # Production build (prebuild injects package version into public/sw.js so PWA cache invalidates on deploy)
npm run db:sync          # Sync database schema
npm run db:push          # Push schema to remote
npm run db:check         # Pre-commit schema check
npm run test:e2e         # Playwright e2e (join/invite flows)
npm run test:e2e:setup   # Seed e2e data (local + remote) then run e2e
```

## Architecture Overview

**Harvous** is a Bible study notes app built with Astro + React Islands + Turso database. Three-level hierarchy: Spaces → Threads → Notes.

- **Frontend**: Astro pages (SSR) + React islands for interactive components
- **Database**: Astro DB (Turso) with schema in `db/config.ts`
- **Auth**: Clerk via `src/middleware.ts`
- **Rich Text**: Tiptap editor in `src/components/react/TiptapEditor.tsx`

## Project Structure

```
src/
├── pages/            # Astro routes
│   ├── dashboard.astro
│   └── api/          # API endpoints
├── components/
│   ├── react/        # React islands (interactive)
│   └── *.astro       # Static Astro components
├── utils/            # Helpers: dashboard-data, auto-tag-generator, scripture-detector
├── actions/          # Server actions for CRUD
└── styles/           # Vanilla CSS (semantic classes)
db/config.ts          # Database schema & relationships
```

## Code Style

- **TypeScript**: Strict mode, `@/` path aliases for imports
- **React Components**: Use hooks, place in `src/components/react/`, name as `PascalCase.tsx`
- **Astro Components**: Static/server-rendered only, name as `PascalCase.astro`
- **CSS**: Semantic classes (no Tailwind), CSS variables for colors, organized by component
- **Formatting**: Prettier (2 spaces, 120 char line width, trailing commas off)

## Key Patterns

- **React Islands**: Use `client:load` for critical interactive components, `client:visible` for below-fold
- **Note IDs**: Never reuse deleted IDs; track highest via `UserMetadata.highestSimpleNoteId`
- **Events**: CustomEvents for cross-component updates (e.g., `noteAddedToThread`)
- **Inline Scripts**: Only use script tags with attribute `is:inline` when you embed third‑party scripts from CDNs (analytics, SDKs, ads, etc.) OR you explicitly need a literal inline script tag in the rendered HTML instead of Astro’s bundled module behavior.

## Important Files

- `docs/ARCHITECTURE.md` - Data structures, database schema, relationships
- `docs/REACT_ISLANDS_STRATEGY.md` - Component migration patterns, implementation details
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
