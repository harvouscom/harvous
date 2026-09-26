/**
 * Church content — schedule channel material, submit it for approval, and review what others
 * submitted (docs/CHURCH_V2_ROADMAP.md §D). The rules live in `server/utils/church-content.ts`.
 *
 * Endpoints:
 *   GET  /api/church/content?orgId=                      staff: the Content list
 *   GET  /api/church/content/for-note/:noteId            the author's open submissions for a note
 *   GET  /api/church/content/submissions/:id             the note behind a submission (author, reviewers)
 *   POST /api/church/content/submit       { noteId, channelSpaceId, publishAt?, serviceId? }
 *   POST /api/church/content/approve      { submissionId, publishAt? }       reviewers
 *   POST /api/church/content/decline      { submissionId, note? }            reviewers
 *   POST /api/church/content/publish-now  { submissionId }
 *   POST /api/church/content/reschedule   { submissionId, publishAt }
 *   POST /api/church/content/withdraw     { submissionId }
 *
 * Who sees what: reviewers see every open submission in their church; everyone else sees their
 * own. The published list is what the congregation already sees, so any staffer may read it.
 */

import { Hono } from 'hono';
import {
  db,
  first,
  ChurchContentSubmissions,
  ChurchServices,
  Churches,
  Notes,
  SpaceMemberships,
  SpaceNotes,
  Spaces,
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  or,
} from '../db';
import { getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { resolveChurchOrgAccess, type ChurchOrgAccessRule } from '../utils/church-org-access';
import { batchAuthorAttribution } from '../utils/dashboard-data';
import { isMinistryBroadcastSpaceRow } from '../utils/channel-publish-cadence';
import { getActiveChurchByOrgId } from '../utils/church-staff';
import {
  OPEN_SUBMISSION_STATUSES,
  PLANNED_ENTRY_PUBLISH_TIME,
  churchRoleFor,
  churchWallTimeToInstant,
  claimPlannedEntry,
  cleanReviewNote,
  parsePublishAt,
  planApproval,
  planSubmission,
  publishSubmission,
  roleCanReview,
  submissionActor,
  type SubmissionRow,
} from '../utils/church-content';
import { associateAuthoredNoteWithSpace, SharedSpaceLifecycleError } from '../utils/shared-space-lifecycle';
import { broadcastCanonicalNoteInvalidation } from '../utils/broadcast-shared-space-note';

const app = new Hono();

const READ: ChurchOrgAccessRule = {
  capability: 'publish',
  code: 'CHURCH_CONTENT_FORBIDDEN',
  staffError: 'Only church staff can see church content',
  roleError: 'Your role does not include church content',
  sponsorshipGated: false,
};
/* Putting something new in front of the congregation is the paid part; withdrawing, declining
   and rescheduling what is already waiting never is. */
const PUBLISH: ChurchOrgAccessRule = { ...READ, sponsorshipGated: true };

type Body = Record<string, unknown>;
const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
async function readBody(c: { req: { json: () => Promise<unknown> } }): Promise<Body> {
  const body = await c.req.json().catch(() => ({}));
  return body && typeof body === 'object' ? (body as Body) : {};
}

/** A submission, the viewer's standing on it, and their church gate — or the refusal. */
async function loadForActor(userId: string, submissionId: string, rule: ChurchOrgAccessRule) {
  const submission = first(
    await db.select().from(ChurchContentSubmissions).where(eq(ChurchContentSubmissions.id, submissionId)).limit(1),
  ) as SubmissionRow | undefined;
  if (!submission) return { ok: false as const, status: 404 as const, code: 'NOT_FOUND', error: 'Not found' };
  const gate = await resolveChurchOrgAccess(userId, submission.orgId, rule);
  if (!gate.ok) return gate;
  const actor = submissionActor({
    submission,
    userId,
    canReview: roleCanReview(await churchRoleFor(submission.orgId, userId)),
  });
  // Someone else's submission reads as missing, not forbidden.
  if (!actor.canSee) return { ok: false as const, status: 404 as const, code: 'NOT_FOUND', error: 'Not found' };
  return { ok: true as const, submission, actor };
}

function fail(c: any, error: unknown, endpoint: string, action: string) {
  const e = handleAPIError(error, { endpoint, action });
  return c.json({ error: e.message, code: e.code }, 500);
}

// ─── GET /api/church/content ────────────────────────────────────────────────

app.get('/api/church/content', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gate = await resolveChurchOrgAccess(auth.userId, str(c.req.query('orgId')), READ);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);
    const orgId = gate.church.orgId;
    const canReview = roleCanReview(await churchRoleFor(orgId, auth.userId));

    // Open ones, plus a month of closed ones so a decline or a failure is seen.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        id: ChurchContentSubmissions.id,
        status: ChurchContentSubmissions.status,
        channelSpaceId: ChurchContentSubmissions.channelSpaceId,
        noteId: ChurchContentSubmissions.noteId,
        authorUserId: ChurchContentSubmissions.authorUserId,
        publishAt: ChurchContentSubmissions.publishAt,
        reviewedAt: ChurchContentSubmissions.reviewedAt,
        reviewNote: ChurchContentSubmissions.reviewNote,
        publishedAt: ChurchContentSubmissions.publishedAt,
        createdAt: ChurchContentSubmissions.createdAt,
        noteTitle: Notes.title,
        channelTitle: Spaces.title,
        channelColor: Spaces.color,
      })
      .from(ChurchContentSubmissions)
      .innerJoin(Notes, eq(Notes.id, ChurchContentSubmissions.noteId))
      .innerJoin(Spaces, eq(Spaces.id, ChurchContentSubmissions.channelSpaceId))
      .where(
        and(
          eq(ChurchContentSubmissions.orgId, orgId),
          or(
            inArray(ChurchContentSubmissions.status, OPEN_SUBMISSION_STATUSES),
            gte(ChurchContentSubmissions.updatedAt, since),
          ),
          canReview ? undefined : eq(ChurchContentSubmissions.authorUserId, auth.userId),
        ),
      )
      .orderBy(desc(ChurchContentSubmissions.createdAt))
      .limit(200);

    const published = await db
      .select({
        noteId: Notes.id,
        title: Notes.title,
        authorUserId: Notes.userId,
        channelSpaceId: Spaces.id,
        channelTitle: Spaces.title,
        channelColor: Spaces.color,
        publishedAt: SpaceNotes.addedAt,
      })
      .from(SpaceNotes)
      .innerJoin(Spaces, eq(Spaces.id, SpaceNotes.spaceId))
      .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
      .where(
        and(
          eq(Spaces.orgId, orgId),
          eq(Spaces.type, 'public'),
          isNull(Spaces.deletedAt),
          isNull(SpaceNotes.removedAt),
          eq(Notes.contentEncrypted, false),
        ),
      )
      .orderBy(desc(SpaceNotes.addedAt))
      .limit(40);

    const authors = await batchAuthorAttribution([
      ...rows.map((row) => row.authorUserId),
      ...published.map((row) => row.authorUserId),
    ]);
    const authorOf = (userId: string) => ({
      displayName: authors[userId]?.displayName ?? 'Church staff',
      isYou: userId === auth.userId,
    });

    return c.json(
      {
        canReview,
        approvalOn: gate.church.contentApproval === true,
        submissions: rows.map((row) => ({
          id: row.id,
          status: row.status,
          noteId: row.noteId,
          title: row.noteTitle || 'Untitled',
          channel: { id: row.channelSpaceId, title: row.channelTitle, color: row.channelColor },
          author: authorOf(row.authorUserId),
          publishAt: row.publishAt,
          reviewedAt: row.reviewedAt,
          reviewNote: row.reviewNote,
          publishedAt: row.publishedAt,
          createdAt: row.createdAt,
        })),
        published: published.map((row) => ({
          noteId: row.noteId,
          title: row.title || 'Untitled',
          channel: { id: row.channelSpaceId, title: row.channelTitle, color: row.channelColor },
          author: authorOf(row.authorUserId),
          publishedAt: row.publishedAt,
        })),
      },
      200,
      { 'Cache-Control': 'private, max-age=0, no-store' },
    );
  } catch (error) {
    return fail(c, error, '/api/church/content', 'church_content_list');
  }
});

