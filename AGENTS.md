# Harvous for AI Agents

## Quick Commands

```bash
npm run dev              # Dev server on port 4321
npm run build            # Production build
npm run db:sync          # Sync database schema
npm run db:push          # Push schema to remote
npm run db:check         # Pre-commit schema check
```

## Architecture Overview

**Harvous** is a Bible study notes app built with Astro + React Islands + Turso database. Three-level hierarchy: Spaces → Threads → Notes.

- **Frontend**: Astro pages (SSR) + React islands for interactive components
- **Database**: Astro DB (Turso) with schema in `db/config.ts`
- **Auth**: Clerk via `src/middleware.ts`
- **Rich Text**: Tiptap editor in `src/components/react/TiptapEditor.tsx`

## Project Structure

```
src/
├── pages/            # Astro routes
│   ├── dashboard.astro
│   └── api/          # API endpoints
├── components/
│   ├── react/        # React islands (interactive)
│   └── *.astro       # Static Astro components
├── utils/            # Helpers: dashboard-data, auto-tag-generator, scripture-detector
├── actions/          # Server actions for CRUD
└── styles/           # Vanilla CSS (semantic classes)
db/config.ts          # Database schema & relationships
```

## Code Style

- **TypeScript**: Strict mode, `@/` path aliases for imports
- **React Components**: Use hooks, place in `src/components/react/`, name as `PascalCase.tsx`
- **Astro Components**: Static/server-rendered only, name as `PascalCase.astro`
- **CSS**: Semantic classes (no Tailwind), CSS variables for colors, organized by component
- **Formatting**: Prettier (2 spaces, 120 char line width, trailing commas off)

## Key Patterns

- **React Islands**: Use `client:load` for critical interactive components, `client:visible` for below-fold
- **Note IDs**: Never reuse deleted IDs; track highest via `UserMetadata.highestSimpleNoteId`
- **Events**: CustomEvents for cross-component updates (e.g., `noteAddedToThread`)
- **Inline Scripts**: Only use script tags with attribute `is:inline` when you embed third‑party scripts from CDNs (analytics, SDKs, ads, etc.) OR you explicitly need a literal inline script tag in the rendered HTML instead of Astro’s bundled module behavior.

## Important Files

- `docs/ARCHITECTURE.md` - Data structures, database schema, relationships
- `docs/REACT_ISLANDS_STRATEGY.md` - Component migration patterns, implementation details
- `docs/PROJECT_STRUCTURE.md` - Directory layout, naming conventions, imports

## Database

[Astro DB (Turso)](https://docs.astro.build/en/guides/astro-db/) with remote in production. Schema defined in `db/config.ts`. Run `db:push` pre-deploy, `db:check` pre-commit.
