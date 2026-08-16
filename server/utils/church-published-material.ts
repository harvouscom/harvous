/**
 * Published material claiming the week — or the run — it accompanies.
 *
 * This is the inversion `docs/future/CHURCH_STUDY_MATERIAL_LINKING.md` decided
 * on: **material claims the service; the service does not point at a room.**
 * A note published into a ministry channel carries a claim on the service or
 * series it is for, and "This Sunday" renders whatever actually claimed it.
 *
 * Not to be confused with its neighbour. `church-service-attachments.ts` is
 * staff prep — "what I am pulling from this week" — and is never congregant
 * facing. This is the opposite direction and the opposite audience: authored in
 * a channel by whoever made the material, read by the congregation.
 *
 * **Two grains, two tables, one answer.** A discussion guide claims one week;
 * an eight-week study claims the run. The congregant asks only ever one
 * question — "what is there for this Sunday?" — so the read unions both and
 * hands back a flat list per service. Claiming a series is what stops a pastor
 * planning Romans from attaching the same note eight times, which was the third
 * of the linking doc's four complaints about the pointer this replaced.
 *
 * **The row is not the relation.** Every claim is re-resolved on read, the way
 * `church-space-channel-links.ts` re-resolves a pairing: the note must still
 * exist, still sit in a live, active room, that room must still belong to this
 * org, and it must still be a ministry channel. A channel converted to a Shared
 * Space stops publishing to the congregation rather than publishing wrongly.
 * There is no tombstone to surface and no cleanup job to owe.
 *
 * **Privacy.** Nothing here selects a user column, and `publishedByUserId` is
 * written but never returned — the congregant learns that their church
 * published something, not who. `Notes.startedFromServiceId` is a different
 * fact (the congregant's *own* note, scoped to one user) and is not read here.
 */
import {
  db,
  first,
  and,
  eq,
  inArray,
  isNull,
  asc,
  ChurchSeries,
  ChurchSeriesPublishedNotes,
  ChurchServices,
  ChurchServicePublishedNotes,
  NoteThreads,
  Notes,
  SpaceNotes,
  Spaces,
} from '../db';
import { isMinistryBroadcastSpaceRow } from './channel-publish-cadence';

/**
 * How many claims one service will render.
 *
 * The doc's argument for a list over a button was that several ministries can
 * legitimately speak to the same Sunday — Adult Ed *and* Students *and* leader
 * notes. That is a handful, not a feed; past this the card has stopped being a
 * card. Applied per service after the union, so a series claim cannot crowd out
 * the week's own material.
 */
export const PUBLISHED_MATERIAL_MAX_PER_SERVICE = 12;

/** How many plan rows one note may claim in a single write. */
export const PUBLISHED_MATERIAL_MAX_TARGETS = 20;

export type PublishedMaterialItem = {
  noteId: string;
  title: string;
  /** The ministry channel it was published into, re-verified on this read. */
  channelId: string;
  channelTitle: string;
  /** Whether it claimed this week specifically, or the run this week belongs to. */
  grain: 'service' | 'series';
};

type ClaimRow = { noteId: string; createdAt: Date };

/** A note, and the live ministry channel it is published in. */
type ResolvedNote = { noteId: string; title: string; channelId: string; channelTitle: string };

/**
 * Resolve claimed notes down to the ones a congregant may actually be shown.
 *
 * One query for the whole batch. A note that fails any check is simply absent —
 * the list is "what is here now", so a deleted note or a converted room removes
 * a row rather than rendering a dead one.
 */
async function resolveClaimedNotes(
  noteIds: readonly string[],
  orgId: string,
): Promise<Map<string, ResolvedNote>> {
  const out = new Map<string, ResolvedNote>();
  if (noteIds.length === 0) return out;

  const rows = await db
    .select({
      noteId: SpaceNotes.noteId,
      title: Notes.title,
      spaceId: Spaces.id,
      spaceTitle: Spaces.title,
      spaceType: Spaces.type,
      spaceOrgId: Spaces.orgId,
      spaceIsActive: Spaces.isActive,
    })
    .from(SpaceNotes)
    .innerJoin(Spaces, eq(Spaces.id, SpaceNotes.spaceId))
    .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
    .where(
      and(
        inArray(SpaceNotes.noteId, [...noteIds]),
        /* Still in the room. Pulling a note out of the channel retracts it from
           the congregation, which is the only retract gesture staff have. */
        isNull(SpaceNotes.removedAt),
        isNull(Spaces.deletedAt),
        eq(Spaces.orgId, orgId),
      ),
    )
    .orderBy(asc(SpaceNotes.spaceId));

  for (const row of rows) {
    if (!row.spaceIsActive) continue;
    if (!isMinistryBroadcastSpaceRow({ type: row.spaceType, orgId: row.spaceOrgId })) continue;
    /* A note can sit in more than one room; the first ministry channel by id
       wins so the same claim renders the same attribution on every read. */
    if (out.has(row.noteId)) continue;
    out.set(row.noteId, {
      noteId: row.noteId,
      title: row.title ?? 'Untitled',
      channelId: row.spaceId,
      channelTitle: row.spaceTitle,
    });
  }
  return out;
}