// ─── GET /api/church/content/for-note/:noteId ───────────────────────────────
/**
 * For the note page's destination menu: this author's open submissions for this note, and
 * which of their churches need approval from them. Only the author's own facts.
 */
app.get('/api/church/content/for-note/:noteId', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const noteId = requireParam(c, 'noteId');
    const submissions = await db
      .select({
        id: ChurchContentSubmissions.id,
        status: ChurchContentSubmissions.status,
        channelSpaceId: ChurchContentSubmissions.channelSpaceId,
        publishAt: ChurchContentSubmissions.publishAt,
        serviceId: ChurchContentSubmissions.serviceId,
      })
      .from(ChurchContentSubmissions)
      .where(
        and(
          eq(ChurchContentSubmissions.noteId, noteId),
          eq(ChurchContentSubmissions.authorUserId, auth.userId),
          inArray(ChurchContentSubmissions.status, OPEN_SUBMISSION_STATUSES),
        ),
      );

    // The churches whose channels this person leads — usually one.
    const orgRows = await db
      .selectDistinct({ orgId: Spaces.orgId })
      .from(SpaceMemberships)
      .innerJoin(Spaces, eq(Spaces.id, SpaceMemberships.spaceId))
      .where(
        and(
          eq(SpaceMemberships.userId, auth.userId),
          inArray(SpaceMemberships.role, ['owner', 'leader']),
          eq(Spaces.type, 'public'),
          isNull(Spaces.deletedAt),
        ),
      );
    const approvalRequiredOrgIds: string[] = [];
    for (const { orgId } of orgRows) {
      if (!orgId) continue;
      const church = await getActiveChurchByOrgId(orgId);
      if (church?.contentApproval && !roleCanReview(await churchRoleFor(orgId, auth.userId))) {
        approvalRequiredOrgIds.push(orgId);
      }
    }
    // Where it is already live — the planner shows "Published" rather than offering to schedule.
    const liveChannelIds = (
      await db
        .select({ spaceId: SpaceNotes.spaceId })
        .from(SpaceNotes)
        .innerJoin(Spaces, eq(Spaces.id, SpaceNotes.spaceId))
        .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
        .where(
          and(
            eq(SpaceNotes.noteId, noteId),
            eq(Notes.userId, auth.userId),
            isNull(SpaceNotes.removedAt),
            eq(Spaces.type, 'public'),
          ),
        )
    ).map((row) => row.spaceId);
    return c.json(
      { submissions, approvalRequiredOrgIds, liveChannelIds },
      200,
      { 'Cache-Control': 'private, max-age=0, no-store' },
    );
  } catch (error) {
    return fail(c, error, '/api/church/content/for-note/[noteId]', 'church_content_for_note');
  }
});

