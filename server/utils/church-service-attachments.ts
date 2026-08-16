/**
 * Resources a planned sermon or entry draws on — staff-side prep.
 *
 * Read as "what I am pulling from this week", not as anything the congregation
 * sees. `docs/future/CHURCH_STUDY_MATERIAL_LINKING.md` is the post-mortem of
 * the single pointer (`ChurchServices.channelSpaceId`) that was built and torn
 * out, and it names the fix as an inversion: published material claims the
 * service, rather than the service pointing at a room. That inversion is built
 * — `church-published-material.ts` — and this is still not a version of it: it
 * is the other direction entirely, many-to-many, and never congregant-facing.
 * Resources here are a pastor's prep shelf; material there is addressed to the
 * room. Do not merge them because both hang off a service.
 *
 * Shared by both plan routes so the church plan and a space plan cannot drift
 * on what an attachment means or who may make one.
 */
import {
  db,
  first,
  and,
  eq,
  inArray,
  isNull,
  asc,
  ChurchServiceLibraryItems,
  ChurchServices,
  LibraryItems,
  ResourceLibraries,
} from '../db';

/** Enough for a week's prep; small enough that a plan read stays one query. */
export const ATTACHMENTS_MAX = 20;

export type AttachedResource = {
  itemId: string;
  title: string;
  kind: string;
  sourceDomain: string | null;
  sourceUrl: string | null;
  fileName: string | null;
};

/**
 * Attachments for a batch of services, keyed by service id.
 *
 * One query for the join and one for the items, rather than per-service reads —
 * a plan is bounded to a quarter but that is still fifty rows.
 */
export async function attachmentsByServiceIds(
  serviceIds: readonly string[],
): Promise<Map<string, AttachedResource[]>> {
  const out = new Map<string, AttachedResource[]>();
  if (serviceIds.length === 0) return out;

  const links = await db
    .select()
    .from(ChurchServiceLibraryItems)
    .where(inArray(ChurchServiceLibraryItems.serviceId, [...serviceIds]))
    .orderBy(asc(ChurchServiceLibraryItems.sortOrder));
  if (links.length === 0) return out;

  const items = await db
    .select()
    .from(LibraryItems)
    .where(inArray(LibraryItems.id, [...new Set(links.map((l) => l.libraryItemId))]));
  const itemById = new Map(items.map((i) => [i.id, i]));

  for (const link of links) {
    const item = itemById.get(link.libraryItemId);
    /* An archived item still resolves — a week that cited it should read as
       "this is what we used", not lose the row. */
    if (!item) continue;
    const entry: AttachedResource = {
      itemId: item.id,
      title: item.title,
      kind: item.kind,
      sourceDomain: item.sourceDomain,
      sourceUrl: item.sourceUrl,
      fileName: item.fileName,
    };
    const list = out.get(link.serviceId);
    if (list) list.push(entry);
    else out.set(link.serviceId, [entry]);
  }
  return out;
}

export type AttachmentWriteResult =
  | { ok: true }
  | { ok: false; status: 400 | 404; error: string; code: string };

/**
 * Replace a service's attachments wholesale.
 *
 * Replace-set rather than add/remove endpoints: the editor pane holds the whole
 * list in hand, and two endpoints would make "remove the last one" a different
 * shape of request from "remove one of three".
 *
 * Both the service and every item are re-scoped here rather than trusted:
 * `serviceId` must belong to the plan the caller was gated on, and every item
 * must live in the shelf that plan draws from — the church's library, or the
 * room's own when the plan has no church behind it. A personal item is refused
 * either way: it is invisible to everyone else, so attaching one would put a
 * resource on the plan that nobody but its owner can open.
 */
export async function setServiceAttachments(input: {
  serviceId: string;
  itemIds: readonly string[];
  /** Null for a churchless Shared Space's plan, which draws from its own shelf. */
  churchId: string | null;
  /** Null for the church plan; a space id narrows to that plan. */
  spaceId: string | null;
  userId: string;
}): Promise<AttachmentWriteResult> {
  const { serviceId, itemIds, churchId, spaceId, userId } = input;

  if (itemIds.length > ATTACHMENTS_MAX) {
    return {
      ok: false,
      status: 400,
      error: `At most ${ATTACHMENTS_MAX} resources on one entry`,
      code: 'TOO_MANY_ATTACHMENTS',
    };
  }

  const service = first(
    await db
      .select({ id: ChurchServices.id })
      .from(ChurchServices)
      .where(
        and(
          eq(ChurchServices.id, serviceId),
          churchId === null
            ? isNull(ChurchServices.churchId)
            : eq(ChurchServices.churchId, churchId),
          /* `eq(col, null)` is never true in SQL — the church plan is the
             rows where spaceId IS NULL, and that needs its own predicate. */
          spaceId === null
            ? isNull(ChurchServices.spaceId)
            : eq(ChurchServices.spaceId, spaceId),
        ),
      )
      .limit(1),
  );
  if (!service) {
    return { ok: false, status: 404, error: 'Entry not found', code: 'SERVICE_NOT_FOUND' };
  }

  const unique = [...new Set(itemIds)];
  if (unique.length > 0) {
    const owned = await db
      .select({ id: LibraryItems.id })
      .from(LibraryItems)
      .innerJoin(ResourceLibraries, eq(LibraryItems.libraryId, ResourceLibraries.id))
      .where(
        and(
          inArray(LibraryItems.id, unique),
          /* The shelf the plan draws from: the church's, or — with no church
             behind it — the room's own, the one `ensureSpaceLibrary` creates. */
          ...(churchId === null
            ? [eq(ResourceLibraries.ownerKind, 'space'), eq(ResourceLibraries.ownerId, spaceId ?? '')]
            : [eq(ResourceLibraries.ownerKind, 'church'), eq(ResourceLibraries.ownerId, churchId)]),
        ),
      );
    if (owned.length !== unique.length) {
      return {
        ok: false,
        status: 400,
        error: 'Those resources are not in your church’s library',
        code: 'ITEM_NOT_FOUND',
      };
    }
  }

  const timestamp = new Date();
  await db.transaction(async (tx) => {
    await tx
      .delete(ChurchServiceLibraryItems)
      .where(eq(ChurchServiceLibraryItems.serviceId, serviceId));
    if (unique.length === 0) return;
    await tx.insert(ChurchServiceLibraryItems).values(
      unique.map((libraryItemId, index) => ({
        id: `svcli_${crypto.randomUUID()}`,
        serviceId,
        libraryItemId,
        attachedByUserId: userId,
        /* Order is the order they were picked — a curator's sequence is a
           statement about how they will use them. */
        sortOrder: index,
        createdAt: timestamp,
      })),
    );
  });

  return { ok: true };
}
