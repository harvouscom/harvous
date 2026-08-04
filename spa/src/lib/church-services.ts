/**
 * Pure logic for the church teaching plan — which service is "current", how it
 * is labelled, and what a congregant's note starts from.
 *
 * React-free and DB-free so the week-boundary behaviour is unit-testable
 * without rendering anything. Same shape as `church-settings.ts`.
 *
 * All date reasoning is **local-calendar**, never UTC: a service is a day on
 * the church's wall calendar, and a viewer three timezones away must still see
 * "This Sunday" on their own Sunday.
 */
import { buildVotdScripturePillHtml } from './votd-scripture-pill-html';
import { formatLocalDateInput, parseLocalDateInput, startOfLocalDay } from './proto-date-picker';

/**
 * How long a service stays visible after its date, in days.
 *
 * Four, not three or seven, and not arbitrary: it matches **the four-day wall**
 * — the Center for Bible Engagement finding that anchors harvous.com/about,
 * that one to three days a week barely moves the needle while four or more is
 * where engagement research sees real shifts. Do not "tidy" this number.
 *
 * It also covers the gap people actually hit: churches enter next week's plan
 * mid-week, so Monday often has nothing upcoming — and Monday is when someone
 * writes up Sunday.
 */
export const SERVICE_GRACE_DAYS = 4;

export type ChurchServiceStarter = {
  templateId: string;
  templateName: string;
  title: string | null;
  content: string;
};

export type ChurchService = {
  id: string;
  serviceDate: string;
  title: string;
  seriesTitle: string | null;
  reference: string | null;
  viewerNoteId: string | null;
  starter: ChurchServiceStarter | null;
};

/** Whole days from `from` to `to`, both snapped to local midnight first. */
function dayDelta(fromIso: string, toIso: string): number | null {
  const from = parseLocalDateInput(fromIso);
  const to = parseLocalDateInput(toIso);
  if (!from || !to) return null;
  const ms = startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Today as 'YYYY-MM-DD' in the viewer's own timezone. */
export function localTodayIso(now: Date = new Date()): string {
  return formatLocalDateInput(now);
}

/**
 * The one service the congregant card should show, or null.
 *
 * Prefers the soonest upcoming service (today counts as upcoming — Sunday
 * morning should still read "This Sunday"). Only when nothing is upcoming does
 * it fall back to the most recent past service, and then only inside the grace
 * window. Services are assumed ascending by date but this does not rely on it.
 */
export function currentServiceFor(
  services: readonly ChurchService[],
  todayIso: string = localTodayIso(),
): ChurchService | null {
  let upcoming: ChurchService | null = null;
  let recentPast: ChurchService | null = null;

  for (const service of services) {
    const delta = dayDelta(todayIso, service.serviceDate);
    if (delta === null) continue;

    if (delta >= 0) {
      if (!upcoming || service.serviceDate < upcoming.serviceDate) upcoming = service;
    } else if (-delta <= SERVICE_GRACE_DAYS) {
      if (!recentPast || service.serviceDate > recentPast.serviceDate) recentPast = service;
    }
  }

  return upcoming ?? recentPast;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * The card's eyebrow.
 *
 * "This Sunday" only when the service is genuinely within the coming week —
 * calling a service three weeks out "This Sunday" would be a small lie that
 * makes the whole card untrustworthy. Uses the service's real weekday, so a
 * Wednesday night study reads "This Wednesday", not "This Sunday".
 */
export function serviceEyebrow(
  service: Pick<ChurchService, 'serviceDate'>,
  todayIso: string = localTodayIso(),
): string {
  const delta = dayDelta(todayIso, service.serviceDate);
  const date = parseLocalDateInput(service.serviceDate);
  if (delta === null || !date) return 'Upcoming';

  const weekday = WEEKDAYS[date.getDay()];

  if (delta < 0) return `Last ${weekday}`;
  if (delta === 0) return `Today`;
  if (delta <= 7) return `This ${weekday}`;
  return `${weekday}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** The series of whichever service is current — the card's context line. */
export function currentSeriesTitle(
  services: readonly ChurchService[],
  todayIso: string = localTodayIso(),
): string | null {
  return currentServiceFor(services, todayIso)?.seriesTitle ?? null;
}

/**
 * Title for the note a congregant starts from a service.
 *
 * The pastor's own title, because that is what makes the note findable a year
 * later ("No Condemnation" beats "Sermon Notes" in a list of fifty). Falls back
 * to the passage when the service has no title yet, and only then to a generic
 * label — a topical Sunday with neither is possible but rare.
 */
export function starterNoteTitle(service: ChurchService): string {
  return service.title?.trim() || service.reference?.trim() || 'Sermon notes';
}

/**
 * Body for the note a congregant starts from a service.
 *
 * The passage goes in as a *pending* pill — `processScriptureReferences` on
 * /api/notes/create resolves `data-note-id="pending"` into a real pill plus its
 * ScriptureMetadata rows. Same mechanism as the VOTD "study now" flow.
 */
export function buildStarterContent(
  service: ChurchService,
  translation: string,
): string {
  const pill = service.reference
    ? buildVotdScripturePillHtml(service.reference, translation)
    : '';
  const body = service.starter?.content?.trim() ?? '';

  if (pill && body) return `${pill}${body}`;
  if (pill) return pill;
  if (body) return body;
  // Neither a passage nor a template: an empty paragraph, so the editor opens
  // with a caret rather than an empty document.
  return '<p></p>';
}
