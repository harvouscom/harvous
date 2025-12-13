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
# Clerk Authentication
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

### 4. Initialize database

```bash
npm run db:sync     # Sync schema
npm run db:push     # Push to remote
```

### 5. Start development server

```bash
npm run dev
```

Visit `http://localhost:4321`

---

## Development

### Available Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start dev server (port 4321) |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run db:sync` | Sync database schema |
| `npm run db:push` | Push schema to remote |
| `npm run db:check` | Verify database state |
| `npm run predeploy` | Pre-deployment checks |
| `npm run deploy` | Build and deploy |
| `npm run version:bump` | Manually bump version |

### Development Workflow

1. **Create a new feature branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes**
   - Astro pages for routes: `src/pages/*.astro`
   - React components for interactivity: `src/components/react/*.tsx`
   - API endpoints: `src/pages/api/*/*.ts`
   - Utilities: `src/utils/*.ts`

3. **Test locally**
   ```bash
   npm run dev
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
   - Requires `WEBFLOW_API_TOKEN` environment variable

5. **Push and deploy**
   ```bash
   git push origin feature/my-feature
   ```

### Architecture Decisions

- **React Islands Pattern**: SSR pages (Astro) for fast initial load, React islands for interactive components
- **Database-First Design**: Source of truth is database, fresh queries on every page load
- **Event-Driven Communication**: CustomEvents for cross-component updates
- **Alpine → React Migration**: Migration 90% complete, React Islands pattern established as primary architecture

### Development Server

- **ALWAYS use port 4321** for the development server
- If port 4321 is busy, kill the process using: `lsof -ti:4321 | xargs kill -9`
- Then restart with: `npm run dev`
- Never use other ports (4322, 4323, etc.) - always force port 4321

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [TECH_STACK.md](./TECH_STACK.md) - Technology stack details
- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - Project organization
- [API.md](./API.md) - API reference
- [README.md](./README.md) - Documentation index

