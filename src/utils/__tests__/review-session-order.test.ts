import { describe, expect, it } from 'vitest';
import { composeSitting, sessionGroupKeyFor } from '../review-session-order';

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
