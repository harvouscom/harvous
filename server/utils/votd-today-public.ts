/**
 * Shared handler for GET /api/votd/today.
 * Used by the health route module so the endpoint ships in the same bundle slice as /api/health.
 *
 * Unauthenticated: returns catalog translation from VotdPublishHistory (public cache).
 * Authenticated: returns UserMetadata.defaultTranslation so sidebar/native daily passage
 * matches the dashboard featured VOTD card.
 */
import type { Context } from 'hono';
import { db, desc, eq, first, lte } from '../db';
import { now } from '../db/dates';
import { VotdPublishHistory } from '../db/schema';
import { getAuth } from '../middleware/auth';
import { getLocalCalendarDateString, isValidIanaTimeZone } from './votd-local-date';
import { getUserDefaultTranslation } from './votd-user-translation';

export interface ResolvedVotd {
  reference: string;
  translation: string;
  /** Set only when the exact day had no row and an older verse stood in for it. */
  featuredItemId: string | null;
}

/**
 * The verse for a local calendar day: the exact row, else the most recent one published
 * before it.
 *
 * The fallback is the whole point — `publish-daily` stamps a UTC day, so a reader in UTC+13
 * reaches their own tomorrow before the next publish lands, and without this the card (or a
 * reminder) would simply have nothing to say. Shared with the reminder payload builder so
 * the notification and the app never disagree about which verse today is.
 */
export async function resolveVotdForLocalDate(
  localCalendarDate: string,
  logLabel = 'api/votd/today',
): Promise<ResolvedVotd | null> {
  const exactRow = first(
    await db
      .select({
        reference: VotdPublishHistory.reference,
        translation: VotdPublishHistory.translation,
        featuredItemId: VotdPublishHistory.featuredItemId,
      })
      .from(VotdPublishHistory)
      .where(eq(VotdPublishHistory.publishedDate, localCalendarDate))
      .limit(1),
  );
  if (exactRow) {
    return {
      reference: exactRow.reference,
      translation: exactRow.translation,
      featuredItemId: exactRow.featuredItemId ?? null,
    };
  }

  const fallbackRow = first(
    await db
      .select({
        reference: VotdPublishHistory.reference,
        translation: VotdPublishHistory.translation,
        featuredItemId: VotdPublishHistory.featuredItemId,
        publishedDate: VotdPublishHistory.publishedDate,
      })
      .from(VotdPublishHistory)
      .where(lte(VotdPublishHistory.publishedDate, localCalendarDate))
      .orderBy(desc(VotdPublishHistory.publishedDate))
      .limit(1),
  );
  if (!fallbackRow) return null;

  console.log(
    `[${logLabel}] fallback used: localDate=${localCalendarDate} publishedDate=${fallbackRow.publishedDate}`,
  );
  return {
    reference: fallbackRow.reference,
    translation: fallbackRow.translation,
    featuredItemId: fallbackRow.featuredItemId ?? null,
  };
}

export async function votdTodayPublicHandler(c: Context) {
  try {
    const tzHeader = (c.req.query('tz') ?? c.req.header('X-Votd-Timezone') ?? '').trim();
    const timeZone = isValidIanaTimeZone(tzHeader) ? tzHeader : 'UTC';
    const localCalendarDate = getLocalCalendarDateString(timeZone, now());

    const row = await resolveVotdForLocalDate(localCalendarDate);

    const auth = getAuth(c);
    let translation = row?.translation?.trim() || 'NET';
    if (auth.userId) {
      translation = await getUserDefaultTranslation(auth.userId);
      c.res.headers.set('Cache-Control', 'private, max-age=3600, stale-while-revalidate=300');
      c.res.headers.append('Vary', 'Authorization, Cookie');
    } else {
      c.res.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=300');
    }

    return c.json(row ? { reference: row.reference, translation } : { reference: null });
  } catch {
    c.res.headers.set('Cache-Control', 'public, max-age=60');
    return c.json({ reference: null });
  }
}
