/**
 * Shared handler for GET /api/votd/today (public, unauthenticated).
 * Used by the health route module so the endpoint ships in the same bundle slice as /api/health.
 */
import type { Context } from 'hono';
import { db, desc, eq, first, lte } from '../db';
import { now } from '../db/dates';
import { VotdPublishHistory } from '../db/schema';
import { getLocalCalendarDateString, isValidIanaTimeZone } from './votd-local-date';

export async function votdTodayPublicHandler(c: Context) {
  try {
    const tzHeader = (c.req.query('tz') ?? c.req.header('X-Votd-Timezone') ?? '').trim();
    const timeZone = isValidIanaTimeZone(tzHeader) ? tzHeader : 'UTC';
    const localCalendarDate = getLocalCalendarDateString(timeZone, now());

    const exactRow = first(
      await db
        .select({ reference: VotdPublishHistory.reference, translation: VotdPublishHistory.translation })
        .from(VotdPublishHistory)
        .where(eq(VotdPublishHistory.publishedDate, localCalendarDate))
        .limit(1),
    );

    let row = exactRow;
    if (!row) {
      const fallbackRow = first(
        await db
          .select({
            reference: VotdPublishHistory.reference,
            translation: VotdPublishHistory.translation,
            publishedDate: VotdPublishHistory.publishedDate,
          })
          .from(VotdPublishHistory)
          .where(lte(VotdPublishHistory.publishedDate, localCalendarDate))
          .orderBy(desc(VotdPublishHistory.publishedDate))
          .limit(1),
      );
      if (fallbackRow) {
        console.log(
          `[api/votd/today] fallback used: timezone=${timeZone} localDate=${localCalendarDate} publishedDate=${fallbackRow.publishedDate}`,
        );
        row = { reference: fallbackRow.reference, translation: fallbackRow.translation };
      }
    }

    c.res.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=300');
    return c.json(row ? { reference: row.reference, translation: row.translation ?? 'NET' } : { reference: null });
  } catch {
    c.res.headers.set('Cache-Control', 'public, max-age=60');
    return c.json({ reference: null });
  }
}
