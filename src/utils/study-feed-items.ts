/**
 * The study feed's wire contract, and the grouping that turns it into a readable day.
 *
 * Named "study feed" rather than "activity" because activity is already taken: a note's
 * activity is what *other people* did to it in a shared space (`useNoteActivity`,
 * `SharedNoteActivityPanel`). This is the opposite — one person's own study, across spaces.
 * "Activity" survives as the label a reader sees; nothing in the code answers to it.
 *
 * The server sends a flat list, newest first. Days and sessions are assembled here, on the
 * client, for two reasons: a day boundary is local to whoever is reading and the server has
 * no business guessing a timezone, and the clustering rule below is a judgement about what
 * counts as one sitting — the kind of thing that wants to be changed in an afternoon and
 * unit-tested, not redeployed.
 */

/**
 * What a moment is. The split that matters is weight, not source: `note-created` and
 * `note-updated` are original thought and get a card; the rest are the supporting trail and
 * get a row. A feed that gave "opened a note" the same presence as "wrote a reflection"
 * would be an audit log, which is the one thing this must not become.
 */
export type StudyFeedItemKind =
  | 'note-created'
  | 'note-updated'
  | 'highlight-note'
  | 'highlight-scripture'
  | 'passage-read'
  | 'note-revisited'
  | 'space-note'
  | 'church-note';

export type StudyFeedItemWeight = 'card' | 'row';

const CARD_KINDS: ReadonlySet<StudyFeedItemKind> = new Set<StudyFeedItemKind>([
  'note-created',
  'note-updated',
  'space-note',
  'church-note',
]);

export function studyFeedItemWeight(kind: StudyFeedItemKind): StudyFeedItemWeight {
  return CARD_KINDS.has(kind) ? 'card' : 'row';
}

/** Who did it and where, when that is not simply "you, in My Home". */
export interface StudyFeedActor {
  displayName: string;
  userColor?: string | null;
  profileImageUrl?: string | null;
}

export interface StudyFeedSpaceRef {
  id: string;
  title: string;
  color?: string | null;
}

interface StudyFeedItemBase {
  /**
   * Deterministic — `kind:sourceId`, or `kind:noteId:bucketStartMs` for a collapsed span.
   * A bucket that straddles a page boundary re-emits with a different span on the next
   * page, and the client replaces rather than duplicates it. That is the whole reason the
   * id is derived from the bucket start instead of being generated.
   */
  id: string;
  kind: StudyFeedItemKind;
  /** Sort key: the latest event in the bucket, ISO. */
  at: string;
  /** Present when the item collapses a span of events. */
  startAt?: string;
}

/**
 * What a moment points at, so a row can wear the glyph of the thing it opens.
 *
 * The list mirrors the sidebar's own list modes — a scripture note carries the scroll it
 * carries there, a folder the folder. Somewhere to go should look the same wherever the app
 * offers to take you.
 */
export type StudyFeedSubject = 'note' | 'scripture' | 'folder' | 'highlight' | 'passage';

/** Fields carried by every moment that is about a note the reader can open. */
interface StudyFeedNoteSubject {
  noteId: string;
  title: string | null;
  /** `Notes.noteType` — 'scripture' notes open as scripture, not as prose. */
  noteType?: string | null;
  /** `Notes.primaryCollection`, when the note lives in one. */
  folder?: string | null;
}

export interface StudyFeedNoteItem extends StudyFeedItemBase, StudyFeedNoteSubject {
  kind: 'note-created' | 'note-updated';
  snippet: string;
  scriptureRefs: string[];
  /** How many saves the bucket collapsed, on `note-updated` only. */
  saveCount?: number;
}

export interface StudyFeedHighlightItem extends StudyFeedItemBase {
  kind: 'highlight-note' | 'highlight-scripture';
  entryId: string;
  accent: string;
  excerpt: string;
  noteId?: string;
  noteTitle?: string | null;
  reference?: string;
  translation?: string;
}

