/**
 * What a reminder actually says.
 *
 * The whole difference between a nudge worth keeping on and one people turn off lives here.
 * A notification that says "Come back to Harvous" is an advertisement for an app; one that
 * says "For God so loved the world… — John 3:16" is the thing itself, already started. So
 * every reminder carries content: today's verse if there is one, otherwise the chapter the
 * reader left, and only as a last resort a plain line.
 *
 * The verse comes from the same resolver `/api/votd/today` uses, so the banner and the app
 * can never disagree about which verse today is.
 */
import { db, eq, first, FeaturedItems, UserMetadata } from '../db';
import { parseLastReadPosition, lastReadPositionReference } from '@/utils/last-read-position';
import { plainExcerpt } from './plain-excerpt';
import { getLocalCalendarDateString } from './votd-local-date';
import { resolveVotdForLocalDate } from './votd-today-public';
import type { ReminderNotificationPayload } from './web-push-client';

export type ReminderKind = 'sunday' | 'midweek' | 'test';
/** Which copy went out. Recorded per delivery so open rates can compare them. */
export type ReminderVariant = 'verse' | 'pickup' | 'plain';

export const REMINDER_TAG = 'harvous-reminder';
export const REMINDER_ICON = '/images/icons/icon-192.png';
export const REMINDER_BADGE = '/images/icons/badge-96.png';

/** Bodies longer than this are truncated by every platform; the quote budget accounts for it. */
const BODY_MAX = 120;
/** Room for the ` — John 3:16 (NET)` tail. */
const QUOTE_MAX = 84;

/**
 * Titles must fit one line, and the line is shorter than it looks.
 *
 * iOS renders a web push title as "<title> from <app name>", so a Home Screen notification
 * from Harvous spends thirteen characters on " from Harvous" before the title gets any. At
 * the lock screen's size that leaves roughly this much before it wraps, and a wrapped title
 * pushes the verse down and reads as a paragraph rather than a heading.
 *
 * Which is why every title below is a fixed string. A title built from a reference —
 * "Still in 1 Corinthians" — is the one shape that cannot be checked by reading the code,
 * because its length depends on the book. References live in the body, which has room.
 * `reminder-payload.test.ts` holds every title to this.
 */
export const TITLE_MAX = 22;

export interface BuiltReminder {
  payload: ReminderNotificationPayload;
  variant: ReminderVariant;
}

interface BuildOptions {
  kind: ReminderKind;
  now?: Date;
  /** Set by the tick so the service worker can report back what happened to this one. */
  deliveryId?: string | null;
  /** Bias toward a variant when the policy has learned one lands better for this reader. */
  preferVariant?: ReminderVariant | null;
}

interface VerseContent {
  quote: string;
  reference: string;
  translation: string;
}

/**
 * Titles, by kind. Sunday says Sunday because that is the whole point of a Sunday reminder;
 * midweek does not name the day, since "It's Wednesday" tells the reader nothing they don't
 * know and sounds like a mail merge.
 */
function verseTitle(kind: ReminderKind): string {
  if (kind === 'sunday') return "Sunday's verse";
  return "Today's verse";
}

function pickupTitle(kind: ReminderKind): string {
  if (kind === 'sunday') return 'Before church';
  return 'Where you left off';
}

function plainTitle(kind: ReminderKind): string {
  if (kind === 'sunday') return "It's Sunday";
  return 'Midweek check-in';
}

function plainBody(kind: ReminderKind): string {
  if (kind === 'sunday') return 'A quiet minute with Scripture before the day starts.';
  return 'Ten minutes in the Word today.';
}

function verseBody(verse: VerseContent): string {
  const quote = plainExcerpt(verse.quote, QUOTE_MAX);
  const tail = `— ${verse.reference} (${verse.translation})`;
  const body = quote ? `“${quote}” ${tail}` : tail;
  return body.length > BODY_MAX ? `${body.slice(0, BODY_MAX - 1)}…` : body;
}

function pickupBody(kind: ReminderKind, reference: string): string {
  if (kind === 'sunday') return `You left off in ${reference}. Pick it up where you were.`;
  // The reference moved here from the title, so the body has to name it.
  return `You're in ${reference}. Read the next few verses.`;
}

