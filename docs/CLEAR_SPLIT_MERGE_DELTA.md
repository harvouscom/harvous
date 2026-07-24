# What Changed Between clear-split-migration and main

This doc explains what diverged when clear-split-migration was merged into main and why production broke (502s, “function crashed”), so we can avoid the same class of breakage next time.

## Summary

- **clear-split-migration tip**: commit `66cca87c` (docs + version bump). Build used **ESM** and **`--packages=external`**, so the Netlify function was a thin `api.mjs` that expected `node_modules` at runtime.
- **Netlify config**: `node_bundler = "none"` — Netlify does **not** install or bundle deps for the function; only the single file is deployed.
- **Result**: In production, the function crashed on import with `Cannot find package 'drizzle-orm'` (and same for `@libsql/client`, etc.) because those packages were external and not present in the function environment → **502 for all `/api/*`**.
- **Fixes applied on main** (after the merge): bundle deps, switch to CJS, use `@libsql/client/web`, then Netlify legacy event handling, dev-reset, and SW cache fixes.

So the regression wasn’t a bad merge or a reverted fix; **clear-split-migration as merged was not production-viable**. The build was fine for local dev (where `node_modules` exists) but wrong for Netlify with `node_bundler = "none"`.

## State at clear-split-migration tip (66cca87c)

| Item | Value |
|------|--------|
| **Build script** | `build:api`: esbuild `--format=esm --packages=external` → `netlify/functions/api.mjs` |
| **Netlify** | `netlify.toml`: function = `api.mjs`, `node_bundler = "none"` |
| **DB client** | `server/db/client.ts`: `createClient` from `@libsql/client` (Node/native) |

With `--packages=external`, `drizzle-orm`, `@libsql/client`, `hono`, `@clerk/backend`, etc. are **not** in the bundle. With `node_bundler = "none"`, only `api.mjs` is deployed. So at runtime Node could not resolve those imports → function crash → 502.

## Commits on main after 66cca87c (post-merge fixes)

Rough order of what was done on main:

1. **bc67ebef** – Remove `--packages=external` so the API bundle includes all dependencies (fixes “Cannot find package 'drizzle-orm'”). Plan: `.cursor/plans/fix-production-502-bundle-api.plan.md`.
2. **f323d5f1** – Switch to **CJS** (`api.cjs`), update `netlify.toml`, fix env var access for CJS in a few utils.
3. **e59e7356** – Use **`@libsql/client/web`** in `server/db/client.ts` and bundle it so the function doesn’t rely on native bindings.
4. **41c9d767, b3e27eae, c76c44db** – API build command and export structure.
5. **ab19c9ec … 71581eb0** – Netlify **legacy event** handling (headers, path normalization, response shape) so the function works with Netlify’s request format.
6. **3beb98d9, c413c079, 028065e2** – **Dev-reset** middleware: prevent it from running on Netlify; then make it opt-in only.
7. **4bbf5076** – **Service worker**: `cache: 'no-store'` for `/api/*` so API responses aren’t cached.

So “something happened again” is: **the branch that was merged had a production-invalid build**. The “something” was the build and runtime environment mismatch, not a merge mistake.

## How to avoid this next time

1. **Validate production build before merging**
   - Run `npm run build:api` and confirm the **single output file** (e.g. `netlify/functions/api.cjs`) runs in an environment that **does not** have `node_modules` (e.g. run `node netlify/functions/api.cjs` from a clean dir with only that file and the right env vars, or use Netlify’s “test function” / a staging deploy).
   - If the build uses `--packages=external`, either ensure the deploy provides those packages (e.g. not `node_bundler = "none"`) or remove external and bundle deps.

2. **Document “production contract” for the API**
   - In `AGENTS.md` or `docs/`: “API is built as a single file; Netlify uses `node_bundler = 'none'`; no `node_modules` at function runtime; use `@libsql/client/web` (not default Node client) for Turso.”

3. **Pre-merge checklist**
   - [ ] `npm run build:api` succeeds.
   - [ ] If billing/env changed: `npm run billing:verify` against the target Paddle env (sandbox or live) so price ids match the registry.
   - [ ] Deploy to staging (or test the built function in a Netlify-like context) and hit `/api/health` (and optionally `/api/debug/me` when logged in).
   - [ ] Confirm no dev-only behavior (e.g. dev-reset) runs in production.

4. **Merge strategy**
   - Prefer merging into main only after a green staging deploy of the **exact** build that main will use (same `build:api`, same `netlify.toml`). That would have caught the external-deps + `node_bundler = "none"` mismatch before merge.

## References

- **Root cause (502)**: `.cursor/plans/fix-production-502-bundle-api.plan.md`
- **Architecture**: `docs/CLEAR_SPLIT_MIGRATION.md`, `docs/REMOVE_ASTRO_COMPLETELY.md` (migration completed; those docs are now historical)
- **Debug endpoint**: `GET /api/debug/me` (when logged in) to verify auth and Turso counts in production