/**
 * Everything published for each of these services, keyed by service id.
 *
 * Services are passed in with their `seriesId` already resolved because the
 * caller has the plan rows in hand — re-reading them here would be a second
 * query for a fact the payload already knows.
 *
 * A service with nothing attached is **absent from the map**, not present with
 * an empty array: zero is the common case and the caller renders nothing for it.
 */
export async function publishedMaterialForServices(
  services: readonly { id: string; seriesId: string | null }[],
  orgId: string,
): Promise<Map<string, PublishedMaterialItem[]>> {
  const out = new Map<string, PublishedMaterialItem[]>();
  if (services.length === 0) return out;

  const serviceIds = [...new Set(services.map((service) => service.id))];
  const seriesIds = [
    ...new Set(services.map((service) => service.seriesId).filter((id): id is string => Boolean(id))),
  ];

  const [serviceClaims, seriesClaims] = await Promise.all([
    db
      .select({
        serviceId: ChurchServicePublishedNotes.serviceId,
        noteId: ChurchServicePublishedNotes.noteId,
        createdAt: ChurchServicePublishedNotes.createdAt,
      })
      .from(ChurchServicePublishedNotes)
      .where(inArray(ChurchServicePublishedNotes.serviceId, serviceIds))
      .orderBy(asc(ChurchServicePublishedNotes.createdAt)),
    seriesIds.length > 0
      ? db
          .select({
            seriesId: ChurchSeriesPublishedNotes.seriesId,
            noteId: ChurchSeriesPublishedNotes.noteId,
            createdAt: ChurchSeriesPublishedNotes.createdAt,
          })
          .from(ChurchSeriesPublishedNotes)
          .where(inArray(ChurchSeriesPublishedNotes.seriesId, seriesIds))
          .orderBy(asc(ChurchSeriesPublishedNotes.createdAt))
      : Promise.resolve([]),
  ]);

  if (serviceClaims.length === 0 && seriesClaims.length === 0) return out;

  const resolved = await resolveClaimedNotes(
    [...new Set([...serviceClaims, ...seriesClaims].map((claim) => claim.noteId))],
    orgId,
  );
  if (resolved.size === 0) return out;

  const byService = new Map<string, ClaimRow[]>();
  for (const claim of serviceClaims) {
    const list = byService.get(claim.serviceId);
    if (list) list.push(claim);
    else byService.set(claim.serviceId, [claim]);
  }
  const bySeries = new Map<string, ClaimRow[]>();
  for (const claim of seriesClaims) {
    const list = bySeries.get(claim.seriesId);
    if (list) list.push(claim);
    else bySeries.set(claim.seriesId, [claim]);
  }

  for (const service of services) {
    const items: PublishedMaterialItem[] = [];
    const seen = new Set<string>();

    /* This week's own material first, then the run's. A note claiming both
       grains is the specific claim — it was attached to this week on purpose. */
    for (const claim of byService.get(service.id) ?? []) {
      const note = resolved.get(claim.noteId);
      if (!note || seen.has(note.noteId)) continue;
      seen.add(note.noteId);
      items.push({ ...note, grain: 'service' });
    }
    for (const claim of service.seriesId ? bySeries.get(service.seriesId) ?? [] : []) {
      const note = resolved.get(claim.noteId);
      if (!note || seen.has(note.noteId)) continue;
      seen.add(note.noteId);
      items.push({ ...note, grain: 'series' });
    }

    if (items.length > 0) {
      out.set(service.id, items.slice(0, PUBLISHED_MATERIAL_MAX_PER_SERVICE));
    }
  }
  return out;
}

export type PublishedMaterialClaims = { serviceIds: string[]; seriesIds: string[] };

/**
 * What this note currently claims — the attach control's own state.
 *
 * Unscoped on purpose: it reports the note's rows, and the caller has already
 * been gated on the note. Showing fewer claims than exist would make the picker
 * silently drop one on the next save, because the write is a replace-set.
 */
export async function publishedMaterialClaimsForNote(
  noteId: string,
): Promise<PublishedMaterialClaims> {
  const [services, series] = await Promise.all([
    db
      .select({ serviceId: ChurchServicePublishedNotes.serviceId })
      .from(ChurchServicePublishedNotes)
      .where(eq(ChurchServicePublishedNotes.noteId, noteId)),
    db
      .select({ seriesId: ChurchSeriesPublishedNotes.seriesId })
      .from(ChurchSeriesPublishedNotes)
      .where(eq(ChurchSeriesPublishedNotes.noteId, noteId)),
  ]);
  return {
    serviceIds: services.map((row) => row.serviceId),
    seriesIds: series.map((row) => row.seriesId),
  };
}

export type PublishedMaterialWriteResult =
  | { ok: true }
  | { ok: false; status: 400 | 404; error: string; code: string };

