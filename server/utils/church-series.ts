/**
 * Series as rows — shared by both teaching plans.
 *
 * `ChurchServices.seriesTitle` used to be free text grouped by equality, and
 * the editor's autocomplete existed to stop a pastor typing "Life In the
 * Spirit" in week 4 and splitting the series in two. That was a workaround for
 * the absence of an entity; `ChurchSeries` is the entity. Why, and what it
 * unlocks, is `docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md` §9.
 *
 * **Everything here takes a plan scope, never a bare church.** A series belongs
 * to exactly one plan — `spaceId: null` is the church's own, a set `spaceId` is
 * that ministry's — and the two never mix. That is not tidiness: the space-plan
 * gate lets a granted volunteer leader manage their own room's plan, so a
 * series reachable across scopes would let a youth volunteer rename a row the
 * main service renders.
 *
 * No gate lives in this file. Callers gate first (`assertCanManage*`) and pass
 * the scope they were cleared for, exactly as the service-time helpers do.
 */
import { db, first, ChurchSeries, ChurchServices, and, asc, desc, eq, inArray, isNull, sql } from '../db';
import { SPACE_COVER_PICKER_COLORS } from '@/utils/space-cover';

/**
 * The `db` handle, or a transaction using it.
 *
 * Every write here takes one, because a series must be able to come into being
 * *inside* the transaction that inserts the sermon that named it. Resolving it
 * outside meant an ordinary rejection — "this ministry already has a gathering
 * that day" — left a real, empty series behind in the picker for a sermon that
 * was never created.
 */
type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

/** Longest a series name may be — the same cap the sermon title uses. */
export const SERIES_TITLE_MAX = 120;

/** One line, not a paragraph — the lane that renders it has one line of room. */
export const SERIES_DESCRIPTION_MAX = 200;

/**
 * Colours a series may take.
 *
 * The space cover picker's set rather than a new one, so a church never meets
 * two different five-colour palettes in the same product. Cream/yellow and paper
 * are out for the same reason they are out there: at the width a run band and a
 * card rail are drawn, neither survives contact with the page behind it.
 *
 * Null is always allowed and is the common case — `seriesAccent` derives a
 * stable colour from the row id, so an unset colour is "not chosen", never
 * "no colour".
 */
export const SERIES_COLORS = SPACE_COVER_PICKER_COLORS;

export function isSeriesColor(value: unknown): value is (typeof SERIES_COLORS)[number] {
  return typeof value === 'string' && (SERIES_COLORS as readonly string[]).includes(value);
}

export type SeriesScope = {
  churchId: string;
  /** NULL = the church's own plan; set = that space's plan. */
  spaceId: string | null;
};

export type ChurchSeriesRow = typeof ChurchSeries.$inferSelect;

export type SerializedSeries = {
  id: string;
  title: string;
  /** How many sermons sit under it — what makes a series page worth opening. */
  serviceCount: number;
  /**
   * A SERIES_COLORS token, or null for "not chosen" — which the client turns
   * into a stable derived accent rather than into no colour at all.
   */
  color: string | null;
  description: string | null;
  /** "2027" for a seasonal re-run; null for a series with no sibling. */
  runLabel: string | null;
};

/**
 * Scope predicate, in one place.
 *
 * `eq(spaceId, null)` silently matches nothing in SQL, so a helper that took the
 * shortcut would hand the church plan an empty series list rather than an error
 * — the same trap `listServicesForChurch` had to be fixed for.
 */
function scopeWhere(scope: SeriesScope) {
  return and(
    eq(ChurchSeries.churchId, scope.churchId),
    scope.spaceId === null ? isNull(ChurchSeries.spaceId) : eq(ChurchSeries.spaceId, scope.spaceId),
  );
}

