/**
 * Analytics Event Tracking Utilities
 * 
 * Provides type-safe event tracking functions for PostHog
 * Use these functions throughout the app to track user actions
 */

import { captureEvent } from './posthog';

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
}) {
  captureEvent('note_created', {
    note_id: data.noteId,
    thread_id: data.threadId,
    space_id: data.spaceId,
    method: data.method || 'manual',
    has_content: data.hasContent,
    content_length: data.contentLength,
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
 * Track search performed
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
 */
export function trackError(data: {
  errorMessage: string;
  errorStack?: string;
  context: string;
  userId?: string;
}) {
  captureEvent('error_occurred', {
    error_message: data.errorMessage,
    error_stack: data.errorStack,
    context: data.context,
    user_id: data.userId,
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

