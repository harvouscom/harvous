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
import { SPACE_COVER_PICKER_COLORS, type SpaceCoverPickerColor } from '@/utils/space-cover';

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

export type ChurchSermonStarter = {
  templateId: string;
  templateName: string;
  title: string | null;
  content: string;
};

export type ChurchSermon = {
  id: string;
  serviceDate: string;
  title: string;
  seriesTitle: string | null;
  reference: string | null;
  viewerNoteId: string | null;
  starter: ChurchSermonStarter | null;
  /**
   * Ministry channel carrying this service's study material, resolved by the
   * server. Optional so a cached payload from before this shipped still parses.
   */
  channel?: { id: string; title: string; color: string | null } | null;
  /**
   * Every time this sermon is preached, ascending 'HH:MM' on the church's own
   * wall clock, resolved by the server — never re-derived here. A church with
   * 9:00 and 10:45 morning services sends both. Optional for the same reason
   * `channel` is: a payload cached before this shipped must still parse.
   */
  serviceTimes?: string[];
};

/** The church's own wall clock, so "has it started?" isn't asked of the wrong zone. */
export type ChurchClock = { date: string; time: string };

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
 * The minimum a row needs for "which one is current".
 *
 * Narrower than `ChurchSermon` on purpose: a *space* plan row carries no
 * viewer note or starter, and selection has never read those. Typing the
 * helpers to what they actually touch lets the church card and a ministry's
 * "coming up" strip share one definition of "next".
 */
export type SelectableSermon = { serviceDate: string; serviceTimes?: string[] };

/** A sermon's earliest time, or null when it has none. Used only to order same-day sermons. */
function earliestTime(service: SelectableSermon): string | null {
  const times = service.serviceTimes;
  if (!times || times.length === 0) return null;
  return times.reduce((a, b) => (a < b ? a : b));
}

/**
 * Of two sermons on the same date, which the card should prefer.
 *
 * The rule is "the next one that hasn't started yet". A church with a morning
 * series and a different evening series has two sermons on one Sunday, and at
 * 8am the morning one is the appointment while at 3pm the evening one is.
 *
 * `clock` is the *church's* wall time, not the viewer's — only the church's
 * clock can say whether its own 10:45 has happened. Without it (no timezone
 * set, or an older cached payload) this falls back to the earliest, which is
 * what the card did before sermons could share a date.
 */
function preferredSameDay<T extends SelectableSermon>(
  a: T,
  b: T,
  clock: ChurchClock | null,
  dateIso: string,
): T {
  const aTime = earliestTime(a);
  const bTime = earliestTime(b);
  if (aTime === null) return bTime === null ? a : b;
  if (bTime === null) return a;

  // Only today can have "already started"; any other date is purely ordered.
  if (clock && clock.date === dateIso) {
    const aUpcoming = aTime >= clock.time;
    const bUpcoming = bTime >= clock.time;
    if (aUpcoming !== bUpcoming) return aUpcoming ? a : b;
    // Both ahead → the sooner. Both past → the later, i.e. the one just left.
    if (aUpcoming) return aTime <= bTime ? a : b;
    return aTime >= bTime ? a : b;
  }
  return aTime <= bTime ? a : b;
}

/**
 * The one service the congregant card should show, or null.
 *
 * Prefers the soonest upcoming service (today counts as upcoming — Sunday
 * morning should still read "This Sunday"). Only when nothing is upcoming does
 * it fall back to the most recent past service, and then only inside the grace
 * window. Services are assumed ascending by date but this does not rely on it.
 *
 * Ties on a date are broken by `preferredSameDay`: two sermons on one Sunday is
 * ordinary now that a church can hold a morning and an evening service.
 */
