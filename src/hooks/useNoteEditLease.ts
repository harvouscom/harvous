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
 * Claim by interacting with the editor (type / select / focus). Idle and blur
 * grace release the pen; Done can release early. No separate "Start editing".
 *
 * Private Realtime channels need a fresh Clerk JWT — see
 * setSupabaseRealtimeAccessTokenGetter. This hook also avoids tearing the
 * channel down when Clerk recreates getToken, and debounces "disconnected"
 * so brief rejoins don't flash reconnecting.
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
/** Don't show reconnecting until the channel has been down this long. */
export const LEASE_DISCONNECT_GRACE_MS = 2_500;

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
  /** Channel is not subscribed — degrade rather than guess. */
  disconnected: boolean;
  /**
   * Presence lease path is actually running (Realtime configured + subscribed path).
   * When false, do not force follower-lock or show a fake "available" claim UI.
   */
  leaseActive: boolean;
  claim: () => void;
  release: () => void;
  /** Call on every real user keystroke / selection to defer idle release (and claim if free). */
  noteUserActivity: () => void;
  /** Editor blurred — start grace timer before releasing. */
  noteEditorBlur: () => void;
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
  leaseActive: false,
  claim: () => {},
  release: () => {},
  noteUserActivity: () => {},
  noteEditorBlur: () => {},
};

