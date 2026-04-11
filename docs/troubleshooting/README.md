# Troubleshooting Guide

This folder contains troubleshooting documentation for common issues encountered during development and deployment.

## Available Guides

### Database Issues
- **[Database Deployment Errors](./database-deployment-errors.md)** - Fixing UNIQUE constraint errors during Netlify deployments
- **[Auto-Tag Debugging Guide](./AUTO_TAG_DEBUGGING_GUIDE.md)** - Troubleshooting auto-tag generation issues
- **[Clerk duplicate user migration](./CLERK_DUPLICATE_USER_MIGRATION.md)** - When a user has two Clerk IDs and missing notes/threads; how to reassign data to the current account

### UI/Component Issues
- **[Close Icon Troubleshooting](./CLOSE_ICON_TROUBLESHOOTING.md)** - Fixing close icon functionality in RecentSearches component
- **[Persistent Navigation Debug](./PERSISTENT_NAVIGATION_DEBUG.md)** - Debugging persistent navigation close functionality and thread duplication
- **[Active space changes unexpectedly](./ACTIVE_SPACE_CHANGES_UNEXPECTEDLY.md)** - Why the space switcher can update without an explicit pick (URL `?space=`, mobile sync, storage); investigation checklist and fix directions
- **[iOS PWA sheet / modal overlay vs status bar](./IOS_PWA_SHEET_OVERLAY_SAFE_AREA.md)** - Backdrop safe-area issues on installed PWA; `env()` unreliability, approaches tried, checklist

## Quick Reference

### Common Issues

**Database schema not deployed?**
- See [Database Deployment Errors](./database-deployment-errors.md)
- Run `npm run db:push` manually

**Features work locally but not in production?**
- Check database schema deployment
- See [Auto-Tag Debugging Guide](./AUTO_TAG_DEBUGGING_GUIDE.md) for debugging strategy

**Component event handling not working?**
- See [Close Icon Troubleshooting](./CLOSE_ICON_TROUBLESHOOTING.md) for event propagation issues
- See [Persistent Navigation Debug](./PERSISTENT_NAVIGATION_DEBUG.md) for navigation-specific issues

## Contributing

When documenting a new troubleshooting issue:
1. Create a new markdown file with a descriptive name
2. Include: Problem description, root cause, solution steps, prevention tips
3. Add a reference in this README
4. Link to related files and code locations
