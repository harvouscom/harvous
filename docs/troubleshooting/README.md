# Troubleshooting Guide

This folder contains troubleshooting documentation for common issues encountered during development and deployment.

## Available Guides

### Sync and multi-device
- **[Cross-platform sync](./CROSS_PLATFORM_SYNC.md)** — Mac Debug vs production web, Debug-Prod checklist, native scheduler and prototype React Query refresh
- **[Note body truncated at ~2000 characters](./NOTE_BODY_TRUNCATION.md)** — note full on one device, hard-cut on another: list-payload preview written back over the note; guards, diagnostic script, and how to restore from `NoteVersions`

### Database Issues
- **[Database Deployment Errors](./database-deployment-errors.md)** - Fixing UNIQUE constraint errors during Netlify deployments
- **[Auto-Tag Debugging Guide](./AUTO_TAG_DEBUGGING_GUIDE.md)** - Troubleshooting auto-tag generation issues
- **[Clerk duplicate user migration](./CLERK_DUPLICATE_USER_MIGRATION.md)** - When a user has two Clerk IDs and missing notes/threads; how to reassign data to the current account
- **[Clerk unexpected sign-outs](./CLERK_SESSION_SIGN_OUT.md)** - Weekly email-code re-login on Hobby plan, browser cookie limits, what is expected vs fixable
- **Missing `SyncDeletedEntities` relation during native sync** - If `/api/sync/changes` returns 500 with `relation "SyncDeletedEntities" does not exist`, run `npm run db:push` against the active Supabase project

### UI/Component Issues
- **[Prototype Aw Snap (error 5)](./PROTOTYPE_AW_SNAP_ERROR_5.md)** - Chrome tab crash on `/prototype` (~5s): wallpaper/GPU compositor vs sync/list payload; bisect steps and code pointers
- **[Close Icon Troubleshooting](./CLOSE_ICON_TROUBLESHOOTING.md)** - Fixing close icon functionality in RecentSearches component
- **[Persistent Navigation Debug](./PERSISTENT_NAVIGATION_DEBUG.md)** - Space-scoped history (`openedInSpaceIds`), close + redirect, URL-only scope on thread/note routes, Home-only threads (onboarding / My Pile), localStorage keys and console checks
- **[Closed nav items on Home / dashboard](./CLOSED_NAV_ITEMS_HOME_DASHBOARD.md)** - Dismissed threads reappearing on Home: root cause (`removeFromClosedItems` inside `addToNavigationHistory`), why spaces masked it, correct reopen path
- **[Active space changes unexpectedly](./ACTIVE_SPACE_CHANGES_UNEXPECTEDLY.md)** - Why the space switcher can update without an explicit pick (URL `?space=`, mobile sync, storage); investigation checklist and fix directions
- **[Multi-space thread: stale URL scope](./MULTI_SPACE_THREAD_STALE_URL_SCOPE.md)** - Same thread in two spaces: wrong default space or close feels stuck; `openedInSpaceIds` vs `?space=`, what to verify in the URL and `harvous-navigation-history-v2`
- **[iOS PWA sheet / modal overlay vs status bar](./IOS_PWA_SHEET_OVERLAY_SAFE_AREA.md)** - Backdrop safe-area issues on installed PWA; `env()` unreliability, approaches tried, checklist
- **[Note scroll well progressive blur (deferred)](./NOTE_SCROLL_WELL_PROGRESSIVE_BLUR.md)** - Backdrop blur edges on note body scroll: muddy gray on light cards; current mask-only approach; notes if we try again
- **[iOS SwiftUI TextField layout warning](./IOS_SWIFTUI_TEXTFIELD_LAYOUT_WARNING.md)** - `PlatformTextFieldAdaptor` / `maximum length` console spam on native iOS; benign layout diagnostic, bisect steps, and field layout rules

## Quick Reference

### Common Issues

**Database schema not deployed?**
- See [Database Deployment Errors](./database-deployment-errors.md)
- Run `npm run db:push` manually

**Native app sync failing with `SyncDeletedEntities` missing?**
- Symptom: `GET /api/sync/changes` -> 500 and `relation "SyncDeletedEntities" does not exist`
- Fix: run `npm run db:push`, then relaunch app and re-test sync/note creation

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
