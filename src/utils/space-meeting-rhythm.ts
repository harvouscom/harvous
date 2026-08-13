/**
 * When a space gathers — "Youth meets Wednesdays at 6:30".
 *
 * `Spaces.meetingDay` / `Spaces.meetingTime` have existed since church space
 * plans landed, and until now nothing anywhere could write them: every one of
 * the ten references was a read. So the Planner anchored its week columns on a
 * column that was always null, and the Coming-up card's "Wednesdays · 6:30 PM"
 * line never rendered for any space ever created.
 *
 * **Display and defaults only.** This seeds the plan's date picker and labels
 * the card. Nothing here schedules, reminds, or recurs — whoever runs the room
 * still enters every gathering by hand. See
 * docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md §1.
 *
 * **No timezone for a churchless room.** A church's zone is `Churches.timezone`;
 * a Shared Space that belongs to no church has none, and inventing one would be
 * a claim the app cannot keep. The time is a wall clock, shown without a zone
 * suffix — which is what a group that meets on Tuesdays actually means by it.
 */

/** 0–6, 0 = Sunday. Matches `Date.getDay()` and the WEEKDAYS array in church-services.ts. */
export const MEETING_DAY_MIN = 0;
export const MEETING_DAY_MAX = 6;

/** Whether the room meets in a place, on a call, or both. */
export const MEETING_KINDS = ['in_person', 'online', 'hybrid'] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];

/** Only these two carry a video link; `in_person` by definition does not. */
export function meetingKindHasUrl(kind: MeetingKind | null | undefined): boolean {
  return kind === 'online' || kind === 'hybrid';
}

export const MEETING_KIND_LABELS: Record<MeetingKind, string> = {
  in_person: 'In person',
  online: 'Online',
  hybrid: 'Both',
};

export type MeetingPlaceInputResult =
  | { kind: 'omit' }
  | { kind: 'set'; meetingKind: MeetingKind | null; meetingUrl: string | null }
  | { kind: 'invalid'; reason: string };

/**
 * Only https, and only a URL the browser itself agrees is one.
 *
 * `http:` is refused rather than upgraded: a meeting link is pasted from
 * somewhere, and silently rewriting somebody's scheme is a good way to send a
 * room to a page that does not exist. Everything else — `javascript:`, `data:`,
 * a bare "zoom.us/j/123" — is refused for the obvious reason.
 */
function parseMeetingUrl(raw: unknown): string | null | 'invalid' {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text || text === 'null') return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return 'invalid';
  }
  if (parsed.protocol !== 'https:') return 'invalid';
  if (!parsed.hostname.includes('.')) return 'invalid';
  return parsed.toString();
}

function parseKind(raw: unknown): MeetingKind | null | 'invalid' {
  if (raw == null) return null;
  const text = String(raw).trim().toLowerCase();
  if (!text || text === 'null' || text === 'none' || text === 'not-set') return null;
  if ((MEETING_KINDS as readonly string[]).includes(text)) return text as MeetingKind;
  return 'invalid';
}

/**
 * Form/JSON input for the pair. Both absent → omit; either present → set both,
 * so clearing the kind clears the link with it.
 *
 * A link on an `in_person` room is refused rather than stored: no surface would
 * show it, so keeping it would leave a dead value that reappears the day
 * somebody flips the room to hybrid and does not expect a link to already be
 * there.
 */
export function parseMeetingPlaceInput(rawKind: unknown, rawUrl: unknown): MeetingPlaceInputResult {
  if (rawKind == null && rawUrl == null) return { kind: 'omit' };

  const meetingKind = parseKind(rawKind);
  if (meetingKind === 'invalid') {
    return { kind: 'invalid', reason: 'Meeting kind must be in person, online, or both' };
  }

  const meetingUrl = parseMeetingUrl(rawUrl);
  if (meetingUrl === 'invalid') {
    return { kind: 'invalid', reason: 'A meeting link must be a full https:// address' };
  }

  if (meetingUrl !== null && !meetingKindHasUrl(meetingKind)) {
    return { kind: 'invalid', reason: 'Only a room that meets online can carry a meeting link' };
  }

  return { kind: 'set', meetingKind, meetingUrl };
}

/** "zoom.us" — what a member sees before deciding to click. */
export function meetingUrlHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export type MeetingRhythmInputResult =
  | { kind: 'omit' }
  | { kind: 'set'; meetingDay: number | null; meetingTime: string | null }
  | { kind: 'invalid'; reason: string };

function parseDay(raw: unknown): number | null | 'invalid' {
  if (raw == null) return null;
  const text = String(raw).trim().toLowerCase();
  if (!text || text === 'null' || text === 'none' || text === 'not-set') return null;
  const day = Number(text);
  if (!Number.isInteger(day) || day < MEETING_DAY_MIN || day > MEETING_DAY_MAX) return 'invalid';
  return day;
}

function parseTime(raw: unknown): string | null | 'invalid' {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text || text === 'null' || text === 'none') return null;
  // 'HH:MM', 24h. Same shape as ChurchServices.serviceTime.
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(text);
  if (!match) return 'invalid';
  return `${match[1]!.padStart(2, '0')}:${match[2]}`;
}

/**
 * Form/JSON input for the pair. Both absent → omit; either present → set both,
 * so clearing the day clears the time with it.
 *
 * A time with no day is refused rather than stored: "6:30" with no weekday
 * labels nothing and anchors nothing, and the one surface that reads the time
 * (`PrototypeSpaceComingUp`) already requires a day before it renders either.
 */
export function parseMeetingRhythmInput(rawDay: unknown, rawTime: unknown): MeetingRhythmInputResult {
  if (rawDay == null && rawTime == null) return { kind: 'omit' };

  const day = parseDay(rawDay);
  if (day === 'invalid') return { kind: 'invalid', reason: 'Meeting day must be 0–6, Sunday first' };

  const time = parseTime(rawTime);
  if (time === 'invalid') return { kind: 'invalid', reason: 'Meeting time must be HH:MM, 24-hour' };

  if (day === null && time !== null) {
    return { kind: 'invalid', reason: 'A meeting time needs a day to sit on' };
  }

  return { kind: 'set', meetingDay: day, meetingTime: time };
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Wednesdays" — the plural is the point; this names a rhythm, not a date. */
export function meetingDayLabel(day: number | null | undefined): string | null {
  if (day == null || !Number.isInteger(day) || day < MEETING_DAY_MIN || day > MEETING_DAY_MAX) {
    return null;
  }
  return `${WEEKDAY_NAMES[day]}s`;
}

/** The next calendar date this rhythm falls on, 'YYYY-MM-DD'. Today counts. */
export function nextMeetingDate(day: number | null | undefined, from = new Date()): string | null {
  if (day == null || !Number.isInteger(day) || day < MEETING_DAY_MIN || day > MEETING_DAY_MAX) {
    return null;
  }
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const ahead = (day - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + ahead);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${dayOfMonth}`;
}
