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
# Clerk Authentication (Astro layer)
PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
PUBLIC_CLERK_SIGN_IN_URL=/sign-in
PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Astro DB (Turso)
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

**Option A — Hono API + SPA (recommended on clear-split branch):**
```bash
npm run dev:all
```
Runs the Hono API on port 3001 and the SPA on port 4322. Open `http://localhost:4322`. If you run only `npm run dev:spa`, `/api` requests will return 500 because the API must be running on 3001.

**Option B — Astro + SPA (two terminals):**

**Terminal 1 — Astro (API layer, port 4321):**
```bash
npm run dev
```

**Terminal 2 — React SPA (port 4322 from root):**
```bash
npm run dev:spa
```

- Astro dev server: `http://localhost:4321` — API routes, sign-in, shared pages
- SPA dev server: `http://localhost:4322` — authenticated app (when using `dev:spa` or `dev:all`)

---

## Development

### Available Scripts

**Root (Astro SSR layer):**

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start Astro dev server (port 4321) |
| `npm run build` | Build Astro SSR output for production |
| `npm run preview` | Preview Astro production build |
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
   - **SPA pages** (authenticated routes): `spa/src/pages/*.tsx`
   - **SPA routing**: `spa/src/router.tsx`
   - **SPA layout/shell**: `spa/src/layouts/AppLayout.tsx`
   - **Shared React components** (used by both SPA and Astro): `src/components/react/*.tsx`
   - **API endpoints**: `src/pages/api/*/*.ts`
   - **Astro public pages** (sign-in, shared views): `src/pages/*.astro`
   - **Utilities**: `src/utils/*.ts`
   - **Styles**: `src/styles/*.css`

3. **Test locally**
   ```bash
   # Terminal 1: Astro API layer
   npm run dev
   # Terminal 2: SPA
   cd spa && npm run dev
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

- **Dual-app monorepo**: Astro SSR handles API routes and public pages; React SPA handles the authenticated app shell
- **Client-side routing**: TanStack Router in the SPA replaces Astro's file-based routing for authenticated routes
- **Server state caching**: TanStack Query with tuned `staleTime` values prevents empty-state flashes on navigation
- **Shared components**: `src/components/react/` is shared between the SPA and Astro pages — changes there affect both
- **Event-Driven Communication**: CustomEvents (`astro:page-load`, `spaceCreated`, `threadCreated`, etc.) keep components in sync; the SPA dispatches `astro:page-load` on route changes for backward compatibility
- **Database-First Design**: Source of truth is always the database; TanStack Query manages cache invalidation

### Development Servers

Two servers run simultaneously in development:

- **Astro (port 4321)**: API routes (`/api/*`), sign-in/sign-up pages, shared/public pages. If port 4321 is busy: `lsof -ti:4321 | xargs kill -9`
- **SPA (port 5173)**: Authenticated app shell (dashboard, threads, notes, spaces). Standard Vite dev server with HMR.

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [TECH_STACK.md](./TECH_STACK.md) - Technology stack details
- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - Project organization
- [API.md](./API.md) - API reference
- [README.md](./README.md) - Documentation index

