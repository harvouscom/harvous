/**
 * Which of your notes are anchored to verses in a chapter — the index behind the margin dots.
 *
 * Nothing new is recorded to make this work. `ScriptureMetadata` has always held one row per
 * scripture reference in a note; the margin only needed it asked by chapter rather than by
 * note. So a note written months ago, in Classic, from a pill you typed by hand, already marks
 * its verse the first time you open that chapter.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { chapterAnchorsFromScriptureIndex } from '@/utils/chapter-anchors-from-scripture-index';
import { getScriptureIndexLocal } from '@/utils/offline-scripture-index';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';

export interface ChapterNoteAnchor {
  noteId: string;
  reference: string;
  /** First verse the reference covers, within this chapter. */
  verse: number;
  /** Last verse, when the reference is a range; null for a single verse. */
  verseEnd: number | null;
  /** Set when the range runs past this chapter's end. */
  chapterEnd: number | null;
  title: string | null;
  updatedAt: string | null;
}

export function chapterNotesKey(book: string, chapter: number) {
  return ['prototype', 'scripture-chapter-notes', book, chapter] as const;
}

/**
 * @param spaceId The space whose scripture index is mirrored offline. Only the fallback
 *   needs it; the live endpoint is scoped by user. Omit it and the hook is online-only.
 */
