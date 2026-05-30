/**
 * Supabase Realtime Broadcast — cross-device cache invalidation (Phase 1).
 * Fire-and-forget; never fails the caller's HTTP response.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RealtimeInvalidationPayload } from '@/lib/realtime-invalidation';

export type { RealtimeInvalidationPayload, RealtimeInvalidationType } from '@/lib/realtime-invalidation';

let adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient | null {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/** Channel topic for a user's cross-device sync signals. */
export function syncChannelName(userId: string): string {
  return `sync-${userId}`;
}

/**
 * Broadcast an invalidation event to all clients subscribed to the user's sync channel.
 */
export function broadcastInvalidation(userId: string, payload: RealtimeInvalidationPayload): void {
  const client = getAdminClient();
  if (!client) return;

  void (async () => {
    try {
      const channel = client.channel(syncChannelName(userId));
      const status = await channel.send({
        type: 'broadcast',
        event: 'invalidate',
        payload,
      });
      if (status === 'error') {
        console.error('[realtime] broadcast send returned error for', payload.type);
      }
      await client.removeChannel(channel);
    } catch (err) {
      console.error('[realtime] broadcast failed:', err instanceof Error ? err.message : err);
    }
  })();
}

type SyncMutation = {
  entityType?: string;
  operation?: string;
  entityId?: string;
};

/** Coalesce a successful `/api/sync/push` batch into one invalidation (or a specific type when uniform). */
export function broadcastInvalidationForSyncPush(
  userId: string,
  mutations: SyncMutation[],
  results: Array<{ success?: boolean }>,
): void {
  const hadSuccess = results.some((r) => r.success);
  if (!hadSuccess) return;

  const successful = mutations.filter((_, i) => results[i]?.success);
  if (successful.length === 0) {
    broadcastInvalidation(userId, { type: 'sync:batch' });
    return;
  }

  if (successful.length === 1) {
    const payload = invalidationFromMutation(successful[0]);
    if (payload) {
      broadcastInvalidation(userId, payload);
      return;
    }
  }

  broadcastInvalidation(userId, { type: 'sync:batch' });
}

function invalidationFromMutation(m: SyncMutation): RealtimeInvalidationPayload | null {
  const op = m.operation;
  const id = typeof m.entityId === 'string' ? m.entityId : undefined;
  switch (m.entityType) {
    case 'note':
      if (op === 'create') return { type: 'note:created', id };
      if (op === 'update') return { type: 'note:updated', id };
      if (op === 'delete') return { type: 'note:deleted', id };
      return { type: 'note:updated', id };
    case 'thread':
      if (op === 'delete') return { type: 'thread:deleted', id };
      return { type: 'thread:updated', id };
    case 'space':
      return { type: 'space:updated', id };
    default:
      return null;
  }
}