export function useNoteEditLease(
  noteId: string | null | undefined,
  self: { displayName: string; color: string } | null,
  opts: { enabled: boolean },
): NotePenState {
  const { userId, getToken, isSignedIn } = useAuth();
  const [entries, setEntries] = useState<NotePenPresence[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const [disconnectedHard, setDisconnectedHard] = useState(false);
  const [wantsPen, setWantsPen] = useState(false);

  const channelRef = useRef<ReturnType<
    NonNullable<ReturnType<typeof getSupabaseBrowserClient>>['channel']
  > | null>(null);
  const claimedAtRef = useRef(0);
  const lastActivityRef = useRef(0);
  const blurTimerRef = useRef<number | null>(null);
  const disconnectTimerRef = useRef<number | null>(null);
  const wantsPenRef = useRef(false);
  const selfRef = useRef(self);
  const getTokenRef = useRef(getToken);
  selfRef.current = self;
  getTokenRef.current = getToken;
  wantsPenRef.current = wantsPen;

  const normalizedNoteId = useMemo(() => {
    const trimmed = (noteId ?? '').trim();
    if (!trimmed) return '';
    return trimmed.startsWith('note_') ? trimmed : `note_${trimmed}`;
  }, [noteId]);

  const active =
    opts.enabled &&
    Boolean(normalizedNoteId && userId && isSignedIn && self) &&
    isSupabaseRealtimeConfigured();

  const clearBlurTimer = useCallback(() => {
    if (blurTimerRef.current != null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  const markSubscribed = useCallback((isSubscribed: boolean) => {
    setSubscribed(isSubscribed);
    if (isSubscribed) {
      if (disconnectTimerRef.current != null) {
        window.clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      setDisconnectedHard(false);
      return;
    }
    if (disconnectTimerRef.current != null) return;
    disconnectTimerRef.current = window.setTimeout(() => {
      disconnectTimerRef.current = null;
      setDisconnectedHard(true);
    }, LEASE_DISCONNECT_GRACE_MS);
  }, []);

  // Subscribe + mirror presence. Deps intentionally exclude getToken / display
  // name identity — those change often and were tearing the channel down.
  useEffect(() => {
    if (!active) {
      setEntries((prev) => (prev.length === 0 ? prev : []));
      setSubscribed(false);
      setDisconnectedHard(false);
      setWantsPen(false);
      clearBlurTimer();
      if (disconnectTimerRef.current != null) {
        window.clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;
    let retryTimer: number | null = null;

    const presenceSelf = () => ({
      userId: userId!,
      displayName: selfRef.current?.displayName ?? 'Someone',
      color: selfRef.current?.color ?? 'blue',
      holding: wantsPenRef.current,
      claimedAt: wantsPenRef.current ? claimedAtRef.current || Date.now() : 0,
    });

    const attach = async () => {
      try {
        const token = await getTokenRef.current();
        if (token && !cancelled) await supabase.realtime.setAuth(token);
      } catch {
        /* refresh loop / retry will try again */
      }
      if (cancelled) return;

      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

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
        setEntries([...new Map(seen.map((entry) => [entry.userId, entry])).values()]);
      });

      channel.subscribe(async (status) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          markSubscribed(true);
          if (wantsPenRef.current && claimedAtRef.current === 0) {
            claimedAtRef.current = Date.now();
          }
          await channel.track(presenceSelf());
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          markSubscribed(false);
          try {
            const token = await getTokenRef.current();
            if (token && !cancelled) await supabase.realtime.setAuth(token);
          } catch {
            /* ignore */
          }
          if (!cancelled && retryTimer == null) {
            retryTimer = window.setTimeout(() => {
              retryTimer = null;
              if (!cancelled) void attach();
            }, 1_500);
          }
        }
      });
    };

    void attach();

    return () => {
      cancelled = true;
      if (retryTimer != null) window.clearTimeout(retryTimer);
      const channel = channelRef.current;
      channelRef.current = null;
      claimedAtRef.current = 0;
      clearBlurTimer();
      if (disconnectTimerRef.current != null) {
        window.clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      setEntries([]);
      setSubscribed(false);
      setDisconnectedHard(false);
      setWantsPen(false);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [active, normalizedNoteId, userId, clearBlurTimer, markSubscribed]);

  const winner = useMemo(() => resolvePenHolder(entries), [entries]);
  const heldBy = winner && userId && winner.userId !== userId ? winner : null;
  const holding = Boolean(wantsPen && userId && !heldBy);
  const available = Boolean(subscribed && !heldBy && !wantsPen);

  // Broadcast our intent whenever it changes, then let the synced state decide.
  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || !subscribed || !userId) return;
    if (wantsPen && claimedAtRef.current === 0) claimedAtRef.current = Date.now();
    if (!wantsPen) claimedAtRef.current = 0;
    void channel.track({
      userId,
      displayName: selfRef.current?.displayName ?? 'Someone',
      color: selfRef.current?.color ?? 'blue',
      holding: wantsPen,
      claimedAt: claimedAtRef.current,
    });
  }, [wantsPen, subscribed, userId]);

  useEffect(() => {
    if (wantsPen && heldBy) setWantsPen(false);
  }, [wantsPen, heldBy]);

  const claim = useCallback(() => {
    clearBlurTimer();
    lastActivityRef.current = Date.now();
    setWantsPen(true);
  }, [clearBlurTimer]);

  const release = useCallback(() => {
    clearBlurTimer();
    setWantsPen(false);
    if (userId) {
      setEntries((prev) =>
        prev.map((entry) =>
          entry.userId === userId ? { ...entry, holding: false, claimedAt: 0 } : entry,
        ),
      );
    }
  }, [clearBlurTimer, userId]);

  const noteUserActivity = useCallback(() => {
    clearBlurTimer();
    lastActivityRef.current = Date.now();
    setWantsPen(true);
  }, [clearBlurTimer]);

  const noteEditorBlur = useCallback(() => {
    if (!wantsPen) return;
    clearBlurTimer();
    blurTimerRef.current = window.setTimeout(() => {
      blurTimerRef.current = null;
      setWantsPen(false);
    }, LEASE_BLUR_GRACE_MS);
  }, [wantsPen, clearBlurTimer]);

  useEffect(() => {
    if (!holding) return;
    const interval = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= LEASE_IDLE_RELEASE_MS) setWantsPen(false);
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [holding]);

  useEffect(() => {
    if (!holding) return;
    const drop = () => setWantsPen(false);
    window.addEventListener('pagehide', drop);
    return () => window.removeEventListener('pagehide', drop);
  }, [holding]);

  return useMemo(() => {
    if (!active) {
      if (opts.enabled) {
        return { ...IDLE_STATE, disconnected: true, leaseActive: false };
      }
      return IDLE_STATE;
    }
    return {
      holding,
      heldBy,
      available,
      disconnected: disconnectedHard,
      leaseActive: true,
      claim,
      release,
      noteUserActivity,
      noteEditorBlur,
    };
  }, [
    active,
    opts.enabled,
    holding,
    heldBy,
    available,
    disconnectedHard,
    claim,
    release,
    noteUserActivity,
    noteEditorBlur,
  ]);
}
