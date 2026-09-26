/**
 * "Your church updated this plan" — a leader-only notice on a group's copy of a church study
 * plan (docs/CHURCH_V2_ROADMAP.md §E, phase 4).
 *
 * Two kinds of change, measured against the copy's baseline (what each source step said when it
 * was copied, or last marked seen — `StudyPlanCopyBaselines`):
 *   - **new steps**: in the church's plan now, never seen by this copy — typically a series that
 *     republished with another week;
 *   - **edited steps**: seen, but the church's words have changed since.
 *
 * What a leader can do (Derek, Sept 26 2026): add the new steps in place, and open the church's
 * version of an edited one. Nothing ever overwrites the group's own copy of a step — a leader
 * may have adapted it — so an edit is only ever looked at, then marked seen.
 */
import {
  db,
  first,
  LibraryItemScopes,
  Notes,
  SpaceMemberships,
  Spaces,
  StudyPlanCopyBaselines,
  StudyPlanLibraryItems,
  StudyPlanStepGuides,
  Threads,
  UserMetadata,
  and,
  eq,
  inArray,
} from '../db';
import { parseSequenceNoteIds, serializeSequenceNoteIds, loadLiveThreadNoteIds } from './thread-sequence';
import {
  planResourceCarry,
  remapGuidesForCopy,
  sourceGuidesFor,
  sourceResourcesFor,
  stepFingerprint,
} from './study-plan-leader-kit';
import {
  buildCopiedStepRows,
  insertCopiedStepsInTx,
  loadVisibleSourceSteps,
  postProcessCopiedSteps,
} from './study-plan-copy';
import { ensurePersonalHomeSpace } from './ensure-personal-home-space';
import { getEffectiveHighestSimpleNoteId } from './highest-simple-note-id';

export type SourceStep = { id: string; title: string | null; content: string | null };
export type CopyStep = { id: string; copiedFromNoteId: string | null };

export type UpstreamDiff = {
  newSteps: { sourceNoteId: string; title: string }[];
  editedSteps: { sourceNoteId: string; copyNoteId: string; title: string }[];
};