/** Deep link for a chapter, matching the reader route `read/$book/$chapter?t=`. */
function readerUrl(book: string, chapter: number, translation: string): string {
  return `/read/${encodeURIComponent(book)}/${chapter}?t=${encodeURIComponent(translation)}`;
}

/** The verse text for a local day, or null when nothing is published yet. */
async function loadVerseContent(localDate: string): Promise<VerseContent | null> {
  const votd = await resolveVotdForLocalDate(localDate, 'push-reminders');
  if (!votd) return null;

  let quote = '';
  if (votd.featuredItemId) {
    const item = first(
      await db
        .select({ metadata: FeaturedItems.metadata })
        .from(FeaturedItems)
        .where(eq(FeaturedItems.id, votd.featuredItemId))
        .limit(1),
    );
    if (item?.metadata) {
      try {
        const parsed = JSON.parse(item.metadata) as { verseText?: unknown };
        if (typeof parsed.verseText === 'string') quote = parsed.verseText;
      } catch {
        /* a malformed metadata blob degrades to reference-only, not to no reminder */
      }
    }
  }

  return { quote, reference: votd.reference, translation: votd.translation };
}

/**
 * Build the notification for one user.
 *
 * Falls through verse → pick-up → plain, so a reader with no published verse and no reading
 * history still gets something true rather than nothing. `preferVariant` can move pick-up
 * ahead of verse when the policy has evidence this reader responds to it, but never invents
 * a variant whose content is missing.
 */
export async function buildReminderPayload(
  userId: string,
  { kind, now = new Date(), deliveryId = null, preferVariant = null }: BuildOptions,
): Promise<BuiltReminder> {
  /*
   * Non-fatal, in the same spirit as get-profile's metadata block. Everything read here only
   * *improves* the reminder — the zone picks which day's verse, the reading position offers a
   * better variant. A failure (an account with no metadata row, or a deploy that has not run
   * `npm run push:schema:apply` yet) should cost the reader a plainer notification, never the
   * notification itself.
   */
  let meta: {
    timezone: string | null;
    lastReadPosition: string | null;
    defaultTranslation: string | null;
  } | null = null;
  try {
    meta =
      first(
        await db
          .select({
            timezone: UserMetadata.timezone,
            lastReadPosition: UserMetadata.lastReadPosition,
            defaultTranslation: UserMetadata.defaultTranslation,
          })
          .from(UserMetadata)
          .where(eq(UserMetadata.userId, userId))
          .limit(1),
      ) ?? null;
  } catch {
    meta = null;
  }

  const timeZone = meta?.timezone?.trim() || 'UTC';
  const localDate = getLocalCalendarDateString(timeZone, now);

  const position = parseLastReadPosition(meta?.lastReadPosition ?? null);
  const verse = await loadVerseContent(localDate).catch(() => null);

  const wantsPickup = preferVariant === 'pickup' && position;
  let variant: ReminderVariant;
  let title: string;
  let body: string;
  let url: string;

  if (verse && !wantsPickup) {
    variant = 'verse';
    title = verseTitle(kind);
    body = verseBody(verse);
    url = '/read/today';
  } else if (position) {
    const reference = lastReadPositionReference(position);
    variant = 'pickup';
    title = pickupTitle(kind);
    body = pickupBody(kind, reference);
    url = readerUrl(position.book, position.chapter, position.translation || meta?.defaultTranslation || 'NET');
  } else {
    variant = 'plain';
    title = plainTitle(kind);
    body = plainBody(kind);
    url = '/';
  }

  // A test send says what it is. Someone pressing "Send a test" is checking that the plumbing
  // works, and a banner indistinguishable from the real thing leaves them unsure whether it did.
  if (kind === 'test') title = 'Your test reminder';

  return {
    variant,
    payload: {
      title,
      body,
      tag: REMINDER_TAG,
      renotify: false,
      icon: REMINDER_ICON,
      badge: REMINDER_BADGE,
      data: { url, kind, deliveryId, sentAt: now.toISOString() },
      // One action, named for what it does. Two would be a toolbar.
      actions: [{ action: 'open', title: 'Open' }],
    },
  };
}