/**
 * Is this note a step of a published study plan?
 *
 * `publishSeriesAsStudyPlan` writes `ChurchServicePublishedNotes` too — one row
 * per step, claiming the week that step teaches — and `publishedWeekIdsInThread`
 * reads exactly those rows to decide which weeks a republish should skip. A
 * replace-set over such a note would delete a claim it does not own, and the
 * next republish would then rebuild a step that already exists.
 *
 * So the two writers are kept off each other's rows: the series machinery owns
 * a step's claim, and the attach control refuses to touch one. The check asks
 * the database rather than a flag, for the same reason `isPublishedSeriesThread`
 * does — provenance that a request body could assert is not provenance.
 */
async function isPublishedSeriesStep(noteId: string): Promise<boolean> {
  return Boolean(
    first(
      await db
        .select({ id: ChurchSeries.id })
        .from(NoteThreads)
        .innerJoin(ChurchSeries, eq(ChurchSeries.publishedThreadId, NoteThreads.threadId))
        .where(eq(NoteThreads.noteId, noteId))
        .limit(1),
    ),
  );
}

/**
 * Replace everything this note claims.
 *
 * Replace-set rather than attach/detach endpoints, for the same reason
 * `setServiceAttachments` is: the picker holds the whole list, and "remove the
 * last one" should not be a different shape of request from "remove one of
 * three".
 *
 * **Targets are re-scoped here rather than trusted.** Every service and series
 * must belong to this church, which is what stops a channel leader in one
 * church attaching to another church's Sunday. Scope rides `ChurchSeries`'
 * own `churchId`, so a space-plan series and a church-plan series stay
 * different rows and neither can be claimed through the other.
 *
 * The caller is responsible for the *authoring* gate — that this user may
 * publish in the room the note lives in. This function will not infer it, in
 * the same way `setServiceAttachments` leaves the plan gate to its route.
 */
export async function setPublishedMaterialForNote(input: {
  noteId: string;
  serviceIds: readonly string[];
  seriesIds: readonly string[];
  /** Null for a churchless Shared Space's plan, matching `ChurchServices.churchId`. */
  churchId: string | null;
  userId: string;
}): Promise<PublishedMaterialWriteResult> {
  const { noteId, churchId, userId } = input;
  const serviceIds = [...new Set(input.serviceIds)];
  const seriesIds = [...new Set(input.seriesIds)];

  if (serviceIds.length + seriesIds.length > PUBLISHED_MATERIAL_MAX_TARGETS) {
    return {
      ok: false,
      status: 400,
      error: `At most ${PUBLISHED_MATERIAL_MAX_TARGETS} attachments on one note`,
      code: 'TOO_MANY_ATTACHMENTS',
    };
  }

  if (await isPublishedSeriesStep(noteId)) {
    return {
      ok: false,
      status: 400,
      error: 'This note is a step of a published study plan — its week is set by the plan',
      code: 'PUBLISHED_SERIES_STEP',
    };
  }

  const churchScope = churchId === null ? isNull(ChurchServices.churchId) : eq(ChurchServices.churchId, churchId);

  if (serviceIds.length > 0) {
    const owned = await db
      .select({ id: ChurchServices.id })
      .from(ChurchServices)
      .where(and(inArray(ChurchServices.id, serviceIds), churchScope));
    if (owned.length !== serviceIds.length) {
      return { ok: false, status: 404, error: 'Entry not found', code: 'SERVICE_NOT_FOUND' };
    }
  }

  if (seriesIds.length > 0) {
    const owned = await db
      .select({ id: ChurchSeries.id })
      .from(ChurchSeries)
      .where(
        and(
          inArray(ChurchSeries.id, seriesIds),
          churchId === null ? isNull(ChurchSeries.churchId) : eq(ChurchSeries.churchId, churchId),
        ),
      );
    if (owned.length !== seriesIds.length) {
      return { ok: false, status: 404, error: 'Series not found', code: 'SERIES_NOT_FOUND' };
    }
  }

  const timestamp = new Date();
  await db.transaction(async (tx) => {
    await tx
      .delete(ChurchServicePublishedNotes)
      .where(eq(ChurchServicePublishedNotes.noteId, noteId));
    await tx.delete(ChurchSeriesPublishedNotes).where(eq(ChurchSeriesPublishedNotes.noteId, noteId));

    if (serviceIds.length > 0) {
      await tx.insert(ChurchServicePublishedNotes).values(
        serviceIds.map((serviceId) => ({
          id: `svcpub_${crypto.randomUUID()}`,
          serviceId,
          noteId,
          publishedByUserId: userId,
          createdAt: timestamp,
        })),
      );
    }
    if (seriesIds.length > 0) {
      await tx.insert(ChurchSeriesPublishedNotes).values(
        seriesIds.map((seriesId) => ({
          id: `serpub_${crypto.randomUUID()}`,
          seriesId,
          noteId,
          publishedByUserId: userId,
          createdAt: timestamp,
        })),
      );
    }
  });

  return { ok: true };
}
