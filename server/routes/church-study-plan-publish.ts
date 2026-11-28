/**
 * Publish a study plan from your own study into a church channel you lead.
 * See `server/utils/study-plan-publish.ts`.
 *
 * Endpoints:
 *   GET  /api/church/publish-plan/channels
 *        The church channels the caller leads, for the "Publish to a channel" menu.
 *   POST /api/threads/:threadId/publish-to-channel
 *        body { channelSpaceId: string }
 */
import { Hono } from 'hono';
import { db, first, SpaceMemberships, Spaces, Threads, and, eq, inArray, isNull, isNotNull, or } from '../db';
import { getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { broadcastInvalidation } from '../utils/realtime';
import { resolveChurchOrgAccess, type ChurchOrgAccessRule } from '../utils/church-org-access';
import { staffLeadsChannel } from '../utils/church-review-access';
import { contentApprovalRequired } from '../utils/church-content';
import { decidePlanPublishToChannel, publishPlanToChannel } from '../utils/study-plan-publish';

const app = new Hono();

const normalizeSpaceId = (id: string) => (id.startsWith('space_') ? id : `space_${id}`);

const PUBLISH_RULE: ChurchOrgAccessRule = {
  capability: 'publish',
  code: 'CHURCH_PUBLISH_FORBIDDEN',
  staffError: 'Only church staff can publish into a channel',
  roleError: 'Your role does not include publishing',
  sponsorshipGated: true,
};

app.get('/api/church/publish-plan/channels', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    /* Channels this person owns or holds a leader row in. Staff sync grants those rows by
       ministry scope, so a scoped teacher sees only their own ministry's channels. */
    const rows = await db
      .select({ id: Spaces.id, title: Spaces.title, orgId: Spaces.orgId })
      .from(Spaces)
      .leftJoin(
        SpaceMemberships,
        and(eq(SpaceMemberships.spaceId, Spaces.id), eq(SpaceMemberships.userId, auth.userId)),
      )
      .where(
        and(
          eq(Spaces.type, 'public'),
          isNotNull(Spaces.orgId),
          isNull(Spaces.deletedAt),
          or(eq(Spaces.userId, auth.userId), inArray(SpaceMemberships.role, ['owner', 'leader'])),
        ),
      );
    const seen = new Set<string>();
    const channels = rows
      .filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)))
      .map((row) => ({ id: row.id, title: row.title, orgId: row.orgId }));
    return c.json({ channels }, 200, { 'Cache-Control': 'private, no-cache' });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/publish-plan/channels',
      action: 'list_publish_plan_channels',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

app.post('/api/threads/:threadId/publish-to-channel', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const threadId = requireParam(c, 'threadId');
    const body = (await c.req.json().catch(() => ({}))) as { channelSpaceId?: string };
    const rawChannel = (body.channelSpaceId ?? '').trim();
    if (!rawChannel) return c.json({ error: 'Pick a channel to publish into', code: 'CHANNEL_REQUIRED' }, 400);
    const channelSpaceId = normalizeSpaceId(rawChannel);

    const [thread, channel] = await Promise.all([
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
    ]);

    const sourceSpace = thread?.spaceId
      ? first(await db.select({ type: Spaces.type, userId: Spaces.userId }).from(Spaces).where(eq(Spaces.id, thread.spaceId)).limit(1))
      : null;
    // A personal space only counts as "your own study" when it is yours.
    const sourceSpaceType = sourceSpace && sourceSpace.userId === auth.userId ? sourceSpace.type : null;

    /* Staff first, before anything reveals whether the church lapsed. */
    if (channel?.orgId && channel.type === 'public' && !channel.deletedAt) {
      const gate = await resolveChurchOrgAccess(auth.userId, channel.orgId, PUBLISH_RULE);
      if (!gate.ok) {
        // A non-staffer learns nothing about the channel.
        const status = gate.code === 'CHURCH_STAFF_REQUIRED' || gate.code === 'CHURCH_NOT_FOUND' ? 404 : gate.status;
        const code = status === 404 ? 'CHANNEL_NOT_FOUND' : gate.code;
        const error = status === 404 ? 'Channel not found' : gate.error;
        return c.json({ error, code }, status);
      }
    }

    const callerLeadsChannel = channel ? await staffLeadsChannel(auth.userId, channelSpaceId) : false;
    const approvalRequired =
      channel?.orgId && callerLeadsChannel ? await contentApprovalRequired(auth.userId, channel.orgId) : false;

    const decision = decidePlanPublishToChannel({
      actorId: auth.userId,
      thread: thread ?? null,
      sourceSpaceType,
      channel: channel ?? null,
      callerLeadsChannel,
      approvalRequired,
    });
    if (!decision.ok) return c.json({ error: decision.error, code: decision.code }, decision.status);

    const result = await publishPlanToChannel({
      source: {
        id: thread!.id,
        title: thread!.title,
        subtitle: thread!.subtitle,
        color: thread!.color,
        sequenceNoteIds: thread!.sequenceNoteIds,
      },
      actorId: auth.userId,
      channelSpaceId,
    });

    if (!result.alreadyPublished) {
      const recipients = await db
        .select({ userId: SpaceMemberships.userId })
        .from(SpaceMemberships)
        .where(eq(SpaceMemberships.spaceId, channelSpaceId));
      for (const recipientId of new Set([auth.userId, ...recipients.map((row) => row.userId)])) {
        broadcastInvalidation(recipientId, { type: 'space:updated', id: channelSpaceId });
      }
    }

    return c.json({ success: true, ...result });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/threads/[threadId]/publish-to-channel',
      action: 'publish_study_plan_to_channel',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
