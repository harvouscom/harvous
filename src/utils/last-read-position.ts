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
  /** Verse the reader was on, when the surface tracks one. Chapter-level surfaces omit it. */
  verse?: number;
  /** ISO timestamp of when this position was recorded. */
  readAt: string;
};

/** The client-supplied half — the server stamps `readAt` itself. */
export type LastReadPositionInput = Omit<LastReadPosition, 'readAt'>;

export function validateLastReadPositionInput(body: unknown): LastReadPositionInput | null {
  if (!body || typeof body !== 'object') return null;
  const { book, chapter, translation, verse } = body as Record<string, unknown>;

  const target = resolveScriptureChapterTarget(book, chapter);
  if (!target) return null;

  const translationCode = normalizeTranslationCode(translation);
  if (!translationCode) return null;

  // A verse is optional, but a nonsense one is rejected rather than dropped: silently
  // storing the chapter would send the reader back to the top of it with no explanation.
  if (verse !== undefined && verse !== null) {
    if (typeof verse !== 'number' || !Number.isInteger(verse) || verse < 1) return null;
    return { ...target, translation: translationCode, verse };
  }

  return { ...target, translation: translationCode };
}

/**
 * Read the stored JSON back, or null when there is nothing usable there.
 *
 * Tolerant on purpose: this column is read on every profile load, and a value written by
 * an older or newer client should degrade to "no saved position" rather than break the
 * surface asking for it.
 */
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

/** The reference to open when someone continues reading, e.g. "John 15". */
export function lastReadPositionReference(position: LastReadPosition): string {
  return `${position.book} ${position.chapter}`;
}