// ─── GET /api/church/content/submissions/:id ────────────────────────────────
/** The note a reviewer is being asked to approve — only while they can act on it, or its author. */
app.get('/api/church/content/submissions/:id', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const loaded = await loadForActor(auth.userId, requireParam(c, 'id'), READ);
    if (!loaded.ok) return c.json({ error: loaded.error, code: loaded.code }, loaded.status);
    const note = first(
      await db
        .select({ id: Notes.id, title: Notes.title, content: Notes.content, noteType: Notes.noteType, contentEncrypted: Notes.contentEncrypted, updatedAt: Notes.updatedAt })
        .from(Notes)
        .where(eq(Notes.id, loaded.submission.noteId))
        .limit(1),
    );
    if (!note || note.contentEncrypted) return c.json({ error: 'This note is no longer available', code: 'NOTE_GONE' }, 404);
    return c.json(
      {
        note: { id: note.id, title: note.title || 'Untitled', content: note.content ?? '', noteType: note.noteType ?? 'default' },
        /** The note changed after it was submitted — what gets approved is what is there now. */
        editedSinceSubmitted: Boolean(
          note.updatedAt && new Date(note.updatedAt).getTime() > new Date(loaded.submission.createdAt).getTime() + 1000,
        ),
      },
      200,
      { 'Cache-Control': 'private, max-age=0, no-store' },
    );
  } catch (error) {
    return fail(c, error, '/api/church/content/submissions/[id]', 'church_content_read');
  }
});

// ─── POST /api/church/content/submit ────────────────────────────────────────

