import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SERVICE_HEADCOUNT_MIN,
  choiceBelongsToViewer,
  isValidSlotInput,
  resolveChoiceSlot,
  slotKey,
  suppressSmallCounts,
  type ServiceSlot,
} from '../church-service-choice';
import { myServiceTimeFor } from '../../routes/church';

const slots: ServiceSlot[] = [
  { dayOfWeek: 0, startTime: '09:00', label: null, serviceTimeId: 'cstm_a' },
  { dayOfWeek: 0, startTime: '11:00', label: 'Traditional', serviceTimeId: 'cstm_b' },
  { dayOfWeek: 3, startTime: '19:00', label: null, serviceTimeId: 'cstm_c' },
];

describe('isValidSlotInput', () => {
  it('takes a weekday and a 24h time', () => {
    expect(isValidSlotInput({ dayOfWeek: 0, startTime: '09:00' })).toBe(true);
    expect(isValidSlotInput({ dayOfWeek: 6, startTime: '23:59' })).toBe(true);
  });
  it('refuses anything else', () => {
    expect(isValidSlotInput({ dayOfWeek: 7, startTime: '09:00' })).toBe(false);
    expect(isValidSlotInput({ dayOfWeek: 0.5, startTime: '09:00' })).toBe(false);
    expect(isValidSlotInput({ dayOfWeek: 0, startTime: '9:00' })).toBe(false);
    expect(isValidSlotInput({ dayOfWeek: '0', startTime: '09:00' })).toBe(false);
    expect(isValidSlotInput(null)).toBe(false);
  });
});

describe('choiceBelongsToViewer', () => {
  it('holds at the church it was made for, by either identity', () => {
    expect(choiceBelongsToViewer({ churchId: 'chur_1', hmcChurchId: null }, { connectedChurchId: 'chur_1', hmcChurchId: null })).toBe(true);
    expect(choiceBelongsToViewer({ churchId: null, hmcChurchId: 'TX-1' }, { connectedChurchId: null, hmcChurchId: 'TX-1' })).toBe(true);
  });
  it('survives the church registering after the choice (directory → Harvous)', () => {
    expect(choiceBelongsToViewer({ churchId: null, hmcChurchId: 'TX-1' }, { connectedChurchId: 'chur_1', hmcChurchId: 'TX-1' })).toBe(true);
  });
  it('means nothing at a different church', () => {
    expect(choiceBelongsToViewer({ churchId: 'chur_1', hmcChurchId: 'TX-1' }, { connectedChurchId: 'chur_2', hmcChurchId: 'TX-2' })).toBe(false);
    expect(choiceBelongsToViewer({ churchId: null, hmcChurchId: null }, { connectedChurchId: null, hmcChurchId: null })).toBe(false);
    expect(choiceBelongsToViewer(null, { connectedChurchId: 'chur_1', hmcChurchId: null })).toBe(false);
  });
});

describe('resolveChoiceSlot', () => {
  it('finds the service by day and time, not by row id', () => {
    expect(resolveChoiceSlot({ dayOfWeek: 0, startTime: '11:00' }, slots)?.serviceTimeId).toBe('cstm_b');
    // Re-created by staff with a new id: still the same service.
    const recreated = [{ ...slots[1], serviceTimeId: 'cstm_new' }];
    expect(resolveChoiceSlot({ dayOfWeek: 0, startTime: '11:00' }, recreated)?.serviceTimeId).toBe('cstm_new');
  });
  it('is no choice when the church no longer holds that service', () => {
    expect(resolveChoiceSlot({ dayOfWeek: 0, startTime: '10:30' }, slots)).toBeNull();
    expect(resolveChoiceSlot(null, slots)).toBeNull();
  });
  it('keys a slot as day@time', () => {
    expect(slotKey({ dayOfWeek: 3, startTime: '19:00' })).toBe('3@19:00');
  });
});

describe('suppressSmallCounts', () => {
  it(`reports 1 to ${SERVICE_HEADCOUNT_MIN - 1} as null, never a number that names people`, () => {
    const out = suppressSmallCounts([{ k: 'a', count: 0 }, { k: 'b', count: 1 }, { k: 'c', count: 4 }, { k: 'd', count: 5 }, { k: 'e', count: 40 }]);
    // Zero names nobody, so an empty service still reads as empty.
    expect(out.map((row) => row.count)).toEqual([0, null, null, 5, 40]);
  });
});

describe('myServiceTimeFor (This Sunday)', () => {
  const sunday = '2026-11-01'; // a Sunday
  it('is the viewer’s time when this sermon is preached at it', () => {
    expect(myServiceTimeFor(sunday, ['09:00', '11:00'], { dayOfWeek: 0, startTime: '11:00' })).toBe('11:00');
  });
  it('is null on another weekday, another time, or no choice', () => {
    expect(myServiceTimeFor(sunday, ['09:00'], { dayOfWeek: 3, startTime: '09:00' })).toBeNull();
    expect(myServiceTimeFor(sunday, ['09:00'], { dayOfWeek: 0, startTime: '11:00' })).toBeNull();
    expect(myServiceTimeFor(sunday, ['09:00'], null)).toBeNull();
    expect(myServiceTimeFor('not-a-date', ['09:00'], { dayOfWeek: 0, startTime: '09:00' })).toBeNull();
  });
});

describe('wiring', () => {
  const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
  it('every read of the new tables tolerates them not existing yet', () => {
    const text = src('server/utils/church-service-choice.ts');
    expect(text.match(/isPgUndefinedRelation\(error, 'ChurchServiceChoices'\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(text).toContain("isPgUndefinedRelation(error, 'ChurchServiceTimeSpaces')");
  });
  it('the congregant route never takes a church from the request', () => {
    const text = src('server/routes/church-service-choice.ts');
    expect(text).not.toMatch(/body\.(orgId|churchId|hmcChurchId)|query\('(orgId|churchId)'\)/);
  });
  it('headcount only counts choices made for this church', () => {
    const text = src('server/utils/church-service-choice.ts');
    const fn = text.slice(text.indexOf('export async function serviceHeadcount'));
    expect(fn).toContain('eq(ChurchServiceChoices.churchId, church.id)');
    expect(fn).toContain('suppressSmallCounts(');
  });
});