export function currentSermonFor<T extends SelectableSermon>(
  services: readonly T[],
  todayIso: string = localTodayIso(),
  churchClock: ChurchClock | null = null,
): T | null {
  let upcoming: T | null = null;
  let recentPast: T | null = null;

  for (const service of services) {
    const delta = dayDelta(todayIso, service.serviceDate);
    if (delta === null) continue;

    if (delta >= 0) {
      if (!upcoming || service.serviceDate < upcoming.serviceDate) upcoming = service;
      else if (service.serviceDate === upcoming.serviceDate) {
        upcoming = preferredSameDay(upcoming, service, churchClock, service.serviceDate);
      }
    } else if (-delta <= SERVICE_GRACE_DAYS) {
      if (!recentPast || service.serviceDate > recentPast.serviceDate) recentPast = service;
      else if (service.serviceDate === recentPast.serviceDate) {
        recentPast = preferredSameDay(recentPast, service, churchClock, service.serviceDate);
      }
    }
  }

  return upcoming ?? recentPast;
}

/** Index = `Date.getDay()`, the same 0 = Sunday model as `Churches.defaultServiceDay`. */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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
export function sermonEyebrow(
  service: Pick<ChurchSermon, 'serviceDate'>,
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

/** Human name for a `Date.getDay()` index; anything out of range reads as Sunday. */
export function weekdayLabel(day: number | null | undefined): string {
  return WEEKDAYS[Number.isInteger(day) ? (day as number) : -1] ?? WEEKDAYS[0];
}

/**
 * "Sun", for rows too narrow for the full name.
 *
 * The sidebar's service-time rows are ~127px: "Sunday · 9:00 AM" fits and
 * "Sunday · 10:45 AM" does not, so a two-digit hour silently loses its AM/PM —
 * the one part of a service time that must never be ambiguous. Three letters
 * buys the margin back.
 */
export function weekdayShortLabel(day: number | null | undefined): string {
  return weekdayLabel(day).slice(0, 3);
}

/**
 * The next 'YYYY-MM-DD' falling on `day` (0 = Sunday), today included.
 *
 * Replaces the service editor's hardcoded `nextSunday()`. Local-calendar, just
 * as that was: a service is a day on the church's wall calendar and the picker
 * does no timezone maths. A null or out-of-range day falls back to Sunday,
 * which is what keeps an unconfigured church behaving exactly as it did before
 * meeting defaults existed.
 */
export function nextOccurrenceOfDay(day: number | null | undefined, from: Date = new Date()): string {
  const target = Number.isInteger(day) && (day as number) >= 0 && (day as number) <= 6 ? (day as number) : 0;
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7));
  return formatLocalDateInput(d);
}

/**
 * "10:45 AM", or "9:00 & 10:45 AM" when one sermon fills two services.
 *
 * Joined rather than listed because it is one sermon: a congregant reads it as
 * "come to either", not as two separate things to keep track of.
 */
export function formatServiceTimes(times: string[] | null | undefined): string | null {
  const labels = (times ?? []).map(formatServiceTime).filter((t): t is string => Boolean(t));
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0];
  // Only the last keeps its meridiem when they agree — "9:00 & 10:45 AM".
  const suffix = labels[labels.length - 1].slice(-2);
  const allSame = labels.every((label) => label.endsWith(suffix));
  const parts = allSame ? labels.map((label) => label.slice(0, -3)) : labels;
  return allSame ? `${parts.join(' & ')} ${suffix}` : parts.join(' & ');
}

/**
 * '10:30' → '10:30 AM'.
 *
 * String maths only — this constructs no `Date`, because a service time is a
 * clock reading on the church's wall, not an instant, and building a Date would
 * invite exactly the timezone conversion §2.3 of the design doc forbids.
 * Returns null for anything that isn't a padded 'HH:MM'.
 */