export function usePrototypeChapterNotes(book: string, chapter: number, spaceId?: string | null) {
  // Cold-start 401s are a recurring bug class here; every query waits for auth.
  const authReady = useAuthReady();
  const { userId } = useAuth();
  const query = useQuery({
    queryKey: chapterNotesKey(book, chapter),
    enabled: authReady && !!book && Number.isFinite(chapter),
    queryFn: async (): Promise<ChapterNoteAnchor[]> => {
      const params = new URLSearchParams({ book, chapter: String(chapter) });
      const res = await fetch(`/api/scripture/chapter-notes?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load chapter notes');
      const data = await res.json();
      return (data.anchors ?? []) as ChapterNoteAnchor[];
    },
  });

  /**
   * Offline fallback: the space's scripture index, mirrored into IndexedDB on every fetch
   * and refreshed whenever a note changes. Read only while the live answer is absent —
   * before the first fetch lands, or when it cannot — so a bar is never a stale one when
   * the real answer is available. Nothing here writes; opening a chapter must not touch
   * a note.
   */
  const apiSpaceId = normalizePrototypeApiSpaceId(spaceId ?? undefined);
  const live = query.data;
  const [mirrored, setMirrored] = useState<ChapterNoteAnchor[] | null>(null);
  useEffect(() => {
    if (live || !userId || !apiSpaceId || !book || !Number.isFinite(chapter)) return;
    let cancelled = false;
    void (async () => {
      const books = await getScriptureIndexLocal(userId, apiSpaceId);
      if (cancelled) return;
      setMirrored(
        books ? (chapterAnchorsFromScriptureIndex(books as never, book, chapter) as ChapterNoteAnchor[]) : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [live, userId, apiSpaceId, book, chapter]);

  const data = useMemo(() => live ?? mirrored ?? undefined, [live, mirrored]);
  return { ...query, data };
}

/** One note behind a bar. */
export interface AnchorNote {
  noteId: string;
  title: string | null;
}

/** One bar in the margin: a span, the notes on it, and which lane it was given. */
export interface AnchorLane {
  reference: string;
  startVerse: number;
  endVerse: number;
  /**
   * Every note covering this span. Notes that cite the exact same verses share one bar rather
   * than stacking identical lanes you would have to guess between — three notes on
   * Exodus 17:1-3 is one mark that opens to three, not three marks that look like a range.
   */
  notes: AnchorNote[];
  /** 0-based column in the gutter. Never exceeds MAX_LANES - 1. */
  lane: number;
  /** Notes this bar stands for, including any merged past the lane cap. */
  mergedCount: number;
}

/**
 * Three lanes fit the 28px gutter with room to tell them apart. Past that, bars would be
 * hairlines with hit areas too narrow to aim at, so the fourth concurrent note merges into
 * the third bar and the count moves into its tooltip instead.
 */
const MAX_LANES = 3;

/**
 * Notes laid out as bars: one per note, spanning the verses it covers, packed into lanes.
 *
 * The reader's old dots asked "what is on verse 12?" and so fanned each anchor across every
 * verse it touched — which threw away the very thing a margin should show. A bar keeps the
 * anchor whole: its length IS the span, and two bars side by side ARE the overlap.
 *
 * Lane packing is the classic interval-greedy: walk anchors in reading order and drop each
 * into the leftmost lane whose last bar has already ended. Ties go to the longer span first
 * so the bar most likely to collide claims the outer lane and the short ticks tuck inside it.
 */
export function assignAnchorLanes(
  anchors: ChapterNoteAnchor[] | undefined,
  verseCount: number,
): AnchorLane[] {
  const raw = (anchors ?? [])
    .map((a) => {
      const startVerse = Math.max(1, a.verse);
      /*
       * A reference may run past this chapter's end — `chapterEnd` marks that case, and the
       * bar stops at the last verse rather than at `verseEnd`, which counts verses in a
       * chapter we are not showing. Without the clamp "Exodus 6:28-7:7" would either mark
       * nothing or run off the bottom of Exodus 6.
       */
      const endVerse =
        a.chapterEnd != null ? verseCount : Math.min(verseCount, a.verseEnd ?? a.verse);
      return { anchor: a, startVerse, endVerse };
    })
    // A reference whose whole span sits outside the rendered verses has no bar to draw.
    .filter((s) => s.endVerse >= s.startVerse && s.startVerse <= verseCount);

  /*
   * Collapse identical spans before packing lanes.
   *
   * Two notes on exactly Exodus 17:1-3 are not an overlap to lay out side by side — they are
   * two notes about one passage. Left as separate bars they would occupy two lanes, look like
   * two different ranges, and force a reader to hover each to find out they were the same.
   */
  const grouped = new Map<string, { startVerse: number; endVerse: number; reference: string; notes: AnchorNote[] }>();
  for (const s of raw) {
    const key = `${s.startVerse}-${s.endVerse}`;
    const entry = grouped.get(key);
    const note = { noteId: s.anchor.noteId, title: s.anchor.title };
    if (entry) entry.notes.push(note);
    else
      grouped.set(key, {
        startVerse: s.startVerse,
        endVerse: s.endVerse,
        reference: s.anchor.reference,
        notes: [note],
      });
  }

  const spans = [...grouped.values()].sort((a, b) =>
    a.startVerse !== b.startVerse
      ? a.startVerse - b.startVerse
      : b.endVerse - b.startVerse - (a.endVerse - a.startVerse),
  );

  const out: AnchorLane[] = [];
  /** Last verse occupied in each lane, so a later bar knows where it may start. */
  const laneEnds: number[] = [];

  for (const span of spans) {
    let lane = laneEnds.findIndex((end) => end < span.startVerse);
    if (lane === -1) lane = laneEnds.length;

    if (lane >= MAX_LANES) {
      /*
       * Out of lanes. Rather than draw a fourth hairline, fold this note into the innermost
       * bar it overlaps and let that bar speak for both — the exact count lives in the
       * tooltip and the dock, where there is room to name them.
       */
      const host = out
        .filter((b) => b.lane === MAX_LANES - 1 && b.startVerse <= span.endVerse && b.endVerse >= span.startVerse)
        .pop();
      if (host) {
        host.endVerse = Math.max(host.endVerse, span.endVerse);
        host.notes.push(...span.notes);
        host.mergedCount += span.notes.length;
        laneEnds[MAX_LANES - 1] = host.endVerse;
        continue;
      }
      lane = MAX_LANES - 1;
    }

    laneEnds[lane] = span.endVerse;
    out.push({
      reference: span.reference,
      startVerse: span.startVerse,
      endVerse: span.endVerse,
      notes: [...span.notes],
      lane,
      mergedCount: span.notes.length,
    });
  }

  return out;
}