/**
 * Every series in one plan, most recently *used* first.
 *
 * Order is the whole point, inherited from the string era: a pastor adding week
 * 4 wants the series they are in the middle of, and sorting by creation date
 * buries it under whatever the church started with. "Most recently used" means
 * the latest `serviceDate` among its sermons, so a series being preached now
 * outranks one created later and never scheduled.
 */
export async function listSeriesForPlan(scope: SeriesScope): Promise<SerializedSeries[]> {
  const rows = await db
    .select({
      id: ChurchSeries.id,
      title: ChurchSeries.title,
      color: ChurchSeries.color,
      description: ChurchSeries.description,
      runLabel: ChurchSeries.runLabel,
      serviceCount: sql<number>`count(${ChurchServices.id})::int`,
      lastDate: sql<string | null>`max(${ChurchServices.serviceDate})`,
    })
    .from(ChurchSeries)
    .leftJoin(ChurchServices, eq(ChurchServices.seriesId, ChurchSeries.id))
    .where(scopeWhere(scope))
    // Grouping by the primary key would be enough for Postgres, but every
    // selected column is listed for the same reason the original was: the next
    // person to add one should not have to learn that rule to keep this working.
    .groupBy(
      ChurchSeries.id,
      ChurchSeries.title,
      ChurchSeries.color,
      ChurchSeries.description,
      ChurchSeries.runLabel,
      ChurchSeries.createdAt,
    )
    // NULLS LAST so a brand-new series with no sermons yet sits below the ones
    // actually being taught, rather than on top because MAX(date) is NULL.
    .orderBy(sql`max(${ChurchServices.serviceDate}) DESC NULLS LAST`, desc(ChurchSeries.createdAt));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    serviceCount: Number(row.serviceCount ?? 0),
    // Re-checked on the way out, not just on the way in: a token written before
    // the palette last changed must not reach the client as a class name that
    // resolves to nothing. An unrecognised value degrades to "not chosen",
    // which the client already knows how to colour.
    color: isSeriesColor(row.color) ? row.color : null,
    description: row.description ?? null,
    runLabel: row.runLabel ?? null,
  }));
}

/**
 * Titles for a set of sermons, for serializers that render a label per row.
 *
 * A map rather than a join in each caller: both plan endpoints already hold
 * their rows in memory, and one keyed lookup keeps the serializers pure.
 */
export async function seriesTitlesByServiceRows(
  rows: { seriesId: string | null }[],
): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((row) => row.seriesId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const found = await db
    .select({ id: ChurchSeries.id, title: ChurchSeries.title })
    .from(ChurchSeries)
    .where(inArray(ChurchSeries.id, ids));
  return new Map(found.map((row) => [row.id, row.title]));
}

export type SeriesResolution =
  | { ok: true; seriesId: string | null }
  | { ok: false; code: string; error: string };

/**
 * Turn what a write asked for into a `seriesId` inside this plan.
 *
 * Accepts either grain, because both are real:
 *   - `seriesId` — the editor's picker, naming a row that already exists.
 *   - `seriesTitle` — typing a new name, which creates the row. This is a
 *     lookup key resolved to an id at write time, not a second stored copy.
 * An explicit `null` on either detaches the sermon; `undefined` means "leave it".
 *
 * **A `seriesId` from another plan resolves to `SERIES_NOT_FOUND`, never to a
 * cross-scope pointer.** The scope check has to live here rather than in an
 * index, because no index can see which plan a foreign id belongs to.
 */
