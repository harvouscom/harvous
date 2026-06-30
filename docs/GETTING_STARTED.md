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

# Database (Turso — same env names as before)
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...

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

```bash
npm run dev
```
Runs the Hono API on port 3001 and the SPA on port 4322. Open `http://localhost:4322`. This is the only dev mode and matches production (API + SPA). If you run only `npm run dev:spa`, `/api` requests will return 500 because the API must be running on 3001.

---

## Development

### Available Scripts

**Root:**

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start Hono API (3001) + SPA (4322) — production parity |
| `npm run dev:all` | Same as `dev` |
| `npm run dev:spa` | Start SPA only (4322); API must run separately |
| `npm run build` | Production build: inject SW + build:api + build:spa |
| `npm run preview` | Preview SPA build (vite preview) |
| `npm run db:sync` | Drizzle Kit push (sync schema to Turso) |
| `npm run db:push` | Drizzle Kit push (apply server/db/schema.ts to Turso) |
| `npm run db:check` | Verify schema changes (server/db/schema.ts) |
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
   - **Shared React components**: `src/components/react/*.tsx`
   - **API endpoints**: `server/` (Hono routes)
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

   Public changelog: [harvous.com/release-notes/](https://harvous.com/release-notes/) — marketing site in [harvouscom/harvous.com](https://github.com/harvouscom/harvous.com); draft copy in `release-notes/` here.

5. **Push and deploy**
   ```bash
   git push origin feature/my-feature
   ```

### Architecture Decisions

- **Production stack**: React SPA (Vite) + Hono API (`server/`). Netlify serves the SPA and a single serverless function that handles all `/api/*` requests.
- **Client-side routing**: TanStack Router in the SPA for all app routes (dashboard, threads, notes, spaces, profile).
- **Server state caching**: TanStack Query with tuned `staleTime` values prevents empty-state flashes on navigation.
- **Shared components**: `src/components/react/` is used by the SPA; UI changes for production go in the SPA or these shared components.
- **Event-Driven Communication**: CustomEvents (`spaceCreated`, `threadCreated`, etc.) keep components in sync.
- **Database-First Design**: Source of truth is the database (Turso via Drizzle); TanStack Query manages cache invalidation.

### Development Servers

With `npm run dev` (or `npm run dev:all`):

- **Hono API (port 3001)**: All `/api/*` routes — matches production.
- **SPA (port 4322)**: Authenticated app; open `http://localhost:4322`.

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [TECH_STACK.md](./TECH_STACK.md) - Technology stack details
- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - Project organization
- [API.md](./API.md) - API reference
- [README.md](./README.md) - Documentation index

