import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { authorOutcomeCopy, reviewerNudgeCopy, reviewerNudgeDue } from '../church-content-push';
import { isChurchDeliveryKind } from '../reminder-policy';
import { TITLE_MAX } from '../reminder-payload';

describe('authorOutcomeCopy', () => {
  const base = { noteTitle: 'Romans 8 study', channelTitle: 'Youth' };
  it('says what happened, in a title that fits', () => {
    for (const outcome of ['approved', 'scheduled', 'declined', 'failed'] as const) {
      const copy = authorOutcomeCopy({ ...base, outcome });
      expect(copy.title.length).toBeLessThanOrEqual(TITLE_MAX);
      expect(copy.body).toContain('Romans 8 study');
    }
  });
  it('carries the reviewer’s note on a decline', () => {
    expect(authorOutcomeCopy({ ...base, outcome: 'declined', reviewNote: 'Add Sunday’s passage' }).body).toBe(
      'Romans 8 study: Add Sunday’s passage',
    );
  });
  it('names when a scheduled post goes out', () => {
    expect(authorOutcomeCopy({ ...base, outcome: 'scheduled', publishAtLabel: 'on Sun, Sep 27, 8:00 AM' }).body).toContain(
      'Sun, Sep 27',
    );
  });
  it('caps the body', () => {
    expect(authorOutcomeCopy({ ...base, outcome: 'declined', reviewNote: 'x'.repeat(400) }).body.length).toBe(120);
  });
});

describe('reviewer nudge', () => {
  it('counts what is waiting', () => {
    expect(reviewerNudgeCopy(0)).toBeNull();
    expect(reviewerNudgeCopy(1)?.body).toBe('1 post is waiting for you to approve it.');
    expect(reviewerNudgeCopy(3)?.body).toBe('3 posts are waiting for you to approve them.');
  });

  const at = (iso: string) => new Date(iso);
  const base = { localHour: 10, localDate: '2026-09-26', lastSentLocalDate: null, lastSentAt: null, newestWaitingAt: at('2026-09-26T14:00:00Z') };
  it('is due in daytime when something is waiting', () => {
    expect(reviewerNudgeDue(base)).toBe(true);
  });
  it('never at night, never twice a day, never with nothing waiting', () => {
    expect(reviewerNudgeDue({ ...base, localHour: 22 })).toBe(false);
    expect(reviewerNudgeDue({ ...base, lastSentLocalDate: '2026-09-26' })).toBe(false);
    expect(reviewerNudgeDue({ ...base, newestWaitingAt: null })).toBe(false);
  });
  it('only for posts newer than the last nudge', () => {
    expect(
      reviewerNudgeDue({ ...base, lastSentLocalDate: '2026-09-25', lastSentAt: at('2026-09-25T15:00:00Z'), newestWaitingAt: at('2026-09-25T14:00:00Z') }),
    ).toBe(false);
    expect(
      reviewerNudgeDue({ ...base, lastSentLocalDate: '2026-09-25', lastSentAt: at('2026-09-25T15:00:00Z'), newestWaitingAt: at('2026-09-26T09:00:00Z') }),
    ).toBe(true);
  });
});

describe('church pushes stay out of the reminder policy', () => {
  it('treats every church kind as a church delivery', () => {
    expect(isChurchDeliveryKind('church')).toBe(true);
    expect(isChurchDeliveryKind('church-content')).toBe(true);
    expect(isChurchDeliveryKind('church-review')).toBe(true);
    expect(isChurchDeliveryKind('sunday')).toBe(false);
    expect(isChurchDeliveryKind('churchy')).toBe(false);
  });
});

describe('wiring', () => {
  const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
  it('approve and decline tell the author; a failed publish does too', () => {
    const routes = src('server/routes/church-content.ts');
    expect(routes).toContain("outcome: 'approved', actorUserId: auth.userId");
    expect(routes).toContain("outcome: 'scheduled', actorUserId: auth.userId");
    expect(routes).toContain("outcome: 'declined', actorUserId: auth.userId");
    expect(src('server/utils/church-content.ts')).toContain("outcome: 'failed'");
  });
  it('the nudge runs hourly', () => {
    expect(src('server/scheduler.ts')).toContain('runChurchReviewNudgeTick()');
  });
});
