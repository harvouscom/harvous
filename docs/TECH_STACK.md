# Technology Stack

Complete technology stack documentation for Harvous, including versions, dependencies, and deployment configuration.

## Architecture Overview

**Production** is a **React SPA + Hono API**:

- **`/spa`** — React SPA (Vite): the full app users see. Handles all routes (dashboard, threads, notes, spaces, profile, sign-in, shared content, etc.). Built output is copied to `dist/` and served as static `index.html` + assets.
- **`/server`** — Hono API: a single Node server that handles **all** `/api/*` requests. Bundled as one Netlify serverless function (`netlify/functions/api.cjs`). Database access, auth, and business logic live here.

The Netlify build runs `npm run build` (inject SW + build:api + build:spa). Publish directory is `dist-spa/`. Database schema lives in `server/db/schema.ts` (Drizzle + Turso).

Netlify routing: `public/_redirects` sends app paths to `/index.html` (SPA); `/api/*` is handled by the SSR function (Hono). Do not add a catch-all that would send API requests to the SPA.

## Core Framework

```
Hono (server/)        - Production API: all /api/* in one Netlify function
React 19.2.0          - Full SPA (production frontend)
Vite                  - SPA build tool
TanStack Router       - Client-side routing within the SPA
TanStack Query        - Server state management and caching
TypeScript 5.9.2      - Type safety
Vanilla CSS            - Semantic CSS classes (migrated from Tailwind)
Drizzle ORM           - Schema and Turso access (server/db/)
```

### Hono API (`/server`)

- **Purpose**: Production API — all `/api/*` endpoints, database access, auth, business logic
- **Deployment**: Single Netlify serverless function (`netlify/functions/api.cjs`)
- **Handles**: Notes, threads, spaces, user, referral, billing, shared content, invitations, webhooks, etc.
- **Dev**: Run with `npm run dev:all` (API on 3001, SPA on 4322)

### React SPA (`/spa`)

- **Version**: 19.2.0
- **Purpose**: Full single-page application for the authenticated user experience
- **Build Tool**: Vite
- **Entry**: `spa/src/main.tsx` → `spa/src/App.tsx`
- **Key Features**:
  - Client-side routing via TanStack Router
  - Server state via TanStack Query (with caching and stale-time tuning)
  - Persistent navigation state via localStorage
  - Route transition animations (CSS `routeFadeIn`)
  - `astro:page-load` events dispatched on route change for backward-compatible component updates

### TanStack Router

- **Purpose**: Client-side routing within the SPA
- **Route Definition**: `spa/src/router.tsx`
- **Route Tree**: Two layout groups — `AppLayout` (authenticated) and `AuthLayout` (sign-in/up)
- **Pattern**: URL slugs are bare IDs (e.g. `/thread/abc123`); DB uses prefixed IDs (`thread_abc123`)

### TanStack Query

- **Purpose**: Server state management, caching, and background refetching
- **staleTime tuning**: Thread queries 60s, note queries 30s — prevents empty-state flash on navigation
- **Pattern**: Cache hit before network; `prefetch` endpoints preload data for instant navigation

### React (shared components)

- **Purpose**: Shared React components used by the SPA: editor, navigation, panels
- **Location**: `src/components/react/`
- **Note**: The SPA imports these directly

### TypeScript

- **Version**: 5.9.2
- **Purpose**: Type safety and developer experience
- **Configuration**: Strict mode enabled
- **Path Aliases**: `@/` maps to `src/`

## Database & Auth

```
Turso (Drizzle)       - Serverless SQL database (server/db/schema.ts, ASTRO_DB_* env)
Clerk                 - Authentication and user management
```

### Astro DB / Turso

- **Purpose**: Serverless SQL database
- **Environment**: 
  - Development: Local SQLite
  - Production: Remote Turso database
- **Schema Management**: Defined in `db/config.ts`
- **Key Features**:
  - Type-safe database queries
  - Automatic migrations
  - Remote sync capabilities

### Clerk

