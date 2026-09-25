/**
 * Ministries — the named parts of a church its channels and groups belong to
 * (docs/CHURCH_V2_ROADMAP.md §C).
 *
 * Optional structure: with no ministries a church works exactly as it did, and every space and
 * staffer is church-wide. The two things a ministry changes:
 *   - **who leads what** — a scoped staffer (`ChurchMinistryStaff`) leads only their ministries'
 *     spaces, applied by the staff sync (`StaffScope`), never at read time;
 *   - **who may see a channel** — `Spaces.audience`, enforced by removing follow rows.
 */

import { db, ChurchMinistries, ChurchMinistryStaff, Spaces, and, eq, isNull } from '../db';
import type { StaffScope } from './clerk-org';
import { isPgUndefinedRelation } from './pg-undefined-relation';

export type MinistryRow = typeof ChurchMinistries.$inferSelect;

export const MINISTRY_NAME_MAX = 40;
export const MINISTRY_DESCRIPTION_MAX = 140;

/** Every ministry a church has, live first then archived, each in its own order. */
export async function listMinistriesForOrg(orgId: string): Promise<MinistryRow[]> {
  const rows = await db.select().from(ChurchMinistries).where(eq(ChurchMinistries.orgId, orgId));
  return rows.sort(
    (a, b) =>
      Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt)) ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

/**
 * Pure: the scope the staff sync applies. Every staffer with any rows is scoped to their *live*
 * ministries; one whose ministries are all archived keeps an empty set and leads nothing —
 * failing closed rather than silently widening to the whole church.
 */
export function buildStaffScope(
  staffRows: readonly { userId: string; ministryId: string }[],
  liveMinistryIds: ReadonlySet<string>,
): StaffScope {
  const map = new Map<string, Set<string>>();
  for (const row of staffRows) {
    const set = map.get(row.userId) ?? new Set<string>();
    if (liveMinistryIds.has(row.ministryId)) set.add(row.ministryId);
    map.set(row.userId, set);
  }
  return { ministryIdsByUser: map };
}

/**
 * The scope and the live ministry ids for one church, loaded once per sync. A database without
 * the ministry tables yet reads as "no ministries" (today's behaviour); any other failure throws
 * before the sync writes anything, as a Clerk failure does.
 */
export async function loadStaffScope(
  orgId: string,
): Promise<{ scope: StaffScope | undefined; liveMinistryIds: Set<string> }> {
  try {
    const [ministries, staff] = await Promise.all([
      db
        .select({ id: ChurchMinistries.id })
        .from(ChurchMinistries)
        .where(and(eq(ChurchMinistries.orgId, orgId), isNull(ChurchMinistries.archivedAt))),
      db
        .select({ userId: ChurchMinistryStaff.userId, ministryId: ChurchMinistryStaff.ministryId })
        .from(ChurchMinistryStaff)
        .where(eq(ChurchMinistryStaff.orgId, orgId)),
    ]);
    const liveMinistryIds = new Set(ministries.map((m) => m.id));
    return {
      scope: staff.length ? buildStaffScope(staff, liveMinistryIds) : undefined,
      liveMinistryIds,
    };
  } catch (error) {
    if (isPgUndefinedRelation(error, 'ChurchMinistries') || isPgUndefinedRelation(error, 'ChurchMinistryStaff')) {
      return { scope: undefined, liveMinistryIds: new Set() };
    }
    throw error;
  }
}

/** Pure: a space's ministry as the sync should read it — archived or foreign reads as none. */
export function effectiveSpaceMinistry(
  ministryId: string | null | undefined,
  liveMinistryIds: ReadonlySet<string>,
): string | null {
  return ministryId && liveMinistryIds.has(ministryId) ? ministryId : null;
}

export type ArchivePlan =
  | { action: 'archive'; releaseSpaceIds: string[] }
  | { action: 'refuse'; code: 'MINISTRY_NOT_EMPTY' | 'AUDIENCE_REQUIRES_MINISTRY'; error: string };

/**
 * Pure: can this ministry be archived? A ministry with spaces in it is archived only when staff
 * say to release them to church-wide — and never while one of its channels is restricted, since
 * a restricted channel without a ministry has no audience to restrict to.
 */
