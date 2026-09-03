/**
 * Keep Harvous denormalized My Church / Churches snapshots fresh from the
 * HMC partner change feed (poll + by-id; no webhooks in v1).
 *
 * @see heresmychurch/docs/future/public-api.md Step 7b
 */

import {
  and,
  AppSyncCursors,
  Churches,
  db,
  eq,
  inArray,
  isNotNull,
  nowISO,
  UserMetadata,
} from '../db';
import {
  hmcDenormFields,
  hmcFetchChurchChanges,
  hmcGetChurchByIdForDenorm,
  type HmcChurchChange,
  type HmcLeanChurch,
} from './hmc-partner';

export const HMC_SYNC_CURSOR_KEY = 'hmc-church-changes';

/** First-run lookback when no watermark exists (within HMC’s 30-day max). */
export const HMC_SYNC_DEFAULT_LOOKBACK_MS = 6 * 60 * 60 * 1000; // 6 hours

export type HmcDirtyAction = 'refresh' | 'removed';

/**
 * Collapse chronological change rows to one action per churchId.
 * Last event wins; `church_removed` → removed, everything else → refresh.
 */
export function coalesceHmcChurchChanges(
  changes: HmcChurchChange[],
): Map<string, HmcDirtyAction> {
  const out = new Map<string, HmcDirtyAction>();
  for (const row of changes) {
    const id = row.churchId.trim();
    if (!id) continue;
    out.set(id, row.action === 'church_removed' ? 'removed' : 'refresh');
  }
  return out;
}

export function defaultHmcSyncSince(nowMs = Date.now()): string {
  return new Date(nowMs - HMC_SYNC_DEFAULT_LOOKBACK_MS).toISOString();
}

/**
 * The furthest back the HMC change feed will answer for.
 *
 * Their limit is 30 days and a `since` beyond it is rejected outright with a 400, not
 * silently truncated. An hour is held back from it so that request latency, or a little
 * clock skew between us and them, cannot land a value that was legal when we computed it
 * on the far side of the boundary by the time they read it.
 */
export const HMC_SYNC_MAX_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000;

/**
 * The watermark to actually ask for, never older than the feed will serve.
 *
 * Without this the sync deadlocks, and it did: the stored cursor drifts past 30 days, every
 * poll 400s on `since cannot be older than 30 days`, and because the cursor is only written
 * after a successful drain, the very thing that would unstick it is downstream of the call
 * that fails. Nothing retries its way out of that — the cron ran every two hours for a week
 * against a cursor 36 days old and could not have succeeded once.
 *
 * Clamping loses the changes between the stored cursor and the floor. That is not a choice
 * between keeping them and dropping them: the feed will not serve that range to anyone. It
 * is a choice between dropping them and never syncing again. `clampedFrom` reports it so the
 * gap is visible in the response rather than inferred from a suspiciously quiet run — a
 * clamp means some linked churches may hold stale denorm and want a manual refresh.
 */
export function clampHmcSyncSince(
  stored: string | null,
  nowMs = Date.now(),
): { since: string; clampedFrom: string | null } {
  if (!stored) return { since: defaultHmcSyncSince(nowMs), clampedFrom: null };

  const parsed = Date.parse(stored);
  // An unparseable cursor is a corrupt one; the default lookback is a better answer than
  // passing it through to be rejected, and it lets the next run write a clean value.
  if (!Number.isFinite(parsed)) return { since: defaultHmcSyncSince(nowMs), clampedFrom: stored };

  const floorMs = nowMs - HMC_SYNC_MAX_LOOKBACK_MS;
  if (parsed >= floorMs) return { since: stored, clampedFrom: null };
  return { since: new Date(floorMs).toISOString(), clampedFrom: stored };
}

export type HmcSyncCursorStore = {
  get(): Promise<string | null>;
  set(cursor: string): Promise<void>;
};

