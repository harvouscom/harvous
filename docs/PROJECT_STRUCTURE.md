# Project Structure

Complete documentation of Harvous's project structure, including directory organization and file purposes.

**Production frontend:** The app served in production is the **React SPA** in `spa/`. The Netlify build runs `astro build` then `vite build` and copies `dist-spa/` over `dist/`, so the SPA's `index.html` and assets are what users receive. The Astro pages under `src/pages/*.astro` are used only for local development (`npm run dev`) and are not served in production.

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
│   ├── pages/              # Astro pages (routes)
│   │   ├── index.astro     # Landing page
│   │   ├── dashboard.astro # Main dashboard
│   │   ├── find.astro      # Find/search page
│   │   ├── profile.astro   # User profile
│   │   ├── new-space.astro # Space creation
│   │   ├── space.astro     # Space view (redirect/legacy)
│   │   ├── sign-in.astro   # Clerk sign-in
│   │   ├── sign-up.astro   # Clerk sign-up
│   │   ├── logout.astro    # Logout
│   │   ├── upgrade.astro   # Upgrade/billing
│   │   ├── [...slug].astro # Dynamic thread/note/space view (catch-all)
│   │   ├── invitations/[token].astro  # Space invite accept/decline
│   │   ├── shared/note/[shareToken].astro  # Shared note preview
│   │   ├── shared/thread/[shareToken].astro # Shared thread preview
│   │   ├── spaces/join/[token].astro  # Join shared space
│   │   └── api/            # API endpoints
│   │       ├── notes/      # Note CRUD, add-thread, comments, share, etc.
│   │       ├── threads/    # Thread CRUD, share, notes, prefetch
│   │       ├── spaces/     # Space CRUD, items, members, invite, join
│   │       ├── user/       # Profile, XP, limits, session, locked-notes, etc.
│   │       ├── scripture/  # Detect, fetch-verse, check-existing
│   │       ├── inbox/      # Inbox preview, archive, add-to-harvous, etc.
│   │       ├── shared/     # Shared note/thread add-to-harvous
│   │       ├── invitations/ # Accept, decline, index
│   │       ├── navigation/ # data.ts
│   │       ├── billing/    # checkout, downgrade
│   │       ├── referral/   # credit, status
│   │       ├── webhooks/   # clerk
│   │       ├── webflow/    # sync-inbox, webhook
│   │       └── ...         # admin, content, tags, resource, sync, test, etc.
│   │
│   ├── components/
│   │   ├── react/          # React island components (~118 TSx)
│   │   │   ├── navigation/ # NavigationColumn, PersistentNavigation, etc.
│   │   │   ├── TiptapEditor.tsx, NewNotePanel.tsx, CardFullEditable.tsx
│   │   │   ├── NewThreadPanel.tsx, EditThreadPanel.tsx, NoteDetailsPanel.tsx
│   │   │   ├── SquareButton.tsx, Menu.tsx, BottomSheet.tsx
│   │   │   └── ...         # Panels, profile, contexts
│   │   ├── ui/             # Radix UI primitives
│   │   └── *.astro         # Astro components (CardNote, CardStack, SpaceButton, etc.)
│   │
│   ├── layouts/            # Page layouts
│   │   └── Layout.astro    # Main layout
│   │
│   ├── hooks/              # React hooks
│   │   ├── useOptimisticUpdates.ts
│   │   ├── usePWAAndNavigationRefresh.ts
│   │   ├── useBottomSheetDrag.ts
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
│   ├── utils/              # Utility functions
│   │   ├── dashboard-data.ts, xp-system.ts
│   │   ├── auto-tag-generator.ts, scripture-detector.ts
│   │   └── user-cache.ts, menu-options.ts, ...
│   │
│   ├── actions/            # Server actions
│   │   ├── notes.ts, threads.ts, noteThreads.ts
│   │   └── api/threads.ts
│   └── styles/             # Global CSS (colors, layout, components)
│
├── db/
│   ├── config.ts           # Database schema
│   └── seed.ts             # Seed data
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
├── *.md                    # Root documentation files
├── astro.config.mjs        # Astro configuration
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

