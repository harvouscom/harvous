/**
 * The group leader kit — what a church hands the people who lead its groups, alongside a study
 * plan (docs/CHURCH_V2_ROADMAP.md §E).
 *
 * **One gate** for all of it, `canUseLeaderKit`: the plan's room is a group or a channel, and
 * the viewer may shape its threads (`canManageSpaceThreadStructure`) — the same rule that already
 * decides who sees a plan's `pulse`. In a channel that is its staff; in a group, its owner and
 * leaders. Followers and members never pass, and a plan in someone's Home never has a kit.
 *
 * **Kit carry** (Derek, Sept 26 2026): a copy carries the kit only into a church room of the
 * same church as the channel. A follower who copied a plan into a group they made themselves
 * would otherwise be reading the leader notes.
 */
import { createHash } from 'node:crypto';
import {
  db,
  first,
  StudyPlanCopyBaselines,
  StudyPlanLibraryItems,
  StudyPlanStepGuides,
  Threads,
  and,
  eq,
  inArray,
} from '../db';
import { canManageSpaceThreadStructure, loadLiveThreadNoteIds } from './thread-sequence';
import { requireSpaceAccess, SpaceAccessError, type SpaceRole, type SpaceRow } from './space-access';

export const LEADER_NOTES_MAX = 4000;
export const QUESTIONS_MAX = 12;
export const QUESTION_MAX = 300;

/** Pure: may this person use the kit on a plan in this room? */
export function canUseLeaderKit(
  space: Pick<SpaceRow, 'type' | 'userId' | 'orgId'> | null | undefined,
  role: SpaceRole,
  userId: string,
): boolean {
  if (!space || (space.type !== 'shared' && space.type !== 'public')) return false;
  return canManageSpaceThreadStructure(space, role, userId);
}

export type LeaderKitAccess =
  | { ok: true; thread: { id: string; spaceId: string; copiedFromThreadId: string | null }; space: SpaceRow }
  | { ok: false; status: 403 | 404; code: string; error: string };

/**
 * The plan and the viewer's standing on it. A plan that doesn't exist, isn't a sequence, lives in
 * a Home, or sits in a room the viewer isn't in is a 404; one they can see but not lead is a 403.
 */
export async function resolveLeaderKitAccess(threadId: string, userId: string): Promise<LeaderKitAccess> {
  const thread = first(
    await db
      .select({ id: Threads.id, spaceId: Threads.spaceId, mode: Threads.mode, copiedFromThreadId: Threads.copiedFromThreadId })
      .from(Threads)
      .where(eq(Threads.id, threadId))
      .limit(1),
  );
  if (!thread || thread.mode !== 'sequence' || !thread.spaceId) {
    return { ok: false, status: 404, code: 'NOT_FOUND', error: 'Study plan not found' };
  }
  let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
  try {
    access = await requireSpaceAccess(thread.spaceId, userId);
  } catch (error) {
    if (error instanceof SpaceAccessError) return { ok: false, status: 404, code: 'NOT_FOUND', error: 'Study plan not found' };
    throw error;
  }
  if (!canUseLeaderKit(access.space, access.role, userId)) {
    return { ok: false, status: 403, code: 'LEADER_ROLE_REQUIRED', error: 'Only this group’s leaders see its leader notes' };
  }
  return {
    ok: true,
    thread: { id: thread.id, spaceId: thread.spaceId, copiedFromThreadId: thread.copiedFromThreadId },
    space: access.space,
  };
}

/** Pure: a question list from stored JSON. Anything malformed reads as none. */
export function parseQuestions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === 'string') : [];
  } catch {
    return [];
  }
}

export type GuideInput = { leaderNotes: string | null; questions: string[] };

/**
 * Pure: a guide from a request body — plain text, trimmed, capped. Null when the guide is empty,
 * which the route reads as "delete it"; an error for input that is the wrong shape.
 */
