/**
 * The database half of Challenges.
 *
 * A challenge is authored structure (src/utils/challenge-templates.ts) bound to the reader's
 * own material, and this file is the binding: it resolves a Thread, question, verse or
 * connection into a `ChallengeSource`, hands that to the template, and stores the result. The
 * steps are built once, at creation, and never regenerated — so a Thread that grows afterwards
 * does not silently rewrite a path the reader is halfway through.
 */

import {
  db,
  and,
  desc,
  eq,
  inArray,
  or,
  Challenges,
  Notes,
  NoteConnections,
  StudyThreadEntries,
  first,
} from '../db';
import { generateTimestampId } from '@/utils/ids';
import { threadTouchForNote, touchNodes } from './study-bible-layer';
import { THREAD_FORMING_SOURCE } from '@/utils/study-bible-source-copy';
import {
  type ChallengeSettableStatus,
  type ChallengeStatus,
  type ChallengeStepStatus,
  type ChallengeTemplateKey,
} from '@/utils/review-item-kinds';
import {
  type ChallengeSource,
  type ChallengeStep,
  applyStepOutcome,
  buildChallengeSteps,
  challengeSourceKey,
  challengeTitle,
  countResolvedSteps,
  isChallengeComplete,
  isQuestionNoteTitle,
  nextPendingStepIndex,
  parseChallengeSteps,
} from '@/utils/challenge-templates';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { collectStudyThreadGraph } from './study-thread-graph';
import { fetchStudyThreadNoteRows } from './study-thread-note-rows';
import { pickRepNoteIdForCluster } from './study-thread-cluster-count';
import { resolveStudyThreadClusterNaming } from './study-thread-cluster-naming';
import { fetchVerseText } from './fetch-verse-text';
import { createReviewItem, stripHtml } from './review-service';
import { buildVerseCloze, type VerseCloze } from '@/utils/verse-cloze';

