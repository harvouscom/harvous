/**
 * The group leader kit on a study plan (docs/CHURCH_V2_ROADMAP.md §E) — leaders only.
 *
 * Its own endpoint rather than a field on `GET /api/threads/:id/notes`: that payload goes to
 * every member, and keeping leader material out of it entirely is simpler to trust than one
 * more conditional inside it. Every route goes through `resolveLeaderKitAccess` first.
 *
 *   GET  /api/threads/:threadId/leader-kit                 { guides: {noteId: {leaderNotes, questions}} }
 *   POST /api/threads/:threadId/leader-kit/steps/:noteId   { leaderNotes?, questions? } — empty deletes
 */
import { Hono } from 'hono';
import { db, first, StudyPlanStepGuides, and, eq } from '../db';
import { getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { loadLiveThreadNoteIds } from '../utils/thread-sequence';
import { loadGuides, normalizeGuideInput, resolveLeaderKitAccess } from '../utils/study-plan-leader-kit';

const app = new Hono();

app.get('/api/threads/:threadId/leader-kit', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const access = await resolveLeaderKitAccess(requireParam(c, 'threadId'), auth.userId);
    if (!access.ok) return c.json({ error: access.error, code: access.code }, access.status);
    const guides = await loadGuides(access.thread.id, access.thread.spaceId);
    return c.json({ guides }, 200, { 'Cache-Control': 'private, max-age=0, no-store' });
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

export default app;
