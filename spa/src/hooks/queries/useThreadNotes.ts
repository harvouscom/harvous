import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';

type ThreadNoteApiRow = {
  id?: unknown;
  title?: unknown;
  content?: unknown;
  noteType?: unknown;
  simpleNoteId?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastUpdated?: unknown;
  contentEncrypted?: unknown;
  authorUserId?: unknown;
  authorDisplayName?: unknown;
  authorColor?: unknown;
  isOwnNote?: unknown;
  contextSpaceId?: unknown;
  threadId?: unknown;
};

export type SharedThreadNote = {
  id: string;
  title: string | null;
  content: string;
  noteType: string;
  simpleNoteId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastUpdated: string | null;
  authorUserId: string | null;
  authorDisplayName: string;
  authorColor: string;
  isOwnNote: boolean;
  context: {
    /**
     * Null for a **personal** plan — a sequence Thread with no space behind it.
     * The server derives the space itself; this only exists so a rendered note
     * knows which room it is being read inside, and a personal plan has none.
     */
    spaceId: string | null;
    threadId: string;
  };
};

export type ThreadSequenceInfo = {
  currentNoteId: string | null;
  /** 1-based. 0 when the plan has no steps yet. */
  currentIndex: number;
  total: number;
};

/**
 * How many people have opened each step. Present only for owner/leader — a
 * member's payload never carries it, so there is nothing for the client to
 * remember to hide.
 */
export type ThreadPulse = {
  memberCount: number;
  openedCountByNoteId: Record<string, number>;
  /**
   * How many people said they finished. A count, under the same rule as the
   * per-step counts: how many, never who. Optional so a payload cached before
   * completion shipped still parses.
   */
  completedCount?: number;
};

export type ThreadNotesPage = {
  notes: SharedThreadNote[];
  hasMore: boolean;
  offset: number;
  limit: number;
  /** 'collection' | 'sequence'. */
  mode: string;
  /** Null unless this Thread is a sequence. */
  sequence: ThreadSequenceInfo | null;
  /** Null unless this Thread is a sequence AND the viewer may manage it. */
  pulse: ThreadPulse | null;
  /**
   * When the viewer said *they* finished. Their own row, read back to them —
   * "Review is never shared" guards a person's study from other people, not
   * from themselves.
   */
  viewerCompletedAt: string | null;
  /**
   * Which steps the viewer has opened. Their own row, the member's half of what
   * `pulse` tells a leader — and the only progress a member's payload carries.
   * Empty for a collection, and for a sequence nobody has started.
   *
   * Already narrowed server-side to the steps still in the plan, so it counts
   * against `sequence.total` and not against the page of notes in hand.
   */
  viewerOpenedNoteIds: string[];
  /**
   * When the room's leader closed the run. Everyone sees it: it is the leader's
   * public statement about the study, not a fact about any member. A closed run
   * is still readable and can still be completed late.
   */
  closedAt: string | null;
};

/** "12 of 18 opened" — the shepherd's line, never shown to the room. */
export function pulseLabel(pulse: ThreadPulse | null, noteId: string): string | null {
  if (!pulse || pulse.memberCount <= 0) return null;
  const opened = pulse.openedCountByNoteId[noteId] ?? 0;
  return `${opened} of ${pulse.memberCount} opened`;
}

/**
 * "3 of 8 steps opened" — the member's own line, and the counterpart to
 * `pulseLabel`. Same shape of sentence on purpose: an owner reads both, and two
 * different phrasings for one idea would make them look like two measurements.
 *
 * Both numbers come from the server's view of the whole plan — `total` from
 * `sequence`, the ids already narrowed to live steps. Counting the loaded page
 * instead would report "3 of 20" on a twenty-five step plan.
 *
 * Null when there is nothing true to say — no steps yet, or none opened. A
 * "0 of 8" on a plan you have not begun is noise on the surface that is trying
 * to get you to begin it; the caller says "Not started" instead.
 */
export function viewerProgressLabel(openedNoteIds: string[], total: number): string | null {
  if (total <= 0) return null;
  /* Capped rather than trusted: the ids are narrowed against the same live list
     `total` is counted from, so they cannot exceed it — but a payload cached
     across a plan being shortened could, and "9 of 8" is worse than a rounded
     truth. */
  const count = Math.min(new Set(openedNoteIds).size, total);
  if (count === 0) return null;
  return `${count} of ${total} steps opened`;
}

/**
 * Which step a note is, and whether the cohort has reached it.
 *
 * `isAhead` drives dimming, which is pacing and not access control — the note
 * is reachable from the space's notes list either way.
 */
export function sequenceStepFor(
  noteId: string,
  orderedNoteIds: string[],
  currentNoteId: string | null,
): { stepNumber: number; isCurrent: boolean; isAhead: boolean } {
  const index = orderedNoteIds.indexOf(noteId);
  const currentIndex = currentNoteId ? orderedNoteIds.indexOf(currentNoteId) : -1;
  return {
    stepNumber: index + 1,
    isCurrent: index >= 0 && index === currentIndex,
    isAhead: index >= 0 && currentIndex >= 0 && index > currentIndex,
  };
}

