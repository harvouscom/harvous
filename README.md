# Harvous

A modern Bible study notes application built with **Astro 5** and **React Islands architecture**. Harvous provides a flexible, hierarchical organization system (Spaces → Threads → Notes) with rich text editing, auto-tagging, XP gamification, and PWA capabilities.

**Current Status**: ✅ **V1 Ready** - All core features implemented and production-ready

---

## Overview

Harvous is designed specifically for Bible study workflows, providing:

- **Flexible Organization**: Hierarchical system with Spaces → Threads → Notes
- **Rich Text Editing**: Modern Tiptap editor with formatting options
- **Auto-Tagging**: Intelligent tagging with 1000+ biblical keywords
- **Scripture Detection**: Automatic detection and parsing of Bible references
- **XP Gamification**: Points for creating content, daily bonuses, activity tracking
- **Multi-Thread Support**: Notes can belong to multiple threads
- **PWA Ready**: Installable on mobile and desktop
- **Real-Time Updates**: Event-driven architecture for instant UI updates

---

## Technology Stack

**Core Framework:**
- Astro 5.13.7 - SSR framework with View Transitions
- React 19.2.0 - Interactive islands
- TypeScript 5.9.2 - Type safety
- Vanilla CSS - Semantic CSS classes

**Database & Auth:**
- Astro DB / Turso - Serverless SQL database
- Clerk - Authentication and user management

**UI & Editing:**
- Tiptap - Modern rich text editor
- Radix UI - Accessible component primitives
- Font Awesome + Lucide - Icons

**Deployment:**
- Netlify - Serverless hosting
- Output: SSR - Server-side rendering

> For detailed technology stack information, see [docs/TECH_STACK.md](./docs/TECH_STACK.md)

---

## Key Features

- **Hierarchical Organization**: Spaces → Threads → Notes with 8-color system
- **Sequential Note IDs**: User-friendly IDs (N001, N002...) that never reuse deleted numbers
- **Auto-Tagging**: 1000+ biblical keywords with confidence scoring
- **Scripture Detection**: Automatic detection and interactive pills for Bible references
- **XP Gamification**: Points for content creation and daily bonuses
- **Multi-Thread Support**: Notes can belong to multiple threads via junction table
- **Rich Text Editing**: Tiptap editor with formatting options
- **PWA Capabilities**: Installable on mobile/desktop with offline support
- **Responsive Design**: Desktop 3-column layout, mobile stacked with bottom sheet
- **Inbox System**: Reserved for external content (Webflow CMS)

> For complete feature documentation, see [docs/FEATURES.md](./docs/FEATURES.md)

---

## Quick Start

### Prerequisites

```bash
Node.js >=20.6.1
npm or pnpm
```

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd harvous
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create `.env` file:
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

4. **Initialize database**
   ```bash
   npm run db:sync     # Sync schema
   npm run db:push     # Push to remote
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```
   Visit `http://localhost:4321`

---

## Development

### Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start dev server |
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

> For detailed architecture documentation, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

---

## Project Structure

```
harvous/
├── src/
│   ├── pages/          # Astro pages (routes)
│   ├── components/     # React islands & Astro components
│   ├── layouts/        # Page layouts
│   ├── utils/          # Utility functions
│   ├── actions/        # Server actions
│   └── styles/         # Global CSS
├── db/                 # Database schema
├── public/             # Static assets & client scripts
└── docs/               # Documentation
```

> For complete project structure, see [docs/PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md)

---

## Documentation

Complete documentation is available in the [`docs/`](./docs/) directory:

### Quick Links

- **[docs/README.md](./docs/README.md)** - Documentation index
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - System architecture
- **[docs/DATABASE.md](./docs/DATABASE.md)** - Database schema
- **[docs/COMPONENTS.md](./docs/COMPONENTS.md)** - Component system
- **[docs/DATA_FLOW.md](./docs/DATA_FLOW.md)** - Data flow diagrams
- **[docs/API.md](./docs/API.md)** - API reference
- **[docs/FEATURES.md](./docs/FEATURES.md)** - Feature documentation
- **[docs/USER_GUIDE.md](./docs/USER_GUIDE.md)** - User guide

### Documentation Categories

- **Architecture & Design**: System architecture, database schema, components, data flows
- **API & Development**: API reference, development guides, best practices
- **Features**: Feature documentation, user guides, how-to guides
- **Component Docs**: Component-specific documentation

---

## Contributing

Harvous is an open-source project! We welcome contributions from the community.

### How to Contribute

1. **Fork the repository** and clone it locally
2. **Create a branch** for your feature or fix: `git checkout -b feature/your-feature`
3. **Make your changes** and test thoroughly
4. **Commit** using conventional commits: `feat: add new feature` or `fix: resolve bug`
5. **Push** to your fork and open a Pull Request

### Development Setup

See the [Development](#development) section above for setup instructions.

### Questions or Issues?

- Open an issue on GitHub for bugs or feature requests
- Check existing issues before creating a new one
- Be respectful and constructive in all interactions

We appreciate your interest in contributing to Harvous!

---

## License

This project is licensed under a Non-Commercial License - see the [LICENSE](LICENSE) file for details.

**Summary**: Free for personal and non-commercial use. Commercial use requires explicit permission from Testament Made, LLC.

---

## Credits

Built with ❤️ for Bible study enthusiasts

**Technologies:**
- [Astro](https://astro.build) - SSR framework
- [React](https://react.dev) - Interactive components
- [Turso](https://turso.tech) - Serverless database
- [Clerk](https://clerk.com) - Authentication
- [Tiptap](https://tiptap.dev) - Rich text editing
- [Vanilla CSS](https://developer.mozilla.org/en-US/docs/Web/CSS) - Semantic CSS classes
- [Radix UI](https://radix-ui.com) - Component primitives
- [Netlify](https://netlify.com) - Hosting

---

**Version:** 0.171.2  
**Last Updated:** January 2025  
**Status:** ✅ V1 Ready - Production Release Candidate
