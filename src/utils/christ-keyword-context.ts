/**
 * Phrase-context guards for the Jesus character keyword — skip devotional Christ-language
 * ("in Christ", "O Lord") while keeping person-focused study ("Jesus healed the blind man").
 * Keep in sync with native `ChristKeywordContextGate`.
 */

const DEVOTIONAL_CHRIST_PHRASE_RES: RegExp[] = [
  /\bin\s+christ\b/giu,
  /\bthrough\s+christ\b/giu,
  /\brelationship\s+with\s+(?:christ|jesus|the\s+lord|lord)\b/giu,
  /\bo\s+lord\b/giu,
  /\bdear\s+lord\b/giu,
  /\blord\s+help\b/giu,
  /\blord\s+i\b/giu,
  /\bthank\s+you\s+lord\b/giu,
  /\bpraise\s+(?:you\s+)?lord\b/giu,
];

const JESUS_LITERAL_RE = /\bjesus\b/giu;

function escapeRegexToken(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchIsInsidePhrase(textLower: string, matchStart: number, matchEnd: number, re: RegExp): boolean {
  for (const m of textLower.matchAll(re)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (matchStart >= start && matchEnd <= end) return true;
  }
  return false;
}

function isDevotionalChristNeedle(needleRaw: string): boolean {
  const needle = needleRaw.toLowerCase().trim();
  return needle === 'christ' || needle === 'lord' || needle === 'savior' || needle === 'messiah';
}

/**
 * Skip a Jesus character trie hit when the needle is devotional shorthand and the match sits
 * inside common prayer/identity phrases. Literal "Jesus" and multi-word phrases (e.g. "lord jesus")
 * are never skipped here.
 */
export function shouldSkipJesusCharacterNeedleMatch(
  keywordName: string,
  needleRaw: string,
  textLower: string,
  matchStart: number,
  matchEnd: number,
): boolean {
  if (keywordName.toLowerCase() !== 'jesus') return false;
  const needle = needleRaw.toLowerCase().trim();
  if (!isDevotionalChristNeedle(needle)) return false;

  for (const re of DEVOTIONAL_CHRIST_PHRASE_RES) {
    if (matchIsInsidePhrase(textLower, matchStart, matchEnd, re)) return true;
  }
  return false;
}

/** Minimum confidence for Jesus when the only hits are synonym needles (not literal "Jesus"). */
export const JESUS_SYNONYM_ONLY_CONFIDENCE_THRESHOLD = 0.88;

/**
 * True when a Jesus keyword row should be suppressed from auto-tags: devotional context gate,
 * or synonym-only hit below the higher confidence bar.
 */
export function shouldSuppressJesusAutoTag(
  keywordName: string,
  confidence: number,
  fullTextLower: string,
  titleLower: string,
  opts: { synonymOnly?: boolean } = {},
): boolean {
  if (keywordName.toLowerCase() !== 'jesus') return false;

  if (opts.synonymOnly && confidence < JESUS_SYNONYM_ONLY_CONFIDENCE_THRESHOLD) {
    return true;
  }

  const literalJesusInTitle = JESUS_LITERAL_RE.test(titleLower);
  if (literalJesusInTitle) return false;

  const literalMatches = [...fullTextLower.matchAll(JESUS_LITERAL_RE)];
  if (literalMatches.length >= 2) return false;
  if (literalMatches.length === 1) return false;

  for (const re of DEVOTIONAL_CHRIST_PHRASE_RES) {
    if (re.test(fullTextLower)) return true;
  }

  return false;
}

/**
 * Count Jesus character needle occurrences with devotional context gates applied.
 * Used when scoring outside the trie (non-character categories path does not apply).
 */
export function countJesusCharacterNeedleInLowerText(
  textLower: string,
  needleRaw: string,
): number {
  const needle = needleRaw.toLowerCase().trim();
  if (!needle || !textLower) return 0;
  const tokens = needle.split(/\s+/).filter(Boolean);
  const pattern =
    tokens.length === 1
      ? `\\b${escapeRegexToken(tokens[0]!)}\\b`
      : `\\b(?:${tokens.map(escapeRegexToken).join('\\s+')})\\b`;
  const re = new RegExp(pattern, 'giu');
  let count = 0;
  for (const m of textLower.matchAll(re)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (
      shouldSkipJesusCharacterNeedleMatch('Jesus', needleRaw, textLower, start, end)
    ) {
      continue;
    }
    count += 1;
  }
  return count;
}
