/**
 * Turning a search log into "you keep looking for this and never wrote it down".
 *
 * ## Why this signal is different from every other one
 *
 * The resurfacing layer is built on things that exist: notes written, chapters read,
 * highlights left, notes returned to. Every card it can show is, underneath, a fact about
 * something the reader made. A search is the one record of something they *wanted* and did
 * not get — a stated intent with nothing behind it. That makes it the only place the app can
 * see a gap rather than a habit, and it is also why the gating below is stricter than
 * anywhere else: a suggestion built on absence is easy to make presumptuous.
 *
 * ## What the gating is actually protecting against
 *
 * Not false positives in the statistical sense. The failure mode is tonal: being told what
 * you searched for reads as being watched, unless the thing being reflected back is
 * unmistakably a *question you kept asking*. So the bar is repetition across days rather than
 * within a session, a term that still finds nothing, and nothing already written under that
 * name. One frustrated evening is not a pattern, and a question you have since answered is
 * not a gap.
 *
 * Pure and deterministic — no AI, matching every other derivation in this layer.
 */

import { isResolvableScriptureReference } from './scripture-detector';
import { UNIVERSAL_BIBLE_ENTITIES } from './universal-bible-entities';

/** One row of the log, already normalized. */
export type SearchGapEvent = {
  query: string;
  action: 'query' | 'resultOpen';
  resultCount: number;
  /** Local day number, so "distinct days" needs no timezone work here. */
  dayIndex: number;
};

export type SearchGap = {
  query: string;
  occurrences: number;
  distinctDays: number;
  /** Most recent day it was asked, for the recency bound. */
  lastDayIndex: number;
};

/** Asked enough times to be a question rather than a passing thought. */
export const SEARCH_GAP_MIN_OCCURRENCES = 3;
/** On separate days: one session of retrying a typo is not a pattern. */
export const SEARCH_GAP_MIN_DISTINCT_DAYS = 2;
/** Still a live interest. */
export const SEARCH_GAP_MAX_AGE_DAYS = 14;
/** And not archaeology — a question from four months ago has usually moved on. */
export const SEARCH_GAP_MAX_SPAN_DAYS = 45;

/**
 * Above `MIN_SEARCH_QUERY_LENGTH`, deliberately.
 *
 * Three-character queries are disproportionately initials, abbreviations and typos. They are
 * fine to *remember* — the recents list shows them back and the reader knows what they meant
 * — but a card built around one would be the app confidently naming something that is not a
 * topic.
 */
export const SEARCH_GAP_MIN_LENGTH = 4;
export const SEARCH_GAP_MAX_LENGTH = 40;

/**
 * Words that carry no subject on their own.
 *
 * Short and English-only on purpose: this is not a linguistics problem, it is a guard against
 * a card titled "about" or "the lord". Anything that slips through still has to clear the
 * repetition and zero-result bars.
 */
const STOPWORDS = new Set([
  'the', 'and', 'but', 'for', 'nor', 'yet', 'so', 'a', 'an', 'of', 'to', 'in', 'on', 'at',
  'by', 'with', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'am', 'it', 'its',
  'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he',
  'him', 'his', 'she', 'her', 'they', 'them', 'their', 'what', 'when', 'where', 'who', 'why',
  'how', 'not', 'no', 'do', 'does', 'did', 'about', 'into', 'out', 'up', 'down', 'over',
]);

/**
 * Whether a term could ever be a gap, ignoring how often it was asked.
 *
 * Split from the counting so the reasons a term is unsuitable can be read — and tested — on
 * their own.
 */