app.post('/api/church/content/submit', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const now = new Date();

    const channel = first(
      await db.select().from(Spaces).where(eq(Spaces.id, str(body.channelSpaceId))).limit(1),
    );
    if (!channel || channel.deletedAt || !channel.orgId || !isMinistryBroadcastSpaceRow(channel)) {
      return c.json({ error: 'Channel not found', code: 'NOT_FOUND' }, 404);
    }
    const gate = await resolveChurchOrgAccess(auth.userId, channel.orgId, PUBLISH);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const note = first(
      await db.select({ id: Notes.id, userId: Notes.userId, contentEncrypted: Notes.contentEncrypted }).from(Notes).where(eq(Notes.id, str(body.noteId))).limit(1),
    );
    if (!note || note.userId !== auth.userId) return c.json({ error: 'Note not found', code: 'NOT_FOUND' }, 404);
    if (note.contentEncrypted) return c.json({ error: "Locked notes can't be shared", code: 'LOCKED_NOTE' }, 409);

    // They must lead the channel now, not just when it goes live — the same rule publishing uses.
    const membership = first(
      await db
        .select({ role: SpaceMemberships.role })
        .from(SpaceMemberships)
        .where(and(eq(SpaceMemberships.spaceId, channel.id), eq(SpaceMemberships.userId, auth.userId)))
        .limit(1),
    );
    if (channel.userId !== auth.userId && membership?.role !== 'owner' && membership?.role !== 'leader') {
      return c.json({ error: 'Only this channel’s leaders can publish to it', code: 'PUBLIC_SPACE_AUTHOR_REQUIRED' }, 403);
    }
    const live = first(
      await db
        .select({ id: SpaceNotes.id })
        .from(SpaceNotes)
        .where(and(eq(SpaceNotes.spaceId, channel.id), eq(SpaceNotes.noteId, note.id), isNull(SpaceNotes.removedAt)))
        .limit(1),
    );
    if (live) return c.json({ error: 'Already published there', code: 'ALREADY_LIVE' }, 409);

    /*
      A planner entry this post is for: a content row on this same channel. Its date (at the
      church's 8:00) is the default time, and going live claims it for the followers' Home card.
    */
    const serviceId = str(body.serviceId) || null;
    let entryPublishAt: string | null = null;
    if (serviceId) {
      const entry = first(
        await db
          .select({ spaceId: ChurchServices.spaceId, kind: ChurchServices.kind, serviceDate: ChurchServices.serviceDate })
          .from(ChurchServices)
          .where(eq(ChurchServices.id, serviceId))
          .limit(1),
      );
      if (!entry || entry.kind !== 'content' || entry.spaceId !== channel.id) {
        return c.json({ error: 'That plan entry isn’t on this channel', code: 'SERVICE_NOT_ON_CHANNEL' }, 404);
      }
      if (entry.serviceDate && body.publishAt === undefined) {
        const zone = first(
          await db.select({ timezone: Churches.timezone }).from(Churches).where(eq(Churches.orgId, channel.orgId)).limit(1),
        )?.timezone;
        entryPublishAt = churchWallTimeToInstant(entry.serviceDate, PLANNED_ENTRY_PUBLISH_TIME, zone)?.toISOString() ?? null;
      }
    }

    const when = parsePublishAt(body.publishAt === undefined ? entryPublishAt : body.publishAt, now);
    if (!when.ok) return c.json({ error: when.error, code: 'INVALID_PUBLISH_AT' }, 400);
    const role = await churchRoleFor(channel.orgId, auth.userId);
    // Unknown role (Clerk down) with approval on: submit rather than publish around the pastor.
    const approvalRequired = gate.church.contentApproval === true && !roleCanReview(role);
    const plan = planSubmission({ approvalRequired, publishAt: when.publishAt });

    if (plan === 'publish_now') {
      const existingOpen = first(
        await db
          .select({ id: ChurchContentSubmissions.id })
          .from(ChurchContentSubmissions)
          .where(
            and(
              eq(ChurchContentSubmissions.channelSpaceId, channel.id),
              eq(ChurchContentSubmissions.noteId, note.id),
              inArray(ChurchContentSubmissions.status, OPEN_SUBMISSION_STATUSES),
            ),
          )
          .limit(1),
      );
      if (existingOpen) {
        if (serviceId) {
          await db.update(ChurchContentSubmissions).set({ serviceId }).where(eq(ChurchContentSubmissions.id, existingOpen.id));
        }
        const outcome = await publishSubmission(existingOpen.id, now);
        if (!outcome.ok) return c.json({ error: outcome.error, code: outcome.code }, 409);
        return c.json({ success: true, status: 'published' });
      }
      await db.transaction(async (tx) => {
        await associateAuthoredNoteWithSpace(tx, { spaceId: channel.id, noteId: note.id, actorId: auth.userId, now });
        if (serviceId) await claimPlannedEntry(tx, serviceId, note.id, auth.userId, now);
      });
      await broadcastCanonicalNoteInvalidation(auth.userId, note.id, { type: 'note:updated', id: note.id }).catch(() => undefined);
      return c.json({ success: true, status: 'published' });
    }

    // One open submission per note per channel: a second submit changes the first.
    const existing = first(
      await db
        .select()
        .from(ChurchContentSubmissions)
        .where(
          and(
            eq(ChurchContentSubmissions.channelSpaceId, channel.id),
            eq(ChurchContentSubmissions.noteId, note.id),
            inArray(ChurchContentSubmissions.status, OPEN_SUBMISSION_STATUSES),
          ),
        )
        .limit(1),
    ) as SubmissionRow | undefined;
    // An approved, scheduled item keeps its approval when only its time moves.
    const status = existing?.status === 'scheduled' && existing.reviewedAt ? 'scheduled' : plan;
    if (existing) {
      await db
        .update(ChurchContentSubmissions)
        .set({ status, publishAt: when.publishAt, ...(serviceId ? { serviceId } : {}), updatedAt: now })
        .where(eq(ChurchContentSubmissions.id, existing.id));
      return c.json({ success: true, status, submissionId: existing.id });
    }
    const id = `ccs_${crypto.randomUUID()}`;
    await db.insert(ChurchContentSubmissions).values({
      id,
      orgId: channel.orgId,
      channelSpaceId: channel.id,
      noteId: note.id,
      authorUserId: auth.userId,
      serviceId,
      status,
      publishAt: when.publishAt,
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ success: true, status, submissionId: id });
  } catch (error) {
    if (error instanceof SharedSpaceLifecycleError) return c.json({ error: error.message, code: error.code }, error.status);
    return fail(c, error, '/api/church/content/submit', 'church_content_submit');
  }
});

