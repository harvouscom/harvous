/**
 * A church's review questions — the staff side (docs/CHURCH_V2_ROADMAP.md §B).
 *
 * Staff see the passages Harvous suggests from what their channel published, keep or dismiss
 * them, write their own questions (multiple choice, put in order, match the pairs), preview any
 * of it as a congregant would see it, and publish. Delivery to followers is a separate step.
 *
 * **What a church never sees:** who holds a question, who answered it, or how anyone did. The one
 * number is "Answered by N", and only from five people up. Nothing in this file reads
 * `ReviewItems` or `ReviewEvents`; a contract test holds that.
 *
 * Endpoints:
 *   GET  /api/church/review/channels?orgId=
 *   GET  /api/church/review/exercises?orgId=&channelId=
 *   POST /api/church/review/exercises/create
 *   POST /api/church/review/exercises/update
 *   POST /api/church/review/exercises/publish
 *   POST /api/church/review/exercises/archive     — never sponsorship-gated
 *   POST /api/church/review/suggestions/dismiss
 *   POST /api/church/review/preview               — what a congregant would be shown
 *   POST /api/church/review/preview/grade         — try it, marked the same way
 */

import { Hono } from 'hono';
import { db, first, ChurchReviewExercises, Spaces, and, eq, inArray, isNull, sql } from '../db';
import { nowISO } from '../db/dates';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { isUniqueViolation } from '../utils/db-unique-violation';
import {
  assertChurchReviewAccess,
  assertChurchReviewChannel,
  flooredAnsweredCount,
} from '../utils/church-review-access';
import { loadChurchReviewSuggestions, suggestionShapeFor } from '../utils/church-review-suggestions';
import {
  buildChurchChoice,
  buildChurchMatch,
  buildChurchOrder,
  gradeChurchChoice,
  isAuthoredChurchExerciseKind,
  isChurchExerciseKind,
  markChurchMatch,
  markChurchOrder,
  parseChurchExerciseContent,
  parseChurchMatchAnswer,
  validateChurchExerciseContent,
  validateChurchPrompt,
  type ChurchExerciseContent,
} from '@/utils/church-exercise';

const app = new Hono();

type Body = Record<string, unknown>;
const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

async function readBody(c: { req: { json: () => Promise<unknown> } }): Promise<Body> {
  const body = await c.req.json().catch(() => ({}));
  return body && typeof body === 'object' ? (body as Body) : {};
}

type ExerciseRow = typeof ChurchReviewExercises.$inferSelect;

/** The staff view of an exercise: its key included — they wrote it — and a floored count. */
function serializeForStaff(row: ExerciseRow) {
  return {
    id: row.id,
    channelSpaceId: row.channelSpaceId,
    kind: row.kind,
    prompt: row.prompt,
    content: parseChurchExerciseContent(row.kind, row.content),
    scriptureReference: row.scriptureReference,
    origin: row.origin,
    status: row.status,
    version: row.version,
    answeredCount: flooredAnsweredCount(row.answeredCount),
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt ?? row.createdAt,
  };
}

type Validated =
  | { ok: true; kind: string; prompt: string | null; content: string | null; reference: string | null }
  | { ok: false; code: string; error: string };

/** One rule for create, update and preview, so a draft that previews is a draft that saves. */
function validateExerciseInput(body: Body, fallbackKind?: string): Validated {
  const requested = str(body.kind) || fallbackKind || '';
  // "passage" lets the editor hand over a reference and have the server decide verse or chapter,
  // by the same rule suggestions use, rather than ship the scripture parser to the browser.
  const passageShape = requested === 'passage' ? suggestionShapeFor(str(body.reference)) : null;
  const kind = requested === 'passage' ? passageShape?.kind ?? 'verse' : requested;
  if (!isChurchExerciseKind(kind)) return { ok: false, code: 'KIND_INVALID', error: 'Choose a kind of question' };
  if (kind === 'verse' || kind === 'chapter') {
    const shape = passageShape ?? suggestionShapeFor(str(body.reference));
    if (!shape) return { ok: false, code: 'REFERENCE_INVALID', error: 'Enter a passage, like John 15:5 or John 15' };
    if (shape.kind !== kind) {
      return {
        ok: false,
        code: 'REFERENCE_SHAPE',
        error: kind === 'verse' ? 'That is more than three verses — ask about the chapter instead' : 'That is a verse, not a chapter',
      };
    }
    return { ok: true, kind, prompt: null, content: null, reference: shape.reference };
  }
  if (!isAuthoredChurchExerciseKind(kind)) return { ok: false, code: 'KIND_INVALID', error: 'Choose a kind of question' };
  const prompt = validateChurchPrompt(body.prompt);
  if (!prompt.ok) return prompt;
  const content = validateChurchExerciseContent(kind, body.content);
  if (!content.ok) return content;
  return { ok: true, kind, prompt: prompt.value, content: JSON.stringify(content.value), reference: null };
}

