/**
 * Writing and reading the search log.
 *
 * Validation lives here rather than in the route so the rules that decide what is worth
 * storing sit next to the ones that decide what is worth returning — those two have to agree,
 * and they drift when they are written in different files.
 */
import { db, SearchEvents, and, desc, eq, gte } from '../db';
import { nowISO } from '../db/dates';
import { generateTimestampId } from '@/utils/ids';
import { isSearchEventsTableMissing } from './pg-undefined-relation';
import {
  SEARCH_EVENT_ACTIONS,
  SEARCH_EVENT_SURFACES,
  SEARCH_HISTORY_MAX_ROWS,
  SEARCH_HISTORY_WINDOW_DAYS,
  normalizeSearchQuery,
  shouldLogSearchQuery,
  type SearchEventAction,
  type SearchEventSurface,
} from '@/utils/search-event-kinds';

export type RecordSearchEventInput = {
  query: string;
  action: SearchEventAction;
  resultCount: number;
  surface: SearchEventSurface;
};

/**
 * `null` for anything that should not be stored, which the route reports as a 400.
 *
 * Note that a query rejected by `shouldLogSearchQuery` is not an error on the client's part —
 * it typed something legitimate that this table has decided not to keep. The route treats
 * both the same way because the client's behaviour is identical either way: it is
 * fire-and-forget, and it does not read the response.
 */
export function validateSearchEventInput(body: unknown): RecordSearchEventInput | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;

  if (typeof raw.query !== 'string') return null;
  const query = normalizeSearchQuery(raw.query);
  if (!shouldLogSearchQuery(query)) return null;

  const action = raw.action;
  if (typeof action !== 'string' || !(SEARCH_EVENT_ACTIONS as readonly string[]).includes(action)) {
    return null;
  }

  const surface = raw.surface;
  if (typeof surface !== 'string' || !(SEARCH_EVENT_SURFACES as readonly string[]).includes(surface)) {
    return null;
  }

  const resultCount =
    typeof raw.resultCount === 'number' && Number.isFinite(raw.resultCount)
      ? Math.max(0, Math.round(raw.resultCount))
      : 0;

  return {
    query,
    action: action as SearchEventAction,
    resultCount,
    surface: surface as SearchEventSurface,
  };
}

export async function recordSearchEvent(
  userId: string,
  input: RecordSearchEventInput,
): Promise<boolean> {
  try {
    await db.insert(SearchEvents).values({
      id: generateTimestampId('searchevent'),
      userId,
      query: input.query,
      action: input.action,
      resultCount: input.resultCount,
      surface: input.surface,
      createdAt: nowISO(),
    });
    return true;
  } catch (error) {
    if (isSearchEventsTableMissing(error)) {
      console.warn('[recordSearchEvent] SearchEvents table missing; skipping. Run the manual SQL.');
      return false;
    }
    throw error;
  }
}

export type SearchEventRow = {
  query: string;
  action: SearchEventAction;
  resultCount: number;
  createdAt: string | Date;
};

/**
 * A reader's recent searches, inside the retention window.
 *
 * The window is applied here rather than by a scheduled delete, matching
 * `RECALL_HISTORY_WINDOW_DAYS`. A row that can never be returned is already functionally
 * gone, and a retention promise that only holds if a cron ran is not a promise.
 */
export async function getRecentSearchEvents(userId: string): Promise<SearchEventRow[]> {
  const since = new Date(Date.now() - SEARCH_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  try {
    const rows = await db
      .select({
        query: SearchEvents.query,
        action: SearchEvents.action,
        resultCount: SearchEvents.resultCount,
        createdAt: SearchEvents.createdAt,
      })
      .from(SearchEvents)
      .where(and(eq(SearchEvents.userId, userId), gte(SearchEvents.createdAt, since)))
      .orderBy(desc(SearchEvents.createdAt))
      .limit(SEARCH_HISTORY_MAX_ROWS);
    return rows as SearchEventRow[];
  } catch (error) {
    if (isSearchEventsTableMissing(error)) return [];
    throw error;
  }
}

/**
 * Delete a reader's whole search history.
 *
 * Called by the settings control, by clear-data and by delete-account. The last two matter
 * most: `SearchEvents` carries no `noteId`, so the note delete cascade cannot reach it, and
 * without an explicit delete a deleted account would leave its owner's searches behind. That
 * is the worst failure available in this feature, so it gets its own function rather than an
 * inline query somebody could forget to copy to the second call site.
 */
export async function deleteSearchEventsForUser(userId: string): Promise<void> {
  try {
    await db.delete(SearchEvents).where(eq(SearchEvents.userId, userId));
  } catch (error) {
    if (isSearchEventsTableMissing(error)) return;
    throw error;
  }
}
