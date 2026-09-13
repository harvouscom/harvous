/**
 * Keyboard rules for the typed rungs.
 *
 * The tap rungs have had A–F bound to their options since they shipped, and the typed ones had
 * nothing at all: the reader filled in a verse and then had to reach for a button. That is the
 * wrong way round — typing is where the keyboard already is.
 *
 * Pure, because the interesting parts are an IME edge case and an off-by-one, and neither is
 * worth reproducing through a rendered dock to check.
 */

export interface SubmitKeyEvent {
  key: string;
  shiftKey: boolean;
  /** True while an input method is composing — see below. */
  isComposing?: boolean;
  nativeEvent?: { isComposing?: boolean };
}

/**
 * Enter submits; Shift+Enter does not.
 *
 * **Never while an IME is composing.** Enter is how a Japanese, Chinese or Korean reader accepts
 * the candidate they are part-way through choosing, and treating that as "check my answer" would
 * submit a half-typed word and spend one of their goes on it. `isComposing` is the flag that
 * says so, and it is read off the native event because React's synthetic event does not always
 * carry it.
 */
export function isSubmitKey(event: SubmitKeyEvent): boolean {
  if (event.key !== 'Enter') return false;
  if (event.shiftKey) return false;
  return !(event.isComposing || event.nativeEvent?.isComposing);
}

/**
 * The next gap worth moving to, or null when there is none.
 *
 * Walks forward from the one just left, wrapping once to catch gaps skipped on the way down, so
 * Enter reads as "take me to the next thing I still have to do" rather than as a plain Tab. A
 * value that is only whitespace counts as empty: the reader has not filled it.
 */
export function nextBlankIndex(values: readonly string[], from: number, total: number): number | null {
  const empty = (index: number) => !(values[index] ?? '').trim();
  for (let i = from + 1; i < total; i++) if (empty(i)) return i;
  for (let i = 0; i <= from && i < total; i++) if (empty(i)) return i;
  return null;
}

/**
 * Whether a keystroke landed somewhere the reader is typing.
 *
 * Escape collapses the dock, and it must not do that out from under someone mid-word — in a
 * gap, in a textarea, or anywhere contenteditable.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
