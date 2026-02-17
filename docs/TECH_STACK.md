# Technology Stack

Complete technology stack documentation for Harvous, including versions, dependencies, and deployment configuration.

## Architecture Overview

Harvous runs as a **dual-app monorepo**:

- **`/` (root)** — Astro SSR app: handles API endpoints, database access, auth middleware, and public/shared pages (sign-in, shared notes, shared threads, invitations). Also serves as the static host for the SPA.
- **`/spa`** — React SPA: the authenticated app shell. A Vite-built single-page app that handles all authenticated routes (`/`, `/thread/*`, `/note/*`, `/space/*`, `/profile`, etc.).

At runtime, Netlify routes authenticated app paths to `spa/index.html`, while API routes and public pages are served by the Astro SSR layer.

## Core Framework

```
Astro 5.x             - SSR layer: API endpoints, auth middleware, public pages
React 19.2.0          - Full SPA for authenticated app shell
TanStack Router       - Client-side routing within the SPA
TanStack Query        - Server state management and caching
TypeScript 5.9.2      - Type safety
Vanilla CSS            - Semantic CSS classes (migrated from Tailwind)
```

### Astro (SSR Layer)

- **Purpose**: API endpoints, database access, auth middleware, and public/unauthenticated pages
- **Output**: SSR (Server-Side Rendering) via Netlify adapter
- **Handles**:
  - All `/api/*` routes
  - `/sign-in`, `/sign-up`
  - `/shared/note/*`, `/shared/thread/*`
  - `/spaces/join/*`, `/invitations/*`
  - `/upgrade`
  - Serves `spa/dist/index.html` for SPA routes

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

### React (within Astro — legacy pattern)

- **Purpose**: Shared React components used by both SPA and Astro pages (editor, navigation, panels)
- **Location**: `src/components/react/`
- **Note**: The SPA imports these shared components directly; Astro pages use `client:` hydration directives

### TypeScript

- **Version**: 5.9.2
- **Purpose**: Type safety and developer experience
- **Configuration**: Strict mode enabled
- **Path Aliases**: `@/` maps to `src/`

## Database & Auth

```
Astro DB / Turso      - Serverless SQL database
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
Output: SSR (Astro)   - API routes and public pages
Output: SPA (Vite)    - Authenticated app shell (static HTML/JS/CSS)
```

### Netlify

- **Purpose**: Serverless hosting and deployment
- **Configuration**: `netlify.toml`
- **Features**:
  - Automatic deployments
  - Serverless functions (Astro API routes)
  - Environment variable management
  - Redirect rules route SPA paths to `spa/dist/index.html`

### Build Output

- **Astro layer**: SSR serverless functions for all `/api/*` routes and public pages
- **SPA layer**: Static `spa/dist/` — `index.html` + hashed JS/CSS bundles, served from CDN
- **API Routes**: Netlify serverless functions (from Astro)

## Development Tools

### Node.js

- **Required Version**: >=20.6.1 (specified in `package.json` engines)
- **Package Manager**: npm or pnpm

### Database Tools

- **Schema Sync**: `npm run db:sync` - Sync local database schema
- **Schema Push**: `npm run db:push` - Push schema to remote
- **Schema Check**: `npm run db:check` - Verify database state

### Build Tools

- **Astro dev server**: `npm run dev` — Start Astro SSR dev server (port 4321)
- **SPA dev server**: `cd spa && npm run dev` — Start Vite SPA dev server (port 5173)
- **Build (Astro)**: `npm run build` — Build Astro SSR output
- **Build (SPA)**: `cd spa && npm run build` — Build Vite SPA to `spa/dist/`
- **Preview**: `npm run preview` — Preview Astro production build

## Environment Variables

### Required for Production

- `PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk publishable key (used by Astro layer)
- `VITE_CLERK_PUBLISHABLE_KEY` - Clerk publishable key (used by the SPA/Vite build)
- `CLERK_SECRET_KEY` - Clerk secret key (server-side Astro only)
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

