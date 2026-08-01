/**
 * "Pass the pen" — the editing lease for a co-edited note.
 *
 * ## The lease is advisory. It is not a lock.
 *
 * The server enforces two things: who is *allowed* to write a note
 * (server/utils/note-collaboration.ts) and whose write *lands*
 * (expectedVersion → 409). This hook enforces neither. Its job is to make
 * conflicts rare and legible — so that in practice one person writes at a time
 * and everyone else can see who — not to make them impossible.
 *
 * That's deliberate. A lease we can't honestly enforce shouldn't pretend to be a
 * lock: the keepalive unload flush fires exactly as the pen is being released,
 * and native clients don't participate at all. Presence gives us free eviction on
 * tab close, sleep, and network drop, which a DB lease would have to buy with a
 * heartbeat loop and expiry sweep — and would still get wrong.
 *
 * Modeled on useSpacePresence. The channel carries no note content (see
 * noteChannelName) — only display names already visible to space members.
 */
import { useAuth } from '@clerk/clerk-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getSupabaseBrowserClient,
  isSupabaseRealtimeConfigured,
  noteChannelName,
  REALTIME_PRIVATE_CHANNEL_CONFIG,
} from '@/lib/supabase-client';

/** How long the pen survives the editor losing focus (portaled toolbars, sheets). */
export const LEASE_BLUR_GRACE_MS = 5_000;
/** Released after this long without a real keystroke, so an idle tab frees the pen. */
export const LEASE_IDLE_RELEASE_MS = 45_000;

export interface NotePenPresence {
  userId: string;
  displayName: string;
  color: string;
  holding: boolean;
  claimedAt: number;
}

export interface NotePenState {
  /** This client holds the pen and may type. */
  holding: boolean;
  /** Someone else holds it. */
  heldBy: NotePenPresence | null;
  /** Free, and this viewer is allowed to take it. */
  available: boolean;
  /** Channel is not subscribed — degrade to read-only rather than guess. */
  disconnected: boolean;
  claim: () => void;
  release: () => void;
  /** Call on every real user keystroke to defer the idle release. */
  noteUserActivity: () => void;
}

export function parseNotePenPresence(raw: unknown): NotePenPresence | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const userId = typeof o.userId === 'string' ? o.userId : '';
  if (!userId) return null;
  return {
    userId,
    displayName: typeof o.displayName === 'string' ? o.displayName : 'Member',
    color: typeof o.color === 'string' ? o.color : 'blue',
    holding: o.holding === true,
    claimedAt: typeof o.claimedAt === 'number' && Number.isFinite(o.claimedAt) ? o.claimedAt : 0,
  };
}

/**
 * Deterministic winner among competing claims: earliest claim wins, ties broken by
 * lowest userId. Every client runs this over the same synced state and reaches the
 * same answer, so there's no arbiter and no flapping. Clock skew between machines
 * can hand the pen to the "wrong" claimant for a moment; nothing is lost, because
 * the loser was never typing — they demote before the editor goes editable.
 */
export function resolvePenHolder(entries: NotePenPresence[]): NotePenPresence | null {
  const claimants = entries.filter((entry) => entry.holding);
  if (claimants.length === 0) return null;
  return [...claimants].sort(
    (a, b) => a.claimedAt - b.claimedAt || a.userId.localeCompare(b.userId),
  )[0];
}

const IDLE_STATE: NotePenState = {
  holding: false,
  heldBy: null,
  available: false,
  disconnected: false,
  claim: () => {},
  release: () => {},
  noteUserActivity: () => {},
};

