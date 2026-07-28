/**
 * Analytics Event Tracking Utilities
 *
 * Provides type-safe event tracking functions for PostHog.
 * Use these throughout the app to track user actions.
 * Do not send note body, verse text, or raw search strings.
 */

import { captureEvent, captureException } from './posthog';

/**
 * Track note creation
 */
export function trackNoteCreated(data: {
  noteId: string;
  threadId?: string;
  spaceId?: string;
  method?: 'manual' | 'auto';
  hasContent: boolean;
  contentLength?: number;
  offline?: boolean;
}) {
  captureEvent('note_created', {
    note_id: data.noteId,
    thread_id: data.threadId,
    space_id: data.spaceId,
    method: data.method || 'manual',
    has_content: data.hasContent,
    content_length: data.contentLength,
    offline: data.offline === true,
  });
}

/**
 * Track thread creation
 */
export function trackThreadCreated(data: {
  threadId: string;
  spaceId?: string;
  hasNotes: boolean;
}) {
  captureEvent('thread_created', {
    thread_id: data.threadId,
    space_id: data.spaceId,
    has_notes: data.hasNotes,
  });
}

/**
 * Track note page/detail opened
 */
export function trackNoteOpened(data: { noteId: string; spaceId?: string }) {
  captureEvent('note_opened', {
    note_id: data.noteId,
    space_id: data.spaceId,
  });
}

/**
 * Track thread page/detail opened
 */
export function trackThreadOpened(data: { threadId: string; spaceId?: string }) {
  captureEvent('thread_opened', {
    thread_id: data.threadId,
    space_id: data.spaceId,
  });
}

/**
 * Track search performed (query length only — never raw query text)
 */
export function trackSearchPerformed(data: {
  query: string;
  resultsCount: number;
  contentType?: 'note' | 'thread' | 'space' | 'all';
}) {
  captureEvent('search_performed', {
    query_length: data.query.length,
    results_count: data.resultsCount,
    content_type: data.contentType || 'all',
  });
}

/**
 * Track public share link created/enabled
 */
export function trackShareCreated(data: {
  noteId?: string;
  threadId?: string;
  shareType?: 'note' | 'thread';
}) {
  captureEvent('share_created', {
    note_id: data.noteId,
    thread_id: data.threadId,
    share_type: data.shareType || (data.threadId ? 'thread' : 'note'),
  });
}

/**
 * Track upgrade / pricing page viewed
 */
export function trackUpgradeViewed(data?: { source?: string }) {
  captureEvent('upgrade_viewed', {
    source: data?.source,
  });
}

/**
 * Track Polar (or other) checkout start
 */
export function trackCheckoutStarted(data: {
  plan?: string;
  interval?: string;
  productId?: string;
}) {
  captureEvent('checkout_started', {
    plan: data.plan,
    interval: data.interval,
    product_id: data.productId,
  });
}

/**
 * Track shared space creation
 */
export function trackSpaceCreated(data: { spaceId: string }) {
  captureEvent('space_created', {
    space_id: data.spaceId,
  });
}

/**
 * Track joining / accepting invite to a shared space
 */
export function trackSpaceJoined(data: {
  spaceId: string;
  method?: 'invite' | 'join_link' | 'other';
}) {
  captureEvent('space_joined', {
    space_id: data.spaceId,
    method: data.method || 'other',
  });
}

/**
 * Track profile update
 */
export function trackProfileUpdated(data: {
  field: 'name' | 'color' | 'email' | 'church';
}) {
  captureEvent('profile_updated', {
    field: data.field,
  });
}

/**
 * Track navigation item clicked
 */
export function trackNavigationItemClicked(data: {
  itemType: 'thread' | 'note' | 'space';
  itemId: string;
  fromContext?: string;
}) {
  captureEvent('navigation_item_clicked', {
    item_type: data.itemType,
    item_id: data.itemId,
    from_context: data.fromContext,
  });
}

/**
 * Track feature used
 */
export function trackFeatureUsed(data: {
  feature: string;
  method?: string;
  context?: string;
}) {
  captureEvent('feature_used', {
    feature: data.feature,
    method: data.method,
    context: data.context,
  });
}

/**
 * Track error occurred
 * Uses PostHog's captureException for proper error tracking
 */
export function trackError(data: {
  errorMessage: string;
  errorStack?: string;
  context: string;
  userId?: string;
  error?: Error;
}) {
  const error = data.error || new Error(data.errorMessage);

  captureException(error, {
    context: data.context,
    user_id: data.userId,
    error_stack: data.errorStack || error.stack,
  });
}

/**
 * Track panel opened/closed
 */
export function trackPanelAction(data: {
  panel: 'new_note' | 'new_thread' | 'edit_thread' | 'note_details' | 'profile' | 'settings';
  action: 'opened' | 'closed';
}) {
  captureEvent('panel_action', {
    panel: data.panel,
    action: data.action,
  });
}