export interface StudyFeedRevisitItem extends StudyFeedItemBase, StudyFeedNoteSubject {
  kind: 'note-revisited';
  visitCount: number;
}

export interface StudyFeedReadingItem extends StudyFeedItemBase {
  kind: 'passage-read';
  book: string;
  bookOrder: number;
  chapters: number[];
  translation: string;
  /** Strongest bucket in the session — never `glance`, those are dropped upstream. */
  dwellBucket: 'read' | 'study';
}

export interface StudyFeedSpaceNoteItem extends StudyFeedItemBase {
  kind: 'space-note' | 'church-note';
  noteId: string;
  title: string | null;
  snippet: string;
  actor: StudyFeedActor;
  space: StudyFeedSpaceRef;
  /** True while the space's last-visit watermark predates this note. */
  isNewSinceVisit?: boolean;
}

export type StudyFeedItem =
  | StudyFeedNoteItem
  | StudyFeedHighlightItem
  | StudyFeedReadingItem
  | StudyFeedRevisitItem
  | StudyFeedSpaceNoteItem;

export interface StudyFeedResponse {
  success: boolean;
  items: StudyFeedItem[];
  /** ISO timestamp to pass back as `before`, or null at the end of the trail. */
  nextCursor: string | null;
}

/** All / just my own study / one space. Serialized as `all`, `home`, `space:<id>`. */
export type StudyFeedScope = { kind: 'all' } | { kind: 'home' } | { kind: 'space'; spaceId: string };

export const STUDY_FEED_SCOPE_ALL: StudyFeedScope = { kind: 'all' };

export function serializeStudyFeedScope(scope: StudyFeedScope): string {
  return scope.kind === 'space' ? `space:${scope.spaceId}` : scope.kind;
}

export function parseStudyFeedScope(raw: unknown): StudyFeedScope {
  if (typeof raw !== 'string' || !raw) return STUDY_FEED_SCOPE_ALL;
  if (raw === 'home') return { kind: 'home' };
  if (raw.startsWith('space:')) {
    const spaceId = raw.slice('space:'.length).trim();
    if (spaceId) return { kind: 'space', spaceId };
  }
  return STUDY_FEED_SCOPE_ALL;
}

/** The note a moment is about, when it is about one. Used for clustering and navigation. */
export function studyFeedItemNoteId(item: StudyFeedItem): string | null {
  switch (item.kind) {
    case 'note-created':
    case 'note-updated':
    case 'note-revisited':
    case 'space-note':
    case 'church-note':
      return item.noteId;
    case 'highlight-note':
      return item.noteId ?? null;
    default:
      return null;
  }
}

function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * Name the day the way someone would say it out loud: "Today", "Yesterday", "Saturday".
 *
 * It used to append the date past a week, on the reasoning that "Tuesday" stops being a
 * location once there is more than one of them behind you. True, and the sheet answers it
 * another way — `dateLabel` sits immediately beside this and always carries the full date,
 * with the year on it whenever the year is not this one. So the two together read
 * "Saturday · August 22", and the label repeating the date made the header say it twice.
 */
export function studyFeedDayLabel(date: Date, now: Date): string {
  const dayKey = localDayKey(date);
  if (dayKey === localDayKey(now)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey === localDayKey(yesterday)) return 'Yesterday';

  return WEEKDAYS[date.getDay()];
}

/**
 * The three parts of a day a sitting can fall in.
 *
 * The feed used to infer sittings from a 45-minute gap, which is more precise and less
 * legible: "9:14–9:52" is a fact about timestamps, while "this morning" is how a person
 * actually files their own day. Three parts also means a day always has the same possible
 * headings, so two days can be compared at a glance.
 */
export type StudyFeedDayPart = 'morning' | 'afternoon' | 'evening';

export interface StudyFeedPartGroup {
  part: StudyFeedDayPart;
  /** "This morning" on today, "Morning" on any other day — the date above says which. */
  label: string;
  items: StudyFeedItem[];
}

