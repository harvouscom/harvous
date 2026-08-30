/**
 * The gate on the one suggestion built from something the reader did *not* find.
 *
 * Most of these assert a refusal. That is the point: a card that reflects your searches back
 * at you is presumptuous unless it is unmistakably a question you kept asking, so the
 * interesting behaviour here is everything it declines to offer.
 */
import { describe, expect, it } from 'vitest';
import {
  deriveSearchGap,
  hasNoteAnsweringGap,
  isEligibleGapQuery,
  type SearchGapEvent,
} from '../search-gap';

const TODAY = 1000;

function asked(query: string, dayIndex: number, resultCount = 0): SearchGapEvent {
  return { query, action: 'query', resultCount, dayIndex };
}

function opened(query: string, dayIndex: number): SearchGapEvent {
  return { query, action: 'resultOpen', resultCount: 3, dayIndex };
}

/** Three asks across three days, finding nothing — the shape that should qualify. */
const QUALIFYING = [asked('patience', TODAY - 5), asked('patience', TODAY - 3), asked('patience', TODAY - 1)];

describe('what qualifies', () => {
  it('surfaces a term asked repeatedly across days that never found anything', () => {
    const gap = deriveSearchGap(QUALIFYING, { todayDayIndex: TODAY });
    expect(gap?.query).toBe('patience');
    expect(gap?.occurrences).toBe(3);
    expect(gap?.distinctDays).toBe(3);
  });

  it('picks the most-asked when several qualify', () => {
    const gap = deriveSearchGap(
      [
        ...QUALIFYING,
        asked('lament', TODAY - 6),
        asked('lament', TODAY - 4),
        asked('lament', TODAY - 2),
        asked('lament', TODAY - 1),
      ],
      { todayDayIndex: TODAY },
    );
    expect(gap?.query).toBe('lament');
  });
});

describe('what it refuses', () => {
  it('refuses a term whose third ask is a second pick on a day it already counted', () => {
    /*
     * The recents chip writes a real event when you pick it, so a term asked once on Monday
     * and picked again the same day, then asked on Tuesday, produces three rows across two
     * days. Counting rows, that cleared `MIN_OCCURRENCES` and the card appeared — built out
     * of the reader clicking the chip that says they searched for it. Counting days, it is
     * two days, and two days is not yet a pattern.
     */
    const gap = deriveSearchGap(
      [asked('patience', TODAY - 2), asked('patience', TODAY - 2), asked('patience', TODAY - 1)],
      { todayDayIndex: TODAY },
    );
    expect(gap).toBeNull();
  });

  it('counts a day once however many times the term was asked that day', () => {
    /* Same three days as QUALIFYING, with same-day repeats added: still three, not seven. */
    const gap = deriveSearchGap(
      [
        asked('patience', TODAY - 5),
        asked('patience', TODAY - 5),
        asked('patience', TODAY - 3),
        asked('patience', TODAY - 3),
        asked('patience', TODAY - 3),
        asked('patience', TODAY - 1),
        asked('patience', TODAY - 1),
      ],
      { todayDayIndex: TODAY },
    );
    expect(gap?.occurrences).toBe(3);
    expect(gap?.distinctDays).toBe(3);
  });

  it('does not let same-day repeats outrank a term asked on more days', () => {
    /*
     * `lament` has more events; `patience` has more days. Ranking on raw events handed it to
     * lament, which is backwards for a signal whose whole premise is repetition across days.
     */
    const gap = deriveSearchGap(
      [
        ...QUALIFYING,
        asked('lament', TODAY - 4),
        asked('lament', TODAY - 4),
        asked('lament', TODAY - 4),
        asked('lament', TODAY - 2),
      ],
      { todayDayIndex: TODAY },
    );
    expect(gap?.query).toBe('patience');
  });

  it('refuses a term asked three times in one sitting', () => {
    /* Retyping something in one evening is frustration, not a pattern. */
    const gap = deriveSearchGap(
      [asked('patience', TODAY - 1), asked('patience', TODAY - 1), asked('patience', TODAY - 1)],
      { todayDayIndex: TODAY },
    );
    expect(gap).toBeNull();
  });

  it('refuses a term that was ever opened', () => {
    /* The question got answered by something already in the library. One open disqualifies
       it for good, even with the asks that surround it. */
    const gap = deriveSearchGap([...QUALIFYING, opened('patience', TODAY - 2)], {
      todayDayIndex: TODAY,
    });
    expect(gap).toBeNull();
  });

  it('refuses a term whose most recent search did find something', () => {
    /* The library has grown into answering it; re-raising it would be stale. */
    const gap = deriveSearchGap(
      [asked('patience', TODAY - 5), asked('patience', TODAY - 3), asked('patience', TODAY - 1, 4)],
      { todayDayIndex: TODAY },
    );
    expect(gap).toBeNull();
  });

  it('refuses a question that has gone quiet', () => {
    const stale = [asked('patience', TODAY - 40), asked('patience', TODAY - 38), asked('patience', TODAY - 36)];
    expect(deriveSearchGap(stale, { todayDayIndex: TODAY })).toBeNull();
  });

  it('refuses a run that started too long ago even if it was asked again recently', () => {
    const straggling = [
      asked('patience', TODAY - 200),
      asked('patience', TODAY - 3),
      asked('patience', TODAY - 1),
    ];
    expect(deriveSearchGap(straggling, { todayDayIndex: TODAY })).toBeNull();
  });

  it('refuses two asks, however recent', () => {
    expect(
      deriveSearchGap([asked('patience', TODAY - 2), asked('patience', TODAY - 1)], {
        todayDayIndex: TODAY,
      }),
    ).toBeNull();
  });
});

describe('which terms can ever be a gap', () => {
  it('rejects a passage reference', () => {
    /* Navigation, and the results already hoist it — offering to write about "John 3" would
       answer a question the panel answered instantly. */
    expect(isEligibleGapQuery('John 3')).toBe(false);
    expect(isEligibleGapQuery('romans 8:28')).toBe(false);
  });

  it('rejects a term that is only stopwords', () => {
    expect(isEligibleGapQuery('what is the')).toBe(false);
  });

  it('rejects a universal name that distinguishes nothing', () => {
    expect(isEligibleGapQuery('god')).toBe(false);
    expect(isEligibleGapQuery('jesus')).toBe(false);
  });

  it('rejects three-character terms even though they are storable', () => {
    /* Above MIN_SEARCH_QUERY_LENGTH on purpose: three characters is mostly initials and
       typos, and a card would name it confidently. */
    expect(isEligibleGapQuery('joy')).toBe(false);
    expect(isEligibleGapQuery('hope')).toBe(true);
  });

  it('accepts a phrase carrying at least one real word', () => {
    expect(isEligibleGapQuery('the fruit of the spirit')).toBe(true);
  });

  it('rejects something long enough to be pasted text', () => {
    expect(isEligibleGapQuery('a'.repeat(60))).toBe(false);
  });
});

describe('a gap the reader has already answered themselves', () => {
  it('is answered by a note named for it', () => {
    const gap = deriveSearchGap(QUALIFYING, { todayDayIndex: TODAY })!;
    expect(hasNoteAnsweringGap(gap, ['On patience', 'Romans 8'])).toBe(true);
  });

  it('is not answered by unrelated notes', () => {
    const gap = deriveSearchGap(QUALIFYING, { todayDayIndex: TODAY })!;
    expect(hasNoteAnsweringGap(gap, ['Romans 8', 'Sunday notes'])).toBe(false);
  });
});