export function formatServiceTime(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const hour24 = Number(match[1]);
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

/**
 * A planned sermon's time, resolved from the church's slots.
 *
 * The staff payload ships slot *ids* so the editor can check boxes; every
 * surface that lists sermons needs clock readings instead, and it is the only
 * thing distinguishing a morning sermon from an evening one on the same date.
 *
 * `slots` is empty for a space plan — a room gathers at its own `meetingTime`,
 * rendered beside the plan rather than per row — and empty for an undated idea,
 * which has no day for a slot to fall on.
 */
export function sermonTimeLabel(
  sermon: { serviceTimeIds: string[]; serviceTime: string | null },
  slots: readonly { id: string; startTime: string }[],
): string | null {
  const startById = new Map(slots.map((slot) => [slot.id, slot.startTime]));
  const slotTimes = sermon.serviceTimeIds
    .map((id) => startById.get(id))
    .filter((time): time is string => Boolean(time))
    .sort();
  if (slotTimes.length > 0) return formatServiceTimes(slotTimes);
  // A one-off only speaks when the sermon claims no usual service.
  return formatServiceTime(sermon.serviceTime);
}

/**
 * What a plan calls the things in it.
 *
 * Three answers, not two: the church preaches sermons, a Shared Space gathers,
 * and a ministry channel publishes. A channel was being asked to "Add a
 * gathering" for something nobody attends — the word promised a room and a
 * time that a published study does not have.
 */
export type PlanVocabulary = {
  /** The primary action's label. */
  addLabel: string;
  /** Shown when the plan is empty and the viewer can write. */
  emptyWritable: string;
  /** One entry, lowercase, for mid-sentence use. */
  itemNoun: string;
};

export function planVocabulary(
  scope: {
    onSpacePlan: boolean;
    planKind?: 'gathering' | 'content';
    /**
     * False for a Shared Space planning on its own authority. Only reaches the
     * empty state: "ministry" is a church's word for a room, and a book club
     * that meets on Tuesdays is not one.
     */
    hasChurch?: boolean;
  },
): PlanVocabulary {
  if (!scope.onSpacePlan) {
    return {
      addLabel: 'Add a sermon',
      emptyWritable: 'Plan a sermon and everyone connected to your church sees it on their Home.',
      itemNoun: 'sermon',
    };
  }
  if (scope.planKind === 'content') {
    return {
      addLabel: 'Add content',
      /* No "members see it inside the space" promise here: a planned entry is
         not published, and nothing congregant-facing reads it yet. */
      emptyWritable: 'Plan what this channel publishes — studies, devotionals, a series to come.',
      itemNoun: 'entry',
    };
  }
  return {
    addLabel: 'Add a gathering',
    emptyWritable:
      scope.hasChurch === false
        ? 'Plan what this group studies. Everyone in the space sees what is coming up.'
        : 'Plan what this ministry studies. Its members see it inside the space.',
    itemNoun: 'gathering',
  };
}

/**
 * The colour a series is drawn in.
 *
 * Colour is what turns eight cards into one run, so every series needs one —
 * but making a pastor pick before the plan reads correctly would be a form to
 * fill in before the feature works. So an unset colour derives a stable one
 * from the row id: existing series are all coloured, differently from each
 * other, the moment this ships, and picking a colour is an override rather
 * than a prerequisite.
 *
 * Derived from the id rather than the title on purpose — a rename must not
 * recolour a run mid-quarter, and the id is the only thing about a series that
 * never changes.
 *
 * Never returns paper or cream: at the width of a rail or a run band, neither
 * survives the page behind it. Same exclusion, same reason, as
 * SPACE_COVER_PICKER_COLORS, which is the list this draws from.
 */
export function seriesAccent(
  series: { id: string; color?: string | null } | null | undefined,
): SpaceCoverPickerColor {
  const chosen = series?.color;
  if (chosen && (SPACE_COVER_PICKER_COLORS as readonly string[]).includes(chosen)) {
    return chosen as SpaceCoverPickerColor;
  }
  const id = series?.id ?? '';
  /* djb2, not a sum: "csrs_ab" and "csrs_ba" differ by their order alone, and a
     plain character sum would hand two series in the same plan one colour. */
  let hash = 5381;
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash << 5) + hash + id.charCodeAt(i)) | 0;
  }
  return SPACE_COVER_PICKER_COLORS[Math.abs(hash) % SPACE_COVER_PICKER_COLORS.length];
}

/** One `link-note` write. `serviceId: null` clears the note's link. */
export type SermonNoteLinkAction = { noteId: string; serviceId: string | null };

