/**
 * Copy for the free history window's soft landing — pure, so every sentence is testable.
 *
 * The stance, shared by every line here: nothing is deleted, it only leaves view, and Plus
 * brings all of it back. Said plainly, once, without urgency theatre.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface LeavingSoon {
  count: number;
  oldestAt: string;
  newestAt: string;
  firstLeavesAt: string;
}

/** Whole days until `iso`, never less than 1 — "in 0 days" reads as a bug. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS));
}

function day(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Jul 2", "Jul 2–5", or "Jul 30 – Aug 2". Hard-coded months: iOS PWA ignores locale hints. */
export function dateSpan(fromIso: string, toIso: string): string {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (from.toDateString() === to.toDateString()) return day(from);
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return `${day(from)}–${to.getDate()}`;
  }
  return `${day(from)} – ${day(to)}`;
}

function inDays(n: number): string {
  return n === 1 ? 'tomorrow' : `in ${n} days`;
}

/** The Home row: what leaves, and when. */
export function leavingRowTitle(leaving: LeavingSoon, now: Date = new Date()): string {
  return `Your study from ${dateSpan(leaving.oldestAt, leaving.newestAt)} leaves your history ${inDays(daysUntil(leaving.firstLeavesAt, now))}`;
}

export const LEAVING_ROW_META = 'Nothing is deleted. Harvous Plus keeps it all in view.';

function madeCount(count: number): string {
  return count === 1 ? 'A note or highlight' : `${count} notes and highlights`;
}

/** The weekly reminder toast — the same fact, with the count. */
export function leavingToastMessage(leaving: LeavingSoon, now: Date = new Date()): string {
  const made = madeCount(leaving.count);
  const verb = leaving.count === 1 ? 'leaves' : 'leave';
  return `${made} from ${dateSpan(leaving.oldestAt, leaving.newestAt)} ${verb} your history ${inDays(daysUntil(leaving.firstLeavesAt, now))}. Nothing is deleted — Plus keeps it all in view.`;
}

/** The trail's end edge: one short caption, now with the real count when there is one. */
export function lockedEdgeLabel(hiddenCount: number | null | undefined, capped: boolean | undefined): string | null {
  if (!hiddenCount || hiddenCount <= 0) return null;
  return `${hiddenCount}${capped ? '+' : ''} earlier · Plus`;
}