export function useNoteEditLease(
  noteId: string | null | undefined,
  self: { displayName: string; color: string } | null,
  opts: { enabled: boolean },
): NotePenState {
  const { userId, getToken, isSignedIn } = useAuth();
  const [entries, setEntries] = useState<NotePenPresence[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const [wantsPen, setWantsPen] = useState(false);

  const channelRef = useRef<ReturnType<
    NonNullable<ReturnType<typeof getSupabaseBrowserClient>>['channel']
  > | null>(null);
  const claimedAtRef = useRef(0);
  const lastActivityRef = useRef(0);

  const normalizedNoteId = useMemo(() => {
    const trimmed = (noteId ?? '').trim();
    if (!trimmed) return '';
    return trimmed.startsWith('note_') ? trimmed : `note_${trimmed}`;
  }, [noteId]);

  const active =
    opts.enabled &&
    Boolean(normalizedNoteId && userId && isSignedIn && self) &&
    isSupabaseRealtimeConfigured();

  const selfDisplayName = self?.displayName ?? '';
  const selfColor = self?.color ?? '';

  // Subscribe + mirror presence.
  useEffect(() => {
    if (!active) {
      setEntries((prev) => (prev.length === 0 ? prev : []));
      setSubscribed(false);
      setWantsPen(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;

    const setup = async () => {
      try {
        const token = await getToken();
        if (token && !cancelled) await supabase.realtime.setAuth(token);
      } catch {
        /* presence may still connect on public channels */
      }
      if (cancelled) return;

      const channel = supabase.channel(noteChannelName(normalizedNoteId), REALTIME_PRIVATE_CHANNEL_CONFIG);
      channelRef.current = channel;

      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<Record<string, unknown>>();
        const seen: NotePenPresence[] = [];
        for (const key of Object.keys(state)) {
          for (const entry of state[key] ?? []) {
            const parsed = parseNotePenPresence(entry);
            if (parsed) seen.push(parsed);
          }
        }
        // One entry per person — a second tab shouldn't read as a second member.
        setEntries([...new Map(seen.map((entry) => [entry.userId, entry])).values()]);
      });

      channel.subscribe(async (status) => {
        if (cancelled) return;
        const isSubscribed = status === 'SUBSCRIBED';
        setSubscribed(isSubscribed);
        if (isSubscribed) {
          await channel.track({
            userId,
            displayName: selfDisplayName,
            color: selfColor,
            holding: false,
            claimedAt: 0,
          });
        }
      });
    };

    void setup();

    return () => {
      cancelled = true;
      const channel = channelRef.current;
      channelRef.current = null;
      claimedAtRef.current = 0;
      setEntries([]);
      setSubscribed(false);
      setWantsPen(false);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [active, normalizedNoteId, userId, selfDisplayName, selfColor, getToken]);

  const winner = useMemo(() => resolvePenHolder(entries), [entries]);
  const holding = Boolean(winner && userId && winner.userId === userId);
  const heldBy = winner && userId && winner.userId !== userId ? winner : null;

  // Broadcast our intent whenever it changes, then let the synced state decide.
  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || !subscribed || !userId) return;
    if (wantsPen && claimedAtRef.current === 0) claimedAtRef.current = Date.now();
    if (!wantsPen) claimedAtRef.current = 0;
    void channel.track({
      userId,
      displayName: selfDisplayName,
      color: selfColor,
      holding: wantsPen,
      claimedAt: claimedAtRef.current,
    });
  }, [wantsPen, subscribed, userId, selfDisplayName, selfColor]);

  // Lost a tie-break: stand down so the winner is unambiguous everywhere.
  useEffect(() => {
    if (wantsPen && winner && userId && winner.userId !== userId) setWantsPen(false);
  }, [wantsPen, winner, userId]);

  const claim = useCallback(() => {
    lastActivityRef.current = Date.now();
    setWantsPen(true);
  }, []);

  const release = useCallback(() => {
    setWantsPen(false);
  }, []);

  const noteUserActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Idle release. Polls rather than resetting a timer per keystroke — typing
  // shouldn't churn timers, and a ~5s granularity is well inside the 45s window.
  useEffect(() => {
    if (!holding) return;
    const interval = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= LEASE_IDLE_RELEASE_MS) setWantsPen(false);
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [holding]);

  // Give up the pen when the tab goes away rather than making everyone else wait
  // for the presence eviction window.
  useEffect(() => {
    if (!holding) return;
    const drop = () => setWantsPen(false);
    window.addEventListener('pagehide', drop);
    return () => window.removeEventListener('pagehide', drop);
  }, [holding]);

  return useMemo(() => {
    if (!active) return IDLE_STATE;
    return {
      holding,
      heldBy,
      available: subscribed && !winner,
      disconnected: !subscribed,
      claim,
      release,
      noteUserActivity,
    };
  }, [active, holding, heldBy, subscribed, winner, claim, release, noteUserActivity]);
}
