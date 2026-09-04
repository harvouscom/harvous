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
}

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
        (pending.find((c) => c.kind !== last.kind && !sameSubject(c, last)) ??
          pending.find((c) => !sameSubject(c, last)))) ??
      pending[0];
    pending.splice(pending.indexOf(pick), 1);
    out.push(pick);
  }
}

function sameSubject(a: SessionOrderInput, b: SessionOrderInput): boolean {
  return Boolean(a.groupKey) && a.groupKey === b.groupKey;
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