/**
 * The writes needed to move a service's sermon draft from one note to another.
 *
 * **Unlink before link, always.** `plannedForServiceId` is a column on `Notes`,
 * not a join row, so pointing a second note at a service does not displace the
 * first — it leaves both stamped. `resolveViewerPlannedNotes` then reports
 * whichever the database happened to return first, with no `ORDER BY` to make
 * that stable. Swapping the picked note therefore has to clear the old one
 * explicitly.
 *
 * Pure and separately tested because the bug it prevents is silent: both writes
 * succeed, nothing errors, and the planner simply starts showing an arbitrary
 * one of two drafts. Same shape and reason as `planSharedAddNotesRequest`.
 */
export function planSermonNoteLink(options: {
  /** What the service was pointing at when the editor opened. */
  previousNoteId: string | null;
  /** What the pastor has picked now. Null = they cleared it. */
  nextNoteId: string | null;
  serviceId: string;
}): SermonNoteLinkAction[] {
  const { previousNoteId, nextNoteId, serviceId } = options;
  // Nothing moved. Emitting a no-op write would invalidate the plan for free.
  if (previousNoteId === nextNoteId) return [];
  const actions: SermonNoteLinkAction[] = [];
  if (previousNoteId) actions.push({ noteId: previousNoteId, serviceId: null });
  if (nextNoteId) actions.push({ noteId: nextNoteId, serviceId });
  return actions;
}

/**
 * What a re-run actually did.
 *
 * The endpoint stops at the first date whose service slots are already claimed
 * and reports it, rather than skipping the week silently — "a plan with a hole
 * the pastor did not notice is worse than a short one they can see". That only
 * holds if the *client* says so too; discarding this is how a run that copied
 * nothing looks like a run that did nothing.
 */
export function describeRerunResult(result: {
  created: number;
  stoppedAt?: string | null;
  total: number;
}): string | null {
  const { created, stoppedAt, total } = result;
  if (!stoppedAt && created >= total) return null;
  const week = (n: number) => (n === 1 ? '1 week' : `${n} weeks`);
  if (created === 0) {
    return `Nothing copied — ${stoppedAt ?? 'that date'} already has a sermon at those times.`;
  }
  return `Copied ${week(created)} of ${week(total)}. Stopped at ${stoppedAt} — it already has a sermon at those times.`;
}

/** A series' extent through the plan, as both panes report it. */
export type SeriesRunExtent = {
  /** First dated week, or '' when every member is still an undated idea. */
  first: string;
  last: string;
  /** Members with no passage — the honest measure of "how much is written". */
  toFill: number;
};

/**
 * Run extents keyed by series id.
 *
 * Shared by the church hub's compact Series lane and the planner's Series view
 * so the two cannot disagree about how long a run is or how much of it is left.
 *
 * Undated members count toward `toFill` but never toward the dates: an idea
 * filed under a series is a week nobody has written, and "starts —" would be
 * worse than saying nothing.
 */
export function seriesRunsByServiceRows(
  services: readonly { seriesId?: string | null; serviceDate: string | null; reference: string | null }[],
): Map<string, SeriesRunExtent> {
  const runs = new Map<string, SeriesRunExtent>();
  for (const service of services) {
    if (!service.seriesId) continue;
    const unfilled = service.reference ? 0 : 1;
    const run = runs.get(service.seriesId);
    if (!run) {
      runs.set(service.seriesId, {
        first: service.serviceDate ?? '',
        last: service.serviceDate ?? '',
        toFill: unfilled,
      });
      continue;
    }
    run.toFill += unfilled;
    if (!service.serviceDate) continue;
    if (!run.first || service.serviceDate < run.first) run.first = service.serviceDate;
    if (!run.last || service.serviceDate > run.last) run.last = service.serviceDate;
  }
  return runs;
}

/**
 * "Aug 9 – Sep 27", or "Aug 9 – 27" inside one month.
 *
 * Null for a one-week series: the date tile beside it already shows that date,
 * and "Aug 9 – Aug 9" is noise.
 */