/** Durable watermark in Postgres (works in the bundled Netlify api function). */
export function createPostgresHmcSyncCursorStore(
  key: string = HMC_SYNC_CURSOR_KEY,
): HmcSyncCursorStore {
  return {
    async get() {
      const rows = await db
        .select({ value: AppSyncCursors.value })
        .from(AppSyncCursors)
        .where(eq(AppSyncCursors.key, key))
        .limit(1);
      const trimmed = rows[0]?.value?.trim() ?? '';
      return trimmed || null;
    },
    async set(cursor: string) {
      const value = cursor.trim();
      const stamp = nowISO();
      await db
        .insert(AppSyncCursors)
        .values({ key, value, updatedAt: stamp })
        .onConflictDoUpdate({
          target: AppSyncCursors.key,
          set: { value, updatedAt: stamp },
        });
    },
  };
}

export type HmcChangeFeedDrain = {
  initialSince: string;
  nextSince: string;
  pages: number;
  changeEvents: number;
  dirty: Map<string, HmcDirtyAction>;
  stalled: boolean;
};

/** Page the HMC change feed until drained or maxPages / stall. */
export async function drainHmcChurchChangeFeed(options: {
  since: string;
  fetchChanges?: typeof hmcFetchChurchChanges;
  maxPages?: number;
}): Promise<HmcChangeFeedDrain> {
  const fetchChanges = options.fetchChanges ?? hmcFetchChurchChanges;
  const maxPages = Math.max(1, options.maxPages ?? 20);
  let since = options.since;
  const initialSince = since;
  let nextSince = since;
  let pages = 0;
  let changeEvents = 0;
  let stalled = false;
  const dirty = new Map<string, HmcDirtyAction>();

  for (let i = 0; i < maxPages; i++) {
    const page = await fetchChanges({ since, limit: 500 });
    pages += 1;
    changeEvents += page.changes.length;
    for (const [id, action] of coalesceHmcChurchChanges(page.changes)) {
      dirty.set(id, action);
    }
    nextSince = page.nextSince;
    if (!page.hasMore) break;
    if (page.nextSince === since) {
      stalled = true;
      break;
    }
    since = page.nextSince;
  }

  return { initialSince, nextSince, pages, changeEvents, dirty, stalled };
}

export type HmcDenormSyncResult = {
  since: string;
  nextSince: string;
  pages: number;
  changeEvents: number;
  dirtyIds: number;
  /**
   * The stored cursor that was too old to use, when one was. Non-null means changes older
   * than the feed's window were skipped and some denorm may be stale.
   */
  clampedFrom: string | null;
  linkedIds: number;
  refreshedUsers: number;
  refreshedChurches: number;
  unlinkedUsers: number;
  unlinkedChurches: number;
  missingOnHmc: number;
  errors: string[];
};

type SyncDeps = {
  cursorStore: HmcSyncCursorStore;
  fetchChanges: typeof hmcFetchChurchChanges;
  getChurchById: (id: string) => Promise<HmcLeanChurch | null>;
  now?: () => number;
  maxPages?: number;
};

/**
 * Drain the HMC change feed from the stored watermark and refresh / unlink
 * Harvous rows that reference dirty church ids.
 */
