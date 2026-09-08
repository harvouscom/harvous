/**
 * The vocabulary of the search log, shared by the client that writes it and the server that
 * validates it.
 *
 * Two actions, and the distinction is the whole reason the table earns its place. `query` is
 * a question asked. `resultOpen` is that question being answered by something the app already
 * had. A term with many of the first and none of the second is the only signal in the system
 * that points at a gap rather than at a habit — every other one is derived from a note that
 * exists or a chapter that was read.
 */
export const SEARCH_EVENT_ACTIONS = ['query', 'resultOpen'] as const;
export type SearchEventAction = (typeof SEARCH_EVENT_ACTIONS)[number];

/** Which field it was typed into. Kept so one surface's behaviour can be read on its own. */
export const SEARCH_EVENT_SURFACES = ['library', 'spotlight'] as const;
export type SearchEventSurface = (typeof SEARCH_EVENT_SURFACES)[number];

/**
 * The longest a query is worth keeping.
 *
 * The gap card needs occurrences across distinct days inside a 45-day span, so 90 gives one
 * re-measurement cycle of headroom and nothing more. Enforced on read rather than by a job,
 * the same way `RECALL_HISTORY_WINDOW_DAYS` is: a row that can never be returned is already
 * functionally gone, and a retention promise that depends on a cron having run is not one.
 */
export const SEARCH_HISTORY_WINDOW_DAYS = 90;

/** Per-user ceiling on a read, newest first. */
export const SEARCH_HISTORY_MAX_ROWS = 2000;

/**
 * Anything longer than this is pasted text, not a search.
 *
 * A cap on what gets stored at all, because the risk of a long query is different in kind: a
 * search is a word or a phrase, whereas 300 characters is a paragraph somebody copied, and a
 * paragraph is far likelier to carry something personal that was never meant to be a query.
 */
export const SEARCH_QUERY_MAX_LENGTH = 64;

/** Trimmed, whitespace-collapsed, lowercased, so repeats group without a second pass. */
export function normalizeSearchQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Whether a query should be written to the server log at all.
 *
 * Deliberately structural rather than topical. The hardest things a person searches for in a
 * Bible-study app — grief, divorce, addiction, doubt — are exactly the ones where being
 * offered a way to write about it matters most, and a deny-list of "sensitive" words would
 * quietly refuse to help precisely there, while being unmaintainable and culturally loaded
 * besides. The protections that do apply are the ones that work regardless of subject: a
 * short retention window, deletion that is real, a control that clears it, and never leaving
 * first-party.
 *
 * What is excluded is what is either useless or not a search:
 * - too long to be a query (see `SEARCH_QUERY_MAX_LENGTH`)
 * - an email address, which is somebody's identity rather than a topic
 * - a run of digits long enough to be an account or phone number
 */
export function shouldLogSearchQuery(normalized: string): boolean {
  if (!normalized) return false;
  if (normalized.length > SEARCH_QUERY_MAX_LENGTH) return false;
  if (normalized.includes('@')) return false;
  if (/\d{7,}/.test(normalized)) return false;
  return true;
}
