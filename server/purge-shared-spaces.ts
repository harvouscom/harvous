import { purgeExpiredDeletedSpaces } from './utils/shared-space-lifecycle';

type Purge = (now: Date, limit: number) => Promise<string[]>;

export const SCHEDULED_PURGE_BATCH_SIZE = 50;
export const SCHEDULED_PURGE_MAX_SPACES = 500;
export const SCHEDULED_PURGE_TIME_BUDGET_MS = 25_000;

export function createPurgeSharedSpacesHandler(
  purge: Purge = purgeExpiredDeletedSpaces,
  clock: () => number = Date.now,
) {
  return async function handler() {
    const startedAt = clock();
    let purged = 0;
    let lastBatchSize = 0;
    do {
      const limit = Math.min(
        SCHEDULED_PURGE_BATCH_SIZE,
        SCHEDULED_PURGE_MAX_SPACES - purged,
      );
      const purgedIds = await purge(new Date(clock()), limit);
      lastBatchSize = purgedIds.length;
      purged += purgedIds.length;
      if (lastBatchSize < limit) break;
    } while (
      purged < SCHEDULED_PURGE_MAX_SPACES &&
      clock() - startedAt < SCHEDULED_PURGE_TIME_BUDGET_MS
    );
    const remaining = lastBatchSize === SCHEDULED_PURGE_BATCH_SIZE;
    console.log(`[purge-shared-spaces] purged=${purged} remaining=${remaining}`);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ purged, remaining }),
    };
  };
}

export const handler = createPurgeSharedSpacesHandler();
export default handler;
