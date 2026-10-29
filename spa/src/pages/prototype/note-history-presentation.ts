import type { NoteHistorySessionWire } from '../../hooks/queries/useNoteHistory';

export type NoteHistoryDayGroup = {
  key: string;
  label: string;
  sessions: NoteHistorySessionWire[];
};

function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function noteHistoryDayLabel(date: Date, now: Date = new Date()): string {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (localDayKey(date) === localDayKey(now)) return 'Today';
  if (localDayKey(date) === localDayKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Sessions arrive newest first; grouping keeps that order within and across days. */
export function groupNoteHistoryByDay(
  sessions: readonly NoteHistorySessionWire[],
  now: Date = new Date(),
): NoteHistoryDayGroup[] {
  const groups: NoteHistoryDayGroup[] = [];
  for (const session of sessions) {
    const ended = new Date(session.endedAt);
    const key = localDayKey(ended);
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.sessions.push(session);
    } else {
      groups.push({ key, label: noteHistoryDayLabel(ended, now), sessions: [session] });
    }
  }
  return groups;
}

function timeLabel(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "2:14 PM", or "2:14 PM – 2:40 PM" when a session spans more than a minute. */
export function noteHistorySessionTimeLabel(session: Pick<NoteHistorySessionWire, 'startedAt' | 'endedAt'>): string {
  const start = new Date(session.startedAt);
  const end = new Date(session.endedAt);
  const startLabel = timeLabel(start);
  const endLabel = timeLabel(end);
  return startLabel === endLabel || end.getTime() - start.getTime() < 60_000
    ? endLabel
    : `${startLabel} – ${endLabel}`;
}

/** "Sep 3, 2026, 2:14 PM" — for confirm and toast copy, where the day may be far back. */
export function formatNoteHistoryMoment(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatNoteHistoryDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

/** "12 min of writing", "A quick edit" — how long a session ran, in words. */
export function noteHistorySessionSpan(session: Pick<NoteHistorySessionWire, 'startedAt' | 'endedAt'>): string {
  const minutes = Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000);
  if (minutes < 2) return 'A quick edit';
  if (minutes < 60) return `${minutes} min of writing`;
  const hours = Math.round(minutes / 6) / 10;
  return `${hours % 1 === 0 ? hours.toFixed(0) : hours} hr of writing`;
}

export type NoteVersionChange = {
  /** Paragraphs in the newer version that the older one did not have, in order. */
  added: string[];
  /** Paragraphs the older version had that the newer one does not. */
  removed: string[];
  /** Scripture references that appeared in this version. */
  referencesAdded: string[];
  /** Newer word count minus older. */
  wordDelta: number;
};

function versionBlocks(html: string): { blocks: string[]; references: string[]; words: number } {
  if (!html || typeof DOMParser === 'undefined') return { blocks: [], references: [], words: 0 };
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return { blocks: [], references: [], words: 0 };
  const blocks: string[] = [];
  root.querySelectorAll('p, li, h1, h2, h3, h4, blockquote').forEach((el) => {
    // A list item or quote holds paragraphs of its own; count the innermost block once.
    if (el.querySelector('p, li')) return;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text) blocks.push(text);
  });
  const references = Array.from(root.querySelectorAll('[data-scripture-reference]'))
    .map((el) => el.getAttribute('data-scripture-reference') ?? '')
    .filter(Boolean);
  // From the blocks, not textContent: adjacent paragraphs have no space between them there.
  const words = blocks.join(' ').split(/\s+/).filter(Boolean).length;
  return { blocks, references, words };
}

/**
 * What a session changed, as a reader would describe it: the paragraphs that came and went,
 * the passages that arrived, and roughly how much was written. Paragraph-level on purpose —
 * a character diff of a study note is noise, and "you added this paragraph" is what someone
 * scanning history for the version they want actually recognises.
 */
export function summarizeNoteVersionChange(olderHtml: string | null, newerHtml: string): NoteVersionChange {
  const newer = versionBlocks(newerHtml);
  const older = versionBlocks(olderHtml ?? '');
  const olderSet = new Set(older.blocks);
  const newerSet = new Set(newer.blocks);
  const olderRefs = new Set(older.references);
  return {
    added: newer.blocks.filter((block) => !olderSet.has(block)),
    removed: older.blocks.filter((block) => !newerSet.has(block)),
    referencesAdded: [...new Set(newer.references.filter((ref) => !olderRefs.has(ref)))],
    wordDelta: newer.words - older.words,
  };
}
