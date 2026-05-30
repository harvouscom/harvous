/**
 * Shared Realtime invalidation payload types (browser + server).
 */

export type RealtimeInvalidationType =
  | 'note:created'
  | 'note:updated'
  | 'note:deleted'
  | 'thread:updated'
  | 'thread:deleted'
  | 'space:updated'
  | 'sync:batch';

export interface RealtimeInvalidationPayload {
  type: RealtimeInvalidationType;
  id?: string;
}

export function isRealtimeInvalidationPayload(value: unknown): value is RealtimeInvalidationPayload {
  if (!value || typeof value !== 'object') return false;
  const t = (value as RealtimeInvalidationPayload).type;
  return (
    t === 'note:created' ||
    t === 'note:updated' ||
    t === 'note:deleted' ||
    t === 'thread:updated' ||
    t === 'thread:deleted' ||
    t === 'space:updated' ||
    t === 'sync:batch'
  );
}
