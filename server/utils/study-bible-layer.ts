/**
 * The writer for the reader's Study Bible layer (UserNodeStates).
 *
 * Every activity path in the app — a chapter read, a note opened, a verse highlighted, a link
 * drawn, a review answered — calls `touchNodes` with what it did, and the layer accumulates.
 * Nothing else writes that table.
 *
 * Three properties this file has to hold, because callers sit on hot request paths:
 *
 * 1. **It never throws.** Same posture as computeAndStoreNoteFingerprint next door: a failure
 *    here must not fail the highlight the reader just made. Missing table warns once, anything
 *    else is logged and swallowed.
 * 2. **One statement per batch.** A highlight on a range can touch a dozen verses, their
 *    chapters, and half a dozen themes; that is one insert with an ON CONFLICT, not twenty
 *    round trips.
 * 3. **Order-independent.** The backfill replays years of events in whatever order the queries
 *    come back, so firstStudiedAt takes the LEAST and lastSeenAt the GREATEST rather than
 *    trusting the last writer to be the latest.
 *
 * Callers should use `void touchNodes(...)` on request paths and await it only in scripts.
 */

import { db, UserNodeStates, Notes, NoteConnections, sql, eq, and } from '../db';
import { generateTimestampId } from '@/utils/ids';
import { isUserNodeStatesTableMissing } from './pg-undefined-relation';
import {
  chapterKeyForVerse,
  nodeKey,
  verseNodesForReference,
  verseReferenceLabel,
  type ChapterKeyParts,
  type NodeKind,
  type NodeSignal,
} from '@/utils/study-bible-nodes';
import type { VerseKeyParts } from '@/utils/scripture-verse-keys';
import type { RecallState } from '@/utils/review-item-kinds';
import { getKnowledgeForPassages, MIN_THEME_CORROBORATION_RELEVANCE } from './scripture-knowledge';
import { pickRepNoteIdFromGraph } from './study-thread-cluster-count';

export interface NodeTouch {
  key: string;
  kind: NodeKind;
  signal: NodeSignal;
  at: Date;
  label?: string | null;
  noteId?: string | null;
  secondaryNoteId?: string | null;
  /** Reader-facing provenance — see src/utils/study-bible-source-copy.ts. */
  sourceLabel?: string | null;
  meta?: Record<string, unknown> | null;
  /** Written only by applyReviewOutcome. ReviewItems remains canonical for scheduling. */
  reviewMirror?: { lastReviewedAt: Date; nextReviewAt: Date | null; recallState: RecallState };
}

/** Which counter a signal increments. Exactly one each — see NODE_SIGNALS' docblock. */
const COUNTER_FOR_SIGNAL: Record<NodeSignal, string> = {
  exposure: 'exposureCount',
  revisit: 'revisitCount',
  connection: 'explicitConnectionCount',
  expansion: 'expansionCount',
  synthesis: 'synthesisCount',
  review: 'reviewCount',
};

const CHUNK_SIZE = 200;

let warnedMissingTable = false;

