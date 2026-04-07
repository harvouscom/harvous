/**
 * VOTD (Verse of the Day) admin routes
 *
 * Endpoints:
 *   POST   /api/admin/votd/schedule       — Add a verse to the VotdSchedule pool
 *   GET    /api/admin/votd/schedule       — List all schedule entries
 *   DELETE /api/admin/votd/schedule/:id   — Remove a schedule entry (unpublished only)
 *   POST   /api/admin/votd/publish-daily  — Publish today's VOTD (auto-select + create FeaturedItems row)
 */

import { Hono } from 'hono';
import { and, db, desc, eq, first, isNull } from '../db';
import { now, nowISO } from '../db/dates';
import { requireHarvousAdmin } from '../utils/harvous-admin';
import { FeaturedItems, VotdSchedule } from '../db/schema';
import { fetchVerseText } from '../utils/fetch-verse-text';
import { parseScriptureReference, normalizeScriptureReference } from '@/utils/scripture-detector';

const app = new Hono();

// Require VOTD cron secret or regular admin credentials for the publish endpoint
function requireVotdAuth(c: Parameters<typeof requireHarvousAdmin>[0]) {
  const expectedSecret = process.env.VOTD_CRON_SECRET?.trim();
  const authHeader = (c.req.header('authorization') ?? c.req.header('Authorization') ?? '').trim();
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const provided = m?.[1]?.trim();

  // Temporary auth debug — remove once cron secret is confirmed working
  console.log('[requireVotdAuth]', {
    hasEnvSecret: !!expectedSecret,
    envSecretLength: expectedSecret?.length ?? 0,
    hasProvidedToken: !!provided,
    providedLength: provided?.length ?? 0,
    match: expectedSecret ? provided === expectedSecret : false,
  });

  if (expectedSecret && provided === expectedSecret) return null;
  return requireHarvousAdmin(c);
}

