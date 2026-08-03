/**
 * Browser Supabase client for Realtime Broadcast + Presence.
 * Uses anon key only — never the service role key.
 *
 * Every channel is opened with {@link REALTIME_PRIVATE_CHANNEL_CONFIG}. RLS on
 * `realtime.messages` (see supabase/realtime-authorization.sql) is what scopes
 * access; channel names alone are not enough.
 *
 * Private channels need a Clerk session JWT with `role: authenticated`. Register
 * {@link setSupabaseRealtimeAccessTokenGetter} from inside ClerkProvider so
 * tokens refresh before they expire (otherwise joins fail "after a while").
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;
type AccessTokenGetter = () => Promise<string | null>;
let accessTokenGetter: AccessTokenGetter | null = null;
let authRefreshTimer: ReturnType<typeof setInterval> | null = null;
let authRefreshVisibilityListenerAttached = false;

/** How often to push a fresh Clerk JWT into Realtime (session tokens are short-lived). */
const REALTIME_AUTH_REFRESH_MS = 45_000;

/** Passed to every `supabase.channel(...)` so Realtime enforces RLS. */
export const REALTIME_PRIVATE_CHANNEL_CONFIG = {
  config: { private: true as const },
};

export function isSupabaseRealtimeConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && String(url).trim() && key && String(key).trim());
}

async function pushRealtimeAccessToken(): Promise<void> {
  const client = browserClient;
  const getter = accessTokenGetter;
  if (!client || !getter) return;
  try {
    const token = await getter();
    if (token) await client.realtime.setAuth(token);
  } catch {
    /* next refresh retries */
  }
}

/**
 * Refresh timer body. Skipped while the tab is hidden — a backgrounded PWA has no
 * open UI reacting to Realtime broadcasts, so there's nothing to keep fresh, and a
 * network write every 45s indefinitely is exactly the kind of thing that keeps a
 * phone's cellular radio from ever going idle. The `visibilitychange` listener below
 * pushes one immediate refresh on return so joins don't fail on a stale token.
 */
function refreshIfVisible(): void {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  void pushRealtimeAccessToken();
}

function ensureAuthRefreshLoop(): void {
  if (typeof window === 'undefined' || authRefreshTimer != null) return;
  authRefreshTimer = setInterval(refreshIfVisible, REALTIME_AUTH_REFRESH_MS);

  if (!authRefreshVisibilityListenerAttached) {
    authRefreshVisibilityListenerAttached = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || authRefreshTimer == null) return;
      // Refresh immediately, then re-arm so the next tick is a full interval from now
      // rather than landing mid-interval on stale timing from while we were hidden.
      void pushRealtimeAccessToken();
      clearInterval(authRefreshTimer);
      authRefreshTimer = setInterval(refreshIfVisible, REALTIME_AUTH_REFRESH_MS);
    });
  }
}

/**
 * Provide Clerk `getToken` (default session — native Supabase integration).
 * Call from a component under `<ClerkProvider>`; clears on sign-out.
 */
export function setSupabaseRealtimeAccessTokenGetter(fn: AccessTokenGetter | null): void {
  accessTokenGetter = fn;
  if (!fn) {
    if (authRefreshTimer != null) {
      clearInterval(authRefreshTimer);
      authRefreshTimer = null;
    }
    return;
  }
  ensureAuthRefreshLoop();
  void pushRealtimeAccessToken();
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseRealtimeConfigured()) return null;
  if (!browserClient) {
    browserClient = createClient(
      String(import.meta.env.VITE_SUPABASE_URL).trim(),
      String(import.meta.env.VITE_SUPABASE_ANON_KEY).trim(),
      {
        auth: { persistSession: false, autoRefreshToken: false },
        accessToken: async () => {
          if (!accessTokenGetter) return null;
          return accessTokenGetter();
        },
      },
    );
    ensureAuthRefreshLoop();
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