export async function runHmcDenormSync(deps?: Partial<SyncDeps>): Promise<HmcDenormSyncResult> {
  const cursorStore = deps?.cursorStore ?? createPostgresHmcSyncCursorStore();
  const fetchChanges = deps?.fetchChanges ?? hmcFetchChurchChanges;
  const getChurchById = deps?.getChurchById ?? hmcGetChurchByIdForDenorm;
  const now = deps?.now ?? Date.now;
  const maxPages = deps?.maxPages;

  const stored = await cursorStore.get();
  const { since: startSince, clampedFrom } = clampHmcSyncSince(stored, now());
  const drain = await drainHmcChurchChangeFeed({
    since: startSince,
    fetchChanges,
    maxPages,
  });

  const dirtyIds = [...drain.dirty.keys()];
  const errors: string[] = [];
  if (drain.stalled) {
    errors.push('change feed stalled (nextSince did not advance)');
  }

  let linkedIds = 0;
  let refreshedUsers = 0;
  let refreshedChurches = 0;
  let unlinkedUsers = 0;
  let unlinkedChurches = 0;
  let missingOnHmc = 0;

  if (dirtyIds.length > 0) {
    const [userRows, churchRows] = await Promise.all([
      db
        .select({ hmcChurchId: UserMetadata.hmcChurchId })
        .from(UserMetadata)
        .where(and(isNotNull(UserMetadata.hmcChurchId), inArray(UserMetadata.hmcChurchId, dirtyIds))),
      db
        .select({ hmcChurchId: Churches.hmcChurchId })
        .from(Churches)
        .where(and(isNotNull(Churches.hmcChurchId), inArray(Churches.hmcChurchId, dirtyIds))),
    ]);

    const linked = new Set<string>();
    for (const row of userRows) {
      if (row.hmcChurchId) linked.add(row.hmcChurchId);
    }
    for (const row of churchRows) {
      if (row.hmcChurchId) linked.add(row.hmcChurchId);
    }
    linkedIds = linked.size;

    const stamp = nowISO();

    for (const hmcId of linked) {
      const action = drain.dirty.get(hmcId) ?? 'refresh';
      try {
        if (action === 'removed') {
          const userResult = await db
            .update(UserMetadata)
            .set({ hmcChurchId: null, updatedAt: stamp })
            .where(eq(UserMetadata.hmcChurchId, hmcId))
            .returning({ id: UserMetadata.id });
          unlinkedUsers += userResult.length;

          const churchResult = await db
            .update(Churches)
            .set({ hmcChurchId: null, updatedAt: stamp })
            .where(eq(Churches.hmcChurchId, hmcId))
            .returning({ id: Churches.id });
          unlinkedChurches += churchResult.length;
          continue;
        }

        const hmc = await getChurchById(hmcId);
        if (!hmc) {
          missingOnHmc += 1;
          // Soft-unlink directory id; keep display denorm as last known.
          const userResult = await db
            .update(UserMetadata)
            .set({ hmcChurchId: null, updatedAt: stamp })
            .where(eq(UserMetadata.hmcChurchId, hmcId))
            .returning({ id: UserMetadata.id });
          unlinkedUsers += userResult.length;
          const churchResult = await db
            .update(Churches)
            .set({ hmcChurchId: null, updatedAt: stamp })
            .where(eq(Churches.hmcChurchId, hmcId))
            .returning({ id: Churches.id });
          unlinkedChurches += churchResult.length;
          continue;
        }

        const denorm = hmcDenormFields(hmc);
        const userResult = await db
          .update(UserMetadata)
          .set({
            hmcChurchId: hmc.id,
            churchName: denorm.name,
            churchCity: denorm.city,
            churchState: denorm.state,
            churchCountry: denorm.country,
            updatedAt: stamp,
          })
          .where(eq(UserMetadata.hmcChurchId, hmcId))
          .returning({ id: UserMetadata.id });
        refreshedUsers += userResult.length;

        const churchResult = await db
          .update(Churches)
          .set({
            hmcChurchId: hmc.id,
            name: denorm.name,
            city: denorm.city,
            state: denorm.state,
            country: denorm.country,
            updatedAt: stamp,
          })
          .where(eq(Churches.hmcChurchId, hmcId))
          .returning({ id: Churches.id });
        refreshedChurches += churchResult.length;
      } catch (error) {
        errors.push(`${hmcId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (!drain.stalled) {
    try {
      await cursorStore.set(drain.nextSince);
    } catch (error) {
      errors.push(
        `cursor write failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    since: drain.initialSince,
    nextSince: drain.nextSince,
    pages: drain.pages,
    changeEvents: drain.changeEvents,
    dirtyIds: dirtyIds.length,
    clampedFrom,
    linkedIds,
    refreshedUsers,
    refreshedChurches,
    unlinkedUsers,
    unlinkedChurches,
    missingOnHmc,
    errors,
  };
}