export async function resolveSeriesForWrite(options: {
  scope: SeriesScope;
  seriesId?: string | null;
  seriesTitle?: string | null;
  userId: string;
  /** Pass the transaction that will write the sermon, so both roll back together. */
  executor?: Executor;
}): Promise<SeriesResolution> {
  const { scope, userId } = options;
  const exec: Executor = options.executor ?? db;

  if (options.seriesId !== undefined) {
    const id = String(options.seriesId ?? '').trim();
    if (!id) return { ok: true, seriesId: null };
    const row = first(
      await exec
        .select({ id: ChurchSeries.id })
        .from(ChurchSeries)
        .where(and(eq(ChurchSeries.id, id), scopeWhere(scope)))
        .limit(1),
    );
    if (!row) {
      return {
        ok: false,
        code: 'SERIES_NOT_FOUND',
        error: 'That series is not part of this plan',
      };
    }
    return { ok: true, seriesId: row.id };
  }

  if (options.seriesTitle !== undefined) {
    const title = String(options.seriesTitle ?? '').trim().slice(0, SERIES_TITLE_MAX);
    if (!title) return { ok: true, seriesId: null };
    return { ok: true, seriesId: await findOrCreateSeries(scope, title, userId, exec) };
  }

  return { ok: true, seriesId: null };
}

/**
 * Find by name inside the plan, case-insensitively, or create.
 *
 * Case-insensitive because that is the fork the row exists to prevent: "Life In
 * the Spirit" in week 4 must land on the same series as "Life in the Spirit" in
 * week 3, keeping the spelling already chosen rather than minting a twin.
 *
 * The unique index is the real guard, not the SELECT — two staff saving week 4
 * at once would both find nothing and both insert. Handled with
 * `ON CONFLICT DO NOTHING` and a re-read rather than by catching the violation,
 * because this runs inside the sermon's transaction: a raised unique violation
 * would abort that transaction, taking the sermon with it. `DO NOTHING` never
 * raises, so the loser of the race simply re-reads the winner's row.
 */
export async function findOrCreateSeries(
  scope: SeriesScope,
  title: string,
  userId: string,
  executor: Executor = db,
): Promise<string> {
  const existing = await findSeriesByTitle(scope, title, executor);
  if (existing) return existing;

  await executor
    .insert(ChurchSeries)
    .values({
      id: `csrs_${crypto.randomUUID()}`,
      churchId: scope.churchId,
      spaceId: scope.spaceId,
      title,
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: null,
    })
    .onConflictDoNothing();

  const settled = await findSeriesByTitle(scope, title, executor);
  if (!settled) throw new Error(`Could not resolve series "${title}"`);
  return settled;
}

/**
 * The unlabelled series of this name in this plan, if there is one.
 *
 * **`runLabel IS NULL` is the whole point.** Once seasonal runs exist, a plan
 * can hold "Advent · 2026" and "Advent · 2027", and a lookup by title alone
 * would be ambiguous — it is the free-text combobox's resolution path, so an
 * ambiguous answer there is how a sermon silently joins last year's run.
 *
 * Restricting it to the unlabelled row keeps that path exactly as it was: one
 * answer, or none. Labelled runs are only ever reached by id, from the flows
 * that created them. It also keeps the typo guard intact — this is still what
 * makes "Life In the Spirit" resolve to "Life in the Spirit" rather than
 * forking it.
 */
async function findSeriesByTitle(
  scope: SeriesScope,
  title: string,
  executor: Executor = db,
): Promise<string | null> {
  const row = first(
    await executor
      .select({ id: ChurchSeries.id })
      .from(ChurchSeries)
      .where(
        and(
          scopeWhere(scope),
          sql`lower(${ChurchSeries.title}) = lower(${title})`,
          isNull(ChurchSeries.runLabel),
        ),
      )
      .limit(1),
  );
  return row?.id ?? null;
}

/** One series and the sermons under it, ascending — the staff series view. */
export async function getSeriesWithServices(
  scope: SeriesScope,
  seriesId: string,
): Promise<{ series: ChurchSeriesRow; services: (typeof ChurchServices.$inferSelect)[] } | null> {
  const series = first(
    await db
      .select()
      .from(ChurchSeries)
      .where(and(eq(ChurchSeries.id, seriesId), scopeWhere(scope)))
      .limit(1),
  );
  if (!series) return null;
  const services = await db
    .select()
    .from(ChurchServices)
    .where(eq(ChurchServices.seriesId, series.id))
    .orderBy(asc(ChurchServices.serviceDate));
  return { series, services };
}