async function loadExercise(orgId: string, exerciseId: string): Promise<ExerciseRow | null> {
  if (!exerciseId) return null;
  return (
    first(
      await db
        .select()
        .from(ChurchReviewExercises)
        .where(and(eq(ChurchReviewExercises.id, exerciseId), eq(ChurchReviewExercises.orgId, orgId)))
        .limit(1),
    ) ?? null
  );
}

/** What a congregant is shown for an authored question — built exactly as Review builds it. */
function previewFor(kind: string, content: ChurchExerciseContent, seed: string) {
  if (kind === 'choice' && 'correctIndex' in content) {
    return { choice: { options: buildChurchChoice(content, seed).options, opening: false } };
  }
  if (kind === 'order' && 'items' in content) return { sequence: { phrases: buildChurchOrder(content, seed).phrases } };
  if (kind === 'match' && 'pairs' in content) {
    const built = buildChurchMatch(content, seed);
    return { match: { left: built.left, right: built.right } };
  }
  return {};
}

// ─── GET /api/church/review/channels ────────────────────────────────────────

app.get('/api/church/review/channels', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const orgId = str(c.req.query('orgId'));
    const gate = await assertChurchReviewAccess(auth.userId, orgId, 'read');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const channels = await db
      .select({ id: Spaces.id, title: Spaces.title, color: Spaces.color, isActive: Spaces.isActive })
      .from(Spaces)
      .where(and(eq(Spaces.orgId, gate.church.orgId), eq(Spaces.type, 'public'), isNull(Spaces.deletedAt)));
    const ids = channels.map((channel) => channel.id);
    const counts = ids.length
      ? await db
          .select({
            channelSpaceId: ChurchReviewExercises.channelSpaceId,
            status: ChurchReviewExercises.status,
            n: sql<number>`count(*)::int`,
          })
          .from(ChurchReviewExercises)
          .where(inArray(ChurchReviewExercises.channelSpaceId, ids))
          .groupBy(ChurchReviewExercises.channelSpaceId, ChurchReviewExercises.status)
      : [];
    const countOf = (id: string, status: string) =>
      counts.find((row) => row.channelSpaceId === id && row.status === status)?.n ?? 0;

    c.header('Cache-Control', 'private, max-age=0, no-store');
    return c.json({
      channels: channels
        .map((channel) => ({
          id: channel.id,
          title: channel.title,
          color: channel.color,
          isActive: channel.isActive,
          published: countOf(channel.id, 'published'),
          drafts: countOf(channel.id, 'draft'),
        }))
        .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })),
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/review/channels', action: 'church_review_channels' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/church/review/exercises ───────────────────────────────────────

