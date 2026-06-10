/**
 * Skip dictionary / character keyword hits when a capitalized token looks like a modern
 * person name in running prose (honorific prefix and/or following surname).
 * Shared by reference suggestions and bible-study folder/tag matching — keep in sync with
 * native `PersonNameContextGate`.
 */

export const PERSON_NAME_HONORIFIC_PREFIXES = new Set<string>([
  'ps',
  'st',
  'sr',
  'dr',
  'rev',
  'fr',
  'pastor',
  'rabbi',
  'mr',
  'mrs',
  'ms',
]);

/** Minimum capitalized token length for surname-after gate (matches reference suggestions). */
export const PERSON_NAME_SURNAME_MIN_LENGTH = 3;

export function isCapitalizedToken(word: string): boolean {
  const first = word.charAt(0);
  return first !== '' && first === first.toUpperCase() && first !== first.toLowerCase();
}

/** Skip hints/tags when the token looks like a person name in running prose. */
export function shouldSkipPersonNameContext(
  _word: string,
  text: string,
  wordStart: number,
  wordEnd: number,
): boolean {
  const before = text.slice(0, wordStart).trimEnd();
  const priorMatch = before.match(/[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’-]*$/);
  if (priorMatch && PERSON_NAME_HONORIFIC_PREFIXES.has(priorMatch[0].toLowerCase())) {
    return true;
  }
  const after = text.slice(wordEnd);
  const nextMatch = after.match(/^\s*([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’-]*)/);
  if (
    nextMatch &&
    isCapitalizedToken(nextMatch[1]) &&
    nextMatch[1].length >= PERSON_NAME_SURNAME_MIN_LENGTH
  ) {
    return true;
  }
  return false;
}
