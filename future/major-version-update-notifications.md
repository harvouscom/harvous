# Major Version Update Notifications

## Current Implementation (v1.27.2+)

As of v1.27.2, the app has **automatic update notifications** for minor and patch releases:

- **Minor/Patch Updates (1.27.2 → 1.27.3, 1.27.x → 1.28.0)**: Toast shows "New update available, refreshing app" then auto-refreshes after 2 seconds
- **Major Updates (1.x.x → 2.0.0)**: Service worker detects the major version change and **skips automatic reload** to give users control

**Implementation**: [`service-worker-manager.js`](../public/scripts/service-worker-manager.js) compares cache name versions and only auto-reloads for non-major updates.

## Problem to Solve

When a major version update (e.g., 2.0.0) is available, users need to:
1. Be notified that an update exists
2. Understand why this update matters (what's new, what's changed)
3. Choose when to update (since major updates may have breaking changes or new features they want to prepare for)

Currently, major updates are silently skipped with only a console log.

## Proposed Solution: Smart Major Update Notification

### Option 1: Enhanced Toast with Actions

Show a persistent toast notification when a major update is detected:

**Toast Design:**
```
┌─────────────────────────────────────────────┐
│  🎉 Harvous 2.0 is available!              │
│                                             │
│  [Update Now]  [See What's New]            │
└─────────────────────────────────────────────┘
```

**Behavior:**
- **Update Now**: Immediately refreshes the app to load v2.0
- **See What's New**: Opens a panel/modal with release notes
  - After reading, user can choose to update or dismiss
  - Dismissed updates show a subtle indicator in the profile menu
- Toast persists until user interacts (doesn't auto-dismiss)
- Uses `toast.info()` with action buttons (similar to `toast.errorWithAction()` pattern in [`toast.ts`](../src/utils/toast.ts))

**Implementation:**
- Modify [`service-worker-manager.js`](../public/scripts/service-worker-manager.js) to show this toast instead of skipping on major updates
- Fetch release notes from `/api/releases/latest` or embed in service worker
- Store dismissed updates in `localStorage` to avoid re-showing

### Option 2: Harvous Inbox Integration (Recommended)

Leverage the **existing Harvous inbox system** (currently disabled) to deliver major update notifications:

**Why This Makes Sense:**
- Inbox is designed for important notifications that users can action
- Already has UI for displaying rich content (title, description, actions)
- Users are familiar with the inbox pattern
- Non-intrusive - users can check when convenient
- Can include rich content: changelog, screenshots, video demos

**Inbox Item Design:**
```json
{
  "id": "update-v2.0.0",
  "contentType": "system",
  "title": "Harvous 2.0 is Now Available",
  "subtitle": "New features, improved performance, and more",
  "content": "<Rich HTML description of update>",
  "imageUrl": "/images/v2-hero.png",
  "actions": [
    { "label": "Update Now", "action": "reload" },
    { "label": "View Release Notes", "action": "open-url", "url": "/release-notes/2.0.0" }
  ],
  "priority": "high",
  "dismissible": true
}
```

**User Flow:**
1. Major update detected → Service worker adds item to inbox
2. User sees inbox badge/indicator (1 new item)
3. User opens inbox when convenient
4. Sees update notification with rich content
5. Can read details, watch demo, then choose to update
6. Can dismiss if they want to update later (shows again in 7 days)

**Benefits:**
- Re-enables the inbox system with a clear use case
- Less intrusive than persistent toasts
- Better context for major updates (can include detailed info)
- Follows app's existing patterns
- Can be expanded for other system notifications (maintenance, new features, etc.)

**Implementation:**
- Re-enable inbox system in [`Layout.astro`](../src/layouts/Layout.astro)
- Create `/api/inbox/system-notifications` endpoint
- Modify [`service-worker-manager.js`](../public/scripts/service-worker-manager.js) to post to inbox API on major update detection
- Store notification in database with user dismissal tracking
- Inbox UI already exists in [`NavigationColumn.tsx`](../src/components/react/navigation/NavigationColumn.tsx)

### Option 3: Hybrid Approach (Best of Both Worlds)

Combine both methods for maximum reach:

1. **Initial Toast**: "🎉 Harvous 2.0 is available! Check your inbox for details"
   - Non-blocking, auto-dismisses after 5 seconds
   - Sets inbox badge to highlight the notification
   
2. **Inbox Notification**: Full rich content about the update
   - Persistent until user engages with it
   - Detailed changelog, screenshots, etc.
   - Action buttons for update or dismiss

**Benefits:**
- Immediate awareness (toast)
- Detailed information when ready (inbox)
- Non-intrusive but informative
- Leverages existing UI patterns

## Implementation Considerations

### Version Detection
- Current: Parses cache names (`harvous-cache-v1-27-2`)
- Works well, no changes needed
- Consider adding version meta tag to HTML for easier access: `<meta name="app-version" content="1.27.2">`

### Release Notes Storage
- **Option A**: Embed in service worker (limited, but offline-first)
- **Option B**: Fetch from API (flexible, requires network)
- **Option C**: Fetch from static files in `/release-notes/` (best of both worlds)

### User Preferences
- Allow users to opt-out of major update notifications? (probably not - these are important)
- Frequency of re-showing dismissed updates (suggestion: 7 days)
- Store preferences in `UserSettings` table

### Timing
- When to show notification?
  - Immediately on detection?
  - On next app open after detection?
  - **Recommended**: On next page navigation after detection (less jarring)

## Next Steps

1. **Decision**: Choose between Option 1, 2, or 3
2. **Design**: Create mockups for toast/inbox notification UI
3. **Implement**: 
   - Update service worker manager
   - Create inbox integration or enhanced toast
   - Test major version update flow
4. **Document**: Update user docs to explain update process

## Related Files

- [`service-worker-manager.js`](../public/scripts/service-worker-manager.js) - Current implementation
- [`toast.ts`](../src/utils/toast.ts) - Toast system
- [`NavigationColumn.tsx`](../src/components/react/navigation/NavigationColumn.tsx) - Inbox UI
- [`/api/inbox/`](../src/pages/api/inbox/) - Inbox API endpoints (currently disabled)
- [`/release-notes/`](../release-notes/) - Existing release notes (markdown)

## Notes

- Major version updates might include database schema changes, so giving users time to prepare is important
- Consider showing update progress/loading state during refresh
- Test thoroughly with mock major version bumps
- Consider A/B testing different notification approaches with real users