// ─── POST /api/church/content/approve ───────────────────────────────────────

app.post('/api/church/content/approve', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const now = new Date();
    const loaded = await loadForActor(auth.userId, str(body.submissionId), PUBLISH);
    if (!loaded.ok) return c.json({ error: loaded.error, code: loaded.code }, loaded.status);
    if (!loaded.actor.canReview) return c.json({ error: 'A pastor or admin approves', code: 'REVIEW_ROLE_REQUIRED' }, 403);
    if (loaded.submission.status !== 'in_review') return c.json({ error: 'Not waiting for approval', code: 'NOT_IN_REVIEW' }, 409);

    // A reviewer may set the time; otherwise the author's requested time stands.
    const override = body.publishAt === undefined ? null : parsePublishAt(body.publishAt, now);
    if (override && !override.ok) return c.json({ error: override.error, code: 'INVALID_PUBLISH_AT' }, 400);
    const publishAt = override ? override.publishAt : loaded.submission.publishAt;

    await db
      .update(ChurchContentSubmissions)
      .set({ reviewedByUserId: auth.userId, reviewedAt: now, publishAt, updatedAt: now })
      .where(and(eq(ChurchContentSubmissions.id, loaded.submission.id), eq(ChurchContentSubmissions.status, 'in_review')));

    if (planApproval({ publishAt: publishAt ? new Date(publishAt) : null, now }) === 'scheduled') {
      await db
        .update(ChurchContentSubmissions)
        .set({ status: 'scheduled', updatedAt: now })
        .where(and(eq(ChurchContentSubmissions.id, loaded.submission.id), eq(ChurchContentSubmissions.status, 'in_review')));
      return c.json({ success: true, status: 'scheduled' });
    }
    const outcome = await publishSubmission(loaded.submission.id, now, ['in_review']);
    if (!outcome.ok) return c.json({ error: outcome.error, code: outcome.code }, 409);
    return c.json({ success: true, status: 'published' });
  } catch (error) {
    return fail(c, error, '/api/church/content/approve', 'church_content_approve');
  }
});

// ─── POST /api/church/content/decline ───────────────────────────────────────

