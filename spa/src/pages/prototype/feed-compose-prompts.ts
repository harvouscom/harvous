/**
 * The lines the Activity compose prompt rotates through, chosen from what we already know.
 *
 * A fixed list reads the same on a Monday morning as on a Saturday night, and the same to
 * someone halfway through Romans as to someone who has never written a note. Everything used
 * here is already on the page — the day, the hour, the chapter you are in, what you keep coming
 * back to, today's passage — so a line can be about *you, now* without another request.
 *
 * Order is priority, and the first line is the one the prompt rests on after its pass, so the
 * most specific thing that is true today goes first. The day line leads because it is the most
 * time-bound ("what did Sunday leave you with?" is only a good question for a day or two), and
 * it follows the service they chose, when they chose one; then the reader's own study; then the
 * day's shared passage; then the hour; then plain invitations so there is always something to
 * rotate to.
 *
 * Pure and deterministic given `now`, so every rule is a test rather than a guess. Adding a
 * signal is adding a rule here; nothing in the component needs to change.
 */

/** Past this the label ellipsizes at phone width; a clipped question is worse than none. */
export const FEED_COMPOSE_MAX_CHARS = 34;

/** Enough to feel varied, few enough that a pass is not half a minute of motion. */
export const FEED_COMPOSE_MAX_LINES = 5;

/** Always true, so a pass never runs short; the first is the anchor line. */
export const FEED_COMPOSE_FILLERS = [
  'What are you studying today?',
  'A verse on your mind?',
  'A question you’re sitting with?',
] as const;

export interface FeedComposeContext {
  now: Date;
  /** Notes on the account, for the one line that should only greet someone brand new. */
  noteCount: number;
  /** The chapter Activity offers to continue, if any. */
  continueReading?: { book: string; chapter: number } | null;
  /** Today's passage, and whether it has already been opened or written about today. */
  passage?: { reference: string; acted: boolean } | null;
  /** What the greeting says you are "lately returning to" — a subject, passage or arc. */
  trendLabel?: string | null;
  /** The Thread you are building most, from the greeting's lead. */
  leadThreadTitle?: string | null;
  /**
   * The service they told us they attend (Settings → Church, or Home's "Is this your service?").
   * When set, the church lines follow it instead of assuming a Sunday-morning service: a Saturday
   * vigil, a Sunday 6pm, a Wednesday night. Read on the viewer's clock, which is the church's for
   * anyone who actually goes.
   */
  service?: { dayOfWeek: number; startTime: string } | null;
}

function fits(line: string): boolean {
  return line.length <= FEED_COMPOSE_MAX_CHARS;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Notes are "from the sermon" from a little before it starts (people open the app in the pew)
 * until a few hours after; past that it is a reflection. The 30 matches the push's quiet window
 * in church-publish-push.ts.
 */
const SERMON_NOTES_BEFORE_MIN = 30;
const SERMON_NOTES_AFTER_MIN = 4 * 60;

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Whole days from `from` forward to `to`, both weekdays: Sat→Sun is 1, Sun→Sat is 6. */
function daysAfter(from: number, to: number): number {
  return (to - from + 7) % 7;
}

/** The church lines for someone with no service chosen: a Sunday-morning church. */
function sundayLine(now: Date): string | null {
  const day = now.getDay();
  const hour = now.getHours();
  if (day === 0) {
    // Morning is still in the service or just out of it; later it is a reflection.
    return hour < 15 ? 'Notes from this morning’s sermon?' : 'What stayed with you from church?';
  }
  if (day === 1 || day === 2) return 'What did Sunday leave you with?';
  if (day === 6) return 'Preparing your heart for Sunday?';
  return null;
}

/** The same three moments — before, the day of, the days after — around their own service. */
function serviceLine(now: Date, service: { dayOfWeek: number; startTime: string }): string | null {
  const start = toMinutes(service.startTime);
  const name = WEEKDAY_NAMES[service.dayOfWeek];
  if (start === null || !name) return sundayLine(now);

  const since = daysAfter(service.dayOfWeek, now.getDay());
  if (since === 0) {
    const minute = now.getHours() * 60 + now.getMinutes();
    // Earlier on the day of a later service, the sermon has not happened yet.
    if (minute < start - SERMON_NOTES_BEFORE_MIN) return 'Preparing your heart for church?';
    if (minute <= start + SERMON_NOTES_AFTER_MIN) {
      const when = start < 12 * 60 ? 'this morning’s' : start < 17 * 60 ? 'today’s' : 'tonight’s';
      return `Notes from ${when} sermon?`;
    }
    return 'What stayed with you from church?';
  }
  if (since === 1 || since === 2) return `What did ${name} leave you with?`;
  if (since === 6) {
    const line = `Preparing your heart for ${name}?`;
    return fits(line) ? line : 'Preparing your heart for tomorrow?';
  }
  return null;
}

/** The line that belongs to this day of the week, if one does. */
function dayLine(now: Date, service: FeedComposeContext['service']): string | null {
  return service ? serviceLine(now, service) : sundayLine(now);
}

/** The line that belongs to this hour, if one does. The afternoon is left to the others. */
function hourLine(now: Date): string | null {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return 'What’s on your mind this morning?';
  if (hour >= 18 && hour < 22) return 'What stayed with you today?';
  if (hour >= 22 || hour < 5) return 'A thought before you rest?';
  return null;
}

/** "Psalms 18:1-2" is in Psalms 18; "Psalms 180" would not be, were there one. */
function isInChapter(reference: string, chapter: FeedComposeContext['continueReading']): boolean {
  if (!chapter) return false;
  const prefix = `${chapter.book} ${chapter.chapter}`;
  return reference === prefix || reference.startsWith(`${prefix}:`);
}

export function buildFeedComposePrompts(ctx: FeedComposeContext): string[] {
  const candidates: (string | null)[] = [];

  // Someone who has never written: say so plainly before anything clever.
  if (ctx.noteCount === 0) candidates.push('Write your first note');

  candidates.push(dayLine(ctx.now, ctx.service));

  if (ctx.continueReading) {
    candidates.push(`Still in ${ctx.continueReading.book} ${ctx.continueReading.chapter}?`);
  }

  const trend = ctx.trendLabel?.trim();
  if (trend) {
    const line = `Still thinking about ${trend}?`;
    candidates.push(fits(line) ? line : `More on ${trend}?`);
  }

  const thread = ctx.leadThreadTitle?.trim();
  if (thread) candidates.push(`Adding to ${thread}?`);

  // Once opened or written about, the card has folded away; asking again would be nagging. And
  // when the passage is in the chapter you are already reading, the line above has asked it.
  if (ctx.passage && !ctx.passage.acted && !isInChapter(ctx.passage.reference, ctx.continueReading)) {
    candidates.push(`Thoughts on ${ctx.passage.reference}?`);
  }

  candidates.push(hourLine(ctx.now));
  candidates.push(...FEED_COMPOSE_FILLERS);

  const lines: string[] = [];
  for (const line of candidates) {
    if (!line || !fits(line) || lines.includes(line)) continue;
    lines.push(line);
    if (lines.length === FEED_COMPOSE_MAX_LINES) break;
  }
  return lines;
}
