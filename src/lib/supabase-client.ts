/**
 * Browser Supabase client for Realtime Broadcast + Presence.
 * Uses anon key only — never the service role key.
 *
 * Every channel is opened with {@link REALTIME_PRIVATE_CHANNEL_CONFIG}. RLS on
 * `realtime.messages` (see supabase/realtime-authorization.sql) is what scopes
 * access; channel names alone are not enough.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

/** Passed to every `supabase.channel(...)` so Realtime enforces RLS. */
export const REALTIME_PRIVATE_CHANNEL_CONFIG = {
  config: { private: true as const },
};

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

/**
 * Per-note "pass the pen" channel. Carries presence only — who has the note open
 * and who holds the pen. Note *bodies* travel on each member's `sync-*` channel
 * (size-capped) after Realtime Authorization is enabled; never put content here.
 */
export function noteChannelName(noteId: string): string {
  const id = noteId.startsWith('note_') ? noteId : `note_${noteId}`;
  return `note-${id}`;
}
