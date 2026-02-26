# Getting Started

Complete guide for setting up and developing Harvous locally.

## Prerequisites

```bash
Node.js >=20.6.1
npm or pnpm
```

## Quick Start

### 1. Clone the repository

```bash
git clone <repository-url>
cd harvous
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create `.env` file in the root directory:

```env
# Clerk Authentication (API / server)
PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
PUBLIC_CLERK_SIGN_IN_URL=/sign-in
PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Database (Astro DB / Turso)
ASTRO_DB_REMOTE_URL=libsql://...
ASTRO_DB_APP_TOKEN=...

# Bible API (optional)
BIBLE_API_KEY=...
```

Create `spa/.env` file for the SPA (Vite build):

```env
# Clerk Authentication (SPA/Vite layer)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### 4. Initialize database

```bash
npm run db:sync     # Sync schema
npm run db:push     # Push to remote
```

### 5. Start development servers

**Recommended — Hono API + SPA (production parity):**
```bash
npm run dev:all
```
Runs the Hono API on port 3001 and the SPA on port 4322. Open `http://localhost:4322`. This matches production: the API is a single Hono server; the frontend is the React SPA. If you run only `npm run dev:spa`, `/api` requests will return 500 because the API must be running on 3001.

**Alternative — Astro + SPA (legacy dev, two terminals):**

**Terminal 1 — Astro (port 4321):**
```bash
npm run dev
```

**Terminal 2 — React SPA (port 4322 from root):**
```bash
npm run dev:spa
```

Use this only if you need to work on Astro SSR pages or legacy API routes. Production serves the SPA and the Hono API only; Astro is not used in production.

---

## Development

### Available Scripts

**Root:**

| Script | Purpose |
|--------|---------|
| `npm run dev:all` | **Recommended.** Start Hono API (3001) + SPA (4322) — production parity |
| `npm run dev` | Start Astro dev server (4321) — legacy dev only |
| `npm run dev:spa` | Start SPA only (4322); API must run separately (e.g. `dev:all`) |
| `npm run build` | Production build: Astro build + Vite build; `dist-spa/` is copied over `dist/` (SPA is what users get) |
| `npm run preview` | Preview production build |
| `npm run db:sync` | Sync database schema |
| `npm run db:push` | Push schema to remote |
| `npm run db:check` | Verify database state |
| `npm run predeploy` | Pre-deployment checks |
| `npm run deploy` | Build and deploy |
| `npm run version:bump` | Manually bump version |

**`spa/` (React SPA):**

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | Build SPA to `spa/dist/` |
| `npm run preview` | Preview Vite production build |

### Development Workflow

1. **Create a new feature branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes**
   - **SPA pages** (production routes): `spa/src/pages/*.tsx`
   - **SPA routing**: `spa/src/router.tsx`
   - **SPA layout/shell**: `spa/src/layouts/AppLayout.tsx`
   - **Shared React components** (SPA + optional Astro dev): `src/components/react/*.tsx`
   - **API endpoints (production)**: `server/` (Hono routes); legacy Astro API: `src/pages/api/*/*.ts` (dev only)
   - **Astro pages** (dev only; not served in production): `src/pages/*.astro`
   - **Utilities**: `src/utils/*.ts`
   - **Styles**: `src/styles/*.css`

3. **Test locally**
   ```bash
   npm run dev:all
   # Then open http://localhost:4322
   ```

4. **Commit with conventional commits**
   ```bash
   git commit -m "feat: add new feature"
   git commit -m "fix: fix bug"
   ```

   Version bumps automatically via git hook:
   - `feat:` → minor bump (0.10.0 → 0.11.0)
   - `fix:` → patch bump (0.10.0 → 0.10.1)
   - `BREAKING CHANGE` → major bump (0.10.0 → 1.0.0)

   **Changelog sync to Webflow CMS** (automatic starting at v1.0.0):
   - After each commit, if version >= 1.0.0, creates a changelog entry in Webflow CMS
   - Extracts version, date, commit message, and category automatically
   - Skips version bump commits automatically
   - Requires `WEBFLOW_CHANGELOG_API_TOKEN` environment variable (with cms:write scope)

5. **Push and deploy**
   ```bash
   git push origin feature/my-feature
   ```

### Architecture Decisions

- **Production stack**: React SPA (Vite) + Hono API (`server/`). Netlify serves the SPA and a single serverless function that handles all `/api/*` requests. Astro is used for build tooling and optional local dev; it is **not** served in production.
- **Client-side routing**: TanStack Router in the SPA for all app routes (dashboard, threads, notes, spaces, profile).
- **Server state caching**: TanStack Query with tuned `staleTime` values prevents empty-state flashes on navigation.
- **Shared components**: `src/components/react/` is used by the SPA (and by Astro pages in dev); UI changes for production should go in the SPA or these shared components.
- **Event-Driven Communication**: CustomEvents (`astro:page-load`, `spaceCreated`, `threadCreated`, etc.) keep components in sync; the SPA dispatches `astro:page-load` on route changes for backward compatibility.
- **Database-First Design**: Source of truth is always the database; TanStack Query manages cache invalidation.

### Development Servers

With `npm run dev:all`:

- **Hono API (port 3001)**: All `/api/*` routes — matches production.
- **SPA (port 4322)**: Authenticated app; open `http://localhost:4322`.

Optional legacy dev: Astro on port 4321 (`npm run dev`) for working on Astro pages or legacy API routes; not required for production work.

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [TECH_STACK.md](./TECH_STACK.md) - Technology stack details
- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - Project organization
- [API.md](./API.md) - API reference
- [README.md](./README.md) - Documentation index

