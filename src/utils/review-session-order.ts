/**
 * The order a sitting is asked in.
 *
 * Most overdue first, by whole days. Within a day, alternate kinds and subjects.
 * Reviews come before first askings. A sitting that is all scripture is a quiz;
 * a note is pulled in whenever one exists, even if it is not due today.
 */

export function sessionGroupKeyFor(row: {
  scriptureReference?: string | null;
  noteId?: string | null;
}): string | null {
  const reference = row.scriptureReference?.trim().toLowerCase();
  if (reference) return reference.replace(/:.*$/, '');
  return row.noteId ?? null;
}

export interface SessionOrderInput {
  id: string;
  kind: string;
  groupKey: string | null;
  dueAt: Date;
  reviewCount: number;
  ladderStep?: number;
}

export function sittingHalf(kind: string): 'passage' | 'note' {
  return kind === 'verse' || kind === 'chapter' || kind === 'highlight' ? 'passage' : 'note';
}

export const SITTING_NEAR_DAYS = 2;
export const SITTING_OTHER_HALF = 2;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysOverdue(item: SessionOrderInput, now: Date): number {
  return Math.floor((now.getTime() - item.dueAt.getTime()) / MS_PER_DAY);
}

function buckets<T extends SessionOrderInput>(items: T[], now: Date): T[][] {
  const byDay = new Map<number, T[]>();
  for (const item of items) {
    const day = daysOverdue(item, now);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(item);
    else byDay.set(day, [item]);
  }
  return [...byDay.entries()].sort((a, b) => b[0] - a[0]).map(([, bucket]) => bucket);
}

function drain<T extends SessionOrderInput>(bucket: T[], out: T[]): void {
  const pending = [...bucket];
  while (pending.length) {
    const last = out[out.length - 1];
    const pick =
      (last &&
        (pending.find((c) => c.kind !== last.kind && !sameSubject(c, last) && !sameRung(c, last)) ??
          pending.find((c) => c.kind !== last.kind && !sameSubject(c, last)) ??
          pending.find((c) => !sameSubject(c, last) && !sameRung(c, last)) ??
          pending.find((c) => !sameSubject(c, last)))) ??
      pending[0];
    pending.splice(pending.indexOf(pick), 1);
    out.push(pick);
  }
}

function sameSubject(a: SessionOrderInput, b: SessionOrderInput): boolean {
  return Boolean(a.groupKey) && a.groupKey === b.groupKey;
}

function sameRung(a: SessionOrderInput, b: SessionOrderInput): boolean {
  return (a.ladderStep ?? 0) === (b.ladderStep ?? 0);
}

export function interleaveSession<T extends SessionOrderInput>(items: T[], now: Date = new Date()): T[] {
  const reviews = items.filter((item) => item.reviewCount > 0);
  const fresh = items.filter((item) => item.reviewCount <= 0);
  const out: T[] = [];
  for (const group of [reviews, fresh]) {
    for (const bucket of buckets(group, now)) drain(bucket, out);
  }
  return out;
}

function daysUntil(item: SessionOrderInput, now: Date): number {
  return (item.dueAt.getTime() - now.getTime()) / MS_PER_DAY;
}

export function composeSitting<T extends SessionOrderInput>(
  due: readonly T[],
  upcoming: readonly T[],
  max: number,
  now: Date = new Date(),
): T[] {
  if (due.length === 0) return [];

  const near = upcoming.filter((item) => {
    const days = daysUntil(item, now);
    return days > 0 && days <= SITTING_NEAR_DAYS;
  });

  const available = { note: 0, passage: 0 };
  for (const item of [...due, ...near, ...upcoming]) available[sittingHalf(item.kind)] += 1;
  const canMix = available.note > 0 && available.passage > 0;

  const capFor = (half: 'note' | 'passage'): number => {
    if (!canMix) return max;
    const other = half === 'note' ? available.passage : available.note;
    return Math.max(1, max - Math.min(SITTING_OTHER_HALF, other));
  };

  const picked: T[] = [];
  const used = new Set<string>();
  const count = { note: 0, passage: 0 };

  const tryPick = (item: T): void => {
    if (used.has(item.id) || picked.length >= max) return;
    const half = sittingHalf(item.kind);
    if (count[half] >= capFor(half)) return;
    used.add(item.id);
    count[half] += 1;
    picked.push(item);
  };

  for (const item of interleaveSession([...due], now)) tryPick(item);
  for (const item of interleaveSession(near, now)) tryPick(item);

  if (count.note < SITTING_OTHER_HALF && picked.length < max) {
    for (const item of upcoming) {
      if (sittingHalf(item.kind) === 'note') tryPick(item);
    }
  }

  return interleaveSession(picked, now);
}

/**
 * Today's sitting: what is left to ask, and how long it was.
 *
 * A sitting could not finish. `composeSitting` backfills from what is coming up — anything due
 * inside two days, and any note at all to meet the mix quota — and answering an item sets it due
 * in one day, which is inside that window. So the queue refilled with the very items just
 * answered, the shelf's "N more" was `min(8, rows) - 2` for ever, and it sat directly above
 * "18 coming back later", which climbs as you work. Two numbers, pulling opposite ways, and
 * between them the honest impression that nothing you did made any difference.
 *
 * Two changes, both here:
 *
 * 1. **Anything answered since `since` is not eligible to come back today.** Tomorrow is soon
 *    enough; that is what the interval means.
 * 2. **The day has a budget.** Eight questions, less what has already been answered, so the
 *    sitting shrinks as it is worked and reaches zero.
 *
 * `goal` is what the progress label counts towards. It is deliberately not a backlog: it is
 * what has been answered plus what is actually on offer, capped at the day's ceiling, so it can
 * never climb past eight however much is waiting. The failure mode the whole feature is designed
 * against is an escalating "27 due", and a number that cannot exceed a single sitting is not
 * that number.
 */
export function todaySitting<T extends SessionOrderInput & { lastReviewedAt?: Date | null }>(
  due: readonly T[],
  upcoming: readonly T[],
  answeredToday: number,
  since: Date,
  cap: number,
  now: Date = new Date(),
): { rows: T[]; goal: number } {
  const budget = Math.max(0, cap - Math.max(0, answeredToday));
  if (budget === 0) return { rows: [], goal: Math.min(cap, Math.max(0, answeredToday)) };

  const seenToday = (item: T): boolean =>
    Boolean(item.lastReviewedAt && item.lastReviewedAt.getTime() >= since.getTime());

  const rows = composeSitting(
    due.filter((item) => !seenToday(item)),
    upcoming.filter((item) => !seenToday(item)),
    budget,
    now,
  );
  return { rows, goal: Math.min(cap, Math.max(0, answeredToday) + rows.length) };
}