/** Pure: a stored fingerprint map, forgiving of anything malformed. */
export function parseFingerprints(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Pure: what changed upstream. With a baseline, new = source steps it has never seen, and edited
 * = seen steps whose words differ now and which the group still has a copy of. A copy made
 * before baselines existed has none: every step the group holds a copy of counts as seen, and
 * nothing is flagged as edited — there is nothing honest to compare against.
 */
export function diffUpstream(input: {
  sourceSteps: readonly SourceStep[];
  baseline: Record<string, string> | null;
  copySteps: readonly CopyStep[];
}): UpstreamDiff {
  const copyBySource = new Map<string, string>();
  for (const step of input.copySteps) if (step.copiedFromNoteId) copyBySource.set(step.copiedFromNoteId, step.id);
  const seen = input.baseline ? new Set(Object.keys(input.baseline)) : new Set(copyBySource.keys());

  const newSteps: UpstreamDiff['newSteps'] = [];
  const editedSteps: UpstreamDiff['editedSteps'] = [];
  for (const step of input.sourceSteps) {
    const title = step.title?.trim() || 'Untitled step';
    if (!seen.has(step.id)) {
      newSteps.push({ sourceNoteId: step.id, title });
      continue;
    }
    const recorded = input.baseline?.[step.id];
    const copyNoteId = copyBySource.get(step.id);
    if (recorded && copyNoteId && recorded !== stepFingerprint(step)) {
      editedSteps.push({ sourceNoteId: step.id, copyNoteId, title });
    }
  }
  return { newSteps, editedSteps };
}

/**
 * Pure: the copy's new sequence with new steps placed where the church put them — each right
 * after the copy of its nearest earlier church step, or at the end when it has none. Steps
 * added in one go keep their church order.
 */
export function placeNewSteps(input: {
  copySequence: readonly string[];
  sourceSequence: readonly string[];
  /** Church step id → the group's copy of it, for steps the group has. */
  copyBySource: ReadonlyMap<string, string>;
  /** Church step id → the new copy being added. */
  added: ReadonlyMap<string, string>;
}): string[] {
  const out = [...input.copySequence];
  const placed = new Map(input.copyBySource);
  for (const sourceId of input.sourceSequence) {
    const newId = input.added.get(sourceId);
    if (!newId) continue;
    const earlier = input.sourceSequence.slice(0, input.sourceSequence.indexOf(sourceId)).reverse();
    const anchor = earlier.map((id) => placed.get(id)).find((id) => id && out.includes(id));
    if (anchor) out.splice(out.indexOf(anchor) + 1, 0, newId);
    else out.push(newId);
    placed.set(sourceId, newId);
  }
  return out;
}

export type SourcePlan = {
  sourceThreadId: string;
  channelSpaceId: string;
  channelOrgId: string;
  sourceSequenceNoteIds: string | null;
};

/**
 * The church plan a group's copy came from — only when it is still a live study plan in a church
 * channel this viewer can see. A shared-link import also sets `copiedFromThreadId`; it never
 * matches here, and neither does a channel the viewer is no longer in (restricted channels).
 */
export async function resolveSourcePlan(copiedFromThreadId: string | null, userId: string): Promise<SourcePlan | null> {
  if (!copiedFromThreadId) return null;
  const source = first(
    await db
      .select({ id: Threads.id, spaceId: Threads.spaceId, mode: Threads.mode, sequenceNoteIds: Threads.sequenceNoteIds })
      .from(Threads)
      .where(eq(Threads.id, copiedFromThreadId))
      .limit(1),
  );
  if (!source || source.mode !== 'sequence' || !source.spaceId) return null;
  const channel = first(
    await db
      .select({ id: Spaces.id, type: Spaces.type, orgId: Spaces.orgId, deletedAt: Spaces.deletedAt })
      .from(Spaces)
      .where(eq(Spaces.id, source.spaceId))
      .limit(1),
  );
  if (!channel || channel.deletedAt || channel.type !== 'public' || !channel.orgId) return null;
  const member = first(
    await db
      .select({ id: SpaceMemberships.id })
      .from(SpaceMemberships)
      .where(and(eq(SpaceMemberships.spaceId, channel.id), eq(SpaceMemberships.userId, userId)))
      .limit(1),
  );
  if (!member) return null;
  return { sourceThreadId: source.id, channelSpaceId: channel.id, channelOrgId: channel.orgId, sourceSequenceNoteIds: source.sequenceNoteIds };
}

/** The group copy's live steps and what each was copied from. */
export async function loadCopySteps(copyThreadId: string, spaceId: string): Promise<CopyStep[]> {
  const live = await loadLiveThreadNoteIds(copyThreadId, spaceId);
  if (live.length === 0) return [];
  return db
    .select({ id: Notes.id, copiedFromNoteId: Notes.copiedFromNoteId })
    .from(Notes)
    .where(inArray(Notes.id, live));
}

/** The notice for one copy, or null when nothing changed (or it isn't a church plan's copy). */
export async function sourceUpdateFor(input: {
  copyThreadId: string;
  copiedFromThreadId: string | null;
  spaceId: string;
  userId: string;
}): Promise<(UpstreamDiff & { channelSpaceId: string }) | null> {
  const source = await resolveSourcePlan(input.copiedFromThreadId, input.userId);
  if (!source) return null;
  const [sourceSteps, copySteps, baselineRow] = await Promise.all([
    loadVisibleSourceSteps(source.sourceSequenceNoteIds, source.channelSpaceId),
    loadCopySteps(input.copyThreadId, input.spaceId),
    db
      .select({ stepFingerprints: StudyPlanCopyBaselines.stepFingerprints })
      .from(StudyPlanCopyBaselines)
      .where(eq(StudyPlanCopyBaselines.threadId, input.copyThreadId))
      .limit(1)
      .then(first),
  ]);
  const diff = diffUpstream({
    sourceSteps,
    baseline: baselineRow ? parseFingerprints(baselineRow.stepFingerprints) : null,
    copySteps,
  });
  if (diff.newSteps.length === 0 && diff.editedSteps.length === 0) return null;
  return { ...diff, channelSpaceId: source.channelSpaceId };
}

/**
 * The copy's baseline row inside a transaction, locked; created from what the group already holds
 * for a copy made before baselines existed (everything it has counts as seen, as of now).
 */
async function lockBaseline(
  tx: any,
  input: { copyThreadId: string; sourceThreadId: string; sourceSteps: readonly SourceStep[]; copySteps: readonly CopyStep[]; now: Date },
): Promise<{ id: string; fingerprints: Record<string, string> }> {
  const row = first(
    await tx
      .select()
      .from(StudyPlanCopyBaselines)
      .where(eq(StudyPlanCopyBaselines.threadId, input.copyThreadId))
      .for('update')
      .limit(1),
  ) as typeof StudyPlanCopyBaselines.$inferSelect | undefined;
  if (row) return { id: row.id, fingerprints: parseFingerprints(row.stepFingerprints) };
  const held = new Set(input.copySteps.map((s) => s.copiedFromNoteId).filter(Boolean));
  const fingerprints: Record<string, string> = {};
  for (const step of input.sourceSteps) if (held.has(step.id)) fingerprints[step.id] = stepFingerprint(step);
  const id = `spcb_${crypto.randomUUID()}`;
  await tx
    .insert(StudyPlanCopyBaselines)
    .values({
      id,
      threadId: input.copyThreadId,
      sourceThreadId: input.sourceThreadId,
      stepFingerprints: JSON.stringify(fingerprints),
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing();
  return { id, fingerprints };
}

export type SourceUpdateResult = { ok: true; added: number } | { ok: false; status: 404; code: string; error: string };

/**
 * Bring the church's new steps into a group's copy, each placed after its nearest earlier step.
 * Idempotent: the baseline is locked and the set recomputed inside the transaction, so a double
 * click adds nothing twice. The group's current step never moves.
 */
export async function addUpstreamSteps(input: {
  copyThreadId: string;
  copiedFromThreadId: string | null;
  spaceId: string;
  actorId: string;
  requested: readonly string[] | null;
  carryKit: boolean;
}): Promise<SourceUpdateResult> {
  const source = await resolveSourcePlan(input.copiedFromThreadId, input.actorId);
  if (!source) return { ok: false, status: 404, code: 'SOURCE_NOT_FOUND', error: 'Your church’s plan is no longer available' };
  const [sourceSteps, copySteps] = await Promise.all([
    loadVisibleSourceSteps(source.sourceSequenceNoteIds, source.channelSpaceId),
    loadCopySteps(input.copyThreadId, input.spaceId),
  ]);
  const homeSpaceId = await ensurePersonalHomeSpace(input.actorId);
  const effectiveHighest = await getEffectiveHighestSimpleNoteId(input.actorId);
  const guideSource = input.carryKit ? await sourceGuidesFor(source.sourceThreadId) : [];
  const resourceSource = input.carryKit ? await sourceResourcesFor(source.sourceThreadId) : null;
  const now = new Date();

  const added = await db.transaction(async (tx) => {
    const baseline = await lockBaseline(tx, {
      copyThreadId: input.copyThreadId,
      sourceThreadId: source.sourceThreadId,
      sourceSteps,
      copySteps,
      now,
    });
    const thread = first(
      await tx
        .select({ sequenceNoteIds: Threads.sequenceNoteIds })
        .from(Threads)
        .where(eq(Threads.id, input.copyThreadId))
        .for('update')
        .limit(1),
    ) as { sequenceNoteIds: string | null } | undefined;
    if (!thread) return [];

    const wanted = input.requested ? new Set(input.requested) : null;
    const toAdd = sourceSteps.filter((step) => !(step.id in baseline.fingerprints) && (!wanted || wanted.has(step.id)));
    if (toAdd.length === 0) return [];

    const locked = first(
      await tx.select().from(UserMetadata).where(eq(UserMetadata.userId, input.actorId)).for('update').limit(1),
    ) as typeof UserMetadata.$inferSelect | undefined;
    if (!locked) throw new Error('User metadata missing while adding upstream steps');

    const noteRows = buildCopiedStepRows({
      steps: toAdd,
      threadId: input.copyThreadId,
      homeSpaceId,
      actorId: input.actorId,
      base: now.getTime(),
    });
    const firstSimple = await insertCopiedStepsInTx(tx, {
      noteRows,
      actorId: input.actorId,
      threadId: input.copyThreadId,
      targetSpaceId: input.spaceId,
      now,
      highestSimpleNoteId: Math.max(effectiveHighest, locked.highestSimpleNoteId ?? 0),
    });
    await tx
      .update(UserMetadata)
      .set({ highestSimpleNoteId: firstSimple + noteRows.length - 1, updatedAt: now })
      .where(eq(UserMetadata.userId, input.actorId));

    const addedMap = new Map(toAdd.map((step, index) => [step.id, noteRows[index].id]));
    const copyBySource = new Map(
      copySteps.filter((s) => s.copiedFromNoteId).map((s) => [s.copiedFromNoteId as string, s.id]),
    );
    const sequence = placeNewSteps({
      copySequence: parseSequenceNoteIds(thread.sequenceNoteIds),
      sourceSequence: sourceSteps.map((s) => s.id),
      copyBySource,
      added: addedMap,
    });
    await tx
      .update(Threads)
      .set({ sequenceNoteIds: serializeSequenceNoteIds(sequence), updatedAt: now })
      .where(eq(Threads.id, input.copyThreadId));

    // The kit for the new steps only; the plan-wide resources already came with the copy.
    if (input.carryKit) {
      const guides = remapGuidesForCopy({
        guides: guideSource.filter((g) => addedMap.has(g.noteId)),
        stepIdMap: addedMap,
        copyThreadId: input.copyThreadId,
        actorId: input.actorId,
        now,
      });
      if (guides.length) await tx.insert(StudyPlanStepGuides).values(guides).onConflictDoNothing();
      if (resourceSource) {
        const carry = planResourceCarry({
          rows: resourceSource.rows.filter((r) => r.noteId && addedMap.has(r.noteId)),
          scopes: resourceSource.scopes,
          stepIdMap: addedMap,
          copyThreadId: input.copyThreadId,
          targetSpaceId: input.spaceId,
          actorId: input.actorId,
          now,
        });
        if (carry.rows.length) await tx.insert(StudyPlanLibraryItems).values(carry.rows).onConflictDoNothing();
        if (carry.scopeItemIds.length) {
          await tx
            .insert(LibraryItemScopes)
            .values(
              carry.scopeItemIds.map((libraryItemId) => ({
                id: `libsc_${crypto.randomUUID()}`,
                libraryItemId,
                scopeKind: 'space',
                spaceId: input.spaceId,
                ministryKey: null,
                createdAt: now,
              })),
            )
            .onConflictDoNothing();
        }
      }
    }

    const fingerprints = { ...baseline.fingerprints };
    for (const step of toAdd) fingerprints[step.id] = stepFingerprint(step);
    await tx
      .update(StudyPlanCopyBaselines)
      .set({ stepFingerprints: JSON.stringify(fingerprints), updatedAt: now })
      .where(eq(StudyPlanCopyBaselines.threadId, input.copyThreadId));
    return noteRows;
  });

  await postProcessCopiedSteps(added, input.actorId, input.copyThreadId);
  return { ok: true, added: added.length };
}

/**
 * Mark church changes as seen without taking them: a new step the group doesn't want, or an edit
 * the leader has looked at. Records each named step's current words as the baseline.
 */
export async function dismissUpstream(input: {
  copyThreadId: string;
  copiedFromThreadId: string | null;
  spaceId: string;
  actorId: string;
  sourceNoteIds: readonly string[];
}): Promise<SourceUpdateResult> {
  const source = await resolveSourcePlan(input.copiedFromThreadId, input.actorId);
  if (!source) return { ok: false, status: 404, code: 'SOURCE_NOT_FOUND', error: 'Your church’s plan is no longer available' };
  const [sourceSteps, copySteps] = await Promise.all([
    loadVisibleSourceSteps(source.sourceSequenceNoteIds, source.channelSpaceId),
    loadCopySteps(input.copyThreadId, input.spaceId),
  ]);
  const now = new Date();
  const named = new Set(input.sourceNoteIds);
  await db.transaction(async (tx) => {
    const baseline = await lockBaseline(tx, {
      copyThreadId: input.copyThreadId,
      sourceThreadId: source.sourceThreadId,
      sourceSteps,
      copySteps,
      now,
    });
    const fingerprints = { ...baseline.fingerprints };
    for (const step of sourceSteps) if (named.has(step.id)) fingerprints[step.id] = stepFingerprint(step);
    await tx
      .update(StudyPlanCopyBaselines)
      .set({ stepFingerprints: JSON.stringify(fingerprints), updatedAt: now })
      .where(eq(StudyPlanCopyBaselines.threadId, input.copyThreadId));
  });
  return { ok: true, added: 0 };
}
