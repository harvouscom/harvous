/**
 * VOTD (Verse of the Day) admin routes
 *
 * Endpoints:
 *   POST   /api/admin/votd/schedule       — Add a verse to the pool or pin a date (override)
 *   GET    /api/admin/votd/schedule       — List schedule entries
 *   DELETE /api/admin/votd/schedule/:id    — Remove an unpublished entry
 *   POST   /api/admin/votd/publish-daily  — Publish today's VOTD (cron + admin). Query `target=next`
 *                                          (Bearer cron only) publishes tomorrow's UTC date early so the
 *                                          FeaturedItems row exists before `startsAt` — avoids a gap after
 *                                          midnight UTC when the previous day's `endsAt` passes.
 *   GET    /api/admin/votd/preview         — Editorial preview of upcoming days
 *   POST   /api/admin/votd/override        — Pin reference to a UTC date
 *   POST   /api/admin/votd/refresh         — Re-roll a future day (stores pin)
 *   DELETE /api/admin/votd/override/:date  — Clear pin for date (YYYY-MM-DD)
 */

import { Hono } from 'hono';
import { and, db, desc, eq, first, gte, inArray, isNotNull, lte } from '../db';
import { now, nowISO } from '../db/dates';
import { requireHarvousAdmin } from '../utils/harvous-admin';
import { FeaturedItems, VotdSchedule, VotdPublishHistory } from '../db/schema';
import { fetchVerseText } from '../utils/fetch-verse-text';
import { parseScriptureReference, normalizeScriptureReference } from '@/utils/scripture-detector';
import {
  stripLeadingVerseNumberFromPlainText,
  stripRedundantEdgeQuotesForVotdCard,
  stripHtmlPreservingBreaksForVotd,
} from '@/utils/verse-plain-display';
import { getCalendarVerseForDate, isCalendarHolidayDate } from '../utils/votd-calendar';
import {
  pickDailyVerseForPublish,
  pickPoolVerseForPreview,
  getPublishedBookOnDate,
  utcPreviousCalendarDay,
  VOTD_AUTOMATION_POOL,
  type DailyVersePick,
} from '../utils/votd-pool';
import { bookFromReference } from '../utils/votd-reference-bounds';

const app = new Hono();

function requireVotdAuth(c: Parameters<typeof requireHarvousAdmin>[0]) {
  if (c.get('cronAuthed')) return null;

  const expectedSecret = process.env.VOTD_CRON_SECRET?.trim();
  const authHeader = (c.req.header('authorization') ?? c.req.header('Authorization') ?? '').split(',')[0].trim();
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const provided = m?.[1]?.trim();

  if (expectedSecret && provided && provided === expectedSecret) return null;
  return requireHarvousAdmin(c);
}

function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dateStrToUtcNoon(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
}