export function planArchiveMinistry(input: {
  spaces: readonly { id: string; audience: string }[];
  releaseSpaces: boolean;
}): ArchivePlan {
  if (input.spaces.length === 0) return { action: 'archive', releaseSpaceIds: [] };
  if (!input.releaseSpaces) {
    return {
      action: 'refuse',
      code: 'MINISTRY_NOT_EMPTY',
      error: 'This ministry still has channels or groups. Move them, or archive and make them church-wide.',
    };
  }
  if (input.spaces.some((space) => space.audience !== 'church')) {
    return {
      action: 'refuse',
      code: 'AUDIENCE_REQUIRES_MINISTRY',
      error: 'Open its restricted channels to the whole church first.',
    };
  }
  return { action: 'archive', releaseSpaceIds: input.spaces.map((space) => space.id) };
}

export type AssignPlan =
  | { action: 'assign'; spaceIds: string[] }
  | { action: 'refuse'; code: 'PAIRED_ACROSS_MINISTRIES' | 'AUDIENCE_REQUIRES_MINISTRY'; error: string };

/**
 * Pure: move a space (and, if asked, the channel or group paired with it) into a ministry — or
 * out to church-wide. A group and its companion channel live in one ministry, or the pairing
 * would span two; a restricted channel cannot leave its ministry.
 */
export function planAssignSpace(input: {
  space: { id: string; audience: string };
  pairedSpace: { id: string; ministryId: string | null; audience: string } | null;
  targetMinistryId: string | null;
  movePair: boolean;
}): AssignPlan {
  const moving = [input.space, ...(input.movePair && input.pairedSpace ? [input.pairedSpace] : [])];
  if (!input.targetMinistryId && moving.some((space) => space.audience !== 'church')) {
    return {
      action: 'refuse',
      code: 'AUDIENCE_REQUIRES_MINISTRY',
      error: 'Open this channel to the whole church before making it church-wide.',
    };
  }
  if (input.pairedSpace && !input.movePair && input.pairedSpace.ministryId !== input.targetMinistryId) {
    return {
      action: 'refuse',
      code: 'PAIRED_ACROSS_MINISTRIES',
      error: 'This group and its channel belong together. Move both.',
    };
  }
  return { action: 'assign', spaceIds: moving.map((space) => space.id) };
}

/** Pure: clean a ministry's name; null when unusable. */
export function cleanMinistryName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  return name && name.length <= MINISTRY_NAME_MAX ? name : null;
}

/** The spaces in a ministry (live), with what the plans above need. */
export async function spacesInMinistry(ministryId: string) {
  return db
    .select({ id: Spaces.id, audience: Spaces.audience })
    .from(Spaces)
    .where(and(eq(Spaces.ministryId, ministryId), isNull(Spaces.deletedAt)));
}

export type CreateMinistryResolution =
  | { ok: true; ministryId: string | null }
  | { ok: false; status: 400 | 403 | 404; code: string; error: string };

/**
 * Pure: which ministry a new channel or group goes in. A named one must be live and — for a
 * staffer scoped to ministries — one of theirs. Unnamed: a staffer scoped to exactly one gets it
 * by default, one scoped to several must choose, anyone else gets church-wide.
 */
export function resolveCreateMinistry(input: {
  requested: string | null;
  liveMinistryIds: ReadonlySet<string>;
  /** The creator's live ministries, or null when they are not scoped. */
  creatorMinistryIds: ReadonlySet<string> | null;
}): CreateMinistryResolution {
  const { requested, liveMinistryIds, creatorMinistryIds } = input;
  if (requested) {
    if (!liveMinistryIds.has(requested)) {
      return { ok: false, status: 404, code: 'MINISTRY_NOT_FOUND', error: 'Ministry not found' };
    }
    if (creatorMinistryIds && !creatorMinistryIds.has(requested)) {
      return { ok: false, status: 403, code: 'MINISTRY_OUT_OF_SCOPE', error: 'You lead other ministries' };
    }
    return { ok: true, ministryId: requested };
  }
  if (creatorMinistryIds) {
    if (creatorMinistryIds.size === 1) return { ok: true, ministryId: [...creatorMinistryIds][0] };
    return { ok: false, status: 400, code: 'MINISTRY_REQUIRED', error: 'Choose which ministry this is for' };
  }
  return { ok: true, ministryId: null };
}

/** Load what `resolveCreateMinistry` needs for this creator, and resolve. */
export async function resolveMinistryForNewSpace(
  orgId: string,
  creatorUserId: string,
  requested: unknown,
): Promise<CreateMinistryResolution> {
  const wanted = typeof requested === 'string' && requested.trim() ? requested.trim() : null;
  const { scope, liveMinistryIds } = await loadStaffScope(orgId);
  const creatorMinistryIds = scope?.ministryIdsByUser.get(creatorUserId) ?? null;
  return resolveCreateMinistry({ requested: wanted, liveMinistryIds, creatorMinistryIds });
}
