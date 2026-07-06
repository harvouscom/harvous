/**
 * Browser Supabase client for Realtime Broadcast (Phase 1 cross-device sync).
 * Uses anon key only — never the service role key.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

export function isSupabaseRealtimeConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && String(url).trim() && key && String(key).trim());
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseRealtimeConfigured()) return null;
  if (!browserClient) {
    browserClient = createClient(String(import.meta.env.VITE_SUPABASE_URL).trim(), String(import.meta.env.VITE_SUPABASE_ANON_KEY).trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return browserClient;
}

/** Must match server `syncChannelName` in server/utils/realtime.ts */
export function syncChannelName(userId: string): string {
  return `sync-${userId}`;
}

/** Presence + live activity channel for a shared/public space. */
export function spaceChannelName(spaceId: string): string {
  const id = spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
  return `space-${id}`;
}