export function flattenThreadNotePages(
  pages: Array<Pick<ThreadNotesPage, 'notes'>> | undefined,
): SharedThreadNote[] {
  return pages?.flatMap((page) => page.notes) ?? [];
}

export function nextThreadNotesOffset(page: Pick<ThreadNotesPage, 'hasMore' | 'offset' | 'limit'>) {
  return page.hasMore ? page.offset + page.limit : undefined;
}

export const threadNotesQueryKey = (threadId: string | undefined, spaceId: string | undefined) =>
  ['thread', threadId, 'notes', normalizePrototypeApiSpaceId(spaceId)] as const;

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Keep the drilldown contract intentionally smaller than the canonical note record. */
export function adaptSharedThreadNote(
  row: ThreadNoteApiRow,
  context: { spaceId: string | null; threadId: string },
): SharedThreadNote | null {
  const id = stringOrNull(row.id);
  if (!id || row.contentEncrypted === true) return null;
  const apiSpaceId = stringOrNull(row.contextSpaceId);
  const apiThreadId = stringOrNull(row.threadId);
  if ((apiSpaceId && apiSpaceId !== context.spaceId) || (apiThreadId && apiThreadId !== context.threadId)) {
    return null;
  }
  return {
    id,
    title: stringOrNull(row.title),
    content: typeof row.content === 'string' ? row.content : '',
    noteType: stringOrNull(row.noteType) ?? 'default',
    simpleNoteId: typeof row.simpleNoteId === 'number' ? row.simpleNoteId : null,
    createdAt: stringOrNull(row.createdAt),
    updatedAt: stringOrNull(row.updatedAt),
    lastUpdated: stringOrNull(row.lastUpdated) ?? stringOrNull(row.updatedAt) ?? stringOrNull(row.createdAt),
    authorUserId: stringOrNull(row.authorUserId),
    authorDisplayName: stringOrNull(row.authorDisplayName) ?? 'Member',
    authorColor: stringOrNull(row.authorColor) ?? 'blue',
    isOwnNote: row.isOwnNote === true,
    context,
  };
}

export function useThreadNotes(threadId: string | undefined, spaceId: string | undefined, limit = 20) {
  const authReady = useAuthReady();
  const normalizedSpaceId = normalizePrototypeApiSpaceId(spaceId);
  return useInfiniteQuery({
    queryKey: threadNotesQueryKey(threadId, normalizedSpaceId),
    /*
      Gated on the Thread alone, not on a space.

      This used to require a `spaceId`, which is why personal reading plans were
      server-built and UI-dead: `threads.ts` has always handled the no-space
      case, but the only hook that could render the steps refused to fire
      without a room. The endpoint never took a space — it resolves that
      server-side from the Thread — so the gate was guarding nothing.
    */
    enabled: authReady && Boolean(threadId),
    queryFn: async ({ pageParam = 0 }): Promise<ThreadNotesPage> => {
      const response = await api.get<{
        notes?: ThreadNoteApiRow[];
        hasMore?: boolean;
        offset?: number;
        limit?: number;
        mode?: unknown;
        sequence?: ThreadSequenceInfo | null;
        pulse?: ThreadPulse | null;
        /** The viewer's own finish and own opened steps, and the leader's close of the run. */
        viewerCompletedAt?: string | null;
        viewerOpenedNoteIds?: unknown;
        closedAt?: string | null;
      }>(`/api/threads/${encodeURIComponent(threadId!)}/notes`, { offset: pageParam, limit });
      return {
        notes: (response.notes ?? [])
          .map((row) =>
            adaptSharedThreadNote(row, {
              spaceId: normalizedSpaceId ?? null,
              threadId: threadId!,
            }),
          )
          .filter((row): row is SharedThreadNote => row !== null),
        hasMore: response.hasMore === true,
        offset: response.offset ?? pageParam,
        limit: response.limit ?? limit,
        mode: typeof response.mode === 'string' ? response.mode : 'collection',
        sequence: response.sequence ?? null,
        pulse: response.pulse ?? null,
        viewerCompletedAt: response.viewerCompletedAt ?? null,
        /* Absent on a payload cached before this field shipped, and on a
           collection, so the empty array is the answer rather than a gap. */
        viewerOpenedNoteIds: Array.isArray(response.viewerOpenedNoteIds)
          ? response.viewerOpenedNoteIds.filter((id): id is string => typeof id === 'string' && id !== '')
          : [],
        closedAt: response.closedAt ?? null,
      };
    },
    getNextPageParam: nextThreadNotesOffset,
    initialPageParam: 0,
    staleTime: 30_000,
  });
}