export function formatSeriesRun(run: { first: string; last: string }): string | null {
  if (!run.first || run.first === run.last) return null;
  const from = parseLocalDateInput(run.first);
  const to = parseLocalDateInput(run.last);
  if (!from || !to) return null;
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  const start = `${month(from)} ${from.getDate()}`;
  const end =
    from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()
      ? `${to.getDate()}`
      : `${month(to)} ${to.getDate()}`;
  return `${start} – ${end}`;
}

/**
 * One accent lookup for a whole plan, built once and handed to every surface.
 *
 * Board, calendar, and list all need "what colour is this sermon's series", and
 * three call sites resolving it themselves is how the same run ends up two
 * colours on two views. Returns null for a sermon with no series — which is a
 * real answer, not a missing one, and the surfaces draw nothing for it.
 */
export function buildSeriesAccentLookup(
  series: readonly { id: string; color?: string | null }[],
): (seriesId: string | null | undefined) => SpaceCoverPickerColor | null {
  const byId = new Map(series.map((entry) => [entry.id, entry]));
  return (seriesId) => {
    if (!seriesId) return null;
    /*
      A sermon can name a series the plan payload has not caught up with — a
      colleague created it a moment ago. Deriving from the bare id keeps the run
      coloured and stable rather than dropping the band until the next refetch.
    */
    return seriesAccent(byId.get(seriesId) ?? { id: seriesId });
  };
}

/** The series of whichever service is current — the card's context line. */
export function currentSeriesTitle(
  services: readonly ChurchSermon[],
  todayIso: string = localTodayIso(),
): string | null {
  return currentSermonFor(services, todayIso)?.seriesTitle ?? null;
}

/**
 * Title for the note a congregant starts from a service.
 *
 * The pastor's own title, because that is what makes the note findable a year
 * later ("No Condemnation" beats "Sermon Notes" in a list of fifty). Falls back
 * to the passage when the service has no title yet, and only then to a generic
 * label — a topical Sunday with neither is possible but rare.
 */
export function starterNoteTitle(service: ChurchSermon): string {
  return service.title?.trim() || service.reference?.trim() || 'Sermon notes';
}

/**
 * Folder a note started from this service should live in — the series, if the
 * church named one.
 *
 * Deliberately the **primary** folder, not a secondary. Secondaries are
 * auto-managed: `withSubjectFolders` recomputes them on every edit and
 * `clearAutoFolderChrome` empties them, so a series parked there would vanish
 * the first time the person typed. The primary survives when paired with
 * `collectionUserOverride` (`freezePrimary = pinned || userOverride`), which is
 * honest here — the grouping was *chosen* by whoever planned the series, not
 * guessed from the note's contents.
 *
 * Null when the service has no series: a one-off Sunday shouldn't invent a
 * folder, and the person's own auto-folder is better than a folder of one.
 */
export function starterFolderForSermon(service: ChurchSermon): string | null {
  return service.seriesTitle?.trim() || null;
}

/**
 * Body for the note a congregant starts from a service.
 *
 * The passage goes in as a *pending* pill — `processScriptureReferences` on
 * /api/notes/create resolves `data-note-id="pending"` into a real pill plus its
 * ScriptureMetadata rows. Same mechanism as the VOTD "study now" flow.
 */
export function buildStarterContent(
  service: ChurchSermon,
  translation: string,
): string {
  const pill = service.reference
    ? buildVotdScripturePillHtml(service.reference, translation)
    : '';
  const body = service.starter?.content?.trim() ?? '';

  if (pill && body) return `${pill}${body}`;
  // A blank paragraph after the pill is where the caret goes on open. Without
  // it the only cursor position is the pill's own trailing edge, which sits
  // visually inside the pill's box — you appear to be typing into the citation.
  if (pill) return `${pill}<p></p>`;
  if (body) return body;
  // Neither a passage nor a template: an empty paragraph, so the editor opens
  // with a caret rather than an empty document.
  return '<p></p>';
}