// ─── POST /api/admin/votd/schedule ───────────────────────────────────────────
// Add a verse to the curated pool. Pass scheduledDate to pin it to a specific day.
app.post('/api/admin/votd/schedule', async (c) => {
  const unauthorized = requireHarvousAdmin(c);
  if (unauthorized) return unauthorized;

  const body = (await c.req.json().catch(() => ({}))) as {
    reference?: string;
    translation?: string;
    scheduledDate?: string | null; // ISO date string 'YYYY-MM-DD'
  };

  const reference = body.reference?.trim() ?? '';
  if (!reference) return c.json({ error: 'reference is required' }, 400);

  const translation = body.translation?.trim() || 'NET';
  const scheduledDate = body.scheduledDate?.trim() || null;

  // Normalize and parse the reference
  const normalizedRef = normalizeScriptureReference(reference);
  const parsed = parseScriptureReference(normalizedRef);
  if (!parsed) return c.json({ error: `Could not parse scripture reference: "${reference}"` }, 400);

  const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
  const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : undefined;

  // Pre-fetch verse text
  let verseText = '';
  try {
    verseText = await fetchVerseText(normalizedRef, translation);
  } catch (err) {
    console.error('[votd/schedule] fetchVerseText error (non-critical):', err);
  }

  const timestamp = nowISO();
  const id = `votd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const inserted = first(
    await db
      .insert(VotdSchedule)
      .values({
        id,
        reference: normalizedRef,
        translation,
        verseText: verseText || null,
        book: parsed.book,
        chapter: parsed.chapter,
        verse: verseStart,
        verseEnd: verseEnd || null,
        scheduledDate,
        isPublished: false,
        featuredItemId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning(),
  );

  return c.json(inserted ?? { success: true }, 201);
});

// ─── GET /api/admin/votd/schedule ────────────────────────────────────────────
// List all schedule entries, newest first.
app.get('/api/admin/votd/schedule', async (c) => {
  const unauthorized = requireHarvousAdmin(c);
  if (unauthorized) return unauthorized;

  const rows = await db
    .select()
    .from(VotdSchedule)
    .orderBy(desc(VotdSchedule.createdAt));

  return c.json(rows);
});

// ─── DELETE /api/admin/votd/schedule/:id ─────────────────────────────────────
// Remove an unpublished schedule entry.
app.delete('/api/admin/votd/schedule/:id', async (c) => {
  const unauthorized = requireHarvousAdmin(c);
  if (unauthorized) return unauthorized;

  const id = c.req.param('id')?.trim() ?? '';
  if (!id) return c.json({ error: 'id is required' }, 400);

  const entry = first(
    await db.select().from(VotdSchedule).where(eq(VotdSchedule.id, id)).limit(1),
  );
  if (!entry) return c.json({ error: 'Not found' }, 404);
  if (entry.isPublished) return c.json({ error: 'Cannot delete a published VOTD entry' }, 409);

  await db.delete(VotdSchedule).where(eq(VotdSchedule.id, id));
  return c.json({ success: true });
});

// ─── POST /api/admin/votd/publish-daily ──────────────────────────────────────
// Publish today's VOTD. Finds the entry scheduled for today, or picks the oldest
// unscheduled pool entry. Creates a FeaturedItems row active for the calendar day.
app.post('/api/admin/votd/publish-daily', async (c) => {
  const unauthorized = requireVotdAuth(c);
  if (unauthorized) return unauthorized;

  const todayStr = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

  // Check if a VOTD was already published for today
  const alreadyPublished = first(
    await db
      .select({ id: FeaturedItems.id })
      .from(FeaturedItems)
      .innerJoin(VotdSchedule, eq(VotdSchedule.featuredItemId, FeaturedItems.id))
      .where(and(eq(FeaturedItems.contentType, 'votd'), eq(VotdSchedule.scheduledDate, todayStr)))
      .limit(1),
  );
  if (alreadyPublished) {
    return c.json({ success: true, alreadyPublished: true, featuredItemId: alreadyPublished.id });
  }

  // Find today's scheduled verse first, then fall back to unscheduled pool
  let entry = first(
    await db
      .select()
      .from(VotdSchedule)
      .where(and(eq(VotdSchedule.scheduledDate, todayStr), eq(VotdSchedule.isPublished, false)))
      .limit(1),
  );

  if (!entry) {
    // Pick oldest unscheduled pool entry
    entry = first(
      await db
        .select()
        .from(VotdSchedule)
        .where(and(isNull(VotdSchedule.scheduledDate), eq(VotdSchedule.isPublished, false)))
        .orderBy(VotdSchedule.createdAt)
        .limit(1),
    );
  }

  if (!entry) {
    return c.json({ error: 'No unpublished VOTD entries available. Add verses via POST /api/admin/votd/schedule.' }, 404);
  }

  // Build time window: today 00:00 UTC → tomorrow 00:00 UTC
  const todayStart = new Date(`${todayStr}T00:00:00.000Z`);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  // Build a short verse excerpt for description (strip HTML tags, truncate)
  const plainText = (entry.verseText ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const excerpt = plainText.length > 280 ? plainText.slice(0, 280) + '…' : plainText;

  const metadata = {
    reference: entry.reference,
    translation: entry.translation,
    verseText: entry.verseText ?? '',
    book: entry.book ?? '',
    chapter: entry.chapter ?? null,
    verse: entry.verse ?? null,
    verseEnd: entry.verseEnd ?? null,
  };

  const timestamp = now();
  const featuredItemId = `votd_fi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  await db.insert(FeaturedItems).values({
    id: featuredItemId,
    contentType: 'votd',
    title: entry.reference,
    description: excerpt || null,
    refId: entry.id,
    shareToken: null,
    color: null,
    isActive: true,
    startsAt: todayStart,
    endsAt: tomorrowStart,
    metadata: JSON.stringify(metadata),
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  // Mark the schedule entry as published
  await db
    .update(VotdSchedule)
    .set({ isPublished: true, featuredItemId, scheduledDate: todayStr, updatedAt: nowISO() })
    .where(eq(VotdSchedule.id, entry.id));

  return c.json({ success: true, featuredItemId, reference: entry.reference, scheduledDate: todayStr });
});

export default app;