### `src/pages/`

Astro pages that define routes (development only; not served in production). Each `.astro` file becomes a route.

**Key Files:**
- `dashboard.astro` - Main dashboard with inbox and organized content
- `[...slug].astro` - Dynamic catch-all routing for threads, notes, and spaces
- `find.astro` - Find/search page
- `profile.astro` - User profile page with XP display
- `new-space.astro` - Space creation
- `sign-in.astro`, `sign-up.astro`, `logout.astro` - Auth (Clerk)
- `upgrade.astro` - Billing/upgrade
- `invitations/[token].astro` - Space invite accept/decline
- `shared/note/[shareToken].astro`, `shared/thread/[shareToken].astro` - Shared content preview
- `spaces/join/[token].astro` - Join shared space
- `api/` - API endpoints (notes, threads, spaces, user, inbox, shared, billing, webhooks, etc.)

### `src/components/`

Component library organized by type.

**Subdirectories:**
- `react/` - React island components (client-hydrated)
- `ui/` - Radix UI component primitives
- `*.astro` - Astro components (server-rendered)

**Key Components:**
- `react/navigation/NavigationColumn.tsx`, `PersistentNavigation.tsx` - Navigation
- `react/TiptapEditor.tsx`, `NewNotePanel.tsx`, `CardFullEditable.tsx` - Editing
- `react/NewThreadPanel.tsx`, `EditThreadPanel.tsx`, `NoteDetailsPanel.tsx` - Panels
- `react/SquareButton.tsx`, `Menu.tsx` - Context menus (SquareButton also has Astro wrapper)
- `CardNote.astro`, `CardStack.astro`, `SpaceButton.astro` - Astro cards and layout

### `src/utils/`

Utility functions for common operations.

**Key Files:**
- `dashboard-data.ts` - Dashboard data fetching and processing
- `xp-system.ts` - XP calculation and awarding
- `auto-tag-generator.ts` - Auto-tagging logic
- `scripture-detector.ts` - Scripture reference parsing
- `user-cache.ts` - Clerk user data caching

### `src/actions/`

Server actions for database operations.

**Key Files:**
- `notes.ts` - Note CRUD operations
- `threads.ts` - Thread CRUD operations
- `noteThreads.ts` - Note-thread relationship management

### `src/styles/`

Global CSS and styling.

**Key Files:**
- `global.css` - Global styles and CSS variables
- Component-specific CSS files (e.g., `buttons.css`, `cards.css`)

### `db/`

Database configuration and schema.

**Key Files:**
- `config.ts` - Database schema definitions
- `seed.ts` - Seed data for development

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

### Astro Files
- Pages: `kebab-case.astro` (e.g., `dashboard.astro`)
- Components: `PascalCase.astro` (e.g., `CardNote.astro`)
- Layouts: `PascalCase.astro` (e.g., `Layout.astro`)

### React Files
- Components: `PascalCase.tsx` (e.g., `NavigationColumn.tsx`)
- Hooks: `useCamelCase.ts` (e.g., `useNavigation.ts`)

### TypeScript Files
- Utilities: `kebab-case.ts` (e.g., `dashboard-data.ts`)
- Actions: `camelCase.ts` (e.g., `notes.ts`, `threads.ts`, `noteThreads.ts`)

## Import Paths

### Path Aliases

- `@/` maps to `src/`
- Example: `import { function } from "@/utils/helper"`

### Common Import Patterns

```typescript
// Astro components
import CardNote from "@/components/CardNote.astro";

// React components
import NavigationColumn from "@/components/react/NavigationColumn";

// Utilities
import { getDashboardData } from "@/utils/dashboard-data";

// Actions
import { createNote } from "@/actions/notes";
```

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall system architecture
- [COMPONENTS.md](./COMPONENTS.md) - Component system details
- [TECH_STACK.md](./TECH_STACK.md) - Technology stack information
- [README.md](../README.md) - Quick start and setup

