/**
 * The planner board's arithmetic — weeks, drop targets, and grouping.
 *
 * Pure and separately tested, because the interesting decisions here are all
 * date maths that is tedious to exercise through a drag gesture: which day a
 * card lands on when you drop it on a week, and whether a sermon that already
 * had a Wednesday keeps it.
 *
 * Backlog ordering is `createdAt` descending, newest idea on top, and there is
 * deliberately no rank column. Dragging *within* the backlog is not part of the
 * board — the columns answer "when", not "in what order" — and a rank column
 * would drag in fractional-rank endpoints and a second kind of drop for a
 * capability nobody asked for. It stays cheap to add later.
 */
import { parseLocalDateInput, formatLocalDateInput, startOfLocalDay } from './proto-date-picker';

export type PlannerSermonLike = {
  id: string;
  serviceDate: string | null;
  createdAt?: string | null;
};

export type PlannerWeek = {
  /** Stable droppable id and React key. */
  id: string;
  /** ISO day the week starts on — the church's service day, not Sunday-by-fiat. */
  startIso: string;
  /** ISO day the week ends on, inclusive. */
  endIso: string;
  /** "Aug 9 – 15" — the column heading. */
  label: string;
  /** True for the week containing today. */
  isCurrent: boolean;
};

/** The board's droppable ids, parsed back into what they mean. */
export const BACKLOG_DROPPABLE_ID = 'planner-backlog';
export const weekDroppableId = (startIso: string) => `planner-week:${startIso}`;
export const dayDroppableId = (iso: string) => `planner-day:${iso}`;

export function parseDroppableId(
  id: string,
): { kind: 'backlog' } | { kind: 'week'; startIso: string } | { kind: 'day'; iso: string } | null {
  if (id === BACKLOG_DROPPABLE_ID) return { kind: 'backlog' };
  if (id.startsWith('planner-week:')) return { kind: 'week', startIso: id.slice('planner-week:'.length) };
  if (id.startsWith('planner-day:')) return { kind: 'day', iso: id.slice('planner-day:'.length) };
  return null;
}

