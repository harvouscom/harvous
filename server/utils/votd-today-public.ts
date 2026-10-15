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
import { getUserReadingPrefs } from './votd-user-translation';
import { fetchVerseText } from './fetch-verse-text';
import { votdActedOnToday } from './votd-record-engagement';
import { normalizeTradition } from '@/utils/tradition';
import { dateForCalendarDay, todaysReadingsFor, type TodaysReadings } from '@/utils/lectionary';

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

/** What the card needs of the day's readings: its name and each reading, Gospel last. */
function readingsPayload(readings: TodaysReadings) {
  return {
    title: readings.title,
    items: readings.readings.map(({ slot, label, citation, reference }) => ({ slot, label, citation, reference })),
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
    // A member's tradition is the account's; a guest's lives on the device, so it is asked for.
    let tradition = normalizeTradition(c.req.query('tradition'));
    if (auth.userId) {
      ({ translation, tradition } = await getUserReadingPrefs(auth.userId));
      c.res.headers.set('Cache-Control', 'private, max-age=3600, stale-while-revalidate=300');
      c.res.headers.append('Vary', 'Authorization, Cookie');
    } else {
      c.res.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=300');
    }

    /*
     * Today's readings, for a Catholic: the Gospel takes the passage's place, so every client that
     * reads only `reference` (native, reminders) still opens the right chapter, and `readings`
     * carries the rest for the card. Weekdays without a solemnity have none, and the passage
     * stands. `actedToday` still keys on the day's verse row, which is where the card's
     * engagement is recorded either way.
     */
    const lectionaryDate = tradition === 'catholic' ? dateForCalendarDay(localCalendarDate) : null;
    const readings = lectionaryDate ? todaysReadingsFor(lectionaryDate) : null;
    const gospel = readings?.readings[readings.readings.length - 1];
    const reference = gospel?.reference ?? row?.reference;
    const readingsBody = readings ? { readings: readingsPayload(readings) } : {};

    if (!reference) return c.json({ reference: null });
    if (!auth.userId) return c.json({ reference, translation, ...readingsBody });

    /*
     * A member's Activity shows the passage itself, not just its name, so the words come with
     * the reference — one request, no loading state on the card. And whether they already acted
     * on it today (opened it, wrote about it — on any device), which is what folds the card down
     * to its row. Both additive: native reads only `reference` and `translation`.
     *
     * Either can fail without costing the other or the reference: no text means the app shows
     * the row, as it did before there was a card.
     */
    const [textHtml, actedToday] = await Promise.all([
      fetchVerseText(reference, translation).catch(() => ''),
      row?.featuredItemId
        ? votdActedOnToday(auth.userId, row.featuredItemId).catch(() => false)
        : Promise.resolve(false),
    ]);
    return c.json({
      reference,
      translation,
      ...(textHtml.trim() ? { textHtml } : {}),
      actedToday,
      ...readingsBody,
    });
  } catch {
    /*
     * Never cache the failure, and never cache it publicly.
     *
     * This answered `public, max-age=60`, so one blip — a pool timeout, a redeploy — was handed
     * to every reader who asked in the following minute, and to any shared cache in between. The
     * client holds a passage for an hour, so a body saying "no passage today" arriving during
     * that minute meant no passage row until the tab was reloaded. A momentary fault should cost
     * the request it happened on and nothing else.
     */
    c.res.headers.set('Cache-Control', 'private, no-store');
    return c.json({ reference: null });
  }
}