export interface StudyFeedDay {
  /** Local calendar day, `YYYY-MM-DD`. */
  dayKey: string;
  /** "Today", "Yesterday", "Tuesday", or "Tuesday, August 25" past this week. */
  label: string;
  /** The full date, always — the sheet shows it beside the relative name. */
  dateLabel: string;
  parts: StudyFeedPartGroup[];
  /** True when nothing was recorded. The day still exists; it was simply a rest day. */
  isEmpty: boolean;
}

function partOfDay(date: Date): StudyFeedDayPart {
  const hour = date.getHours();
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

/**
 * Newest part first — evening, then afternoon, then morning.
 *
 * The stack already reads backwards through time: today sits in front and older days peek
 * behind it. A day that then read forwards internally made the sheet change direction
 * halfway down, so the most recent thing you did was the furthest thing from the top on
 * the one day you are most likely to be checking.
 */
const PART_ORDER: StudyFeedDayPart[] = ['evening', 'afternoon', 'morning'];
const PART_NOUN: Record<StudyFeedDayPart, string> = {
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
};

/** "August 25, 2026" — spelled out, because a sheet is a page and pages are dated. */
export function studyFeedFullDate(date: Date, now: Date): string {
  const monthDay = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === now.getFullYear()
    ? monthDay
    : `${monthDay}, ${date.getFullYear()}`;
}

function addDays(date: Date, delta: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + delta);
  return next;
}

/**
 * Every calendar day from today back to the oldest thing loaded — gaps included.
 *
 * The gaps are the point. A stack that only holds the days you studied silently rewrites
 * the month into an unbroken streak, and someone flipping back through it would have no way
 * to see the week they missed. A rest day is part of the record, so it gets a sheet.
 *
 * Bounded by the data rather than by a fixed window: the stack grows as older pages load,
 * so it never reaches back past what it could actually show.
 */
export function buildStudyFeedDays(items: StudyFeedItem[], now: Date = new Date()): StudyFeedDay[] {
  const byDay = new Map<string, StudyFeedItem[]>();
  let oldest: Date | null = null;

  for (const item of items) {
    const at = new Date(item.at);
    if (Number.isNaN(at.getTime())) continue;
    const key = localDayKey(at);
    const list = byDay.get(key);
    if (list) list.push(item);
    else byDay.set(key, [item]);
    if (!oldest || at < oldest) oldest = at;
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last = oldest
    ? new Date(oldest.getFullYear(), oldest.getMonth(), oldest.getDate())
    : today;
  const span = Math.max(0, Math.round((today.getTime() - last.getTime()) / 86_400_000));

  const days: StudyFeedDay[] = [];
  for (let i = 0; i <= span; i++) {
    const date = addDays(today, -i);
    const dayKey = localDayKey(date);
    const dayItems = byDay.get(dayKey) ?? [];
    const isToday = dayKey === localDayKey(now);

    const parts: StudyFeedPartGroup[] = [];
    for (const part of PART_ORDER) {
      const inPart = dayItems.filter((item) => partOfDay(new Date(item.at)) === part);
      if (inPart.length === 0) continue;
      parts.push({
        part,
        label: isToday
          ? `This ${PART_NOUN[part]}`
          : PART_NOUN[part].charAt(0).toUpperCase() + PART_NOUN[part].slice(1),
        // Newest first inside the part too, so the whole sheet runs one direction.
        items: [...inPart].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
      });
    }

    days.push({
      dayKey,
      label: studyFeedDayLabel(date, now),
      dateLabel: studyFeedFullDate(date, now),
      parts,
      isEmpty: dayItems.length === 0,
    });
  }

  return days;
}

/** Merge a newly fetched page onto what is already shown, newest first, without duplicates. */
export function mergeStudyFeedPages(pages: StudyFeedItem[][]): StudyFeedItem[] {
  const byId = new Map<string, StudyFeedItem>();
  for (const page of pages) {
    for (const item of page) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