function plainExcerpt(html: string, max = 120): string {
  const t = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

/** Full plain text for admin preview — matches dashboard VOTD card processing (no truncation). */
function votdPreviewPlainFromHtml(html: string, reference: string): string {
  const parsed = parseScriptureReference(normalizeScriptureReference(reference));
  const verseStart = parsed ? (Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse) : null;
  const verseEnd = parsed ? (Array.isArray(parsed.verse) ? parsed.verse[1] : null) : null;
  const collapsed = stripHtmlPreservingBreaksForVotd(html);
  const withoutLeadingNum = stripLeadingVerseNumberFromPlainText(collapsed, verseStart, verseEnd);
  return stripRedundantEdgeQuotesForVotdCard(withoutLeadingNum);
}

async function publishVotdCore(params: {
  dateStr: string;
  reference: string;
  translation: string;
  verseText: string;
  book: string;
  chapter: number | null;
  verse: number | null;
  verseEnd: number | null;
  source: 'calendar' | 'pool' | 'override';
  label: string | null;
  scheduleId: string | null;
}): Promise<{ featuredItemId: string }> {
  const {
    dateStr,
    reference,
    translation,
    verseText,
    book,
    chapter,
    verse,
    verseEnd,
    source,
    label,
    scheduleId,
  } = params;

  const todayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const excerpt = plainExcerpt(verseText, 280);

  const metadata = {
    reference,
    translation,
    verseText,
    book,
    chapter,
    verse,
    verseEnd,
  };

  const timestamp = now();
  const featuredItemId = `votd_fi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const historyId = `votd_hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const year = parseInt(dateStr.slice(0, 4), 10);

  await db.insert(FeaturedItems).values({
    id: featuredItemId,
    contentType: 'votd',
    title: reference,
    description: excerpt || null,
    refId: scheduleId,
    shareToken: null,
    color: null,
    isActive: true,
    startsAt: todayStart,
    endsAt: tomorrowStart,
    metadata: JSON.stringify(metadata),
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await db.insert(VotdPublishHistory).values({
    id: historyId,
    reference,
    translation,
    featuredItemId,
    source,
    label,
    publishedDate: dateStr,
    year,
    createdAt: now(),
  });

  if (scheduleId) {
    await db
      .update(VotdSchedule)
      .set({ isPublished: true, featuredItemId, scheduledDate: dateStr, updatedAt: nowISO() })
      .where(eq(VotdSchedule.id, scheduleId));
  }

  return { featuredItemId };
}

// ─── POST /api/admin/votd/schedule ───────────────────────────────────────────
app.post('/api/admin/votd/schedule', async (c) => {
  const unauthorized = requireHarvousAdmin(c);
  if (unauthorized) return unauthorized;

  const body = (await c.req.json().catch(() => ({}))) as {
    reference?: string;
    translation?: string;
    scheduledDate?: string | null;
  };

  const reference = body.reference?.trim() ?? '';
  if (!reference) return c.json({ error: 'reference is required' }, 400);

  const translation = body.translation?.trim() || 'NET';
  const scheduledDate = body.scheduledDate?.trim() || null;

  const normalizedRef = normalizeScriptureReference(reference);
  const parsed = parseScriptureReference(normalizedRef);
  if (!parsed) return c.json({ error: `Could not parse scripture reference: "${reference}"` }, 400);

  const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
  const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : undefined;

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
app.get('/api/admin/votd/schedule', async (c) => {
  const unauthorized = requireHarvousAdmin(c);
  if (unauthorized) return unauthorized;

  const rows = await db.select().from(VotdSchedule).orderBy(desc(VotdSchedule.createdAt));
  return c.json(rows);
});

// ─── DELETE /api/admin/votd/schedule/:id ─────────────────────────────────────
app.delete('/api/admin/votd/schedule/:id', async (c) => {
  const unauthorized = requireHarvousAdmin(c);
  if (unauthorized) return unauthorized;

  const id = c.req.param('id')?.trim() ?? '';
  if (!id) return c.json({ error: 'id is required' }, 400);

  const entry = first(await db.select().from(VotdSchedule).where(eq(VotdSchedule.id, id)).limit(1));
  if (!entry) return c.json({ error: 'Not found' }, 404);
  if (entry.isPublished) return c.json({ error: 'Cannot delete a published VOTD entry' }, 409);

  await db.delete(VotdSchedule).where(eq(VotdSchedule.id, id));
  return c.json({ success: true });
});

// ─── POST /api/admin/votd/publish-daily ──────────────────────────────────────
app.post('/api/admin/votd/publish-daily', async (c) => {
  const unauthorized = requireVotdAuth(c);
  if (unauthorized) return unauthorized;

  const target = c.req.query('target');
  let todayStr: string;
  if (target === 'next') {
    if (!c.get('cronAuthed')) {
      return c.json({ error: 'target=next requires VOTD cron bearer auth' }, 403);
    }
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    todayStr = utcDateStr(d);
  } else {
    todayStr = utcDateStr(new Date());
  }

  const published = first(
    await db
      .select({ featuredItemId: VotdPublishHistory.featuredItemId })
      .from(VotdPublishHistory)
      .where(eq(VotdPublishHistory.publishedDate, todayStr))
      .limit(1),
  );
  if (published) {
    return c.json({ success: true, alreadyPublished: true, featuredItemId: published.featuredItemId });
  }

  let manual = first(
    await db
      .select()
      .from(VotdSchedule)
      .where(and(eq(VotdSchedule.scheduledDate, todayStr), eq(VotdSchedule.isPublished, false)))
      .orderBy(desc(VotdSchedule.createdAt))
      .limit(1),
  );

  let pick: DailyVersePick;
  let scheduleId: string | null = null;
  let verseText: string;
  let translation = 'NET';
  let book: string;
  let chapter: number | null;
  let verse: number | null;
  let verseEnd: number | null;

  if (manual) {
    scheduleId = manual.id;
    pick = {
      reference: manual.reference,
      source: 'override',
      label: null,
    };
    translation = manual.translation || 'NET';
    try {
      verseText = manual.verseText || (await fetchVerseText(manual.reference, translation));
    } catch {
      verseText = manual.verseText || '';
    }
    book = manual.book ?? '';
    chapter = manual.chapter ?? null;
    verse = manual.verse ?? null;
    verseEnd = manual.verseEnd ?? null;
  } else {
    pick = await pickDailyVerseForPublish(todayStr);
    const normalizedRef = normalizeScriptureReference(pick.reference);
    const parsed = parseScriptureReference(normalizedRef);
    if (!parsed) {
      return c.json({ error: `Could not parse reference: "${pick.reference}"` }, 500);
    }
    const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
    const vEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : undefined;
    try {
      verseText = await fetchVerseText(normalizedRef, translation);
    } catch (e) {
      console.error('[votd/publish-daily] fetchVerseText', e);
      return c.json({ error: `Could not load verse text for ${pick.reference}` }, 500);
    }
    book = parsed.book;
    chapter = parsed.chapter;
    verse = verseStart;
    verseEnd = vEnd ?? null;
    pick = { ...pick, reference: normalizedRef };
  }

  const result = await publishVotdCore({
    dateStr: todayStr,
    reference: pick.reference,
    translation,
    verseText,
    book,
    chapter,
    verse,
    verseEnd,
    source: pick.source,
    label: pick.label,
    scheduleId,
  });

  return c.json({
    success: true,
    featuredItemId: result.featuredItemId,
    reference: pick.reference,
    scheduledDate: todayStr,
    source: pick.source,
  });
});

// ─── GET /api/admin/votd/preview ───────────────────────────────────────────
app.get('/api/admin/votd/preview', async (c) => {
  const unauthorized = requireHarvousAdmin(c);
  if (unauthorized) return unauthorized;

  const daysRaw = c.req.query('days');
  const days = Math.min(90, Math.max(1, parseInt(daysRaw || '30', 10) || 30));

  const start = new Date();
  start.setUTCHours(12, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + days - 1);
  const dateMin = utcDateStr(start);
  const dateMax = utcDateStr(end);

  const histInRange = await db
    .select()
    .from(VotdPublishHistory)
    .where(
      and(gte(VotdPublishHistory.publishedDate, dateMin), lte(VotdPublishHistory.publishedDate, dateMax)),
    );
  const histByDate = new Map(histInRange.map((h) => [h.publishedDate, h]));

  const pinsInRange = await db
    .select()
    .from(VotdSchedule)
    .where(
      and(
        eq(VotdSchedule.isPublished, false),
        isNotNull(VotdSchedule.scheduledDate),
        gte(VotdSchedule.scheduledDate, dateMin),
        lte(VotdSchedule.scheduledDate, dateMax),
      ),
    );
  const pinByDate = new Map<string, (typeof pinsInRange)[0]>();
  const sortedPins = [...pinsInRange].sort(
    (a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0),
  );
  for (const p of sortedPins) {
    const sd = p.scheduledDate;
    if (sd && !pinByDate.has(sd)) pinByDate.set(sd, p);
  }

  const yearsInRange = new Set<number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    yearsInRange.add(d.getUTCFullYear());
  }
  const yearList = [...yearsInRange];
  const histForYears =
    yearList.length > 0
      ? await db
          .select({ reference: VotdPublishHistory.reference, year: VotdPublishHistory.year })
          .from(VotdPublishHistory)
          .where(inArray(VotdPublishHistory.year, yearList))
      : [];
  const usedByYear = new Map<number, Set<string>>();
  for (const y of yearList) usedByYear.set(y, new Set());
  for (const row of histForYears) {
    usedByYear.get(row.year)?.add(row.reference);
  }

  type PreviewDay = {
    date: string;
    dayOfWeek: string;
    reference: string;
    translation: string;
    source: 'calendar' | 'pool' | 'override' | 'published';
    label: string | null;
    isHoliday: boolean;
    isOverridden: boolean;
    isPublished: boolean;
    versePreview: string;
  };

  const out: PreviewDay[] = [];
  const dow = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let previousDayBook = await getPublishedBookOnDate(utcPreviousCalendarDay(dateMin));

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const dateStr = utcDateStr(d);

    const hist = histByDate.get(dateStr);

    if (hist) {
      const translation = hist.translation || 'NET';
      let versePreview = '';
      try {
        const html = await fetchVerseText(hist.reference, translation);
        versePreview = votdPreviewPlainFromHtml(html, hist.reference);
      } catch {
        versePreview = '';
      }
      out.push({
        date: dateStr,
        dayOfWeek: dow[d.getUTCDay()]!,
        reference: hist.reference,
        translation,
        source: 'published',
        label: hist.label,
        isHoliday: hist.source === 'calendar',
        isOverridden: hist.source === 'override',
        isPublished: true,
        versePreview,
      });
      previousDayBook = bookFromReference(hist.reference);
      continue;
    }

    const pin = pinByDate.get(dateStr);

    if (pin) {
      const translation = pin.translation || 'NET';
      let versePreview = '';
      try {
        const html = pin.verseText || (await fetchVerseText(pin.reference, translation));
        versePreview = votdPreviewPlainFromHtml(html, pin.reference);
      } catch {
        versePreview = '';
      }
      out.push({
        date: dateStr,
        dayOfWeek: dow[d.getUTCDay()]!,
        reference: pin.reference,
        translation,
        source: 'override',
        label: null,
        isHoliday: isCalendarHolidayDate(d),
        isOverridden: true,
        isPublished: false,
        versePreview,
      });
      previousDayBook = bookFromReference(pin.reference);
      continue;
    }

    const cal = getCalendarVerseForDate(d);
    const year = d.getUTCFullYear();
    const usedYear = usedByYear.get(year) ?? new Set<string>();

    let reference: string;
    let source: 'calendar' | 'pool';
    let label: string | null;
    if (cal) {
      reference = cal.reference;
      source = 'calendar';
      label = cal.label;
    } else {
      reference = pickPoolVerseForPreview(dateStr, usedYear, previousDayBook);
      source = 'pool';
      label = null;
    }

    const translation = 'NET';
    let versePreview = '';
    try {
      const html = await fetchVerseText(reference, translation);
      versePreview = votdPreviewPlainFromHtml(html, reference);
    } catch {
      versePreview = '';
    }

    out.push({
      date: dateStr,
      dayOfWeek: dow[d.getUTCDay()]!,
      reference,
      translation,
      source,
      label,
      isHoliday: cal !== null,
      isOverridden: false,
      isPublished: false,
      versePreview,
    });
    previousDayBook = bookFromReference(reference);
  }

  return c.json({ days: out });
});

// ─── POST /api/admin/votd/override ─────────────────────────────────────────
app.post('/api/admin/votd/override', async (c) => {
  const unauthorized = requireHarvousAdmin(c);
  if (unauthorized) return unauthorized;

  const body = (await c.req.json().catch(() => ({}))) as { date?: string; reference?: string };
  const dateStr = body.date?.trim() ?? '';
  const reference = body.reference?.trim() ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  }
  if (!reference) return c.json({ error: 'reference is required' }, 400);

  const normalizedRef = normalizeScriptureReference(reference);
  const parsed = parseScriptureReference(normalizedRef);
  if (!parsed) return c.json({ error: `Could not parse scripture reference: "${reference}"` }, 400);

  await db
    .delete(VotdSchedule)
    .where(and(eq(VotdSchedule.scheduledDate, dateStr), eq(VotdSchedule.isPublished, false)));

  const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
  const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : undefined;
  const translation = 'NET';
  let verseText = '';
  try {
    verseText = await fetchVerseText(normalizedRef, translation);
  } catch (err) {
    console.error('[votd/override] fetchVerseText', err);
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
        scheduledDate: dateStr,
        isPublished: false,
        featuredItemId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning(),
  );

  return c.json(inserted ?? { success: true });
});

// ─── POST /api/admin/votd/refresh ──────────────────────────────────────────
app.post('/api/admin/votd/refresh', async (c) => {
  const unauthorized = requireHarvousAdmin(c);
  if (unauthorized) return unauthorized;

  const body = (await c.req.json().catch(() => ({}))) as { date?: string };
  const dateStr = body.date?.trim() ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  }

  const todayStr = utcDateStr(new Date());
  if (dateStr < todayStr) {
    return c.json({ error: 'Cannot refresh past dates' }, 400);
  }

  const hist = first(
    await db.select().from(VotdPublishHistory).where(eq(VotdPublishHistory.publishedDate, dateStr)).limit(1),
  );
  if (hist) {
    return c.json({ error: 'Date already published; refresh not applicable' }, 409);
  }

  await db
    .delete(VotdSchedule)
    .where(and(eq(VotdSchedule.scheduledDate, dateStr), eq(VotdSchedule.isPublished, false)));

  const d = dateStrToUtcNoon(dateStr);
  const year = d.getUTCFullYear();
  const usedRows = await db
    .select({ reference: VotdPublishHistory.reference })
    .from(VotdPublishHistory)
    .where(eq(VotdPublishHistory.year, year));
  const usedYear = new Set(usedRows.map((r) => r.reference));

  const cal = getCalendarVerseForDate(d);
  let reference: string;
  if (cal) {
    const pool = VOTD_AUTOMATION_POOL.filter((r) => r !== cal.reference);
    reference = pool.length ? pool[Math.floor(Math.random() * pool.length)]! : cal.reference;
  } else {
    const prevBook = await getPublishedBookOnDate(utcPreviousCalendarDay(dateStr));
    reference = pickPoolVerseForPreview(`${dateStr}_refresh_${Date.now()}`, usedYear, prevBook);
  }

  const normalizedRef = normalizeScriptureReference(reference);
  const parsed = parseScriptureReference(normalizedRef);
  if (!parsed) return c.json({ error: 'Invalid reference from refresh' }, 500);

  const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
  const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : undefined;
  const translation = 'NET';
  let verseText = '';
  try {
    verseText = await fetchVerseText(normalizedRef, translation);
  } catch (err) {
    console.error('[votd/refresh] fetchVerseText', err);
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
        scheduledDate: dateStr,
        isPublished: false,
        featuredItemId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning(),
  );

  return c.json({ success: true, reference: normalizedRef, row: inserted });
});

// ─── DELETE /api/admin/votd/override/:date ───────────────────────────────────
app.delete('/api/admin/votd/override/:date', async (c) => {
  const unauthorized = requireHarvousAdmin(c);
  if (unauthorized) return unauthorized;

  const dateStr = c.req.param('date')?.trim() ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  }

  await db
    .delete(VotdSchedule)
    .where(and(eq(VotdSchedule.scheduledDate, dateStr), eq(VotdSchedule.isPublished, false)));

  return c.json({ success: true });
});

export default app;
