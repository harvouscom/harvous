/**
 * Phrase-context guards for life-category auto-tags — skip incidental hits in spiritual
 * or church-building prose. Keep in sync with native `LifeKeywordContextGate`.
 */

const SPIRITUAL_RELATIONSHIP_RE =
  /\brelationship\s+with\s+(?:god|christ|jesus|the\s+lord|lord)\b/giu;

const FELLOWSHIP_HALL_RE = /\bfellowship\s+hall\b/giu;
const CHURCH_FELLOWSHIP_RE = /\bchurch\s+fellowship\b/giu;
/** Incidental "my family went to church" attendance prose — not a family-life study theme. */
const FAMILY_CHURCH_ATTENDANCE_RE =
  /\b(?:my\s+)?family(?:\s+and\s+i)?\s+(?:went|go|goes|attended|attend|used\s+to\s+go)\b[^.]{0,80}\bchurch\b/giu;
const FAMILY_WENT_TO_CHURCH_RE = /\bmy\s+family\s+went\s+to\b[^.]{0,60}\bchurch\b/giu;
/** Eschatological "marriage supper of the Lamb" — not a marriage-life study theme. */
const MARRIAGE_SUPPER_OF_LAMB_RE = /\bmarriage(?:\s+supper|\s+feast|\s+banquet)\s+of\s+(?:the\s+)?lamb\b/giu;
const MARRIAGE_OF_LAMB_RE = /\bmarriage\s+of\s+(?:the\s+)?lamb\b/giu;

function escapeRegexToken(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `matchStart` in `textLower` falls inside a suppressed phrase for this keyword + needle. */
export function shouldSkipLifeKeywordNeedleMatch(
  keywordName: string,
  needleRaw: string,
  textLower: string,
  matchStart: number,
): boolean {
  const key = keywordName.toLowerCase();
  const needle = needleRaw.toLowerCase().trim();

  if (
    (key === 'marriage' || key === 'relationships' || key === 'reconciliation') &&
    needle.includes('relationship')
  ) {
    for (const m of textLower.matchAll(SPIRITUAL_RELATIONSHIP_RE)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (matchStart >= start && matchStart < end) return true;
    }
  }

  if (key === 'friendship' && needle === 'fellowship') {
    for (const re of [FELLOWSHIP_HALL_RE, CHURCH_FELLOWSHIP_RE]) {
      for (const m of textLower.matchAll(re)) {
        const start = m.index ?? 0;
        const end = start + m[0].length;
        if (matchStart >= start && matchStart < end) return true;
      }
    }
  }

  if (key === 'family' && (needle === 'family' || needle.includes('family'))) {
    for (const re of [FAMILY_CHURCH_ATTENDANCE_RE, FAMILY_WENT_TO_CHURCH_RE]) {
      for (const m of textLower.matchAll(re)) {
        const start = m.index ?? 0;
        const end = start + m[0].length;
        if (matchStart >= start && matchStart < end) return true;
      }
    }
  }

  if (key === 'marriage' && (needle === 'marriage' || needle.includes('marriage'))) {
    for (const re of [MARRIAGE_SUPPER_OF_LAMB_RE, MARRIAGE_OF_LAMB_RE]) {
      for (const m of textLower.matchAll(re)) {
        const start = m.index ?? 0;
        const end = start + m[0].length;
        if (matchStart >= start && matchStart < end) return true;
      }
    }
  }

  return false;
}

/**
 * Whole-word / phrase-boundary occurrence count, excluding life-keyword context false positives.
 */
export function countLifeKeywordNeedleInLowerText(
  textLower: string,
  needleRaw: string,
  keywordName: string,
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
    if (shouldSkipLifeKeywordNeedleMatch(keywordName, needleRaw, textLower, start)) continue;
    count += 1;
  }
  return count;
}
