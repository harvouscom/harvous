/**
 * The group leader kit on a study plan (docs/CHURCH_V2_ROADMAP.md §E) — leaders only.
 *
 * Its own endpoint rather than a field on `GET /api/threads/:id/notes`: that payload goes to
 * every member, and keeping leader material out of it entirely is simpler to trust than one
 * more conditional inside it. Every route goes through `resolveLeaderKitAccess` first.
 *
 *   GET  /api/threads/:threadId/leader-kit                 { guides: {noteId: {leaderNotes, questions}} }
 *   POST /api/threads/:threadId/leader-kit/steps/:noteId   { leaderNotes?, questions? } — empty deletes
 *   POST /api/threads/:threadId/leader-kit/resources/set   { noteId: string | null, itemIds } — church plans
 *   GET  /api/spaces/:spaceId/gatherings/:serviceId/agenda
 *   POST /api/spaces/:spaceId/gatherings/:serviceId/agenda/set   { items, stepThreadId?, stepNoteId? }
 *
 * The agenda is gated on leading the *room* (`canUseLeaderKit`), deliberately not on the plan
 * gates: a granted volunteer who runs the group runs its meetings, church role or not.
 */
import { Hono } from 'hono';
import { db, first, ChurchServices, GatheringAgendas, StudyPlanStepGuides, Threads, and, eq } from '../db';
import { getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { loadLiveThreadNoteIds } from '../utils/thread-sequence';
import {
  canUseLeaderKit,
  loadGuides,
  loadPlanResources,
  setPlanResources,
  normalizeAgendaItems,
  normalizeGuideInput,
  parseAgendaItems,
  resolveLeaderKitAccess,
} from '../utils/study-plan-leader-kit';
import { requireSpaceAccess, SpaceAccessError } from '../utils/space-access';
import { getActiveChurchByOrgId } from '../utils/church-staff';

/** The room and the gathering, when the viewer leads the room and the gathering is its own. */
async function resolveAgendaAccess(userId: string, spaceId: string, serviceId: string) {
  let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
  try {
    access = await requireSpaceAccess(spaceId, userId);
  } catch (error) {
    if (error instanceof SpaceAccessError) return { ok: false as const, status: 404 as const, code: 'NOT_FOUND', error: 'Not found' };
    throw error;
  }
  if (access.space.type !== 'shared' || !canUseLeaderKit(access.space, access.role, userId)) {
    return { ok: false as const, status: 403 as const, code: 'LEADER_ROLE_REQUIRED', error: 'Only this group’s leaders plan its meetings' };
  }
  const service = first(
    await db
      .select({ id: ChurchServices.id, spaceId: ChurchServices.spaceId, kind: ChurchServices.kind })
      .from(ChurchServices)
      .where(eq(ChurchServices.id, serviceId))
      .limit(1),
  );
  if (!service || service.spaceId !== access.space.id || service.kind !== 'gathering') {
    return { ok: false as const, status: 404 as const, code: 'NOT_FOUND', error: 'Gathering not found' };
  }
  return { ok: true as const, space: access.space, serviceId: service.id };
}

async function agendaPayload(serviceId: string) {
  const row = first(await db.select().from(GatheringAgendas).where(eq(GatheringAgendas.serviceId, serviceId)).limit(1));
  return {
    items: parseAgendaItems(row?.items),
    stepThreadId: row?.stepThreadId ?? null,
    stepNoteId: row?.stepNoteId ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

const app = new Hono();

app.get('/api/threads/:threadId/leader-kit', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const access = await resolveLeaderKitAccess(requireParam(c, 'threadId'), auth.userId);
    if (!access.ok) return c.json({ error: access.error, code: access.code }, access.status);
    const [guides, live] = await Promise.all([
      loadGuides(access.thread.id, access.thread.spaceId),
      loadLiveThreadNoteIds(access.thread.id, access.thread.spaceId),
    ]);
    const resources = await loadPlanResources(access.thread.id, live);
    return c.json(
      {
        guides,
        resources,
        // Resources are attached on the church's own plan and travel from there; a copy reads them.
        canAttachResources: access.space.type === 'public' && Boolean(access.space.orgId),
      },
      200,
      { 'Cache-Control': 'private, max-age=0, no-store' },
    );
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/threads/[threadId]/leader-kit', action: 'leader_kit_read' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

app.post('/api/threads/:threadId/leader-kit/steps/:noteId', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const access = await resolveLeaderKitAccess(requireParam(c, 'threadId'), auth.userId);
    if (!access.ok) return c.json({ error: access.error, code: access.code }, access.status);

    const noteId = requireParam(c, 'noteId');
    const live = await loadLiveThreadNoteIds(access.thread.id, access.thread.spaceId);
    if (!live.includes(noteId)) return c.json({ error: 'That step isn’t in this plan', code: 'STEP_NOT_FOUND' }, 404);

    const input = normalizeGuideInput(await c.req.json().catch(() => ({})));
    if (!input.ok) return c.json({ error: input.error, code: 'INVALID_GUIDE' }, 400);

    const where = and(eq(StudyPlanStepGuides.threadId, access.thread.id), eq(StudyPlanStepGuides.noteId, noteId));
    const now = new Date();
    if (!input.guide) {
      await db.delete(StudyPlanStepGuides).where(where);
    } else {
      const existing = first(await db.select({ id: StudyPlanStepGuides.id }).from(StudyPlanStepGuides).where(where).limit(1));
      const values = {
        leaderNotes: input.guide.leaderNotes,
        questions: JSON.stringify(input.guide.questions),
        updatedByUserId: auth.userId,
        updatedAt: now,
      };
      if (existing) {
        await db.update(StudyPlanStepGuides).set(values).where(eq(StudyPlanStepGuides.id, existing.id));
      } else {
        await db
          .insert(StudyPlanStepGuides)
          .values({ id: `spg_${crypto.randomUUID()}`, threadId: access.thread.id, noteId, createdAt: now, ...values })
          // Two co-leaders saving at once: last write wins, never a duplicate.
          .onConflictDoUpdate({ target: [StudyPlanStepGuides.threadId, StudyPlanStepGuides.noteId], set: values });
      }
    }
    return c.json({ success: true, guides: await loadGuides(access.thread.id, access.thread.spaceId) });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/threads/[threadId]/leader-kit/steps/[noteId]', action: 'leader_kit_guide' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

app.post('/api/threads/:threadId/leader-kit/resources/set', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const access = await resolveLeaderKitAccess(requireParam(c, 'threadId'), auth.userId);
    if (!access.ok) return c.json({ error: access.error, code: access.code }, access.status);
    if (access.space.type !== 'public' || !access.space.orgId) {
      return c.json({ error: 'Resources are attached on your church’s plan', code: 'CHURCH_PLAN_ONLY' }, 403);
    }
    const church = await getActiveChurchByOrgId(access.space.orgId);
    if (!church) return c.json({ error: 'Church not found', code: 'NOT_FOUND' }, 404);

    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { noteId?: unknown; itemIds?: unknown };
    const noteId = typeof body.noteId === 'string' && body.noteId.trim() ? body.noteId.trim() : null;
    if (!Array.isArray(body.itemIds) || body.itemIds.some((id) => typeof id !== 'string')) {
      return c.json({ error: 'itemIds must be a list', code: 'BAD_REQUEST' }, 400);
    }
    const live = await loadLiveThreadNoteIds(access.thread.id, access.thread.spaceId);
    if (noteId && !live.includes(noteId)) return c.json({ error: 'That step isn’t in this plan', code: 'STEP_NOT_FOUND' }, 404);

    const result = await setPlanResources({
      threadId: access.thread.id,
      noteId,
      itemIds: body.itemIds as string[],
      churchId: church.id,
      userId: auth.userId,
    });
    if (!result.ok) return c.json({ error: result.error, code: result.code }, result.status);
    return c.json({ success: true, resources: await loadPlanResources(access.thread.id, live) });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/threads/[threadId]/leader-kit/resources/set', action: 'leader_kit_resources' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

app.get('/api/spaces/:spaceId/gatherings/:serviceId/agenda', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const access = await resolveAgendaAccess(auth.userId, requireParam(c, 'spaceId'), requireParam(c, 'serviceId'));
    if (!access.ok) return c.json({ error: access.error, code: access.code }, access.status);
    return c.json(await agendaPayload(access.serviceId), 200, { 'Cache-Control': 'private, max-age=0, no-store' });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/gatherings/[serviceId]/agenda', action: 'agenda_read' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

app.post('/api/spaces/:spaceId/gatherings/:serviceId/agenda/set', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const access = await resolveAgendaAccess(auth.userId, requireParam(c, 'spaceId'), requireParam(c, 'serviceId'));
    if (!access.ok) return c.json({ error: access.error, code: access.code }, access.status);

    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { items?: unknown; stepThreadId?: unknown; stepNoteId?: unknown };
    const items = normalizeAgendaItems(body.items);
    if (!items.ok) return c.json({ error: items.error, code: 'INVALID_AGENDA' }, 400);

    // The step it covers, if any: a live step of a study plan in this same room.
    const stepThreadId = typeof body.stepThreadId === 'string' && body.stepThreadId.trim() ? body.stepThreadId.trim() : null;
    const stepNoteId = typeof body.stepNoteId === 'string' && body.stepNoteId.trim() ? body.stepNoteId.trim() : null;
    if (stepThreadId || stepNoteId) {
      const thread = stepThreadId
        ? first(
            await db
              .select({ spaceId: Threads.spaceId, mode: Threads.mode })
              .from(Threads)
              .where(eq(Threads.id, stepThreadId))
              .limit(1),
          )
        : undefined;
      const live = thread && thread.spaceId === access.space.id && thread.mode === 'sequence'
        ? await loadLiveThreadNoteIds(stepThreadId!, access.space.id)
        : [];
      if (!stepNoteId || !live.includes(stepNoteId)) {
        return c.json({ error: 'That step isn’t in one of this group’s plans', code: 'STEP_NOT_FOUND' }, 404);
      }
    }

    const now = new Date();
    const values = {
      items: JSON.stringify(items.items),
      stepThreadId,
      stepNoteId,
      updatedByUserId: auth.userId,
      updatedAt: now,
    };
    await db
      .insert(GatheringAgendas)
      .values({ id: `agenda_${crypto.randomUUID()}`, serviceId: access.serviceId, createdAt: now, ...values })
      .onConflictDoUpdate({ target: GatheringAgendas.serviceId, set: values });
    return c.json({ success: true, ...(await agendaPayload(access.serviceId)) });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/gatherings/[serviceId]/agenda/set', action: 'agenda_set' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

export default app;