/**
 * Edit a series inside the plan. Returns the reason on refusal so the route can
 * pick a status without re-deriving why.
 *
 * Every field is optional and `undefined` means "leave it" — the same
 * distinction `resolveSeriesForWrite` draws, so a colour change never has to
 * resend a title and risk racing someone else's rename. `null` on `color` or
 * `description` clears it; a title cannot be cleared, only replaced.
 *
 * This was `renameSeries`. It grew rather than gaining a sibling because the
 * uniqueness check and the scoped `WHERE` are the parts worth having once, and
 * a second writer touching the same row is how two sources of truth start.
 */
export async function updateSeries(
  scope: SeriesScope,
  seriesId: string,
  changes: {
    title?: string;
    color?: string | null;
    description?: string | null;
  },
): Promise<{ ok: true; series: ChurchSeriesRow } | { ok: false; code: string; error: string }> {
  const patch: Partial<typeof ChurchSeries.$inferInsert> = {};

  if (changes.title !== undefined) {
    const trimmed = changes.title.trim().slice(0, SERIES_TITLE_MAX);
    if (!trimmed) return { ok: false, code: 'BAD_REQUEST', error: 'A series name is required' };

    const clash = await findSeriesByTitle(scope, trimmed);
    if (clash && clash !== seriesId) {
      return {
        ok: false,
        code: 'SERIES_TITLE_TAKEN',
        error: 'This plan already has a series with that name',
      };
    }
    patch.title = trimmed;
  }

  if (changes.color !== undefined) {
    // Refused rather than silently dropped: a picker sending a colour this
    // server does not know is a bug in the picker, and quietly storing null
    // would show the pastor a colour they did not choose.
    if (changes.color !== null && !isSeriesColor(changes.color)) {
      return { ok: false, code: 'BAD_REQUEST', error: 'That is not a series colour' };
    }
    patch.color = changes.color;
  }

  if (changes.description !== undefined) {
    const trimmed = changes.description?.trim().slice(0, SERIES_DESCRIPTION_MAX) ?? '';
    // An empty description is an absent one. Storing '' would make every
    // "does this series have a description" check a two-part test forever.
    patch.description = trimmed || null;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, code: 'BAD_REQUEST', error: 'Nothing to change' };
  }

  const updated = await db
    .update(ChurchSeries)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(ChurchSeries.id, seriesId), scopeWhere(scope)))
    .returning();
  const row = first(updated);
  if (!row) return { ok: false, code: 'SERIES_NOT_FOUND', error: 'That series is not part of this plan' };
  return { ok: true, series: row };
}

/**
 * Delete a series and detach its sermons — **never** delete the sermons.
 *
 * A destructive act on a label must not be a destructive act on the calendar: a
 * pastor tidying up series names should not discover they erased a quarter of
 * preaching. One transaction so a half-deleted series can't leave sermons
 * pointing at a row that is gone.
 */
export async function deleteSeries(
  scope: SeriesScope,
  seriesId: string,
): Promise<{ ok: true; detached: number } | { ok: false; code: string; error: string }> {
  const exists = first(
    await db
      .select({ id: ChurchSeries.id })
      .from(ChurchSeries)
      .where(and(eq(ChurchSeries.id, seriesId), scopeWhere(scope)))
      .limit(1),
  );
  if (!exists) {
    return { ok: false, code: 'SERIES_NOT_FOUND', error: 'That series is not part of this plan' };
  }

  let detached = 0;
  await db.transaction(async (tx) => {
    const cleared = await tx
      .update(ChurchServices)
      .set({ seriesId: null })
      .where(eq(ChurchServices.seriesId, seriesId))
      .returning({ id: ChurchServices.id });
    detached = cleared.length;
    await tx.delete(ChurchSeries).where(eq(ChurchSeries.id, seriesId));
  });
  return { ok: true, detached };
}
