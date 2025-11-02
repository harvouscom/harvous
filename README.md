# Harvous

A note-taking and thread management application designed specifically for Bible study. 
Aka our approach to a Bible notes app.

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

## Content Organization

Harvous uses a hierarchical system with **Spaces** → **Threads** → **Notes**:

- **Spaces**: Top-level containers with customizable colors and private/shared types
  - **Private Spaces**: Personal study spaces (e.g., "Bible Study", "Prayer Journal")
  - **Shared Spaces**: Collaborative environments for groups (e.g., "Church Small Group", "Bible Study Club")
- **Threads**: Collections of related notes with unique colors (e.g., "Gospel of John", "Psalm 23 Study")  
- **Notes**: Individual content items with rich text support

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed content organization, database schema, and implementation details.

## Development

This project is built with Astro and React islands and uses TypeScript for type safety.