export function isEligibleGapQuery(query: string): boolean {
  const q = query.trim();
  if (q.length < SEARCH_GAP_MIN_LENGTH || q.length > SEARCH_GAP_MAX_LENGTH) return false;

  /*
   * Passage lookups are navigation, not unanswered questions. They are also the highest-volume
   * and least informative thing anybody types, and the results already hoist a resolvable
   * reference to the top — so a card offering to "write about John 3" would be answering a
   * question the panel answered instantly.
   */
  if (isResolvableScriptureReference(q)) return false;

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  /*
   * At least one word that means something on its own, and it must not be a universal name.
   * `deriveRecurringPerson` already declines to suggest a note about God for the same reason:
   * the name is in everything, so it distinguishes nothing.
   */
  return tokens.some(
    (token) => !STOPWORDS.has(token) && !UNIVERSAL_BIBLE_ENTITIES.has(token),
  );
}

/**
 * The strongest unanswered question, or `null`.
 *
 * One at a time, deliberately. This kind is new, it is built on a signal type nothing else in
 * the system uses, and a shelf showing three of them would turn a helpful memory into a list
 * of everything you failed to find.
 */
export function deriveSearchGap(
  events: SearchGapEvent[],
  options: { todayDayIndex: number },
): SearchGap | null {
  const byQuery = new Map<
    string,
    { occurrences: number; days: Set<number>; lastDay: number; firstDay: number; answered: boolean; lastCount: number }
  >();

  for (const event of events) {
    const query = event.query.trim();
    if (!query) continue;
    let entry = byQuery.get(query);
    if (!entry) {
      entry = {
        occurrences: 0,
        days: new Set(),
        lastDay: -Infinity,
        firstDay: Infinity,
        answered: false,
        lastCount: 0,
      };
      byQuery.set(query, entry);
    }

    /* An open at any point in the window disqualifies the term for good. The question was
       answered by something the app already had, so there is no gap to offer to fill. */
    if (event.action === 'resultOpen') {
      entry.answered = true;
      continue;
    }

    entry.occurrences += 1;
    entry.days.add(event.dayIndex);
    if (event.dayIndex >= entry.lastDay) {
      entry.lastDay = event.dayIndex;
      entry.lastCount = event.resultCount;
    }
    if (event.dayIndex < entry.firstDay) entry.firstDay = event.dayIndex;
  }

  let best: SearchGap | null = null;
  for (const [query, entry] of byQuery) {
    if (entry.answered) continue;
    if (entry.occurrences < SEARCH_GAP_MIN_OCCURRENCES) continue;
    if (entry.days.size < SEARCH_GAP_MIN_DISTINCT_DAYS) continue;
    /* Still finding nothing. A term that has since started returning results is a question
       the library has grown into answering, and re-raising it would be stale. */
    if (entry.lastCount > 0) continue;
    if (options.todayDayIndex - entry.lastDay > SEARCH_GAP_MAX_AGE_DAYS) continue;
    if (options.todayDayIndex - entry.firstDay > SEARCH_GAP_MAX_SPAN_DAYS) continue;
    if (!isEligibleGapQuery(query)) continue;

    const candidate: SearchGap = {
      query,
      occurrences: entry.occurrences,
      distinctDays: entry.days.size,
      lastDayIndex: entry.lastDay,
    };
    /* Most-asked wins; a tie goes to the one asked across more days, then to the more recent.
       Ordering is fully determined so the card does not change identity between renders. */
    if (
      !best ||
      candidate.occurrences > best.occurrences ||
      (candidate.occurrences === best.occurrences && candidate.distinctDays > best.distinctDays) ||
      (candidate.occurrences === best.occurrences &&
        candidate.distinctDays === best.distinctDays &&
        candidate.lastDayIndex > best.lastDayIndex)
    ) {
      best = candidate;
    }
  }

  return best;
}

/**
 * Whether the reader already has a note that answers this.
 *
 * Kept out of `deriveSearchGap` because it needs the note list, and the derivation is
 * deliberately a function of the log alone. Matching on title rather than on full text: a
 * passing mention is not an answer, but a note *named* for the term is.
 */
export function hasNoteAnsweringGap(
  gap: SearchGap,
  noteTitles: readonly (string | null | undefined)[],
): boolean {
  const q = gap.query.trim().toLowerCase();
  if (!q) return false;
  return noteTitles.some((title) => (title ?? '').trim().toLowerCase().includes(q));
}
