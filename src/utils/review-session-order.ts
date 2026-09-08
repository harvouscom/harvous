/**
 * The order a sitting is asked in.
 *
 * `dueAt` ascending — the order the first cut used — has two failings a reader notices in the
 * first week. Items added together come due together, so a sitting is four questions about the
 * same chapter in a row, which is a test of the last answer more than of memory. And a new item
 * queued this morning can sit ahead of one the reader has been holding for a month and just
 * missed, so novelty is served before repetition.
 *
 * So: most overdue first, by whole days rather than by the clock — two items due this morning
 * are equally due, and which was stamped first is noise. Within a day, alternate kinds where
 * both are present, and never ask two questions about the same passage back to back. Reviews
 * (`reviewCount > 0`) always come before items on their first asking, so repetition takes
 * precedence over novelty. The result is a function of its input alone; two devices agree.
 */

/**
 * What an item is *about*, for keeping two questions on one subject apart.
 *
 * A passage's subject is its chapter, not its verse: "John 3" and "John 3:16" are one thing to
 * be asked about, and a chapter question straight after a verse question from it is a test of
 * the last answer. So the verse part is stripped, which also keeps two verses of one chapter
 * apart — an improvement the chapter kind happened to force. A note's subject is the note.
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
  /** What the item is about — a passage, a note — so two on the same thing are kept apart. */
  groupKey: string | null;
  dueAt: Date;
  reviewCount: number;
  /** Rung family. Prefer not to ask the same shape twice in a row when other work is waiting. */
  ladderStep?: number;
}

/**
 * The two halves of a sitting: scripture (verse, chapter, a marked span) and the
 * reader's own writing. A handful of one half is a quiz; both is review.
 */
export function sittingHalf(kind: string): 'passage' | 'note' {
  return kind === 'verse' || kind === 'chapter' || kind === 'highlight' ? 'passage' : 'note';
}

/** Pull a waiting item in if it is due within this many days. Tomorrow, not next month. */
export const SITTING_NEAR_DAYS = 2;

/** Leave room for this many of the other half when it is waiting nearby. */
export const SITTING_OTHER_HALF = 2;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysOverdue(item: SessionOrderInput, now: Date): number {
  return Math.floor((now.getTime() - item.dueAt.getTime()) / MS_PER_DAY);
}

/** Group by whole days overdue, most overdue first; the order within a bucket is the input's. */
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

/**
 * Empty a bucket into `out`, one item at a time, always preferring the candidate that differs
 * from the last emitted item in kind and in subject; falling back to a different subject; and
 * only then to whatever is next. The fallbacks mean the constraints are preferences, not
 * filters: nothing is ever dropped.
 */
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

/**
 * A handful that mixes writing and scripture, even when the due pile is one kind.
 *
 * Due items still lead. When they are all notes (or all verses) and the other half
 * is due within {@link SITTING_NEAR_DAYS}, that half is pulled in and the dominant
 * side is capped so the sitting is not five of the same thing. Items due later
 * than that stay "coming back later" — asking something scheduled for next week
 * is not review, it is raiding the future.
 */
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
  for (const item of [...due, ...near]) available[sittingHalf(item.kind)] += 1;
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

  return interleaveSession(picked, now);
}
