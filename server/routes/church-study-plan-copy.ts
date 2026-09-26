/**
 * Curriculum handoff: copy a ministry channel's study plan into your own study
 * or into a group you lead. See `server/utils/study-plan-copy.ts`.
 *
 * Endpoints:
 *   POST /api/church/channels/:spaceId/threads/:threadId/copy
 *        body { targetSpaceId?: string } — omit for My Home
 *
 * Its own file, like the teaching-plan routes, so `church.ts`'s positional
 * contract tests keep measuring only the receive half.
 */
import { Hono } from 'hono';
import { db, first, SpaceMemberships, Spaces, Threads, eq } from '../db';
import { getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { broadcastInvalidation } from '../utils/realtime';
import { requireSpaceAccess, SpaceAccessError } from '../utils/space-access';
import { canManageSpaceThreadStructure } from '../utils/thread-sequence';
import { copyStudyPlanThread, decideStudyPlanCopy } from '../utils/study-plan-copy';
import { decideKitCarry } from '../utils/study-plan-leader-kit';

const app = new Hono();

const normalizeSpaceId = (id: string) => (id.startsWith('space_') ? id : `space_${id}`);

async function accessOrNull(spaceId: string, userId: string) {
  try {
    return await requireSpaceAccess(spaceId, userId);
  } catch (err) {
    if (err instanceof SpaceAccessError) return null;
    throw err;
  }
}

app.post(
  '/api/church/channels/:spaceId/threads/:threadId/copy',
  requireAuth,
  rateLimit('write'),
  async (c) => {
    try {
      const auth = getAuthenticatedAuth(c);
      const channelSpaceId = normalizeSpaceId(requireParam(c, 'spaceId'));
      const threadId = requireParam(c, 'threadId');
      const body = (await c.req.json().catch(() => ({}))) as { targetSpaceId?: string | null };
      const targetSpaceId = body.targetSpaceId?.trim() ? normalizeSpaceId(body.targetSpaceId.trim()) : null;

      const [thread, sourceSpace, sourceAccess] = await Promise.all([
        db
          .select({
            id: Threads.id,
            title: Threads.title,
            subtitle: Threads.subtitle,
            color: Threads.color,
            userId: Threads.userId,
            spaceId: Threads.spaceId,
            mode: Threads.mode,
            sequenceNoteIds: Threads.sequenceNoteIds,
          })
          .from(Threads)
          .where(eq(Threads.id, threadId))
          .limit(1)
          .then(first),
        db
          .select({ type: Spaces.type, orgId: Spaces.orgId, deletedAt: Spaces.deletedAt })
          .from(Spaces)
          .where(eq(Spaces.id, channelSpaceId))
          .limit(1)
          .then(first),
        accessOrNull(channelSpaceId, auth.userId),
      ]);

      let target: Parameters<typeof decideStudyPlanCopy>[0]['target'] = null;
      let targetSpaceForKit: { type: string | null; orgId: string | null } | null = null;
      if (targetSpaceId) {
        const targetAccess = await accessOrNull(targetSpaceId, auth.userId);
        targetSpaceForKit = targetAccess ? { type: targetAccess.space.type, orgId: targetAccess.space.orgId } : null;
        target = {
          spaceId: targetSpaceId,
          type: targetAccess?.space.type ?? null,
          deletedAt: targetAccess?.space.deletedAt ?? null,
          callerCanManageThreads: targetAccess
            ? canManageSpaceThreadStructure(targetAccess.space, targetAccess.role, auth.userId)
            : false,
        };
      }

      const decision = decideStudyPlanCopy({
        thread: thread ?? null,
        sourceSpace: sourceSpace ?? null,
        channelSpaceId,
        callerIsMember: Boolean(sourceAccess),
        target,
      });
      if (!decision.ok) return c.json({ error: decision.error, code: decision.code }, decision.status);

      const result = await copyStudyPlanThread({
        source: {
          id: thread!.id,
          title: thread!.title,
          subtitle: thread!.subtitle,
          color: thread!.color,
          userId: thread!.userId,
          spaceId: channelSpaceId,
          sequenceNoteIds: thread!.sequenceNoteIds,
        },
        actorId: auth.userId,
        targetSpaceId,
        // Leader notes go only to the church's own rooms — never a group a follower made.
        carryKit: decideKitCarry({ targetSpace: targetSpaceForKit, sourceOrgId: sourceSpace?.orgId ?? null }),
      });

      if (!result.alreadyCopied && targetSpaceId) {
        // The group has a new study plan; everyone in it should see it arrive.
        const members = await db
          .select({ userId: SpaceMemberships.userId })
          .from(SpaceMemberships)
          .where(eq(SpaceMemberships.spaceId, targetSpaceId));
        for (const recipientId of new Set(members.map((row) => row.userId))) {
          broadcastInvalidation(recipientId, { type: 'space:updated', id: targetSpaceId });
        }
      }

      return c.json({ success: true, ...result });
    } catch (error) {
      const standardError = handleAPIError(error, {
        endpoint: '/api/church/channels/[spaceId]/threads/[threadId]/copy',
        action: 'copy_study_plan',
      });
      return c.json({ error: standardError.message, code: standardError.code }, 500);
    }
  },
);

export default app;