export interface ChallengeRow {
  id: string;
  userId: string;
  templateKey: string;
  title: string;
  status: string;
  sourceKey: string;
  sourceNoteId: string | null;
  sourceSecondaryNoteId: string | null;
  sourceEntryId: string | null;
  scriptureReference: string | null;
  translation: string | null;
  steps: string;
  currentStepIndex: number;
  startedAt: Date;
  lastStepAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface ChallengeView {
  id: string;
  templateKey: ChallengeTemplateKey;
  title: string;
  status: ChallengeStatus;
  steps: ChallengeStep[];
  currentStepIndex: number;
  resolvedSteps: number;
  totalSteps: number;
  sourceNoteId: string | null;
  sourceSecondaryNoteId: string | null;
  scriptureReference: string | null;
  startedAt: string;
  completedAt: string | null;
}

export function toChallengeView(row: ChallengeRow): ChallengeView {
  const steps = parseChallengeSteps(row.steps);
  return {
    id: row.id,
    templateKey: row.templateKey as ChallengeTemplateKey,
    title: row.title,
    status: row.status as ChallengeStatus,
    steps,
    currentStepIndex: row.currentStepIndex,
    resolvedSteps: countResolvedSteps(steps),
    totalSteps: steps.length,
    sourceNoteId: row.sourceNoteId,
    sourceSecondaryNoteId: row.sourceSecondaryNoteId,
    scriptureReference: row.scriptureReference,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function displayTitle(title: string | null | undefined): string {
  return stripServerAutoUntitledNoteTitleForDisplay((title ?? '').trim());
}

export async function listChallenges(
  userId: string,
  status?: ChallengeStatus,
): Promise<ChallengeRow[]> {
  const where = status
    ? and(eq(Challenges.userId, userId), eq(Challenges.status, status))
    : eq(Challenges.userId, userId);
  return (await db
    .select()
    .from(Challenges)
    .where(where)
    .orderBy(desc(Challenges.startedAt))
    .limit(100)) as ChallengeRow[];
}

export async function getChallenge(userId: string, id: string): Promise<ChallengeRow | null> {
  const row = first(
    await db
      .select()
      .from(Challenges)
      .where(and(eq(Challenges.id, id), eq(Challenges.userId, userId)))
      .limit(1),
  );
  return (row as ChallengeRow | undefined) ?? null;
}

export interface ResolveSourceInput {
  templateKey: ChallengeTemplateKey;
  noteId?: string | null;
  secondaryNoteId?: string | null;
  repNoteId?: string | null;
  scriptureReference?: string | null;
  translation?: string | null;
  studyThreadEntryId?: string | null;
}

/**
 * Turn what the client sent into a source the template can build from.
 *
 * Every branch verifies ownership, because the ids arrive from the browser. The verse branch
 * also verifies that the reference resolves to actual text — a challenge built on a
 * mistyped reference would produce five steps about a passage that does not exist.
 */
export async function resolveChallengeSource(
  userId: string,
  input: ResolveSourceInput,
): Promise<ChallengeSource | { error: string }> {
  switch (input.templateKey) {
    case 'strengthen_thread': {
      const seed = (input.repNoteId || input.noteId || '').trim();
      if (!seed) return { error: 'A Thread needs a note to start from' };
      if (!(await ownsNote(userId, seed))) return { error: 'Note not found' };

      const repNoteId = (await pickRepNoteIdForCluster(userId, seed)) ?? seed;
      const graph = await collectStudyThreadGraph(repNoteId, userId);
      const rows = await fetchStudyThreadNoteRows(graph.nodeIds, userId);
      if (rows.length < 2) return { error: 'This Thread needs more than one note' };

      const naming = resolveStudyThreadClusterNaming(
        rows,
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          content: r.content,
          noteType: r.noteType,
          degree: graph.degreeMap.get(r.id) ?? 0,
        })),
        repNoteId,
      );

      return {
        kind: 'thread',
        repNoteId: naming.repNoteId,
        threadTitle: naming.threadTitle,
        memberNoteIds: rows.map((r) => r.id),
        memberTitles: rows.map((r) => displayTitle(r.title)).filter(Boolean),
      };
    }

    case 'keep_verse': {
      const reference = (input.scriptureReference || '').trim();
      if (!reference) return { error: 'A verse challenge needs a reference' };
      const text = await fetchVerseText(reference, input.translation ?? 'NET');
      if (!text) return { error: 'That reference did not resolve to a passage' };
      return {
        kind: 'verse',
        reference,
        translation: input.translation ?? null,
        entryId: input.studyThreadEntryId ?? null,
      };
    }

    case 'return_to_question': {
      const noteId = (input.noteId || '').trim();
      if (!noteId) return { error: 'A question challenge needs a note' };
      const note = first(
        await db
          .select({ id: Notes.id, title: Notes.title })
          .from(Notes)
          .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
          .limit(1),
      );
      if (!note) return { error: 'Note not found' };
      if (!isQuestionNoteTitle(note.title)) {
        return { error: 'This path is for a note titled as a question' };
      }
      return { kind: 'question', noteId: note.id, title: displayTitle(note.title) };
    }

    case 'trace_connection': {
      const fromNoteId = (input.noteId || '').trim();
      const toNoteId = (input.secondaryNoteId || '').trim();
      if (!fromNoteId || !toNoteId) return { error: 'A connection needs two notes' };

      const edge = first(
        await db
          .select({ id: NoteConnections.id })
          .from(NoteConnections)
          .where(
            and(
              eq(NoteConnections.userId, userId),
              or(
                and(
                  eq(NoteConnections.fromNoteId, fromNoteId),
                  eq(NoteConnections.toNoteId, toNoteId),
                ),
                and(
                  eq(NoteConnections.fromNoteId, toNoteId),
                  eq(NoteConnections.toNoteId, fromNoteId),
                ),
              ),
            ),
          )
          .limit(1),
      );
      if (!edge) return { error: 'These notes are not connected' };

      const rows = await db
        .select({ id: Notes.id, title: Notes.title })
        .from(Notes)
        .where(and(eq(Notes.userId, userId), inArray(Notes.id, [fromNoteId, toNoteId])));
      if (rows.length < 2) return { error: 'Note not found' };
      const byId = new Map(rows.map((r) => [r.id, r]));

      return {
        kind: 'connection',
        fromNoteId,
        toNoteId,
        fromTitle: displayTitle(byId.get(fromNoteId)?.title),
        toTitle: displayTitle(byId.get(toNoteId)?.title),
      };
    }
  }
}

