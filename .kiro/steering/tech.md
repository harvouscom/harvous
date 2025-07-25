# Technology Stack

## Framework & Build System
- **Astro 5.5.5** - Main framework with server-side rendering
- **TypeScript** - Strict configuration with path aliases (`@/*` → `src/*`)
- **Vite** - Build tool and dev server
- **Netlify** - Deployment adapter and hosting

## Frontend Technologies
- **Tailwind CSS 4.0** - Utility-first CSS framework
- **Alpine.js** - Lightweight JavaScript framework for interactivity
- **Trix Editor** - Rich text editing component
- **FontAwesome** - Icon library
- **Reddit Sans/Mono** - Custom font stack

## Backend & Data
- **Astro DB** - Built-in database solution
- **Clerk** - Authentication and user management
- **DOMPurify** - HTML sanitization for security

## Common Commands

### Development
```bash
npm run dev          # Start development server
npm run build        # Build for production (with remote DB)
npm run preview      # Preview production build
```

### Database
```bash
npm run db:sync      # Sync database schema
npm run db:push      # Push schema changes to remote DB
```

## Environment Setup
Required environment variables (see `.env.example`):
- `PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY` 
- `ASTRO_DB_REMOTE_URL`
- `ASTRO_DB_APP_TOKEN`