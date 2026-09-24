import { describe, expect, it } from 'vitest';
import { composeSitting, sessionGroupKeyFor, todaySitting } from '../review-session-order';

const now = new Date('2026-09-08T12:00:00Z');

function item(partial: {
  id: string;
  kind?: string;
  reviewCount?: number;
  ladderStep?: number;
  dueAt?: Date;
  scriptureReference?: string | null;
  noteId?: string | null;
}) {
  const kind = partial.kind ?? 'verse';
  return {
    id: partial.id,
    kind,
    reviewCount: partial.reviewCount ?? 0,
    ladderStep: partial.ladderStep ?? 0,
    dueAt: partial.dueAt ?? now,
    scriptureReference: partial.scriptureReference ?? (kind === 'verse' ? `John 15:${partial.id}` : null),
    noteId: partial.noteId ?? (kind === 'note' ? partial.id : null),
    groupKey: sessionGroupKeyFor({
      scriptureReference: partial.scriptureReference ?? (kind === 'verse' ? `John 15:${partial.id}` : null),
      noteId: partial.noteId ?? (kind === 'note' ? partial.id : null),
    }),
  };
}

describe('composeSitting variety', () => {
  it('still fills a sitting when every due verse is on the first rung', () => {
    const due = Array.from({ length: 8 }, (_, i) =>
      item({ id: String(i + 1), scriptureReference: `John ${i + 1}:1` }),
    );
    const sitting = composeSitting(due, [], 8, now);
    expect(sitting.length).toBe(8);
  });

  it('pulls a note in when the due pile is all scripture', () => {
    const due = Array.from({ length: 6 }, (_, i) =>
      item({ id: `v${i}`, scriptureReference: `Romans ${i + 1}:1` }),
    );
    const upcoming = [
      item({
        id: 'n1',
        kind: 'note',
        dueAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      }),
    ];
    const sitting = composeSitting(due, upcoming, 8, now);
    expect(sitting.some((row) => row.kind === 'note')).toBe(true);
  });
});

describe('a sitting that can actually finish', () => {
  const dayStart = new Date('2026-09-08T05:00:00Z');
  const CAP = 8;

  function dueItem(id: string, over: { lastReviewedAt?: Date | null; kind?: string } = {}) {
    return { ...item({ id, kind: over.kind }), lastReviewedAt: over.lastReviewedAt ?? null };
  }

  it('asks for fewer as the day is worked through', () => {
    const due = Array.from({ length: 12 }, (_, i) => dueItem(String(i + 1)));
    expect(todaySitting(due, [], 0, dayStart, CAP, now).rows).toHaveLength(8);
    expect(todaySitting(due, [], 3, dayStart, CAP, now).rows).toHaveLength(5);
    expect(todaySitting(due, [], 8, dayStart, CAP, now).rows).toHaveLength(0);
  });

  /*
   * The bug this was written for. Answering sets an item due in a day, which is inside the
   * two-day window `composeSitting` backfills from — so the queue refilled with the very items
   * just answered and "N more" never moved.
   */
  it('does not offer back an item answered earlier today', () => {
    const answered = dueItem('1', {
      lastReviewedAt: new Date('2026-09-08T09:00:00Z'),
      kind: 'note',
    });
    const upcoming = [{ ...answered, dueAt: new Date('2026-09-09T09:00:00Z') }];
    const fresh = dueItem('2');
    const rows = todaySitting([fresh], upcoming, 1, dayStart, CAP, now).rows;
    expect(rows.map((r) => r.id)).toEqual(['2']);
  });

  it('still offers one answered before today', () => {
    const yesterday = dueItem('1', { lastReviewedAt: new Date('2026-09-07T09:00:00Z') });
    const rows = todaySitting([yesterday], [], 0, dayStart, CAP, now).rows;
    expect(rows.map((r) => r.id)).toEqual(['1']);
  });

  it('holds the goal steady as the sitting is worked', () => {
    /* Five due and none answered, then one answered and four left: the same five-question day,
       so the label counts towards the same number rather than moving under the reader. */
    const due = Array.from({ length: 5 }, (_, i) => dueItem(String(i + 1)));
    expect(todaySitting(due, [], 0, dayStart, CAP, now).goal).toBe(5);
    expect(todaySitting(due.slice(1), [], 1, dayStart, CAP, now).goal).toBe(5);
  });

  it('never sets a goal beyond one sitting, however much is waiting', () => {
    const due = Array.from({ length: 40 }, (_, i) => dueItem(String(i + 1)));
    expect(todaySitting(due, [], 0, dayStart, CAP, now).goal).toBe(CAP);
    expect(todaySitting(due, [], 6, dayStart, CAP, now).goal).toBe(CAP);
  });

  it('reports the day as done rather than going negative', () => {
    const due = [dueItem('1')];
    const result = todaySitting(due, [], 12, dayStart, CAP, now);
    expect(result.rows).toHaveLength(0);
    expect(result.goal).toBe(CAP);
  });
});

describe('composeSitting and the same question asked again', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  const day = 24 * 60 * 60 * 1000;
  const row = (id: string, kind: string, ladderStep: number, overdueDays: number, groupKey = id) => ({
    id,
    kind,
    groupKey,
    ladderStep,
    reviewCount: 0,
    dueAt: new Date(now.getTime() - overdueDays * day),
  });

  it('puts a third chapter on the same step behind anything else due', () => {
    // The account that prompted it: five overdue chapters, all "pick the verse that is in it".
    const due = [
      ...['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => row(id, 'chapter', 0, 17)),
      row('v1', 'verse', 3, 2),
      row('v2', 'verse', 1, 2),
      row('n1', 'note', 0, 14),
    ];
    const sitting = composeSitting(due, [], 5, now);
    expect(sitting.filter((r) => r.kind === 'chapter')).toHaveLength(2);
    expect(sitting.map((r) => r.id)).toEqual(expect.arrayContaining(['v1', 'v2', 'n1']));
  });

  it('still fills the sitting from them when nothing else is waiting', () => {
    const due = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => row(id, 'chapter', 0, 17));
    expect(composeSitting(due, [], 5, now)).toHaveLength(5);
  });
});
