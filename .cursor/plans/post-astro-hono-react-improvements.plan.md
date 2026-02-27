# Post-Astro improvements (Hono + React only)

The migration is complete: no Astro in build or runtime. This plan covers cleanup of Astro-named legacy contracts and **switching to Turso env var names** (you're already updating `.env` and Netlify).

---

## 0. Env var rename: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN

**You're doing:** Updating `.env` and Netlify to use `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

**Codebase changes:** Prefer the new names everywhere, with **fallback** to `ASTRO_DB_REMOTE_URL` / `ASTRO_DB_APP_TOKEN` so existing deploys or local `.env` keep working until they switch.

**Pattern (use in all server/script/e2e code):**

```ts
const url = process.env.TURSO_DATABASE_URL ?? process.env.ASTRO_DB_REMOTE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.ASTRO_DB_APP_TOKEN;
```

**Files to update:**

| File | Change |
|------|--------|
| [server/db/client.ts](server/db/client.ts) | Read `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`, fallback to old. Error messages: "Missing TURSO_DATABASE_URL (or ASTRO_DB_REMOTE_URL)". |
| [drizzle.config.ts](drizzle.config.ts) | Same pattern; update throw message. |
| [server/db/validate-schema.ts](server/db/validate-schema.ts) | Same; update comments and usage in error text. |
| [server/dev.ts](server/dev.ts) | Comment: require "TURSO_DATABASE_URL (or ASTRO_DB_*), ...". |
| [e2e/global-setup.ts](e2e/global-setup.ts) | Use `process.env.TURSO_DATABASE_URL ?? process.env.ASTRO_DB_REMOTE_URL` for the `remote` check. |
| **Scripts** (each uses ASTRO_DB_* in comment or code): [scripts/seed-e2e.ts](scripts/seed-e2e.ts), [scripts/reset-user-simple-note-id.ts](scripts/reset-user-simple-note-id.ts), [scripts/force-merge-one-user.ts](scripts/force-merge-one-user.ts), [scripts/fix-clerk-mapping-row.ts](scripts/fix-clerk-mapping-row.ts), [scripts/check-user-ids-in-db.ts](scripts/check-user-ids-in-db.ts), [scripts/migrate-clerk-user.ts](scripts/migrate-clerk-user.ts), [scripts/audit-clerk-mapping-for-users-with-notes.ts](scripts/audit-clerk-mapping-for-users-with-notes.ts), [scripts/batch-merge-mapped-users-to-live.ts](scripts/batch-merge-mapped-users-to-live.ts), [scripts/merge-test-user-into-live.ts](scripts/merge-test-user-into-live.ts), [scripts/populate-clerk-user-mapping.ts](scripts/populate-clerk-user-mapping.ts), [scripts/audit-restored-db.ts](scripts/audit-restored-db.ts) | In each: read from `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` with fallback (or pass through to a shared helper). Update header comments to "Requires: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (or ASTRO_DB_*).". |
| [.env.example](.env.example), [env-template.txt](env-template.txt) | Replace ASTRO_DB_* with TURSO_DATABASE_URL and TURSO_AUTH_TOKEN; optionally keep old as "# deprecated". |
| [src/env.d.ts](src/env.d.ts) | Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (and optionally keep ASTRO_* for fallback). |
| [src/utils/env-validation.ts](src/utils/env-validation.ts) | Validate `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (with fallback: if either new or both old are set, consider DB config present). Note: this runs in Vite context; DB vars are usually server-only, so this may only matter for dev/build. |
| **Docs** | [AGENTS.md](AGENTS.md), [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md), [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md), [docs/TECH_STACK.md](docs/TECH_STACK.md), [docs/E2E_TESTING.md](docs/E2E_TESTING.md), [docs/CAPACITOR_IMPLEMENTATION_GUIDE.md](docs/CAPACITOR_IMPLEMENTATION_GUIDE.md), [docs/PROFILE_PERSISTENCE_SOLUTION.md](docs/PROFILE_PERSISTENCE_SOLUTION.md), [docs/troubleshooting/database-deployment-errors.md](docs/troubleshooting/database-deployment-errors.md), [docs/troubleshooting/CLERK_DUPLICATE_USER_MIGRATION.md](docs/troubleshooting/CLERK_DUPLICATE_USER_MIGRATION.md) | Replace references to ASTRO_DB_* with TURSO_DATABASE_URL / TURSO_AUTH_TOKEN; mention fallback where relevant. |

After this, Netlify and local can use the new vars; old vars still work during transition.

---

## 1. Replace Astro-named lifecycle events with app-level events

**Current state:** [spa/src/layouts/AppLayout.tsx](spa/src/layouts/AppLayout.tsx) dispatches `astro:after-swap` and `astro:page-load` on route change so shared React components and `public/scripts/*.js` that listen for these events still run.

**Recommendation:** Introduce app-level events (e.g. `app:route-change` or `harvous:page-load`) and migrate all listeners. Then remove the `astro:*` dispatches.

- **Dispatch:** In `AppLayout.tsx`, after the route transition, dispatch the new event(s). Then remove the `astro:*` dispatches.
- **Listeners to update:** React components (NavigationColumn, PersistentNavigation, KeyboardShortcutsInit, NewNotePanel, UpgradePageContent, ManageBillingPanel, FindSearchInput, OrganizedContentList, SpaceContentList, ThreadNotesList, SafeSubscriptionDetailsButton, UpgradeSuccessHandler, NavigationContext), utils/hooks (view-transitions-refresh, usePWAAndNavigationRefresh), and all `public/scripts/*.js` (toast-handler, tab-manager, history-tracker, persistent-navigation, unorganized-handler, avatar-manager-global, profile-sync). Document in TECH_STACK.md and AGENTS.md.

---

## 2. Optional: "before navigation" event or remove dead listeners

**Current state:** Several components listen for `astro:before-preparation`; AppLayout never dispatches it in the SPA.

**Recommendation:** Either add `app:before-route-change` and wire listeners, or remove the `astro:before-preparation` listeners as dead code.

---

## 3. Rename transitions shim and alias

**Current state:** Vite aliases `astro:transitions/client` to [spa/src/shims/astro-transitions.ts](spa/src/shims/astro-transitions.ts). [src/utils/safe-navigate.ts](src/utils/safe-navigate.ts) and some components import it.

**Recommendation:** Add something like `@/utils/app-navigate.ts` (or under `spa/src/lib/`) that exports `navigate()`. Point the alias there; optionally migrate imports to the new path and remove the `astro:transitions/client` alias.

---

## 4. Replace window.astroNavigate

**Current state:** KeyboardShortcutsInit sets `(window as any).astroNavigate`; navigation-breadcrumb.ts and keyboard-shortcuts.ts use it.

**Recommendation:** Rename to `window.appNavigate` and update those three places.

---

## 5. Update comments that still say "Astro"

**Recommendation:** In files touched for events/shim/env, replace comments that describe current behavior with "SPA" or "app" (e.g. "same as app layout"). Leave historical docs as-is.

---

## Suggested order

1. **Env var rename** (you’re already on it) — implement the codebase side above so app and scripts use TURSO_* with fallback.
2. Replace `astro:*` events with `app:*` and update all listeners + public scripts.
3. Rename `window.astroNavigate` → `window.appNavigate`.
4. Rename shim/alias and optionally add `app:before-route-change` or remove dead before-preparation listeners.
5. Comment cleanup in touched files.
