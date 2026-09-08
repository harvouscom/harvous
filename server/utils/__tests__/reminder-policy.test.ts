/**
 * The back-off rules, which are the difference between a reminder people keep on and one
 * they turn off. Each test is one sentence of the promise made on the settings page.
 */
import { describe, expect, it } from 'vitest';
import type { ReminderSettings } from '@/utils/reminder-settings';
import {
  consecutiveIgnored,
  decideReminder,
  hasRecentPositive,
  preferredVariant,
  shouldRearm,
  shouldWritePause,
  summarizeRecentDeliveries,
  POLICY_WINDOW,
  type DeliveryRecord,
  type ReminderOutcome,
} from '../reminder-policy';

const settings: ReminderSettings = {
  cadence: 'twice-weekly',
  sunday: true,
  midweek: true,
  midweekDay: 3,
  hour: 8,
  pausedByPolicy: null,
};

/** Newest first, one week apart, so ordering is unambiguous. */
function history(outcomes: ReminderOutcome[], kind = 'sunday', variant = 'verse'): DeliveryRecord[] {
  const base = Date.parse('2026-09-01T13:00:00.000Z');
  return outcomes.map((outcome, index) => ({
    kind,
    variant,
    outcome,
    sentAt: new Date(base - index * 7 * 24 * 60 * 60 * 1000),
  }));
}

describe('consecutiveIgnored', () => {
  it('counts back from the newest until something else answers', () => {
    expect(consecutiveIgnored(history(['ignored', 'ignored', 'clicked']))).toBe(2);
  });

  it('stops at a delivery that is still open rather than counting it', () => {
    // Sent an hour ago and not yet answered is not the same as ignored, and treating it as a
    // strike would let one quiet morning pause someone who is simply asleep.
    expect(consecutiveIgnored(history([null, 'ignored', 'ignored']))).toBe(0);
  });

  it('lets a dismissal neither extend nor break a silent run', () => {
    expect(consecutiveIgnored(history(['ignored', 'dismissed', 'ignored']))).toBe(2);
  });
});

describe('decideReminder', () => {
  it('sends when there is no history at all', () => {
    expect(decideReminder(settings, 'sunday', [])).toMatchObject({ send: true, reason: 'ok' });
  });

  it('refuses a kind whose switch is off', () => {
    const sundayOnly = { ...settings, midweek: false };
    expect(decideReminder(sundayOnly, 'midweek', [])).toMatchObject({ send: false, reason: 'kind-off' });
  });

  it('skips the next one after two ignored in a row', () => {
    expect(decideReminder(settings, 'sunday', history(['ignored', 'ignored']))).toMatchObject({
      send: false,
      reason: 'backoff-skip',
    });
  });

  it('resumes after the skipped one, rather than stopping', () => {
    // Three ignored is an odd count: the skip already happened, so this one goes out.
    expect(decideReminder(settings, 'sunday', history(['ignored', 'ignored', 'ignored']))).toMatchObject({
      send: true,
    });
  });

  it('stops entirely after four ignored in a row', () => {
    const window = history(['ignored', 'ignored', 'ignored', 'ignored']);
    expect(decideReminder(settings, 'sunday', window)).toMatchObject({
      send: false,
      reason: 'paused-by-policy',
    });
    expect(shouldWritePause(settings, 'sunday', window)).toBe(true);
  });

  it('lets one tap buy back the schedule', () => {
    const window = history(['clicked', 'ignored', 'ignored', 'ignored', 'ignored']);
    expect(decideReminder(settings, 'sunday', window)).toMatchObject({ send: true });
    expect(shouldWritePause(settings, 'sunday', window)).toBe(false);
  });

  it('counts an app open with no tap as a yes', () => {
    // The banner did its job even though the banner itself was never touched.
    expect(hasRecentPositive(history(['opened', 'ignored']))).toBe(true);
    expect(decideReminder(settings, 'sunday', history(['opened', 'ignored', 'ignored']))).toMatchObject({
      send: true,
    });
  });

  it('never pauses on dismissals alone', () => {
    // iOS and Safari report dismissal unevenly, so it must not be able to stop anything.
    const window = history(['dismissed', 'dismissed', 'dismissed', 'dismissed']);
    expect(decideReminder(settings, 'sunday', window)).toMatchObject({ send: true });
    expect(shouldWritePause(settings, 'sunday', window)).toBe(false);
  });

  it('keeps a written pause until it is cleared, not until the next quiet week', () => {
    const paused = {
      ...settings,
      pausedByPolicy: { at: '2026-08-01T13:00:00.000Z', kind: 'all' as const },
    };
    expect(decideReminder(paused, 'sunday', [])).toMatchObject({
      send: false,
      reason: 'paused-by-policy',
    });
    // And a second pause is never written on top of an existing one.
    expect(shouldWritePause(paused, 'sunday', history(['ignored', 'ignored', 'ignored', 'ignored']))).toBe(false);
  });

  it('judges each kind on its own record', () => {
    const sundayIgnored = history(['ignored', 'ignored', 'ignored', 'ignored'], 'sunday');
    // Midweek has nothing against it, so a bad Sunday run must not stop it.
    expect(decideReminder(settings, 'midweek', sundayIgnored)).toMatchObject({ send: true });
  });
});

