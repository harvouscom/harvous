# Project Structure

## Root Level
- `astro.config.mjs` - Astro configuration with integrations
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration with path aliases
- `.env` / `.env.example` - Environment variables

## Database (`/db`)
- `config.ts` - Astro DB schema definitions
- `seed.ts` - Database seeding scripts

## Source Code (`/src`)

### Core Files
- `middleware.ts` - Clerk authentication middleware
- `env.d.ts` - TypeScript environment declarations
- `entrypoint.ts` - Application entry point

### Components (`/src/components`)
- Astro components using `.astro` extension
- Import paths use `@/` alias for `src/`
- Two component sets: main components and `_vibe/` variants
- Common components: `NoteCard`, `TrixEditor`, `IconButton`, etc.

### Pages (`/src/pages`)
- File-based routing with Astro conventions
- Protected routes under `/dashboard` (requires auth)
- Experimental `_vibe` route variants
- Dynamic routes use `[...id]` pattern for catch-all segments

### Styles (`/src/styles`)
- `global.css` - Global styles with Tailwind imports and CSS variables
- `animations.css` - Animation definitions
- Custom CSS variables for design system colors and shadows

### Actions (`/src/actions`)
- Server-side actions for data operations
- `notes.ts` - Note CRUD operations

## Coding Conventions

### Astro Components
- Use TypeScript in frontmatter with `interface Props`
- Import external libraries at component level
- Sanitize user content with DOMPurify
- Use CSS variables for theming

### Styling
- Tailwind utility classes preferred
- Custom CSS variables defined in `:root`
- Component-specific styles in `<style>` blocks
- Typography classes: `.text-title`, `.text-body`, etc.

### Authentication
- All `/dashboard` routes protected by Clerk middleware
- User ID available via `auth()` helper
- Redirect unauthenticated users to sign-in