- **Purpose**: Authentication and user management
- **Integration**: Middleware-based authentication
- **Features**:
  - User authentication
  - Session management
  - User profile data (cached in UserMetadata)
- **Environment Variables**:
  - `PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`

## UI & Editing

```
Tiptap                - Modern rich text editor
Radix UI              - Accessible component primitives
Shadcn-style          - Component design system
Font Awesome + Lucide - Icons
```

### Tiptap

- **Purpose**: Rich text editing
- **Integration**: React components
- **Features**:
  - Bold, italic, underline
  - Ordered/unordered lists
  - ProseMirror-based
  - TypeScript support

### Radix UI

- **Purpose**: Accessible component primitives
- **Usage**: Base components for complex UI patterns
- **Features**: 
  - Accessibility built-in
  - Unstyled components
  - Keyboard navigation

### Font Awesome

- **Purpose**: Icon system
- **Usage**: SVG imports from `@fortawesome/fontawesome-free/svgs/solid/`
- **Pattern**: Direct SVG imports for optimal performance

## Deployment

```
Netlify               - Serverless hosting
Output: SPA (Vite)    - Static index.html + JS/CSS (production frontend)
Output: Hono (server/)- Single serverless function for all /api/*
```

### Netlify

- **Purpose**: Serverless hosting and deployment
- **Configuration**: `netlify.toml`
- **Features**:
  - Automatic deployments
  - One serverless function for the API (Hono from `server/`)
  - Environment variable management
  - Redirect rules send app paths to `/index.html` (SPA); `/api/*` goes to the function

### Build Output

- **Build order**: `astro build` (DB/schema tooling, legacy output) then `vite build` (SPA → `dist-spa/`); `dist-spa/` is copied over `dist/`, so **production serves the SPA**.
- **SPA**: Static `index.html` + hashed JS/CSS from `spa/`, served from CDN.
- **API**: Single Netlify function (`netlify/functions/api.cjs`) handles all `/api/*` (Hono app from `server/`).

## Development Tools

### Node.js

- **Required Version**: >=20.6.1 (specified in `package.json` engines)
- **Package Manager**: npm or pnpm

### Database Tools

- **Schema Sync**: `npm run db:sync` - Sync local database schema
- **Schema Push**: `npm run db:push` - Push schema to remote
- **Schema Check**: `npm run db:check` - Verify database state

### Build Tools

- **Recommended dev**: `npm run dev:all` — Hono API (3001) + SPA (4322), production parity
- **Legacy Astro dev**: `npm run dev` — Astro dev server (port 4321), optional
- **SPA only**: `npm run dev:spa` — Vite SPA (4322); API must be running separately
- **Production build**: `npm run build` — Astro build + Vite build; `dist-spa/` copied to `dist/` (SPA is what gets served)
- **Preview**: `npm run preview` — Preview production build

## Environment Variables

### Required for Production

- `PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk publishable key (server/API)
- `VITE_CLERK_PUBLISHABLE_KEY` - Clerk publishable key (SPA/Vite build)
- `CLERK_SECRET_KEY` - Clerk secret key (server-side API)
- `ASTRO_DB_REMOTE_URL` - Remote database connection URL
- `ASTRO_DB_APP_TOKEN` - Database authentication token

### Optional

- `BIBLE_API_KEY` - Bible.org API key for scripture fetching
- `WEBFLOW_INBOX_API_TOKEN` - Webflow CMS integration (for inbox/webhook operations)
- `WEBFLOW_CHANGELOG_API_TOKEN` - Webflow CMS integration (for changelog sync, requires cms:write scope)

## Version Management

- **Automatic Version Bumps**: Via git hooks
  - `feat:` → minor bump (0.10.0 → 0.11.0)
  - `fix:` → patch bump (0.10.0 → 0.10.1)
  - `BREAKING CHANGE` → major bump (0.10.0 → 1.0.0)
- **Manual Bump**: `npm run version:bump`

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall system architecture
- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - Project organization
- [README.md](../README.md) - Quick start and setup