app.post('/api/church/content/decline', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const now = new Date();
    const loaded = await loadForActor(auth.userId, str(body.submissionId), READ);
    if (!loaded.ok) return c.json({ error: loaded.error, code: loaded.code }, loaded.status);
    if (!loaded.actor.canReview) return c.json({ error: 'A pastor or admin decides', code: 'REVIEW_ROLE_REQUIRED' }, 403);
    if (loaded.submission.status !== 'in_review') return c.json({ error: 'Not waiting for approval', code: 'NOT_IN_REVIEW' }, 409);
    await db
      .update(ChurchContentSubmissions)
      .set({
        status: 'declined',
        reviewedByUserId: auth.userId,
        reviewedAt: now,
        reviewNote: cleanReviewNote(body.note),
        updatedAt: now,
      })
      .where(and(eq(ChurchContentSubmissions.id, loaded.submission.id), eq(ChurchContentSubmissions.status, 'in_review')));
    return c.json({ success: true, status: 'declined' });
  } catch (error) {
    return fail(c, error, '/api/church/content/decline', 'church_content_decline');
  }
});

// ─── POST /api/church/content/publish-now ───────────────────────────────────
/** A scheduled item, early. Its author or a reviewer; never something still awaiting approval. */
app.post('/api/church/content/publish-now', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const loaded = await loadForActor(auth.userId, str(body.submissionId), PUBLISH);
    if (!loaded.ok) return c.json({ error: loaded.error, code: loaded.code }, loaded.status);
    if (loaded.submission.status !== 'scheduled') {
      return c.json({ error: 'Only something scheduled can go out early', code: 'NOT_SCHEDULED' }, 409);
    }
    const outcome = await publishSubmission(loaded.submission.id, new Date(), ['scheduled']);
    if (!outcome.ok) return c.json({ error: outcome.error, code: outcome.code }, 409);
    return c.json({ success: true, status: 'published' });
  } catch (error) {
    return fail(c, error, '/api/church/content/publish-now', 'church_content_publish_now');
  }
});

// ─── POST /api/church/content/reschedule ────────────────────────────────────

app.post('/api/church/content/reschedule', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const now = new Date();
    const loaded = await loadForActor(auth.userId, str(body.submissionId), READ);
    if (!loaded.ok) return c.json({ error: loaded.error, code: loaded.code }, loaded.status);
    const { submission, actor } = loaded;
    if (!OPEN_SUBMISSION_STATUSES.includes(submission.status as never)) {
      return c.json({ error: 'No longer waiting', code: 'NOT_OPEN' }, 409);
    }
    // While it awaits approval only its author asks for a time; once scheduled, either may move it.
    if (submission.status === 'in_review' && !actor.isAuthor) {
      return c.json({ error: 'Approve it with a time instead', code: 'AUTHOR_ONLY' }, 403);
    }
    const when = parsePublishAt(body.publishAt, now);
    if (!when.ok) return c.json({ error: when.error, code: 'INVALID_PUBLISH_AT' }, 400);
    if (submission.status === 'scheduled' && !when.publishAt) {
      return c.json({ error: 'Choose a time ahead, or publish it now', code: 'INVALID_PUBLISH_AT' }, 400);
    }
    await db
      .update(ChurchContentSubmissions)
      .set({ publishAt: when.publishAt, updatedAt: now })
      .where(and(eq(ChurchContentSubmissions.id, submission.id), inArray(ChurchContentSubmissions.status, OPEN_SUBMISSION_STATUSES)));
    return c.json({ success: true, status: submission.status });
  } catch (error) {
    return fail(c, error, '/api/church/content/reschedule', 'church_content_reschedule');
  }
});

// ─── POST /api/church/content/withdraw ──────────────────────────────────────
/** Take back something not yet live. Its author, or a reviewer unscheduling it. */
app.post('/api/church/content/withdraw', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const now = new Date();
    const loaded = await loadForActor(auth.userId, str(body.submissionId), READ);
    if (!loaded.ok) return c.json({ error: loaded.error, code: loaded.code }, loaded.status);
    const updated = await db
      .update(ChurchContentSubmissions)
      .set({ status: 'withdrawn', updatedAt: now })
      .where(and(eq(ChurchContentSubmissions.id, loaded.submission.id), inArray(ChurchContentSubmissions.status, OPEN_SUBMISSION_STATUSES)))
      .returning({ id: ChurchContentSubmissions.id });
    if (updated.length === 0) return c.json({ error: 'No longer waiting', code: 'NOT_OPEN' }, 409);
    return c.json({ success: true, status: 'withdrawn' });
  } catch (error) {
    return fail(c, error, '/api/church/content/withdraw', 'church_content_withdraw');
  }
});

export default app;
