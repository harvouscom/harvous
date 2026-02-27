# Remove Astro Completely

**Status: COMPLETED.** Astro has been fully removed. The repo is SPA + Hono API + Drizzle/Turso only. This doc is kept as a historical checklist.

**Related:** [CLEAR_SPLIT_MIGRATION.md](./CLEAR_SPLIT_MIGRATION.md) described the original vision; this doc was the concrete removal checklist.

---

## Current State (Post-Removal)

| Area | Status |
|------|--------|
| **Production frontend** | Vite SPA only (`spa/`). Served from `dist-spa/`. |
| **Production API** | Hono in `server/`, bundled as `netlify/functions/api.cjs`. All `/api/*` go there. |
| **Root `npm run build`** | `inject-sw` + `build:api` + `build:spa`. No Astro. |
| **Dev** | `npm run dev` / `dev:all` = Hono API (3001) + SPA (4322). No Astro dev server. |
| **DB schema** | Single source: `server/db/schema.ts` (Drizzle). |
| **DB commands** | `db:sync`, `db:push`, `db:check` use Drizzle Kit. E2E seed uses Node + Turso. |
| **Astro** | Removed: no `.astro` files, no Astro packages or config. |

---

## What “Remove Astro Completely” Means

1. **Build:** Root `build` and any CI script run only SPA build + API build. No `astro build`, no Astro config for the app.
2. **DB tooling:** Schema and migrations use one source (Drizzle). `db:sync` / `db:push` / seeds run via Node + Turso (e.g. Drizzle Kit or custom scripts).
3. **Dev:** Only `dev:all` (API + SPA). No Astro dev server or Astro-specific scripts.
4. **Codebase:** Remove Astro packages and the 58 `.astro` files (or move to an archive branch). No `astro.config.mjs` for the main app, no `db/config.ts` (Astro) once Drizzle is the single source of truth.

---

## Prerequisites

- Hono API is the only API in production (done).
- Drizzle schema in `server/db/schema.ts` is kept in sync with `db/config.ts` (done today; after removal, Drizzle is the only schema).
- E2E and deploy use Netlify’s build command (build:api + build:spa), not root `npm run build`.

---

## Phase 1: Build Pipeline (No Astro Build)

**Goal:** Root `npm run build` and any CI use only SPA + API build. No Astro.

1. **Change root `build` script** in [package.json](package.json):
   - **Current:** `"build": "astro build --remote"`
   - **Target:** `"build": "node scripts/inject-sw-cache-version.js && npm run build:api && npm run build:spa"`
   - So local “full build” matches what Netlify runs (minus `npm ci`). Drop `prebuild` if it only ran inject-sw and fold into `build`, or keep `prebuild` and have `build` call `prebuild && build:api && build:spa` if you want to keep the hook name.

2. **Optional: `preview`**  
   - **Current:** `astro preview`  
   - **Target:** Use `vite preview` for the SPA (e.g. `npm run preview:spa` or a new `preview` that serves `dist-spa/` and does not need the API for static preview). Document that full E2E needs API + SPA running.

3. **Verify**  
   - Run `npm run build` from repo root. Confirm only `build:api` and `build:spa` run, and `netlify/functions/api.cjs` and `dist-spa/` are produced.  
   - Netlify deploy is unchanged (it already uses the custom command in `netlify.toml`).

**Outcome:** No Astro in the build path. Astro can still be present for DB and dev until Phase 2–4.

---

## Phase 2: Database Tooling (Drizzle-Only)

**Goal:** One schema source (Drizzle). Sync, push, and seeds use Node + Turso. No `astro db`.

1. **Choose single schema source**  
   - **Recommended:** Keep [server/db/schema.ts](../server/db/schema.ts) as the only schema. It already mirrors the Astro DB schema.  
   - **Alternative:** Use Drizzle Kit migrations (SQL files) and generate the schema from migrations. Larger change; only if you want versioned SQL migrations.

2. **Replace `db:sync` and `db:push`**  
   - **Option A – Drizzle Kit:**  
     - Add `drizzle-kit` and a `drizzle.config.ts` that points at `server/db/schema.ts` and Turso (env: `ASTRO_DB_REMOTE_URL`, `ASTRO_DB_APP_TOKEN`).  
     - Scripts: `db:sync` = `drizzle-kit push` (or `drizzle-kit migrate` if using migrations), `db:push` = same or a thin script that runs push against remote.  
   - **Option B – Custom script:**  
     - A Node script (e.g. `scripts/db-push.ts`) that uses `server/db/client.ts` and Drizzle’s migration/sync APIs (or raw SQL from schema) to apply schema to Turso.  
   - Update [package.json](package.json) scripts: `db:sync` and `db:push` no longer call `astro db`. Any hook that runs `db:push` (e.g. `predeploy`) will then use the new implementation automatically.

3. **Replace `db:check`**  
   - [scripts/db-sync.js](scripts/db-sync.js) (or equivalent) currently may use Astro. Rewrite to use Drizzle + Turso (e.g. introspect or compare schema) so pre-commit check does not depend on Astro.

4. **E2E seed**  
   - [db/seed-e2e.ts](../db/seed-e2e.ts) uses `astro:db`. Port to a Node script that uses `server/db/client.ts` and `server/db/schema.ts` (same tables and columns).  
   - Update [package.json](package.json): `test:e2e:setup` runs the new seed script for local and remote (e.g. `node scripts/seed-e2e.ts` with env for remote URL).

