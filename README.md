# Harvous

A note-taking and thread management application designed specifically for Bible study. 
Aka our approach to a Bible notes app.

## Quick Start

1. **Install dependencies**: `npm install`
2. **Start development server**: `npm run dev` (always uses port 4321)
3. **Sign in**: Use Clerk authentication to access your personal notes
4. **Create content**: Add notes, threads, and spaces to organize your Bible study

## Features

- **Flexible Organization**: Mix threads and individual notes within spaces
- **Visual Counts**: Quick indicators showing item counts in each space/thread
- **Rich Note Support**: Notes can include titles, content, and images
- **Bible Study Focused**: Designed specifically for Bible study workflows
- **Real Database**: Production-ready with Turso database and Clerk authentication
- **Sequential Note IDs**: User-friendly IDs (N001, N002, N003) that never reuse deleted numbers
- **XP System**: Gamified experience with points for creating content and daily bonuses
- **Immediate Navigation Updates**: New threads and spaces appear in navigation instantly without page refresh

## Documentation

### For Users
- **[USER_GUIDE.md](./USER_GUIDE.md)**: Complete user guide for using Harvous
- **[FEATURES.md](./FEATURES.md)**: Feature overview and examples

### For Developers
- **[ARCHITECTURE.md](./ARCHITECTURE.md)**: Core functionality, data structures, and implementation details
- **[NAVIGATION_SYSTEM_WINS.md](./NAVIGATION_SYSTEM_WINS.md)**: Navigation system development wins, learnings, and patterns
- **[Development Rules](#development)**: Setup, workflow, and best practices

## Content Organization

Harvous uses a hierarchical system with **Spaces** → **Threads** → **Notes**:

- **Spaces**: Top-level containers with customizable colors and private/shared types
  - **Private Spaces**: Personal study spaces (e.g., "Bible Study", "Prayer Journal")
  - **Shared Spaces**: Collaborative environments for groups (e.g., "Church Small Group", "Bible Study Club")
- **Threads**: Collections of related notes with unique colors (e.g., "Gospel of John", "Psalm 23 Study")  
- **Notes**: Individual content items with rich text support

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed content organization, database schema, and implementation details.

## Development

This project is built with Astro and uses TypeScript for type safety.

### Development Server

- **Port**: Always use port 4321 for development
- **URL**: http://localhost:4321/
- **Start**: `npm run dev`
- **Kill busy port**: `lsof -ti:4321 | xargs kill -9`

### Development Workflow

- **Real Database**: Uses Turso database with Clerk authentication
- **User Authentication**: Sign in to access your personal data
- **Data Persistence**: All content is automatically saved and available across sessions
- **Astro MCP**: Always consult Astro MCP for component development and best practices
- **Alpine.js**: Use proper syntax with `x-data`, `x-on:click`, `x-show`, etc. - NO inline `onclick` handlers

### Key Development Rules

- **ALWAYS use port 4321** - never use other ports
- **ALWAYS consult ARCHITECTURE.md** for core functionality and implementation details
- **ALWAYS test functionality** before declaring it complete
- **ALWAYS check for linting errors** after making changes
- **Update documentation** when making architectural changes

### Troubleshooting

#### Common Issues

- **Port 4321 in use**: Kill other processes using the port or restart your terminal
- **Database locked**: Restart the development server to clear database locks
- **Empty dashboard**: Check console for database connection errors
- **Panels opening by default**: Clear browser localStorage or check panel state initialization

#### Dashboard Not Showing Content

If the dashboard appears empty or doesn't load content:

1. **Check Browser Console**: Look for JavaScript errors or database connection issues
2. **Check Terminal**: Look for `SQLITE_BUSY` or database connection errors
3. **Database Issues**: If you see `SQLITE_BUSY: database is locked`, restart the dev server
4. **Panel State Issues**: If panels open by default, check localStorage in browser dev tools

For detailed troubleshooting, implementation details, and technical architecture, see [ARCHITECTURE.md](./ARCHITECTURE.md).
