/**
 * Supabase Realtime Presence for a shared/public space.
 */
import { useAuth } from '@clerk/clerk-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseBrowserClient, isSupabaseRealtimeConfigured, spaceChannelName } from '@/lib/supabase-client';

const CLERK_SUPABASE_JWT_TEMPLATE = 'supabase';

export interface SpacePresenceUser {
  userId: string;
  displayName: string;
  color: string;
}

function parsePresencePayload(raw: unknown): SpacePresenceUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const userId = typeof o.userId === 'string' ? o.userId : '';
  if (!userId) return null;
  return {
    userId,
    displayName: typeof o.displayName === 'string' ? o.displayName : 'Member',
    color: typeof o.color === 'string' ? o.color : 'blue',
  };
}

export function useSpacePresence(
  spaceId: string | null | undefined,
  self: { displayName: string; color: string } | null,
): SpacePresenceUser[] {
  const { userId, getToken, isSignedIn } = useAuth();
  const [others, setOthers] = useState<SpacePresenceUser[]>([]);
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabaseBrowserClient>>['channel']> | null>(
    null,
  );

  const normalizedSpaceId = useMemo(() => {
    const t = (spaceId ?? '').trim();
    if (!t) return '';
    return t.startsWith('space_') ? t : `space_${t}`;
  }, [spaceId]);

  const selfDisplayName = self?.displayName ?? '';
  const selfColor = self?.color ?? '';

  useEffect(() => {
    if (!normalizedSpaceId || !userId || !isSignedIn || !self || !isSupabaseRealtimeConfigured()) {
      setOthers((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;

    const setup = async () => {
      try {
        const token = await getToken({ template: CLERK_SUPABASE_JWT_TEMPLATE });
        if (token && !cancelled) await supabase.realtime.setAuth(token);
      } catch {
        /* presence may still connect on public channels */
      }
      if (cancelled) return;

      const channel = supabase.channel(spaceChannelName(normalizedSpaceId));
      channelRef.current = channel;

      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<Record<string, unknown>>();
        const users: SpacePresenceUser[] = [];
        for (const key of Object.keys(state)) {
          const entries = state[key] ?? [];
          for (const entry of entries) {
            const parsed = parsePresencePayload(entry);
            if (parsed && parsed.userId !== userId) users.push(parsed);
          }
        }
        const deduped = [...new Map(users.map((u) => [u.userId, u])).values()];
        setOthers(deduped);
      });

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            userId,
            displayName: self.displayName,
            color: self.color,
          });
        }
      });
    };

    void setup();

    return () => {
      cancelled = true;
      const ch = channelRef.current;
      channelRef.current = null;
      setOthers((prev) => (prev.length === 0 ? prev : []));
      if (ch) void supabase.removeChannel(ch);
    };
  }, [normalizedSpaceId, userId, isSignedIn, selfDisplayName, selfColor, getToken]);

  return others;
}

/** Short label for the presence strip ("Sarah is here" / "2 people studying"). */
export function formatSpacePresenceLabel(users: SpacePresenceUser[]): string | null {
  if (users.length === 0) return null;
  if (users.length === 1) return `${users[0].displayName} is here`;
  if (users.length === 2) return `${users[0].displayName} and ${users[1].displayName} are here`;
  return `${users.length} people studying`;
}