describe('the daily rhythm has its own patience', () => {
  const daily: ReminderSettings = { ...settings, cadence: 'daily' };

  it('does not back off at the count that would stop a weekly one', () => {
    // Two ignored is a fortnight of silence at two a week, and two days at daily. Reusing the
    // count would let a long weekend away switch someone off.
    expect(decideReminder(daily, 'daily', history(['ignored', 'ignored'], 'daily'))).toMatchObject({
      send: true,
    });
  });

  it('backs off once the silence is worth reading as one', () => {
    const window = history(['ignored', 'ignored', 'ignored', 'ignored', 'ignored', 'ignored'], 'daily');
    expect(decideReminder(daily, 'daily', window)).toMatchObject({ reason: 'backoff-skip' });
  });

  it('pauses after ten, which is about a fortnight of being ignored', () => {
    const nine = history(Array(9).fill('ignored'), 'daily');
    expect(decideReminder(daily, 'daily', nine)).not.toMatchObject({ reason: 'paused-by-policy' });

    const ten = history(Array(10).fill('ignored'), 'daily');
    expect(decideReminder(daily, 'daily', ten)).toMatchObject({ reason: 'paused-by-policy' });
    expect(shouldWritePause(daily, 'daily', ten)).toBe(true);
  });

  it('still lets one tap buy the rhythm back', () => {
    const window = history(['clicked', ...Array(10).fill('ignored')] as ReminderOutcome[], 'daily');
    expect(decideReminder(daily, 'daily', window)).toMatchObject({ send: true });
  });

  it('has no per-day switch to turn off', () => {
    // Choosing the cadence is the switch; `sunday`/`midweek` belong to the other rhythm and
    // must not be able to silence a daily reminder.
    const off = { ...daily, sunday: false, midweek: false };
    expect(decideReminder(off, 'daily', [])).toMatchObject({ send: true, reason: 'ok' });
  });
});

describe('every rhythm can actually reach its own pause', () => {
  it('looks back far enough to see the threshold it is measured against', () => {
    /*
     * The bug this exists for: `windowFor` truncates to the window *before* anything is
     * counted, so a pause threshold deeper than the window can never be reached. Daily was
     * briefly pause-at-10 read through an 8-deep window, which would have backed off forever
     * and never stopped. A window is only meaningful as "far enough back to see the threshold".
     */
    for (const kind of ['sunday', 'midweek', 'daily'] as const) {
      const atThreshold = history(Array(POLICY_WINDOW).fill('ignored') as ReminderOutcome[], kind);
      const cadence = kind === 'daily' ? 'daily' : 'twice-weekly';
      const s: ReminderSettings = { ...settings, cadence };
      expect(
        decideReminder(s, kind, atThreshold),
        `${kind} never reaches paused-by-policy`,
      ).toMatchObject({ reason: 'paused-by-policy' });
    }
  });
});

describe('preferredVariant', () => {
  it('says nothing until each variant has a few sends', () => {
    expect(preferredVariant(history(['clicked', 'ignored']))).toBeNull();
  });

  it('prefers the variant this reader answers, once the gap is clear', () => {
    const deliveries = [
      ...history(['clicked', 'clicked', 'opened'], 'sunday', 'pickup'),
      ...history(['ignored', 'ignored', 'ignored'], 'sunday', 'verse'),
    ];
    expect(preferredVariant(deliveries)).toBe('pickup');
  });

  it('stays out of it when two variants are within a hair of each other', () => {
    const deliveries = [
      ...history(['clicked', 'ignored', 'clicked'], 'sunday', 'pickup'),
      ...history(['clicked', 'ignored', 'clicked'], 'sunday', 'verse'),
    ];
    expect(preferredVariant(deliveries)).toBeNull();
  });

  it('ignores test sends when judging variants', () => {
    const deliveries = [
      ...history(['clicked', 'clicked', 'clicked'], 'test', 'plain'),
      ...history(['ignored', 'ignored'], 'sunday', 'verse'),
    ];
    expect(preferredVariant(deliveries)).toBeNull();
  });
});

describe('shouldRearm', () => {
  it('needs three separate days back before reminders return', () => {
    const paused = {
      ...settings,
      pausedByPolicy: { at: '2026-08-01T13:00:00.000Z', kind: 'all' as const },
    };
    expect(shouldRearm(paused, 2)).toBe(false);
    expect(shouldRearm(paused, 3)).toBe(true);
  });

  it('is a no-op for an account that was never paused', () => {
    expect(shouldRearm(settings, 10)).toBe(false);
  });
});

describe('summarizeRecentDeliveries', () => {
  it('says nothing when no reminder has been settled yet', () => {
    expect(summarizeRecentDeliveries(history([null, null]))).toBeNull();
  });

  it('counts opens against settled reminders only', () => {
    expect(summarizeRecentDeliveries(history(['clicked', 'opened', 'ignored', null]))).toBe(
      'Opened 2 of the last 3',
    );
  });
});
