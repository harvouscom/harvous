import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { churchPushCopy, churchPushWindowOpen } from '../church-publish-push';
import { TITLE_MAX } from '../reminder-payload';
import { parseReminderSettings, serializeReminderSettings, validateReminderSettingsInput, DEFAULT_REMINDER_SETTINGS } from '@/utils/reminder-settings';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('churchPushWindowOpen', () => {
  it('sends in daytime, once per local day', () => {
    expect(churchPushWindowOpen({ localHour: 10, localDate: '2026-09-18', lastSentLocalDate: null })).toBe(true);
    expect(churchPushWindowOpen({ localHour: 10, localDate: '2026-09-18', lastSentLocalDate: '2026-09-18' })).toBe(false);
    expect(churchPushWindowOpen({ localHour: 10, localDate: '2026-09-18', lastSentLocalDate: '2026-09-17' })).toBe(true);
  });

  it('holds church news overnight', () => {
    expect(churchPushWindowOpen({ localHour: 7, localDate: '2026-09-18', lastSentLocalDate: null })).toBe(false);
    expect(churchPushWindowOpen({ localHour: 22, localDate: '2026-09-18', lastSentLocalDate: null })).toBe(false);
  });
});

describe('churchPushCopy', () => {
  it('coalesces every channel into one line, busiest first', () => {
    expect(churchPushCopy([{ title: 'Adults', count: 1 }, { title: 'Youth', count: 3 }])).toEqual({
      title: 'New from your church',
      body: '3 new in Youth · 1 new in Adults',
    });
  });

  it('says nothing when nothing is new', () => {
    expect(churchPushCopy([])).toBeNull();
    expect(churchPushCopy([{ title: 'Youth', count: 0 }])).toBeNull();
  });

  it('keeps the title on one line and the body within budget', () => {
    const copy = churchPushCopy(Array.from({ length: 20 }, (_, i) => ({ title: `Ministry ${i}`, count: 2 })))!;
    expect(copy.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(copy.body.length).toBeLessThanOrEqual(120);
  });
});

describe('churchUpdates setting', () => {
  it('is off unless chosen, and survives a round trip when on', () => {
    expect(parseReminderSettings(serializeReminderSettings(DEFAULT_REMINDER_SETTINGS))?.churchUpdates).toBeUndefined();
    const on = validateReminderSettingsInput({ ...DEFAULT_REMINDER_SETTINGS, churchUpdates: true })!;
    expect(parseReminderSettings(serializeReminderSettings(on))?.churchUpdates).toBe(true);
  });

  it('rejects a non-boolean', () => {
    expect(validateReminderSettingsInput({ ...DEFAULT_REMINDER_SETTINGS, churchUpdates: 'yes' })).toBeNull();
  });

  it('matches the candidate filter’s serialized form exactly', () => {
    const on = validateReminderSettingsInput({ ...DEFAULT_REMINDER_SETTINGS, churchUpdates: true })!;
    expect(serializeReminderSettings(on)).toContain('"churchUpdates":true');
    expect(source('server/utils/church-publish-push.ts')).toContain(`'%"churchUpdates":true%'`);
  });
});

describe('church pushes never move the reminder policy', () => {
  it('uses its own kind and tag, and the scheduler runs it after reminders', () => {
    const util = source('server/utils/church-publish-push.ts');
    expect(util).toContain("export const CHURCH_PUSH_KIND = 'church'");
    expect(util).toContain("export const CHURCH_PUSH_TAG = 'harvous-church'");
    const scheduler = source('server/scheduler.ts');
    expect(scheduler.indexOf("name: 'push-reminders'")).toBeLessThan(scheduler.indexOf("name: 'church-updates'"));
  });
});

describe('reminder summary ignores church pushes', () => {
  it('counts only reminders', async () => {
    const { summarizeRecentDeliveries } = await import('../reminder-policy');
    const at = new Date('2026-09-18T10:00:00Z');
    expect(
      summarizeRecentDeliveries([
        { kind: 'sunday', variant: 'verse', outcome: 'clicked', sentAt: at },
        { kind: 'church', variant: 'plain', outcome: 'ignored', sentAt: at },
      ]),
    ).toBe('Opened 1 of the last 1');
  });
});

describe('reminders page payload', () => {
  it('sends every settings field, because the route overwrites', () => {
    const page = source('spa/src/pages/prototype/settings/PrototypeRemindersPage.tsx');
    const payload = page.slice(page.indexOf("'/api/user/update-reminders'"), page.indexOf('timezone: Intl'));
    for (const field of ['cadence', 'sunday', 'midweek', 'midweekDay', 'hour', 'churchUpdates']) {
      expect(payload).toContain(`${field}:`);
    }
  });
});