async function ownsNote(userId: string, noteId: string): Promise<boolean> {
  const row = first(
    await db
      .select({ id: Notes.id })
      .from(Notes)
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
      .limit(1),
  );
  return Boolean(row);
}

export type CreateChallengeResult =
  | { challenge: ChallengeRow }
  | { error: string; code?: string; existingId?: string };

/**
 * Start a path.
 *
 * One active path per source, because two "Strengthen Covenant" challenges are two lists of
 * the same five questions and finishing either leaves the other looking unfinished. A
 * completed or retired one does not block a new attempt — returning to a Thread a year later
 * is exactly the behaviour this feature is for.
 */
export async function createChallenge(
  userId: string,
  input: ResolveSourceInput,
  now: Date = new Date(),
): Promise<CreateChallengeResult> {
  const source = await resolveChallengeSource(userId, input);
  if ('error' in source) return { error: source.error };

  const sourceKey = challengeSourceKey(input.templateKey, source);

  const existing = first(
    await db
      .select()
      .from(Challenges)
      .where(
        and(
          eq(Challenges.userId, userId),
          eq(Challenges.sourceKey, sourceKey),
          inArray(Challenges.status, ['active', 'paused']),
        ),
      )
      .limit(1),
  ) as ChallengeRow | undefined;

  if (existing) {
    return {
      error: 'You already have this challenge open',
      code: 'CHALLENGE_ALREADY_ACTIVE',
      existingId: existing.id,
    };
  }

  const steps = buildChallengeSteps(input.templateKey, source);
  const row = first(
    await db
      .insert(Challenges)
      .values({
        id: generateTimestampId('challenge'),
        userId,
        templateKey: input.templateKey,
        title: challengeTitle(input.templateKey, source),
        status: 'active',
        sourceKey,
        sourceNoteId:
          source.kind === 'thread'
            ? source.repNoteId
            : source.kind === 'question'
              ? source.noteId
              : source.kind === 'connection'
                ? source.fromNoteId
                : null,
        sourceSecondaryNoteId: source.kind === 'connection' ? source.toNoteId : null,
        sourceEntryId: source.kind === 'verse' ? (source.entryId ?? null) : null,
        scriptureReference: source.kind === 'verse' ? source.reference : null,
        translation: source.kind === 'verse' ? (source.translation ?? null) : null,
        steps: JSON.stringify(steps),
        currentStepIndex: 0,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning(),
  ) as ChallengeRow;

  /*
   * A verse path also puts the verse into Review.
   *
   * The challenge is five sittings; keeping the verse is the point, and that outlives the
   * path. Without this, finishing "Keep John 15:5" would end with the verse dropping out of
   * the app entirely — the reader having done the work is precisely when it should start
   * coming back on a schedule. Non-fatal: a failure here must not lose the challenge.
   */
  if (source.kind === 'verse') {
    try {
      await createReviewItem(
        userId,
        {
          kind: 'verse',
          scriptureReference: source.reference,
          translation: source.translation ?? null,
          studyThreadEntryId: source.entryId ?? null,
          origin: 'challenge',
          challengeId: row.id,
        },
        now,
      );
    } catch (error) {
      console.warn('[challenge-service] verse review item not created', error);
    }
  }

  return { challenge: row };
}

export type StepOutcomeResult =
  | { challenge: ChallengeRow }
  | { error: string; code?: string };

export async function completeChallengeStep(
  userId: string,
  challenge: ChallengeRow,
  stepKey: string,
  status: Exclude<ChallengeStepStatus, 'pending'>,
  extra: { artifactNoteId?: string; response?: string } = {},
  now: Date = new Date(),
): Promise<StepOutcomeResult> {
  const steps = parseChallengeSteps(challenge.steps);
  if (!steps.some((s) => s.key === stepKey)) {
    return { error: 'Unknown step', code: 'CHALLENGE_STEP_NOT_FOUND' };
  }

  const next = applyStepOutcome(steps, stepKey, status, { ...extra, at: now });
  const complete = isChallengeComplete(next);

  const updated = first(
    await db
      .update(Challenges)
      .set({
        steps: JSON.stringify(next),
        currentStepIndex: nextPendingStepIndex(next),
        lastStepAt: now,
        // Completing does not overwrite an existing completedAt — a reopened step on a
        // finished path should not restamp when it was finished.
        ...(complete
          ? { status: 'completed', completedAt: challenge.completedAt ?? now }
          : {}),
        updatedAt: now,
      })
      .where(and(eq(Challenges.id, challenge.id), eq(Challenges.userId, userId)))
      .returning(),
  ) as ChallengeRow;

  // Study Bible layer: a written summary step is the reader saying what the whole Thread is,
  // which is the same act as naming one. Skipping the step is not, and records nothing.
  const step = next.find((s) => s.key === stepKey);
  if (step?.kind === 'summary' && status === 'done' && challenge.sourceNoteId) {
    void (async () => {
      const touches = await threadTouchForNote(
        userId,
        challenge.sourceNoteId!,
        'synthesis',
        now,
        THREAD_FORMING_SOURCE,
      );
      await touchNodes(userId, touches);
    })();
  }

  return { challenge: updated };
}

export async function setChallengeStatus(
  userId: string,
  challenge: ChallengeRow,
  status: ChallengeSettableStatus,
  now: Date = new Date(),
): Promise<ChallengeRow> {
  return first(
    await db
      .update(Challenges)
      .set({ status, updatedAt: now })
      .where(and(eq(Challenges.id, challenge.id), eq(Challenges.userId, userId)))
      .returning(),
  ) as ChallengeRow;
}

export interface ChallengeContext {
  members?: { id: string; title: string }[];
  verseText?: string | null;
  cloze?: VerseCloze | null;
}

/** What the challenge page needs beyond the stored steps. */
export async function buildChallengeContext(
  userId: string,
  row: ChallengeRow,
): Promise<ChallengeContext> {
  const context: ChallengeContext = {};

  if (row.templateKey === 'strengthen_thread' && row.sourceNoteId) {
    const graph = await collectStudyThreadGraph(row.sourceNoteId, userId);
    const rows = await fetchStudyThreadNoteRows(graph.nodeIds, userId);
    context.members = rows.map((r) => ({ id: r.id, title: displayTitle(r.title) || 'Untitled' }));
  }

  if (row.templateKey === 'trace_connection') {
    const ids = [row.sourceNoteId, row.sourceSecondaryNoteId].filter(
      (id): id is string => Boolean(id),
    );
    if (ids.length) {
      const rows = await db
        .select({ id: Notes.id, title: Notes.title })
        .from(Notes)
        .where(and(eq(Notes.userId, userId), inArray(Notes.id, ids)));
      context.members = rows.map((r) => ({ id: r.id, title: displayTitle(r.title) || 'Untitled' }));
    }
  }

  if (row.scriptureReference) {
    const html = await fetchVerseText(row.scriptureReference, row.translation ?? 'NET');
    context.verseText = html || null;
    // The rebuild rung is the only one that hides words; the rest read the verse plainly.
    const steps = parseChallengeSteps(row.steps);
    const current = steps[row.currentStepIndex];
    if (html && current?.ladderStep === 1) {
      context.cloze = buildVerseCloze(stripHtml(html), `${row.id}:${current.ladderStep}`);
    }
  }

  return context;
}

/** Highlight deletion retires review items anchored to it. Called from the study-threads route. */
export async function retireChallengesForEntry(userId: string, entryId: string): Promise<void> {
  await db
    .update(Challenges)
    .set({ status: 'retired', updatedAt: new Date() })
    .where(
      and(
        eq(Challenges.userId, userId),
        eq(Challenges.sourceEntryId, entryId),
        inArray(Challenges.status, ['active', 'paused']),
      ),
    );
}
