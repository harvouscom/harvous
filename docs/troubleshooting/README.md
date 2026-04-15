# Troubleshooting Guide

This folder contains troubleshooting documentation for common issues encountered during development and deployment.

## Available Guides

### Database Issues
- **[Database Deployment Errors](./database-deployment-errors.md)** - Fixing UNIQUE constraint errors during Netlify deployments
- **[Auto-Tag Debugging Guide](./AUTO_TAG_DEBUGGING_GUIDE.md)** - Troubleshooting auto-tag generation issues
- **[Clerk duplicate user migration](./CLERK_DUPLICATE_USER_MIGRATION.md)** - When a user has two Clerk IDs and missing notes/threads; how to reassign data to the current account

### UI/Component Issues
- **[Close Icon Troubleshooting](./CLOSE_ICON_TROUBLESHOOTING.md)** - Fixing close icon functionality in RecentSearches component
- **[Persistent Navigation Debug](./PERSISTENT_NAVIGATION_DEBUG.md)** - Space-scoped history (`openedInSpaceIds`), close + redirect, URL-only scope on thread/note routes, Home-only threads (onboarding / My Pile), localStorage keys and console checks
- **[Closed nav items on Home / dashboard](./CLOSED_NAV_ITEMS_HOME_DASHBOARD.md)** - Dismissed threads reappearing on Home: root cause (`removeFromClosedItems` inside `addToNavigationHistory`), why spaces masked it, correct reopen path
- **[Active space changes unexpectedly](./ACTIVE_SPACE_CHANGES_UNEXPECTEDLY.md)** - Why the space switcher can update without an explicit pick (URL `?space=`, mobile sync, storage); investigation checklist and fix directions
- **[iOS PWA sheet / modal overlay vs status bar](./IOS_PWA_SHEET_OVERLAY_SAFE_AREA.md)** - Backdrop safe-area issues on installed PWA; `env()` unreliability, approaches tried, checklist
- **[Note scroll well progressive blur (deferred)](./NOTE_SCROLL_WELL_PROGRESSIVE_BLUR.md)** - Backdrop blur edges on note body scroll: muddy gray on light cards; current mask-only approach; notes if we try again

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
- See [Persistent Navigation Debug](./PERSISTENT_NAVIGATION_DEBUG.md) for space-scoped sidebar history, dismiss, and onboarding / My Pile scope issues
- Dismissed threads reappear on Home only? See [Closed nav items on Home / dashboard](./CLOSED_NAV_ITEMS_HOME_DASHBOARD.md)

## Contributing

When documenting a new troubleshooting issue:
1. Create a new markdown file with a descriptive name
2. Include: Problem description, root cause, solution steps, prevention tips
3. Add a reference in this README
4. Link to related files and code locations
