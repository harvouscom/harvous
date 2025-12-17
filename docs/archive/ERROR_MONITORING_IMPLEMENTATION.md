# Error Monitoring Implementation Guide

This document describes the error monitoring system for Harvous, providing comprehensive error tracking, analytics, and debugging capabilities.

## Overview

The error monitoring system captures and reports:
1. **JavaScript Errors**: Uncaught exceptions, promise rejections
2. **API Errors**: Failed requests, 500 errors, network failures
3. **User-Facing Errors**: Errors with user context
4. **Performance Issues**: Slow API calls, timeouts

## Technology: PostHog

PostHog provides:
- **Error Tracking**: Automatic bug detection
- **Session Replay**: See exactly what users are doing
- **Analytics**: Track user actions and behavior
- **Surveys**: Collect structured feedback
- **Feature Flags**: Control beta feature access

## Implementation

### 1. Installation

```bash
npm install posthog-js
```

### 2. Error Monitoring Utility

Create `src/utils/error-monitor.ts`:

```typescript
// src/utils/error-monitor.ts
import posthog from 'posthog-js';

// Initialize PostHog (only on client-side)
let isInitialized = false;

export function initErrorMonitoring() {
  if (typeof window === 'undefined') return;
  
  const posthogKey = import.meta.env.PUBLIC_POSTHOG_KEY;
  const posthogHost = import.meta.env.PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';
  
  if (!posthogKey) {
    console.warn('PostHog key not found - error monitoring disabled');
    return;
  }
  
  posthog.init(posthogKey, {
    api_host: posthogHost,
    loaded: (posthog) => {
      isInitialized = true;
      console.log('Error monitoring initialized');
    },
    capture_pageview: true,
    capture_pageleave: true,
  });
  
  // Global error handler
  window.addEventListener('error', (event) => {
    captureError({
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
      type: 'javascript_error'
    });
  });
  
  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    captureError({
      message: event.reason?.message || 'Unhandled promise rejection',
      error: event.reason,
      type: 'promise_rejection'
    });
  });
}

export function captureError(error: {
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  error?: Error;
  type?: string;
  context?: Record<string, any>;
}) {
  if (!isInitialized) {
    console.error('Error (not tracked):', error);
    return;
  }
  
  posthog.capture('error_occurred', {
    error_message: error.message,
    error_type: error.type || 'unknown',
    error_filename: error.filename,
    error_line: error.lineno,
    error_column: error.colno,
    error_stack: error.error?.stack,
    ...error.context
  });
}

export function captureAPIError(endpoint: string, status: number, error: any) {
  captureError({
    message: `API Error: ${endpoint} returned ${status}`,
    type: 'api_error',
    context: {
      endpoint,
      status_code: status,
      error_details: error
    }
  });
}

export function captureUserAction(action: string, properties?: Record<string, any>) {
  if (!isInitialized) return;
  
  posthog.capture(action, properties);
}
```

### 3. Initialize in Layout.astro

Add to `src/layouts/Layout.astro` (in the `<head>` or before closing `</body>`):

```astro
<script>
  import { initErrorMonitoring } from '@/utils/error-monitor';
  
  // Initialize error monitoring on client-side
  if (import.meta.env.PROD) {
    initErrorMonitoring();
  }
</script>
```

### 4. Environment Variables

Add to `.env` and your deployment platform:

```bash
PUBLIC_POSTHOG_KEY=phc_your_key_here
PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

### 5. Enhance API Error Handling

Update API endpoints to capture errors. Example for `src/pages/api/notes/create.ts`:

```typescript
// At the top
import { captureAPIError } from '@/utils/error-monitor';

// In the catch block
} catch (error: any) {
  // Capture error for monitoring
  if (import.meta.env.PROD) {
    captureAPIError('/api/notes/create', 500, error);
  }
  
  console.error('Error creating note:', error);
  return new Response(JSON.stringify({ 
    error: error.message || 'Failed to create note' 
  }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### 6. Track User Actions

Add tracking to key user actions:

```typescript
// In NewNotePanel.tsx after successful note creation
import { captureUserAction } from '@/utils/error-monitor';

captureUserAction('note_created', {
  note_id: newNote.id,
  thread_id: selectedThreadId,
  has_content: content.length > 0
});
```

## What to Monitor

### Critical Errors (High Priority)
- Uncaught JavaScript exceptions
- API failures (500s, network errors)
- Authentication failures
- Database errors

### User Actions (Medium Priority)
- Note creation failures
- Thread creation failures
- Search errors
- Profile update failures

### Performance Issues (Low Priority)
- Slow API responses (>2 seconds)
- Timeout errors
- Large bundle sizes

## PostHog Dashboard Setup

Once PostHog is integrated, create dashboards for:

### 1. Error Rate Dashboard
- Errors per day
- Error types breakdown
- Most common errors

### 2. User Actions Dashboard
- Note creation success rate
- Thread creation success rate
- Search usage

### 3. Performance Dashboard
- API response times
- Page load times
- Error frequency by endpoint

## Implementation Checklist

- [ ] Install PostHog: `npm install posthog-js`
- [ ] Create `src/utils/error-monitor.ts`
- [ ] Add environment variables
- [ ] Initialize in `Layout.astro`
- [ ] Add error capture to API endpoints
- [ ] Test error tracking in development
- [ ] Set up PostHog dashboard
- [ ] Configure alerts for critical errors

## Estimated Time

- Basic PostHog setup: 2-3 hours
- API error integration: 1-2 hours
- Dashboard setup: 1 hour
- **Total: ~4-6 hours**

## Alternative: Simple Custom Solution

If you want something lighter, create a simple error logger:

```typescript
// src/utils/simple-error-logger.ts
export function logError(error: Error, context?: Record<string, any>) {
  // In production, send to your own endpoint
  if (import.meta.env.PROD) {
    fetch('/api/errors/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        context,
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent,
        url: window.location.href
      })
    }).catch(() => {
      // Silently fail if error logging fails
    });
  } else {
    console.error('Error:', error, context);
  }
}
```

## Best Practices

1. **Don't Log Sensitive Data**: Never log passwords, tokens, or personal information
2. **Use Structured Logging**: Include context (user ID, action, timestamp)
3. **Set Up Alerts**: Get notified for critical errors immediately
4. **Review Regularly**: Check error dashboards weekly
5. **Track Trends**: Monitor error rates over time
6. **User Privacy**: Ensure compliance with privacy regulations

## Integration Points

### API Endpoints
All API endpoints should capture errors:
- `src/pages/api/notes/*.ts`
- `src/pages/api/threads/*.ts`
- `src/pages/api/user/*.ts`
- `src/pages/api/scripture/*.ts`

### React Components
Key user actions should be tracked:
- `src/components/react/NewNotePanel.tsx`
- `src/components/react/NewThreadPanel.tsx`
- `src/components/react/NoteDetailsPanel.tsx`
- `src/components/react/navigation/NavigationContext.tsx`

### Error Boundaries
Consider adding React error boundaries for component-level error catching.

---

**Last Updated**: January 2025  
**Status**: Implementation Guide  
**Next Steps**: Install PostHog and implement error monitoring utility

