# Technology Stack

Complete technology stack documentation for Harvous, including versions, dependencies, and deployment configuration.

## Core Framework

```
Astro 5.13.7          - SSR framework with View Transitions
React 19.2.0          - Interactive islands
TypeScript 5.9.2      - Type safety
Vanilla CSS            - Semantic CSS classes (migrated from Tailwind)
```

### Astro

- **Version**: 5.13.7
- **Purpose**: Server-side rendering framework with View Transitions
- **Output**: SSR (Server-Side Rendering)
- **Key Features**:
  - React Islands architecture
  - View Transitions for smooth navigation
  - Built-in routing
  - API endpoints

### React

- **Version**: 19.2.0
- **Purpose**: Interactive component islands
- **Integration**: Used with Astro's `client:` directives
- **Key Features**:
  - Client-side interactivity
  - Component hydration on demand
  - React Context for state management

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
Output: SSR           - Server-side rendering
```

### Netlify

- **Purpose**: Serverless hosting and deployment
- **Configuration**: `netlify.toml`
- **Features**:
  - Automatic deployments
  - Serverless functions
  - Edge functions support
  - Environment variable management

### Build Output

- **Mode**: SSR (Server-Side Rendering)
- **Static Assets**: Served from CDN
- **API Routes**: Serverless functions

## Development Tools

### Node.js

- **Required Version**: >=20.6.1 (specified in `package.json` engines)
- **Package Manager**: npm or pnpm

### Database Tools

- **Schema Sync**: `npm run db:sync` - Sync local database schema
- **Schema Push**: `npm run db:push` - Push schema to remote
- **Schema Check**: `npm run db:check` - Verify database state

### Build Tools

- **Development**: `npm run dev` - Start dev server (port 4321)
- **Build**: `npm run build` - Build for production
- **Preview**: `npm run preview` - Preview production build

## Environment Variables

### Required for Production

- `PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk publishable key (public)
- `CLERK_SECRET_KEY` - Clerk secret key (server-side only)
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

