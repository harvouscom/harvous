/**
 * Where the reader was last — one chapter, stored on the account.
 *
 * Deliberately not derived from the ReadingEvents log, though it looks like it could be.
 * An event is only written when a reading session *ends*, so a chapter opened and left
 * open has no event yet, and that is exactly the state someone is in when they close a
 * laptop mid-chapter and come back wanting to continue. Position is recorded when the
 * chapter opens; the log records what was read afterwards. They answer different questions
 * and they are allowed to disagree.
 */

import {
  normalizeTranslationCode,
  resolveScriptureChapterTarget,
  type ScriptureChapterTarget,
} from './scripture-chapter-target';

export type LastReadPosition = ScriptureChapterTarget & {
  translation: string;
  verse?: number;
  readAt: string;
};

export type LastReadPositionInput = Omit<LastReadPosition, 'readAt'>;

const LOCAL_LAST_READ_KEY = 'harvous.lastReadPosition';

export function validateLastReadPositionInput(body: unknown): LastReadPositionInput | null {
  if (!body || typeof body !== 'object') return null;
  const { book, chapter, translation, verse } = body as Record<string, unknown>;

  const target = resolveScriptureChapterTarget(book, chapter);
  if (!target) return null;

  const translationCode = normalizeTranslationCode(translation);
  if (!translationCode) return null;

  if (verse !== undefined && verse !== null) {
    if (typeof verse !== 'number' || !Number.isInteger(verse) || verse < 1) return null;
    return { ...target, translation: translationCode, verse };
  }

  return { ...target, translation: translationCode };
}

export function parseLastReadPosition(raw: string | null | undefined): LastReadPosition | null {
  if (!raw || typeof raw !== 'string') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const input = validateLastReadPositionInput(parsed);
  if (!input) return null;

  const { readAt } = parsed as Record<string, unknown>;
  if (typeof readAt !== 'string' || !readAt.trim()) return null;
  if (Number.isNaN(Date.parse(readAt))) return null;

  return { ...input, readAt };
}

export function serializeLastReadPosition(
  input: LastReadPositionInput,
  readAt: string,
): string {
  const position: LastReadPosition = { ...input, readAt };
  return JSON.stringify(position);
}

export function lastReadPositionReference(position: LastReadPosition): string {
  return `${position.book} ${position.chapter}`;
}

export function readLocalLastRead(): LastReadPosition | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return parseLastReadPosition(sessionStorage.getItem(LOCAL_LAST_READ_KEY));
  } catch {
    return null;
  }
}

export function writeLocalLastRead(position: LastReadPosition): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(LOCAL_LAST_READ_KEY, serializeLastReadPosition(position, position.readAt));
  } catch {
    // private mode / quota — memory cache still holds the patch
  }
}

/** Keep the position that was recorded later. Ties prefer the one that named a verse. */
export function preferFresherLastRead(
  current: LastReadPosition | null | undefined,
  incoming: LastReadPosition | null | undefined,
): LastReadPosition | null {
  if (!current) return incoming ?? null;
  if (!incoming) return current;
  const currentAt = Date.parse(current.readAt);
  const incomingAt = Date.parse(incoming.readAt);
  if (incomingAt > currentAt) return incoming;
  if (currentAt > incomingAt) return current;
  if (incoming.verse != null && current.verse == null) return incoming;
  return current;
}
