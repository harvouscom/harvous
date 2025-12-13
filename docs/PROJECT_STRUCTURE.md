# Project Structure

Complete documentation of Harvous's project structure, including directory organization and file purposes.

## Directory Tree

```
harvous/
├── src/
│   ├── pages/              # Astro pages (routes)
│   │   ├── index.astro     # Landing page
│   │   ├── dashboard.astro # Main dashboard
│   │   ├── [id].astro      # Dynamic thread/note/space view
│   │   ├── profile.astro   # User profile
│   │   └── api/            # API endpoints
│   │       ├── notes/      # Note operations
│   │       ├── threads/    # Thread operations
│   │       ├── user/       # User operations
│   │       └── scripture/  # Scripture operations
│   │
│   ├── components/
│   │   ├── react/          # React island components
│   │   │   ├── TiptapEditor.tsx
│   │   │   ├── NavigationColumn.tsx
│   │   │   ├── NewNotePanel.tsx
│   │   │   ├── NoteDetailsPanel.tsx
│   │   │   └── BottomSheet.tsx
│   │   ├── ui/             # Radix UI components
│   │   └── *.astro         # Astro components
│   │
│   ├── layouts/            # Page layouts
│   │   └── Layout.astro    # Main layout
│   │
│   ├── utils/              # Utility functions
│   │   ├── dashboard-data.ts    # Data fetching
│   │   ├── xp-system.ts         # XP logic
│   │   ├── auto-tag-generator.ts # Auto-tagging
│   │   ├── scripture-detector.ts # Scripture parsing
│   │   └── user-cache.ts        # Clerk data caching
│   │
│   ├── actions/            # Server actions
│   └── styles/             # Global CSS
│
├── db/
│   ├── config.ts           # Database schema
│   └── seed.ts             # Seed data
│
├── public/
│   ├── scripts/            # Client-side JS
│   │   ├── navigation/     # Navigation tracking
│   │   └── pwa-startup.js  # PWA initialization
│   ├── manifest.json       # PWA manifest
│   └── sw.js               # Service worker
│
├── docs/                    # Documentation
├── *.md                     # Root documentation files
├── astro.config.mjs         # Astro configuration
├── package.json             # Dependencies
└── netlify.toml             # Netlify config
```

## Key Directories

### `src/pages/`

Astro pages that define routes. Each `.astro` file becomes a route.

**Key Files:**
- `dashboard.astro` - Main dashboard with inbox and organized content
- `[id].astro` - Dynamic routing for threads, notes, and spaces
- `profile.astro` - User profile page with XP display
- `api/` - API endpoints organized by resource type

### `src/components/`

Component library organized by type.

**Subdirectories:**
- `react/` - React island components (client-hydrated)
- `ui/` - Radix UI component primitives
- `*.astro` - Astro components (server-rendered)

**Key Components:**
- `NavigationColumn.tsx` - Main navigation
- `TiptapEditor.tsx` - Rich text editor
- `CardNote.astro` - Note preview cards
- `CardStack.astro` - Stacked card container

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
- `scripts/` - Client-side JavaScript
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
- Actions: `kebab-case.ts` (e.g., `note-threads.ts`)

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

