import { describe, expect, it } from 'vitest';
import {
  meetingDayLabel,
  meetingKindHasUrl,
  meetingUrlHost,
  nextMeetingDate,
  parseMeetingPlaceInput,
  parseMeetingRhythmInput,
} from '../space-meeting-rhythm';

describe('parseMeetingRhythmInput', () => {
  it('omits when neither field was sent, so a save that does not mention the rhythm leaves it alone', () => {
    expect(parseMeetingRhythmInput(null, null)).toEqual({ kind: 'omit' });
    expect(parseMeetingRhythmInput(undefined, undefined)).toEqual({ kind: 'omit' });
  });

  it('takes a day with a time', () => {
    expect(parseMeetingRhythmInput(3, '18:30')).toEqual({
      kind: 'set',
      meetingDay: 3,
      meetingTime: '18:30',
    });
  });

  it('takes a day on its own — a group can meet Tuesdays without naming an hour', () => {
    expect(parseMeetingRhythmInput(2, null)).toEqual({
      kind: 'set',
      meetingDay: 2,
      meetingTime: null,
    });
  });

  it('accepts form strings, since the update route posts FormData', () => {
    expect(parseMeetingRhythmInput('0', '9:00')).toEqual({
      kind: 'set',
      meetingDay: 0,
      meetingTime: '09:00',
    });
  });

  it('clears both when the day is cleared', () => {
    expect(parseMeetingRhythmInput('none', '')).toEqual({
      kind: 'set',
      meetingDay: null,
      meetingTime: null,
    });
  });

  it('refuses a time with no day to sit on', () => {
    const result = parseMeetingRhythmInput('', '18:30');
    expect(result.kind).toBe('invalid');
  });

  it('refuses a day outside the week', () => {
    expect(parseMeetingRhythmInput(7, null).kind).toBe('invalid');
    expect(parseMeetingRhythmInput(-1, null).kind).toBe('invalid');
    expect(parseMeetingRhythmInput(1.5, null).kind).toBe('invalid');
  });

  it('refuses anything that is not a 24-hour wall clock', () => {
    expect(parseMeetingRhythmInput(3, '6:30 PM').kind).toBe('invalid');
    expect(parseMeetingRhythmInput(3, '24:00').kind).toBe('invalid');
    expect(parseMeetingRhythmInput(3, '18:60').kind).toBe('invalid');
  });
});

describe('meetingDayLabel', () => {
  it('names a rhythm, not a date', () => {
    expect(meetingDayLabel(0)).toBe('Sundays');
    expect(meetingDayLabel(3)).toBe('Wednesdays');
  });

  it('is null for a space that has not said', () => {
    expect(meetingDayLabel(null)).toBeNull();
    expect(meetingDayLabel(undefined)).toBeNull();
    expect(meetingDayLabel(9)).toBeNull();
  });
});

describe('nextMeetingDate', () => {
  it('counts today as the next one — a room planning on its own meeting day means today', () => {
    // 2026-08-12 is a Wednesday.
    expect(nextMeetingDate(3, new Date(2026, 7, 12))).toBe('2026-08-12');
  });

  it('walks forward to the coming weekday', () => {
    expect(nextMeetingDate(0, new Date(2026, 7, 12))).toBe('2026-08-16');
    expect(nextMeetingDate(4, new Date(2026, 7, 12))).toBe('2026-08-13');
  });

  it('crosses a month end without drifting', () => {
    // 2026-08-31 is a Monday; the next Wednesday is in September.
    expect(nextMeetingDate(3, new Date(2026, 7, 31))).toBe('2026-09-02');
  });

  it('is null without a day', () => {
    expect(nextMeetingDate(null)).toBeNull();
  });
});

describe('parseMeetingPlaceInput', () => {
  it('omits when neither field was sent', () => {
    expect(parseMeetingPlaceInput(null, null)).toEqual({ kind: 'omit' });
  });

  it('takes an online room with its link', () => {
    expect(parseMeetingPlaceInput('online', 'https://zoom.us/j/123')).toEqual({
      kind: 'set',
      meetingKind: 'online',
      meetingUrl: 'https://zoom.us/j/123',
    });
  });

  it('takes an in-person room, which has no link to take', () => {
    expect(parseMeetingPlaceInput('in_person', '')).toEqual({
      kind: 'set',
      meetingKind: 'in_person',
      meetingUrl: null,
    });
  });

  it('clears the link when the kind is cleared', () => {
    expect(parseMeetingPlaceInput('none', '')).toEqual({
      kind: 'set',
      meetingKind: null,
      meetingUrl: null,
    });
  });

  it('refuses a link on a room that meets in a building', () => {
    // Otherwise it sits there dead, and reappears the day somebody flips the
    // room to hybrid and does not expect a link to already be set.
    expect(parseMeetingPlaceInput('in_person', 'https://zoom.us/j/123').kind).toBe('invalid');
  });

  it('refuses anything that is not https', () => {
    expect(parseMeetingPlaceInput('online', 'http://zoom.us/j/123').kind).toBe('invalid');
    expect(parseMeetingPlaceInput('online', 'javascript:alert(1)').kind).toBe('invalid');
    expect(parseMeetingPlaceInput('online', 'data:text/html,hi').kind).toBe('invalid');
    expect(parseMeetingPlaceInput('online', 'zoom.us/j/123').kind).toBe('invalid');
    expect(parseMeetingPlaceInput('online', 'https://localhost').kind).toBe('invalid');
  });

  it('refuses a kind it does not recognise', () => {
    expect(parseMeetingPlaceInput('carrier-pigeon', null).kind).toBe('invalid');
  });
});

describe('meetingKindHasUrl', () => {
  it('is true only where a link means something', () => {
    expect(meetingKindHasUrl('online')).toBe(true);
    expect(meetingKindHasUrl('hybrid')).toBe(true);
    expect(meetingKindHasUrl('in_person')).toBe(false);
    expect(meetingKindHasUrl(null)).toBe(false);
  });
});

describe('meetingUrlHost', () => {
  it('names the destination before anyone clicks it', () => {
    expect(meetingUrlHost('https://zoom.us/j/123')).toBe('zoom.us');
    expect(meetingUrlHost('https://www.meet.google.com/abc')).toBe('meet.google.com');
    expect(meetingUrlHost(null)).toBeNull();
    expect(meetingUrlHost('not a url')).toBeNull();
  });
});