5. **Remove Astro DB usage**  
   - After the above, nothing should call `astro db` or `db/config.ts` for runtime or tooling.  
   - You can delete or archive `db/config.ts` once Drizzle is the single source and no Astro commands remain.

**Outcome:** All DB operations use Drizzle + Turso. No Astro DB.

---

## Phase 3: Remove Astro Dev App and Scripts

**Goal:** No Astro dev server, no Astro-specific scripts. Dev = `dev:all` only.

1. **Scripts in [package.json](package.json)**  
   - Remove or replace: `dev` (astro dev), `dev:clean`, `preview` (astro preview), `astro`.  
   - Keep: `dev:api`, `dev:spa`, `dev:all`. Optionally add a single `dev` that runs `dev:all` so `npm run dev` is the standard.

2. **Documentation**  
   - [AGENTS.md](../AGENTS.md), [docs/GETTING_STARTED.md](GETTING_STARTED.md): Remove references to “Option B – Astro + SPA” and to `npm run dev` (Astro). State that the only dev mode is `npm run dev:all` (or `npm run dev` if you alias it).

---

## Phase 4: Remove Astro Files and Dependencies

**Goal:** No `.astro` files, no Astro packages. Repo is SPA + API + shared React only.

1. **Delete Astro app and config**  
   - Remove (or move to `_archive/astro-app/` in a branch):  
     - All 58 `.astro` files under `src/pages/`, `src/layouts/`, `src/components/*.astro`.  
     - [astro.config.mjs](../astro.config.mjs) (if it only served the Astro app and DB).  
   - Keep: `src/components/react/`, `src/utils/`, `src/styles/`, `src/data/`, and any non-Astro files under `src/` that the SPA or API use.

2. **Legacy Astro API routes**  
   - `src/pages/api/` is legacy (production uses Hono). After removal, either delete `src/pages/api/` or leave as reference until you are sure no script or doc depends on it; then delete.

3. **Dependencies in [package.json](package.json)**  
   - Remove: `astro`, `@astrojs/check`, `@astrojs/db`, `@astrojs/netlify`, `@astrojs/react`, `@clerk/astro`.  
   - Keep: `@clerk/backend`, `@clerk/clerk-react`, and everything the SPA and Hono API need.

4. **Config and types**  
   - Remove Astro-specific types or config (e.g. `astro` in `tsconfig` or env).  
   - Ensure `vite.config.ts` (and any root config) does not reference Astro. Path aliases (`@/` → `src/`) should remain for the SPA and API build.

5. **Docs and scripts**  
   - Update [docs/PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md), [docs/TECH_STACK.md](TECH_STACK.md), and any doc that mentions Astro pages, Astro dev, or Astro DB.  
   - Search for `astro`, `astro:db`, `defineTable`, `db/config.ts` in docs and scripts; update or remove.

**Outcome:** No Astro in the codebase or dependencies. Build = SPA + API; DB = Drizzle + Turso; dev = API + SPA.

---

## Order of Operations (Suggested)

1. **Phase 1** first: build runs without Astro. Netlify already does; align root `build` and docs.  
2. **Phase 2** next: DB tooling and seed must work without Astro before you delete Astro.  
3. **Phase 3**: Remove Astro dev and scripts.  
4. **Phase 4** last: Delete Astro files and deps after nothing references them.

---

## Files to Touch (Summary)

| Phase | Files / areas |
|-------|----------------|
| 1 | `package.json` (build, preview), optionally `netlify.toml` (if you want one canonical build command), `AGENTS.md`, `docs/GETTING_STARTED.md` |
| 2 | `package.json` (db:sync, db:push, db:check, test:e2e:setup), new or updated scripts (e.g. `scripts/db-push.ts`, `scripts/seed-e2e.ts`), optionally `drizzle.config.ts`, `db/config.ts` (remove after migration) |
| 3 | `package.json` (dev, dev:clean, preview, astro), `AGENTS.md`, `docs/GETTING_STARTED.md` |
| 4 | Delete 58 `.astro` files, `src/pages/api/` (when safe), `astro.config.mjs`; remove Astro deps from `package.json`; update `docs/PROJECT_STRUCTURE.md`, `docs/TECH_STACK.md`, and any doc that references Astro |

---

## Risks and Mitigations

- **Schema drift:** Keep Drizzle schema in sync with actual Turso tables during Phase 2. Run `db:push` (or equivalent) and spot-check with a quick app test.  
- **E2E breakage:** After porting seed-e2e to Node, run `test:e2e:setup` (or equivalent) for both local and remote and re-run join/invite tests.  
- **Missed references:** Grep for `astro`, `astro:db`, `defineTable`, and `db/config.ts` before deleting; update or remove each reference.

---

## When You’re Done

- **Build:** `npm run build` = inject SW version + build:api + build:spa. No Astro.  
- **Dev:** `npm run dev` or `npm run dev:all` = Hono API + SPA. No Astro.  
- **DB:** `db:sync` / `db:push` / seeds = Drizzle + Turso. No Astro.  
- **Repo:** No `.astro` files, no Astro packages, no Astro config. Single frontend (SPA), single API (Hono), single schema/tooling (Drizzle).

This doc can live next to [CLEAR_SPLIT_MIGRATION.md](./CLEAR_SPLIT_MIGRATION.md); that one stays as the high-level rationale; this one is the concrete removal checklist.
