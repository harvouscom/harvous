# PostHog Integration Guide

## Overview

PostHog is integrated for **product analytics, feature flags, and error/event tracking** (not surveys/feedback).

## Setup

### 1. Environment Variables

Add to your `.env` file:

```bash
PUBLIC_POSTHOG_KEY=phc_your_key_here
PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

Get your PostHog key from: https://app.posthog.com/project/settings

### 2. Installation

PostHog is already installed via `npm install posthog-js`.

### 3. Initialization

PostHog is automatically initialized in `Layout.astro` via the `PostHogInit` component. User identification happens automatically when `userId` and `userData` are passed to Layout.

## Usage

### Event Tracking

Use the analytics utilities in `src/utils/analytics.ts`:

```typescript
import { trackNoteCreated, trackThreadCreated, trackSearchPerformed } from '@/utils/analytics';

// Track note creation
trackNoteCreated({
  noteId: 'note_123',
  threadId: 'thread_456',
  method: 'manual',
  hasContent: true,
  contentLength: 150
});

// Track thread creation
trackThreadCreated({
  threadId: 'thread_456',
  spaceId: 'space_789',
  hasNotes: true
});

// Track search
trackSearchPerformed({
  query: 'bible study',
  resultsCount: 5,
  contentType: 'all'
});
```

### Direct PostHog Access

For advanced use cases, import from `src/utils/posthog.ts`:

```typescript
import { captureEvent, isFeatureEnabled, getFeatureFlag } from '@/utils/posthog';

// Capture custom event
captureEvent('custom_event', {
  property1: 'value1',
  property2: 'value2'
});

// Check feature flag
if (isFeatureEnabled('beta-feature')) {
  // Show beta feature
}

// Get feature flag value
const flagValue = getFeatureFlag('feature-flag-name');
```

### Feature Flags

1. Create feature flags in PostHog dashboard
2. Use in code:

```typescript
import { isFeatureEnabled } from '@/utils/posthog';

if (isFeatureEnabled('new-note-types')) {
  // Show new note types feature
}
```

### Error Tracking

PostHog provides comprehensive error tracking through exception autocapture and manual error capture.

#### Exception Autocapture

Exception autocapture is automatically enabled when PostHog initializes. It captures:
- Uncaught JavaScript exceptions (`window.onerror`)
- Unhandled promise rejections (`window.onunhandledrejection`)

**Note**: Exception autocapture must be enabled in PostHog project settings:
1. Go to PostHog dashboard → Project Settings → Error Tracking
2. Enable "Exception Autocapture"
3. This automatically captures `$exception` events when errors occur

#### Manual Error Capture

For custom error tracking in catch blocks:

```typescript
import { captureException } from '@/utils/posthog';

try {
  // Your code
} catch (error) {
  captureException(error, {
    context: 'note_creation',
    endpoint: '/api/notes/create',
  });
}
```

Or use the analytics utility:

```typescript
import { trackError } from '@/utils/analytics';

try {
  // Your code
} catch (error) {
  trackError({
    errorMessage: error.message,
    errorStack: error.stack,
    context: 'note_creation',
    userId: userId,
    error: error
  });
}
```

#### Viewing Errors in PostHog

1. Go to PostHog dashboard → Error Tracking
2. View all captured exceptions with stack traces
3. Filter by error type, context, or user
4. See error frequency and trends

#### Best Practices

- **Capture errors with context**: Always include `context` and `endpoint` properties
- **Don't capture sensitive data**: Never include passwords, tokens, or personal information
- **Use appropriate error types**: Distinguish between JavaScript errors, promise rejections, and API errors
- **Source maps**: For production, consider uploading source maps to PostHog for better stack traces (future enhancement)

## Privacy Settings

PostHog is configured with privacy-first settings:

- ✅ `autocapture: false` - No automatic element capture
- ✅ `respect_dnt: true` - Respects Do Not Track
- ✅ `disable_session_recording: true` - Session recording disabled by default (opt-in only)
- ✅ Only non-sensitive user data is sent (email, name, userColor)

## User Identification

Users are automatically identified when:
- `userId` and `userData` are passed to `Layout.astro`
- User data includes: email, name, displayName, userColor

## Event Tracking Checklist

Add tracking to these key actions:

- [x] PostHog initialization (automatic)
- [x] User identification (automatic)
- [ ] Note creation (`src/pages/api/notes/create.ts`)
- [ ] Thread creation (`src/pages/api/threads/create.ts`)
- [ ] Search (`src/components/SearchInput.astro` or search component)
- [ ] Profile updates (`src/pages/api/user/update-profile.ts`)
- [ ] Navigation clicks (`src/components/react/navigation/NavigationContext.tsx`)
- [ ] Panel open/close (`src/components/react/DesktopPanelManager.tsx`)

## Free Plan Limits

- **1M events/month** - Track essential events only
- **5K session recordings/month** - Disabled by default (opt-in)
- **1 year data retention**

## Next Steps

1. Get PostHog API key from dashboard
2. Add to `.env` file
3. Test in development
4. Add event tracking to key user actions
5. Set up feature flags for beta features
6. Monitor dashboards in PostHog

## Resources

- [PostHog Docs](https://posthog.com/docs)
- [PostHog JavaScript SDK](https://posthog.com/docs/integrate/client/js)
- [Feature Flags Guide](https://posthog.com/docs/feature-flags/manual)