app.get('/api/church/review/exercises', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gate = await assertChurchReviewChannel(
      auth.userId,
      str(c.req.query('orgId')),
      str(c.req.query('channelId')),
      'read',
    );
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const [rows, suggestions] = await Promise.all([
      db
        .select()
        .from(ChurchReviewExercises)
        .where(eq(ChurchReviewExercises.channelSpaceId, gate.channel.id)),
      loadChurchReviewSuggestions(gate.channel.id),
    ]);

    c.header('Cache-Control', 'private, max-age=0, no-store');
    return c.json({
      channel: gate.channel,
      exercises: rows
        .filter((row) => row.status !== 'dismissed')
        .sort((a, b) => (b.updatedAt ?? b.createdAt).getTime() - (a.updatedAt ?? a.createdAt).getTime())
        .map(serializeForStaff),
      suggestions,
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/review/exercises', action: 'church_review_exercises' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/church/review/exercises/create ───────────────────────────────

app.post('/api/church/review/exercises/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const gate = await assertChurchReviewChannel(auth.userId, str(body.orgId), str(body.channelId), 'write');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const valid = validateExerciseInput(body);
    if (!valid.ok) return c.json({ error: valid.error, code: valid.code }, 400);

    const publish = body.status === 'published';
    // A kept suggestion carries its key, so the passage is never suggested again.
    const suggestionKey = valid.reference && body.fromSuggestion === true ? valid.reference : null;
    const now = nowISO();
    try {
      const row = first(
        await db
          .insert(ChurchReviewExercises)
          .values({
            id: `crx_${crypto.randomUUID()}`,
            churchId: gate.church.id,
            orgId: gate.church.orgId,
            channelSpaceId: gate.channel.id,
            kind: valid.kind,
            prompt: valid.prompt,
            content: valid.content,
            scriptureReference: valid.reference,
            origin: suggestionKey ? 'suggested' : 'authored',
            suggestionKey,
            sourceNoteId: str(body.sourceNoteId) || null,
            sourceServiceId: str(body.sourceServiceId) || null,
            status: publish ? 'published' : 'draft',
            version: 1,
            answeredCount: 0,
            createdBy: auth.userId,
            publishedAt: publish ? now : null,
            createdAt: now,
          })
          .returning(),
      );
      return c.json({ success: true, exercise: row ? serializeForStaff(row) : null });
    } catch (error) {
      if (isUniqueViolation(error, 'ChurchReviewExercises_channel_suggestion_unique')) {
        return c.json({ error: 'That passage already has a question here', code: 'ALREADY_ASKED' }, 409);
      }
      throw error;
    }
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/review/exercises/create', action: 'church_review_create' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/church/review/exercises/update ───────────────────────────────

app.post('/api/church/review/exercises/update', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const orgId = str(body.orgId);
    const gate = await assertChurchReviewAccess(auth.userId, orgId, 'write');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);
    const row = await loadExercise(gate.church.orgId, str(body.exerciseId));
    if (!row || row.status === 'dismissed') return c.json({ error: 'Question not found', code: 'NOT_FOUND' }, 404);

    // The kind is fixed at creation: an edit changes the words, not what sort of question it is.
    const valid = validateExerciseInput({ ...body, kind: row.kind, reference: body.reference ?? row.scriptureReference });
    if (!valid.ok) return c.json({ error: valid.error, code: valid.code }, 400);

    const changed =
      valid.prompt !== row.prompt || valid.content !== row.content || valid.reference !== row.scriptureReference;
    /*
     * Applied in place. A published question that changes bumps its version, and each reader's
     * own refill resets their copy to the new question — staff never write into anyone's rows.
     */
    const now = nowISO();
    const updated = first(
      await db
        .update(ChurchReviewExercises)
        .set({
          prompt: valid.prompt,
          content: valid.content,
          scriptureReference: valid.reference,
          version: changed && row.status === 'published' ? row.version + 1 : row.version,
          updatedBy: auth.userId,
          updatedAt: now,
        })
        .where(eq(ChurchReviewExercises.id, row.id))
        .returning(),
    );
    return c.json({ success: true, exercise: updated ? serializeForStaff(updated) : null });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/review/exercises/update', action: 'church_review_update' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/church/review/exercises/publish | archive ────────────────────

for (const action of ['publish', 'archive'] as const) {
  app.post(`/api/church/review/exercises/${action}`, requireAuth, rateLimit('write'), async (c) => {
    try {
      const auth = getAuthenticatedAuth(c);
      const body = await readBody(c);
      // Taking a question down must work for a church whose plan has ended.
      const gate = await assertChurchReviewAccess(auth.userId, str(body.orgId), action === 'publish' ? 'write' : 'retire');
      if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);
      const row = await loadExercise(gate.church.orgId, str(body.exerciseId));
      if (!row || row.status === 'dismissed') return c.json({ error: 'Question not found', code: 'NOT_FOUND' }, 404);

      const now = nowISO();
      const updated = first(
        await db
          .update(ChurchReviewExercises)
          .set(
            action === 'publish'
              ? { status: 'published', publishedAt: row.publishedAt ?? now, updatedBy: auth.userId, updatedAt: now }
              : { status: 'archived', updatedBy: auth.userId, updatedAt: now },
          )
          .where(eq(ChurchReviewExercises.id, row.id))
          .returning(),
      );
      return c.json({ success: true, exercise: updated ? serializeForStaff(updated) : null });
    } catch (error) {
      const e = handleAPIError(error, {
        endpoint: `/api/church/review/exercises/${action}`,
        action: `church_review_${action}`,
      });
      return c.json({ error: e.message, code: e.code }, 500);
    }
  });
}

// ─── POST /api/church/review/suggestions/dismiss ────────────────────────────

app.post('/api/church/review/suggestions/dismiss', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const gate = await assertChurchReviewChannel(auth.userId, str(body.orgId), str(body.channelId), 'write');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);
    const shape = suggestionShapeFor(str(body.reference));
    if (!shape) return c.json({ error: 'Not a passage', code: 'REFERENCE_INVALID' }, 400);

    // A row, so "no thanks" sticks: the suggester skips every key the channel already has.
    await db
      .insert(ChurchReviewExercises)
      .values({
        id: `crx_${crypto.randomUUID()}`,
        churchId: gate.church.id,
        orgId: gate.church.orgId,
        channelSpaceId: gate.channel.id,
        kind: shape.kind,
        scriptureReference: shape.reference,
        origin: 'suggested',
        suggestionKey: shape.reference,
        status: 'dismissed',
        createdBy: auth.userId,
        createdAt: nowISO(),
      })
      .onConflictDoNothing();
    return c.json({ success: true });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/review/suggestions/dismiss', action: 'church_review_dismiss' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/church/review/preview | preview/grade ────────────────────────
/*
 * A draft, as a congregant would be shown it and marked — through the same builders and
 * graders Review uses, so what staff try is what their people get. Nothing is stored.
 */

const PREVIEW_SEED = 'church-review-preview';

app.post('/api/church/review/preview', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const gate = await assertChurchReviewAccess(auth.userId, str(body.orgId), 'read');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);
    const valid = validateExerciseInput(body);
    if (!valid.ok) return c.json({ error: valid.error, code: valid.code }, 400);
    if (!valid.content) {
      // A passage is asked on the same ladders as a reader's own verses; there is no single card.
      return c.json({ kind: valid.kind, reference: valid.reference, reveal: {} });
    }
    const content = parseChurchExerciseContent(valid.kind, valid.content)!;
    return c.json({ kind: valid.kind, prompt: valid.prompt, reveal: previewFor(valid.kind, content, PREVIEW_SEED) });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/review/preview', action: 'church_review_preview' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

app.post('/api/church/review/preview/grade', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const gate = await assertChurchReviewAccess(auth.userId, str(body.orgId), 'read');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);
    const valid = validateExerciseInput(body);
    if (!valid.ok || !valid.content) {
      return c.json({ error: valid.ok ? 'Nothing to mark' : valid.error, code: valid.ok ? 'NOT_GRADED' : valid.code }, 400);
    }
    const content = parseChurchExerciseContent(valid.kind, valid.content)!;
    const answer = (body.answer && typeof body.answer === 'object' ? body.answer : {}) as Body;
    if (valid.kind === 'choice' && 'correctIndex' in content) {
      return c.json({ correct: gradeChurchChoice(buildChurchChoice(content, PREVIEW_SEED), str(answer.option)) });
    }
    if (valid.kind === 'order' && 'items' in content) {
      const order = Array.isArray(answer.order) ? answer.order.filter((v): v is number => Number.isInteger(v)) : [];
      return c.json(markChurchOrder(buildChurchOrder(content, PREVIEW_SEED), order));
    }
    if (valid.kind === 'match' && 'pairs' in content) {
      const built = buildChurchMatch(content, PREVIEW_SEED);
      const pairs = parseChurchMatchAnswer(answer.pairs, built.right.length);
      return pairs ? c.json(markChurchMatch(built, pairs)) : c.json({ error: 'Match every item', code: 'ANSWER_INCOMPLETE' }, 400);
    }
    return c.json({ error: 'Nothing to mark', code: 'NOT_GRADED' }, 400);
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/review/preview/grade', action: 'church_review_preview_grade' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

export default app;