type PendingRow = {
  id: string;
  userId: string;
  nodeKind: string;
  nodeKey: string;
  label: string | null;
  noteId: string | null;
  secondaryNoteId: string | null;
  exposureCount: number;
  revisitCount: number;
  explicitConnectionCount: number;
  expansionCount: number;
  synthesisCount: number;
  reviewCount: number;
  firstStudiedAt: Date;
  lastSeenAt: Date;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  recallState: RecallState;
  lastSignal: NodeSignal;
  lastSourceLabel: string | null;
  lastSourceAt: Date;
  status: string;
  meta: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Fold a batch down to one row per node key.
 *
 * A single gesture legitimately produces several touches for the same node (highlighting a
 * range hits its chapter once per verse), and sending duplicate keys to one INSERT ... ON
 * CONFLICT is a Postgres error — "cannot affect row a second time" — not a merge.
 */
function foldTouches(userId: string, touches: readonly NodeTouch[], now: Date): PendingRow[] {
  const byKey = new Map<string, PendingRow>();

  for (const touch of touches) {
    if (!touch?.key || !touch.kind || !touch.signal) continue;
    const at = touch.at instanceof Date && !Number.isNaN(touch.at.getTime()) ? touch.at : now;
    const existing = byKey.get(touch.key);

    if (!existing) {
      byKey.set(touch.key, {
        id: generateTimestampId('node'),
        userId,
        nodeKind: touch.kind,
        nodeKey: touch.key,
        label: touch.label ?? null,
        noteId: touch.noteId ?? null,
        secondaryNoteId: touch.secondaryNoteId ?? null,
        exposureCount: touch.signal === 'exposure' ? 1 : 0,
        revisitCount: touch.signal === 'revisit' ? 1 : 0,
        explicitConnectionCount: touch.signal === 'connection' ? 1 : 0,
        expansionCount: touch.signal === 'expansion' ? 1 : 0,
        synthesisCount: touch.signal === 'synthesis' ? 1 : 0,
        reviewCount: touch.signal === 'review' ? 1 : 0,
        firstStudiedAt: at,
        lastSeenAt: at,
        lastReviewedAt: touch.reviewMirror?.lastReviewedAt ?? null,
        nextReviewAt: touch.reviewMirror?.nextReviewAt ?? null,
        recallState: touch.reviewMirror?.recallState ?? 'new',
        lastSignal: touch.signal,
        lastSourceLabel: touch.sourceLabel ?? null,
        lastSourceAt: at,
        status: 'active',
        meta: touch.meta ? JSON.stringify(touch.meta) : null,
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }

    const counter = COUNTER_FOR_SIGNAL[touch.signal] as keyof PendingRow;
    (existing[counter] as number) += 1;
    if (at < existing.firstStudiedAt) existing.firstStudiedAt = at;
    if (at > existing.lastSeenAt) existing.lastSeenAt = at;
    if (at >= existing.lastSourceAt) {
      existing.lastSignal = touch.signal;
      existing.lastSourceAt = at;
      if (touch.sourceLabel !== undefined) existing.lastSourceLabel = touch.sourceLabel ?? null;
    }
    existing.label = existing.label ?? touch.label ?? null;
    existing.noteId = existing.noteId ?? touch.noteId ?? null;
    existing.secondaryNoteId = existing.secondaryNoteId ?? touch.secondaryNoteId ?? null;
    existing.meta = existing.meta ?? (touch.meta ? JSON.stringify(touch.meta) : null);
    if (touch.reviewMirror) {
      existing.lastReviewedAt = touch.reviewMirror.lastReviewedAt;
      existing.nextReviewAt = touch.reviewMirror.nextReviewAt;
      existing.recallState = touch.reviewMirror.recallState;
    }
  }

  return [...byKey.values()];
}

/**
 * Record what the reader just did against the nodes it touched.
 *
 * Never throws. Callers on request paths should not await it.
 */
export async function touchNodes(userId: string, touches: readonly NodeTouch[]): Promise<void> {
  if (!userId || !touches?.length) return;
  const now = new Date();
  const rows = foldTouches(userId, touches, now);
  if (!rows.length) return;

  try {
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      await db
        .insert(UserNodeStates)
        .values(chunk)
        .onConflictDoUpdate({
          target: [UserNodeStates.userId, UserNodeStates.nodeKey],
          set: {
            exposureCount: sql`${UserNodeStates.exposureCount} + excluded."exposureCount"`,
            revisitCount: sql`${UserNodeStates.revisitCount} + excluded."revisitCount"`,
            explicitConnectionCount: sql`${UserNodeStates.explicitConnectionCount} + excluded."explicitConnectionCount"`,
            expansionCount: sql`${UserNodeStates.expansionCount} + excluded."expansionCount"`,
            synthesisCount: sql`${UserNodeStates.synthesisCount} + excluded."synthesisCount"`,
            reviewCount: sql`${UserNodeStates.reviewCount} + excluded."reviewCount"`,
            // The backfill replays out of order, so take the extremes rather than the latest write.
            firstStudiedAt: sql`LEAST(${UserNodeStates.firstStudiedAt}, excluded."firstStudiedAt")`,
            lastSeenAt: sql`GREATEST(${UserNodeStates.lastSeenAt}, excluded."lastSeenAt")`,
            // Display fields fill in once and stay; a later touch without a label keeps the old one.
            label: sql`COALESCE(excluded."label", ${UserNodeStates.label})`,
            noteId: sql`COALESCE(excluded."noteId", ${UserNodeStates.noteId})`,
            secondaryNoteId: sql`COALESCE(excluded."secondaryNoteId", ${UserNodeStates.secondaryNoteId})`,
            meta: sql`COALESCE(excluded."meta", ${UserNodeStates.meta})`,
            // The provenance line only moves forward in time, so a replayed old event cannot
            // overwrite "you linked these" with something the reader did two years ago.
            lastSignal: sql`CASE WHEN excluded."lastSourceAt" >= ${UserNodeStates.lastSourceAt} THEN excluded."lastSignal" ELSE ${UserNodeStates.lastSignal} END`,
            lastSourceLabel: sql`CASE WHEN excluded."lastSourceAt" >= ${UserNodeStates.lastSourceAt} THEN COALESCE(excluded."lastSourceLabel", ${UserNodeStates.lastSourceLabel}) ELSE ${UserNodeStates.lastSourceLabel} END`,
            lastSourceAt: sql`GREATEST(${UserNodeStates.lastSourceAt}, excluded."lastSourceAt")`,
            // Mirrors: only a review touch carries them, everything else leaves them alone.
            lastReviewedAt: sql`COALESCE(excluded."lastReviewedAt", ${UserNodeStates.lastReviewedAt})`,
            nextReviewAt: sql`CASE WHEN excluded."lastReviewedAt" IS NOT NULL THEN excluded."nextReviewAt" ELSE ${UserNodeStates.nextReviewAt} END`,
            recallState: sql`CASE WHEN excluded."lastReviewedAt" IS NOT NULL THEN excluded."recallState" ELSE ${UserNodeStates.recallState} END`,
            updatedAt: sql`excluded."updatedAt"`,
            // `status` is deliberately absent: a touch never un-archives what the cascade retired.
          },
        });
    }
  } catch (error) {
    if (isUserNodeStatesTableMissing(error)) {
      if (!warnedMissingTable) {
        warnedMissingTable = true;
        console.warn('[study-bible-layer] UserNodeStates missing; run npm run review:schema:apply');
      }
      return;
    }
    console.error('[study-bible-layer] touchNodes failed:', error);
  }
}

// ─── Touch builders ───────────────────────────────────────────────────────────
// Shared shapes, so a highlight and a pill on the same verse produce identical nodes.

export function noteTouch(input: {
  noteId: string;
  title?: string | null;
  signal: NodeSignal;
  at: Date;
  sourceLabel?: string | null;
}): NodeTouch {
  return {
    key: nodeKey.note(input.noteId),
    kind: 'note',
    signal: input.signal,
    at: input.at,
    label: input.title ?? null,
    noteId: input.noteId,
    sourceLabel: input.sourceLabel ?? null,
  };
}

export function chapterTouch(input: {
  chapter: ChapterKeyParts;
  signal: NodeSignal;
  at: Date;
  sourceLabel?: string | null;
  translation?: string | null;
}): NodeTouch {
  return {
    key: nodeKey.chapter(input.chapter),
    kind: 'chapter',
    signal: input.signal,
    at: input.at,
    label: `${input.chapter.book} ${input.chapter.chapter}`,
    sourceLabel: input.sourceLabel ?? null,
    meta: {
      book: input.chapter.book,
      chapter: input.chapter.chapter,
      ...(input.translation ? { translation: input.translation } : {}),
    },
  };
}

export function verseTouches(input: {
  verses: readonly VerseKeyParts[];
  chapters: readonly ChapterKeyParts[];
  signal: NodeSignal;
  at: Date;
  sourceLabel?: string | null;
  translation?: string | null;
}): NodeTouch[] {
  const touches: NodeTouch[] = input.verses.map((verse) => ({
    key: nodeKey.verse(verse),
    kind: 'verse' as const,
    signal: input.signal,
    at: input.at,
    label: verseReferenceLabel(verse),
    sourceLabel: input.sourceLabel ?? null,
    meta: {
      book: verse.book,
      chapter: verse.chapter,
      verse: verse.verse,
      ...(input.translation ? { translation: input.translation } : {}),
    },
  }));

  // The chapter above every verse, so reading and marking are comparable granularities.
  // Derived when the caller did not pass them, deduped by the key they would produce.
  const chapters = input.chapters.length
    ? input.chapters
    : [
        ...new Map(
          input.verses.map((v) => [chapterKeyForVerse(v), { book: v.book, chapter: v.chapter }]),
        ).values(),
      ];

  for (const chapter of chapters) {
    touches.push(
      chapterTouch({
        chapter,
        signal: 'exposure',
        at: input.at,
        sourceLabel: input.sourceLabel ?? null,
        translation: input.translation ?? null,
      }),
    );
  }

  return touches;
}

/**
 * Theme, person and place nodes for a set of verses, from the curated knowledge layer.
 *
 * This is where the two layers meet: the curated side says Romans 8 is about adoption, and
 * the personal side records that this reader has now been there four times. Themes are keyed
 * by slug rather than label — labels are display text and can be recurated — which is a
 * provenance the note fingerprints throw away, so it is resolved here at touch time instead.
 */
export async function knowledgeTouchesForVerses(input: {
  verses: readonly VerseKeyParts[];
  signal: NodeSignal;
  at: Date;
  sourceLabel?: string | null;
}): Promise<NodeTouch[]> {
  if (!input.verses.length) return [];
  try {
    const knowledge = await getKnowledgeForPassages([...input.verses], {
      minRelevance: MIN_THEME_CORROBORATION_RELEVANCE,
      themeLimit: 5,
    });

    const touches: NodeTouch[] = [];
    for (const theme of knowledge.themes) {
      touches.push({
        key: nodeKey.theme(theme.slug),
        kind: 'theme',
        signal: input.signal,
        at: input.at,
        label: theme.label,
        sourceLabel: input.sourceLabel ?? null,
        meta: { topicId: theme.topicId, slug: theme.slug },
      });
    }
    for (const person of knowledge.people) {
      touches.push({
        key: nodeKey.person(person.slug),
        kind: 'person',
        signal: input.signal,
        at: input.at,
        label: person.name,
        sourceLabel: input.sourceLabel ?? null,
        meta: { slug: person.slug },
      });
    }
    for (const place of knowledge.places) {
      touches.push({
        key: nodeKey.place(place.slug),
        kind: 'place',
        signal: input.signal,
        at: input.at,
        label: place.name,
        sourceLabel: input.sourceLabel ?? null,
        meta: { slug: place.slug },
      });
    }
    return touches;
  } catch (error) {
    console.error('[study-bible-layer] knowledgeTouchesForVerses failed:', error);
    return [];
  }
}

/**
 * Every node one scripture reference touches: its verses, their chapters, and the curated
 * themes, people and places at those verses.
 *
 * The single entry point for highlights and pills, so that marking John 15:5 in the reader
 * and citing it in a note land on exactly the same nodes. Awaits the knowledge lookup, so
 * callers on request paths should not await this.
 */
export async function scriptureTouches(input: {
  reference: string;
  signal: NodeSignal;
  at: Date;
  sourceLabel?: string | null;
  translation?: string | null;
  cap?: number;
}): Promise<NodeTouch[]> {
  const { verses, chapters } = verseNodesForReference(input.reference, { cap: input.cap });
  if (!verses.length) return [];

  const touches = verseTouches({
    verses,
    chapters,
    signal: input.signal,
    at: input.at,
    sourceLabel: input.sourceLabel,
    translation: input.translation,
  });

  const knowledge = await knowledgeTouchesForVerses({
    verses,
    signal: input.signal,
    at: input.at,
    sourceLabel: input.sourceLabel,
  });

  return [...touches, ...knowledge];
}

/** Both note nodes and the connection between them. The link is a node because it gets reviewed. */
export function connectionTouches(input: {
  fromNoteId: string;
  toNoteId: string;
  at: Date;
  sourceLabel?: string | null;
  fromTitle?: string | null;
  toTitle?: string | null;
}): NodeTouch[] {
  const [a, b] = [input.fromNoteId, input.toNoteId].sort();
  return [
    {
      key: nodeKey.connection(input.fromNoteId, input.toNoteId),
      kind: 'connection',
      signal: 'connection',
      at: input.at,
      label: input.fromTitle && input.toTitle ? `${input.fromTitle} and ${input.toTitle}` : null,
      noteId: a,
      secondaryNoteId: b,
      sourceLabel: input.sourceLabel ?? null,
    },
    noteTouch({
      noteId: input.fromNoteId,
      title: input.fromTitle,
      signal: 'connection',
      at: input.at,
      sourceLabel: input.sourceLabel ?? null,
    }),
    noteTouch({
      noteId: input.toNoteId,
      title: input.toTitle,
      signal: 'connection',
      at: input.at,
      sourceLabel: input.sourceLabel ?? null,
    }),
  ];
}

/**
 * The Thread a note belongs to, addressed by the representative note the graph picks.
 *
 * Returns nothing for an isolated note. `pickRepNoteIdForCluster` answers with the seed when
 * there are no edges — correct for its own callers, wrong here, because a Thread of one is
 * not a Thread and would put a "what is this cluster forming?" question on a lone note.
 */
export async function threadTouchForNote(
  userId: string,
  noteId: string,
  signal: NodeSignal,
  at: Date,
  sourceLabel?: string | null,
): Promise<NodeTouch[]> {
  try {
    const edges = await db
      .select({ fromNoteId: NoteConnections.fromNoteId, toNoteId: NoteConnections.toNoteId })
      .from(NoteConnections)
      .where(eq(NoteConnections.userId, userId));

    const connected = edges.some((e) => e.fromNoteId === noteId || e.toNoteId === noteId);
    if (!connected) return [];

    const repNoteId = pickRepNoteIdFromGraph(noteId, edges);
    if (!repNoteId) return [];

    const [rep] = await db
      .select({ title: Notes.title, threadTitle: Notes.studyThreadTitle })
      .from(Notes)
      .where(and(eq(Notes.id, repNoteId), eq(Notes.userId, userId)))
      .limit(1);

    return [
      {
        key: nodeKey.thread(repNoteId),
        kind: 'thread',
        signal,
        at,
        label: rep?.threadTitle?.trim() || rep?.title?.trim() || null,
        noteId: repNoteId,
        sourceLabel: sourceLabel ?? null,
      },
    ];
  } catch (error) {
    console.error('[study-bible-layer] threadTouchForNote failed:', error);
    return [];
  }
}
