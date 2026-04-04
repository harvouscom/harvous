# Project Structure

Complete documentation of Harvous's project structure, including directory organization and file purposes.

**Production frontend:** The app served in production is the **React SPA** in `spa/`. The Netlify build runs `npm run build` (inject SW + build:api + build:spa); publish directory is `dist-spa/`. The API is a single Hono server bundled as `netlify/functions/api.cjs`.

## Directory Tree

```
harvous/
├── spa/                     # PRODUCTION FRONTEND (Vite SPA)
│   └── src/
│       ├── layouts/         # AppLayout.tsx, AuthLayout.tsx
│       ├── pages/           # DashboardPage, NotePage, ThreadPage, SpacePage, etc.
│       ├── hooks/queries/   # React Query hooks (useNote, useThread, useSpace, ...)
│       ├── router.tsx       # TanStack Router routes
│       ├── main.tsx         # Entry point, global CSS
│       ├── lib/api.ts       # API client
│       └── shims/           # e.g. astro:transitions/client for safeNavigate
│
├── src/
│   ├── components/
│   │   ├── react/          # React island components (~118 TSx)
│   │   │   ├── navigation/ # NavigationColumn, PersistentNavigation, etc.
│   │   │   ├── TiptapEditor.tsx, NewNotePanel.tsx, CardFullEditable.tsx
│   │   │   ├── NewThreadPanel.tsx, EditThreadPanel.tsx, NoteDetailsPanel.tsx
│   │   │   ├── SquareButton.tsx, Menu.tsx, BottomSheet.tsx
│   │   │   └── ...         # Panels, profile, contexts
│   │   └── ui/             # Radix UI primitives
│   │
│   ├── hooks/              # React hooks
│   │   ├── useOptimisticUpdates.ts
│   │   ├── usePWAAndNavigationRefresh.ts
│   │   └── useNavigationFeedback.ts
│   │
│   ├── scripts/            # Client/build scripts
│   │   ├── navigation-cache-client.ts
│   │   ├── navigation-close.js
│   │   ├── auth-pwa-init.ts
│   │   └── activity-panel-handler.js
│   │
│   ├── data/               # Static/data content
│   │   ├── onboarding/     # Welcome, create-organize, find markdown
│   │   ├── note-templates.ts
│   │   ├── bible-chapters.json
│   │   └── about/
│   │
│   ├── lib/                # Shared lib (e.g. utils.ts)
│   ├── utils/              # Shared utility functions
│   │   ├── scripture-detector.ts, colors.ts, validation.ts
│   │   ├── auto-tag-generator.ts, scripture-detector.ts
│   │   └── user-cache.ts, menu-options.ts, ...
│   └── styles/             # Global CSS (colors, layout, components)
│
├── server/
│   ├── db/                 # Drizzle schema (schema.ts), client (Supabase Postgres), dates
│   ├── routes/             # Hono API routes (notes, threads, user, etc.)
│   └── utils/              # Server-only utils (dashboard-data, user-cache, etc.)
│
├── public/
│   ├── scripts/            # Client-side JS
│   │   ├── navigation/     # history-tracker.js, persistent-navigation.js, unorganized-handler.js
│   │   ├── tabs/            # tab-manager.js
│   │   ├── pwa-startup.js, service-worker-manager.js
│   │   ├── session-tracker.js, profile-sync.js
│   │   ├── avatar-manager-global.js, toast-handler.js
│   │   └── haptics-handler.js
│   ├── manifest.json       # PWA manifest
│   └── sw.js               # Service worker
│
├── docs/                   # Documentation
├── drizzle.config.ts       # Drizzle Kit config (db:push)
├── package.json            # Dependencies
└── netlify.toml            # Netlify config
```

## Key Directories

### `spa/` (production frontend)

The React SPA built with Vite. This is what production and the PWA serve.

- **`spa/src/layouts/AppLayout.tsx`** - Authenticated app layout: main column with content, CreateNoteButton ("Add a note"), and ActionStrip dock (note/thread/space); third column is panels only.
- **`spa/src/pages/`** - Route-level components (DashboardPage, NotePage, ThreadPage, SpacePage, etc.).
- **`spa/src/router.tsx`** - TanStack Router route definitions.
- **`spa/src/hooks/queries/`** - React Query hooks for API data (useNote, useThread, useNavigation, etc.).
- **`spa/src/lib/api.ts`** - API client used by the SPA.

### `src/components/`

Component library organized by type.

**Subdirectories:**
- `react/` - React components used by the SPA
- `ui/` - Radix UI component primitives

**Key Components:**
- `react/navigation/NavigationColumn.tsx`, `PersistentNavigation.tsx` - Navigation
- `react/TiptapEditor.tsx`, `NewNotePanel.tsx`, `CardFullEditable.tsx` - Editing
- `react/NewThreadPanel.tsx`, `EditThreadPanel.tsx`, `NoteDetailsPanel.tsx` - Panels
- `react/SquareButton.tsx`, `Menu.tsx` - Context menus

### `src/utils/`

Shared utility functions (used by SPA and/or server via @/ alias).

**Key Files:**
- `scripture-detector.ts` - Scripture reference parsing
- `colors.ts`, `validation.ts`, `ids.ts`, `url-helpers.ts` - Shared helpers

(Server-side data and XP logic live in `server/utils/`.)

### `src/styles/`

Global CSS and styling.

**Key Files:**
- `global.css` - Global styles and CSS variables
- Component-specific CSS files (e.g., `buttons.css`, `cards.css`)

### `server/db/`

Database: Drizzle schema and Supabase Postgres client.

**Key Files:**
- `schema.ts` - Single source of truth for tables (Drizzle)
- `client.ts` - Supabase Postgres connection (`SUPABASE_DATABASE_URL` preferred; fallback `SUPABASE_DIRECT_URL`)
- `dates.ts` - nowISO(), toDate(), fromDate()

### `public/`

Static assets and client-side scripts.

**Key Files:**
- `scripts/navigation/` - history-tracker.js, persistent-navigation.js, unorganized-handler.js
- `scripts/tabs/` - tab-manager.js
- `scripts/pwa-startup.js`, `service-worker-manager.js`, `session-tracker.js`, `profile-sync.js`
- `scripts/avatar-manager-global.js`, `toast-handler.js`, `haptics-handler.js`
- `manifest.json` - PWA manifest
- `sw.js` - Service worker for offline support

### `docs/`

Documentation files organized by topic.

**Categories:**
- Architecture documentation
- Feature documentation
- Development guides
- Component documentation
- API documentation

## File Naming Conventions

### React Files
- Components: `PascalCase.tsx` (e.g., `NavigationColumn.tsx`)
- Hooks: `useCamelCase.ts` (e.g., `useNavigation.ts`)

### TypeScript Files
- Utilities: `kebab-case.ts` (e.g., `scripture-detector.ts`)

## Import Paths

### Path Aliases

- `@/` maps to `src/`
- Example: `import { function } from "@/utils/helper"`

### Common Import Patterns

```typescript
// React components
import NavigationColumn from "@/components/react/NavigationColumn";

// Utilities
import { parseScriptureReference } from "@/utils/scripture-detector";
```

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall system architecture
- [COMPONENTS.md](./COMPONENTS.md) - Component system details
- [TECH_STACK.md](./TECH_STACK.md) - Technology stack information
- [README.md](../README.md) - Quick start and setup