function addDays(iso: string, days: number): string {
  const d = parseLocalDateInput(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return formatLocalDateInput(d);
}

/** "Aug 9 – 15", or "Aug 30 – Sep 5" when the week straddles a month. */
function weekLabel(startIso: string, endIso: string): string {
  const start = parseLocalDateInput(startIso);
  const end = parseLocalDateInput(endIso);
  if (!start || !end) return startIso;
  const startText = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const sameMonth = start.getMonth() === end.getMonth();
  const endText = end.toLocaleDateString(
    undefined,
    sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' },
  );
  return `${startText} – ${endText}`;
}

/**
 * The board's week columns, starting with the one containing today.
 *
 * Weeks begin on the church's own service day rather than Sunday: a church that
 * gathers Wednesday thinks in Wednesday-to-Tuesday weeks, and a Sunday-anchored
 * grid would split every one of their gatherings across two columns. `anchorDay`
 * is `Date.getDay()` semantics — 0 = Sunday.
 */
export function buildPlannerWeeks(
  anchorDay: number,
  todayIso: string,
  count: number,
): PlannerWeek[] {
  const today = parseLocalDateInput(todayIso);
  if (!today || count <= 0) return [];
  /* Walk back to the most recent anchor day, so today's own week is first and
     a sermon earlier this week is still reachable without paging backwards. */
  const back = (today.getDay() - anchorDay + 7) % 7;
  const firstStart = startOfLocalDay(today);
  firstStart.setDate(firstStart.getDate() - back);

  const weeks: PlannerWeek[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = new Date(firstStart);
    start.setDate(start.getDate() + i * 7);
    const startIso = formatLocalDateInput(start);
    const endIso = addDays(startIso, 6);
    weeks.push({
      id: weekDroppableId(startIso),
      startIso,
      endIso,
      label: weekLabel(startIso, endIso),
      isCurrent: i === 0,
    });
  }
  return weeks;
}

/**
 * Which day a card lands on when dropped onto a week column.
 *
 * A sermon that already has a date keeps its weekday and only moves weeks. That
 * is not tidiness: the church plan mirrors a sermon's date into its service-slot
 * assignments, so moving a Wednesday sermon onto a Sunday would leave it
 * claiming Wednesday slots on a Sunday date — a plan the calendar cannot honour,
 * and one the server would carry across without complaint.
 *
 * An undated idea has no weekday to keep, so it lands on the plan's own service
 * day: the church's first recurring slot, or the space's `meetingDay`.
 */
export function resolveDropDate(
  sermon: PlannerSermonLike,
  week: PlannerWeek,
  defaultDay: number | null,
): string {
  const current = sermon.serviceDate ? parseLocalDateInput(sermon.serviceDate) : null;
  const weekStart = parseLocalDateInput(week.startIso);
  if (!weekStart) return week.startIso;
  const anchorDay = weekStart.getDay();
  const targetDay = current ? current.getDay() : (defaultDay ?? anchorDay);
  /* Offset forward from the column's own start day, so the result always lands
     inside the week the user dropped on. */
  const offset = (targetDay - anchorDay + 7) % 7;
  return addDays(week.startIso, offset);
}

export type PlannerPartition = {
  /** Undated ideas, newest first. */
  backlog: PlannerSermonLike[];
  /** Dated sermons keyed by ISO day; a date can hold more than one. */
  byDate: Map<string, PlannerSermonLike[]>;
};

/** Split a plan into the two shapes the board and calendar actually render. */
export function partitionPlan<T extends PlannerSermonLike>(
  services: T[],
): { backlog: T[]; byDate: Map<string, T[]> } {
  const backlog: T[] = [];
  const byDate = new Map<string, T[]>();
  for (const service of services) {
    if (!service.serviceDate) {
      backlog.push(service);
      continue;
    }
    const list = byDate.get(service.serviceDate);
    if (list) list.push(service);
    else byDate.set(service.serviceDate, [service]);
  }
  backlog.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  return { backlog, byDate };
}

/** Every dated sermon falling inside a week column, earliest first. */
export function sermonsInWeek<T extends PlannerSermonLike>(
  byDate: Map<string, T[]>,
  week: PlannerWeek,
): T[] {
  const out: T[] = [];
  for (let i = 0; i < 7; i += 1) {
    const iso = addDays(week.startIso, i);
    const list = byDate.get(iso);
    if (list) out.push(...list);
  }
  return out;
}

/** One unbroken stretch of a single series, in slot indices. */
export type SeriesRun = {
  seriesId: string;
  /** First slot this run occupies. */
  startIndex: number;
  /** Last slot, inclusive. Equal to `startIndex` for a one-slot run. */
  endIndex: number;
};

/**
 * Contiguous stretches of each series across an ordered row of slots.
 *
 * Deliberately slot-agnostic: a slot is a **day cell** on the calendar and a
 * **week column** on the board, and both want the same answer — where does this
 * run start, where does it stop. Keeping the shape abstract is what stops the
 * two surfaces drifting into disagreeing about the extent of the same series,
 * which is the bug the whole feature exists to avoid.
 *
 * Each slot carries *all* the series ids in it, not one: a church with a morning
 * series and a different evening series has two sermons on one Sunday, which the
 * schema calls ordinary rather than exotic. Runs are computed per series and may
 * therefore overlap; the renderer decides how many to stack.
 *
 * **A gap ends a run.** A series preached weeks 1–2, interrupted by a guest
 * speaker, then resumed weeks 4–5 yields two runs rather than one long band with
 * a hole. That is the honest reading: the band claims "this is one continuous
 * stretch of teaching", and week 3 was not.
 *
 * Ordered by start, then by series id, so a row renders the same way twice.
 */
export function buildSeriesRuns(slots: readonly (readonly string[])[]): SeriesRun[] {
  const open = new Map<string, SeriesRun>();
  const runs: SeriesRun[] = [];

  slots.forEach((slot, index) => {
    const present = new Set(slot);
    // Close any run whose series is absent here before opening new ones, so a
    // series that stops and restarts in adjacent slots cannot merge.
    for (const [seriesId, run] of open) {
      if (!present.has(seriesId)) {
        runs.push(run);
        open.delete(seriesId);
      }
    }
    for (const seriesId of present) {
      const run = open.get(seriesId);
      if (run) run.endIndex = index;
      else open.set(seriesId, { seriesId, startIndex: index, endIndex: index });
    }
  });

  runs.push(...open.values());
  return runs.sort(
    (a, b) => a.startIndex - b.startIndex || a.seriesId.localeCompare(b.seriesId),
  );
}

/**
 * Series ids per day cell, for a row of the calendar month grid.
 *
 * Undated backlog rows never reach this — they are not in `byDate` — which is
 * what keeps an uncommitted idea out of a run that claims a stretch of Sundays.
 */
export function seriesIdsByDay<T extends PlannerSermonLike & { seriesId?: string | null }>(
  byDate: Map<string, T[]>,
  isoDays: readonly string[],
): string[][] {
  return isoDays.map((iso) =>
    (byDate.get(iso) ?? [])
      .map((service) => service.seriesId)
      .filter((id): id is string => Boolean(id)),
  );
}

/** Series ids per week column, for the board's spine. */
export function seriesIdsByWeek<T extends PlannerSermonLike & { seriesId?: string | null }>(
  byDate: Map<string, T[]>,
  weeks: readonly PlannerWeek[],
): string[][] {
  return weeks.map((week) =>
    sermonsInWeek(byDate, week)
      .map((service) => service.seriesId)
      .filter((id): id is string => Boolean(id)),
  );
}

/**
 * Where a series' band sits on a month grid.
 *
 * A series is a *period*, not a set of Sundays. A church eight weeks into
 * Romans is in Romans on the Wednesday too, so the band spans the whole
 * interval from the run's first dated week to its last, and the days between
 * belong to it. Drawing only the days that hold a service produced one-cell
 * dashes that said "something here" rather than "this is a run".
 *
 * The interval is then clipped to each week row, because a month grid wraps: a
 * band from the 30th to the 2nd would have to cross a line break that grid
 * cannot draw and a reader would not follow. So an eight-week run is eight
 * bands, each full-width, reading as one column of colour down the month —
 * and a run that starts mid-week starts mid-row, which is the truth.
 */
export type CalendarSeriesBand = {
  key: string;
  /** 1-based CSS grid row, counting the weekday header out. */
  row: number;
  /** 1-based CSS grid column where the run enters this row. */
  colStart: number;
  /** How many columns it covers. */
  colSpan: number;
  seriesId: string;
  label: string | null;
  /** True when the run reaches this row from the one above. */
  continuesFromPrev: boolean;
  /** True when it carries on into the row below. */
  continuesToNext: boolean;
  /**
   * Which stacked line this band sits on within its row, from 0.
   *
   * Two runs can cover the same days — a Sunday series and a midweek one — and
   * without lanes they draw at the same offset and bleed through each other.
   * Packed first-fit: a band takes the topmost lane no other band in that row
   * already occupies at those columns, so unrelated runs share a lane when
   * they do not touch and separate only when they must.
   */
  lane: number;
};

/** How many stacked band lines each week row needs, indexed by row - 1. */
export function calendarBandLanesByRow(bands: readonly CalendarSeriesBand[]): number[] {
  const lanes: number[] = [];
  for (const band of bands) {
    const index = band.row - 1;
    lanes[index] = Math.max(lanes[index] ?? 0, band.lane + 1);
  }
  return lanes;
}

export function calendarSeriesBands(
  cells: readonly { iso: string }[],
  servicesByDate: ReadonlyMap<string, readonly { seriesId: string | null; seriesTitle: string | null }[]>,
): CalendarSeriesBand[] {
  /** seriesId → the first and last cell index the run touches on this grid. */
  const extent = new Map<string, { first: number; last: number; label: string | null }>();

  cells.forEach((cell, index) => {
    for (const service of servicesByDate.get(cell.iso) ?? []) {
      if (!service.seriesId) continue;
      const found = extent.get(service.seriesId);
      if (found) {
        found.first = Math.min(found.first, index);
        found.last = Math.max(found.last, index);
        found.label = found.label ?? service.seriesTitle;
      } else {
        extent.set(service.seriesId, { first: index, last: index, label: service.seriesTitle });
      }
    }
  });

  const bands: CalendarSeriesBand[] = [];
  const weeks = Math.ceil(cells.length / 7);

  for (const [seriesId, run] of extent) {
    for (let week = 0; week < weeks; week += 1) {
      const rowFirst = week * 7;
      const rowLast = rowFirst + 6;
      // No overlap with this row at all.
      if (run.last < rowFirst || run.first > rowLast) continue;

      const from = Math.max(run.first, rowFirst);
      const to = Math.min(run.last, rowLast);
      bands.push({
        key: `${week}:${seriesId}`,
        row: week + 1,
        colStart: (from % 7) + 1,
        colSpan: to - from + 1,
        seriesId,
        label: run.label,
        continuesFromPrev: run.first < rowFirst,
        continuesToNext: run.last > rowLast,
        /* Assigned below, once every band in the row is known. */
        lane: 0,
      });
    }
  }

  /*
    Lane packing, per row. Longest bands first so a run crossing the whole week
    takes the top line and shorter ones tuck beneath it, rather than a one-day
    band claiming lane 0 and pushing the week-long run down.
  */
  const byRow = new Map<number, CalendarSeriesBand[]>();
  for (const band of bands) {
    const list = byRow.get(band.row);
    if (list) list.push(band);
    else byRow.set(band.row, [band]);
  }

  for (const rowBands of byRow.values()) {
    rowBands.sort((a, b) => b.colSpan - a.colSpan || a.colStart - b.colStart);
    /** Per lane, the columns already spoken for. */
    const occupied: Array<Array<{ start: number; end: number }>> = [];
    for (const band of rowBands) {
      const start = band.colStart;
      const end = band.colStart + band.colSpan - 1;
      let lane = 0;
      while (
        occupied[lane]?.some((taken) => start <= taken.end && end >= taken.start)
      ) {
        lane += 1;
      }
      band.lane = lane;
      (occupied[lane] ??= []).push({ start, end });
    }
  }

  return bands;
}