export function normalizeGuideInput(body: unknown): { ok: true; guide: GuideInput | null } | { ok: false; error: string } {
  const raw = (body && typeof body === 'object' ? body : {}) as { leaderNotes?: unknown; questions?: unknown };
  if (raw.leaderNotes != null && typeof raw.leaderNotes !== 'string') return { ok: false, error: 'Notes must be text' };
  if (raw.questions != null && !Array.isArray(raw.questions)) return { ok: false, error: 'Questions must be a list' };
  const notes = typeof raw.leaderNotes === 'string' ? raw.leaderNotes.replace(/\r\n/g, '\n').trim() : '';
  if (notes.length > LEADER_NOTES_MAX) return { ok: false, error: `Keep notes under ${LEADER_NOTES_MAX} characters` };
  const questions = ((raw.questions as unknown[]) ?? [])
    .map((q) => (typeof q === 'string' ? q.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean);
  if (questions.length > QUESTIONS_MAX) return { ok: false, error: `At most ${QUESTIONS_MAX} questions` };
  if (questions.some((q) => q.length > QUESTION_MAX)) return { ok: false, error: `Keep each question under ${QUESTION_MAX} characters` };
  if (!notes && questions.length === 0) return { ok: true, guide: null };
  return { ok: true, guide: { leaderNotes: notes || null, questions } };
}

/**
 * Pure: does this copy carry the kit? Only into a church room of the same church as the channel
 * it came from. A Home copy, a churchless group, or another church's room gets steps only.
 */
export function decideKitCarry(input: {
  targetSpace: { type: string | null; orgId: string | null } | null;
  sourceOrgId: string | null;
}): boolean {
  const { targetSpace, sourceOrgId } = input;
  return Boolean(
    targetSpace &&
      sourceOrgId &&
      (targetSpace.type === 'shared' || targetSpace.type === 'public') &&
      targetSpace.orgId === sourceOrgId,
  );
}

type GuideRow = typeof StudyPlanStepGuides.$inferSelect;

/** Pure: the source's guides as rows for the copy, keyed to the copy's own step ids. */
export function remapGuidesForCopy(input: {
  guides: readonly Pick<GuideRow, 'id' | 'noteId' | 'leaderNotes' | 'questions'>[];
  stepIdMap: ReadonlyMap<string, string>;
  copyThreadId: string;
  actorId: string;
  now: Date;
}): (typeof StudyPlanStepGuides.$inferInsert)[] {
  return input.guides.flatMap((guide) => {
    const noteId = input.stepIdMap.get(guide.noteId);
    if (!noteId) return [];
    return [
      {
        id: `spg_${crypto.randomUUID()}`,
        threadId: input.copyThreadId,
        noteId,
        leaderNotes: guide.leaderNotes,
        questions: guide.questions,
        copiedFromGuideId: guide.id,
        updatedByUserId: input.actorId,
        createdAt: input.now,
        updatedAt: input.now,
      },
    ];
  });
}

/** Pure: what a step says, as a fingerprint — the source-updated notice compares these. */
export function stepFingerprint(step: { title: string | null; content: string | null }): string {
  return createHash('sha256').update(`${step.title ?? ''}\n${step.content ?? ''}`).digest('hex');
}

/** A plan's guides, for its live steps only — a step removed from the plan drops its guide. */
export async function loadGuides(threadId: string, spaceId: string): Promise<Record<string, GuideInput>> {
  const live = new Set(await loadLiveThreadNoteIds(threadId, spaceId));
  if (live.size === 0) return {};
  const rows = await db
    .select()
    .from(StudyPlanStepGuides)
    .where(and(eq(StudyPlanStepGuides.threadId, threadId), inArray(StudyPlanStepGuides.noteId, [...live])));
  const out: Record<string, GuideInput> = {};
  for (const row of rows) out[row.noteId] = { leaderNotes: row.leaderNotes, questions: parseQuestions(row.questions) };
  return out;
}

/** The source plan's guides, read before a copy's transaction (kept out of it on purpose). */
export async function sourceGuidesFor(threadId: string) {
  return db
    .select({
      id: StudyPlanStepGuides.id,
      noteId: StudyPlanStepGuides.noteId,
      leaderNotes: StudyPlanStepGuides.leaderNotes,
      questions: StudyPlanStepGuides.questions,
    })
    .from(StudyPlanStepGuides)
    .where(eq(StudyPlanStepGuides.threadId, threadId));
}

/** The baseline row a copy records: what each copied source step said. */
export function baselineRowFor(input: {
  copyThreadId: string;
  sourceThreadId: string;
  steps: readonly { id: string; title: string | null; content: string | null }[];
  now: Date;
}): typeof StudyPlanCopyBaselines.$inferInsert {
  const fingerprints: Record<string, string> = {};
  for (const step of input.steps) fingerprints[step.id] = stepFingerprint(step);
  return {
    id: `spcb_${crypto.randomUUID()}`,
    threadId: input.copyThreadId,
    sourceThreadId: input.sourceThreadId,
    stepFingerprints: JSON.stringify(fingerprints),
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/**
 * Delete a plan's kit — guides, attached resources and its copy baseline — with the plan. Nothing
 * cascades in this schema, so every path that deletes a Thread calls this.
 */
export async function deleteLeaderKitForThreads(
  tx: Pick<typeof db, 'delete'>,
  threadIds: readonly string[],
): Promise<void> {
  if (threadIds.length === 0) return;
  const ids = [...threadIds];
  await tx.delete(StudyPlanStepGuides).where(inArray(StudyPlanStepGuides.threadId, ids));
  await tx.delete(StudyPlanLibraryItems).where(inArray(StudyPlanLibraryItems.threadId, ids));
  await tx.delete(StudyPlanCopyBaselines).where(inArray(StudyPlanCopyBaselines.threadId, ids));
}
