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
