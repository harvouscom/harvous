/**
 * Is this link already on a shelf that is not the submitter's to publish?
 *
 * `snapshotResource` refuses a church- or space-owned item id outright — its
 * `WHERE` is scoped to `findPersonalLibrary(userId)` — which settles the direct
 * case the way `snapshotTemplate`'s `isNull(orgId)` settles it for templates.
 *
 * It does not settle the one that actually happens. `GET /api/library/church`
 * serves `sourceUrl` to every admitted member, so a member can read the church
 * row, paste that URL into their own shelf, and own a personal `LibraryItems`
 * row that is — in the database and on screen — indistinguishable from a link
 * they found themselves. `LibraryItems` carries no origin column of any kind
 * (unlike `Notes.copiedFrom*`), so there is nothing to key a provenance rule on.
 * Retyping leaves no trace by construction.
 *
 * So the comparison is the **URL**, made at submit time, against the shelves the
 * submitter can actually see: their connected church and the spaces they are in.
 * Deliberately not every church everywhere — a popular public article would then
 * become unshareable by anyone because some unrelated church happened to list it.
 */
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db, LibraryItems, ResourceLibraries, SpaceMemberships, Spaces } from '../db';
import { first } from '../db/helpers';
import { resolveChurchLibraryViewer } from './church-library-access';
import { validateResourceUrl } from '@/utils/validation';

export type ChurchMaterialVerdict =
  /** Nothing of the submitter's church or rooms matches this URL. */
  | { kind: 'clear' }
  /**
   * A match marked `access: 'leaders'`. Explicitly restricted material — the
   * church chose to keep it from its own members — so this is refused rather
   * than reviewed. No ambiguity to weigh.
   */
  | { kind: 'restricted'; sourceName: string }
  /**
   * A match visible to members. Allowed, because the submitter may well have
   * found the same public article independently, and Discover is curated — a
   * person reads every submission. Recorded so that person is told.
   */
  | { kind: 'curated'; sourceName: string };

/** One shelf the submitter can see, and what to call it if it matches. */
interface CandidateShelf {
  libraryId: string;
  name: string;
}

/**
 * The church library and every space library the submitter belongs to.
 *
 * Two queries rather than `findChurchLibrary` / `findSpaceLibrary` per space:
 * a member of nine rooms would otherwise cost nine round trips on a path that
 * runs inside a submit.
 */
async function shelvesVisibleTo(userId: string): Promise<CandidateShelf[]> {
  const owners: Array<{ ownerKind: string; ownerId: string; name: string }> = [];

  const viewer = await resolveChurchLibraryViewer(userId);
  if (viewer.kind !== 'none') {
    owners.push({ ownerKind: 'church', ownerId: viewer.church.id, name: viewer.church.name });
  }

  /*
   * Owned **or** joined, and the first half is why this is not `getMemberOfSpaces`.
   *
   * That helper answers a deliberately different question — its own comment says
   * "spaces the user belongs to *but does not own*", and it enforces it with
   * `ne(Spaces.userId, userId)`. Reusing it here silently skipped every room the
   * submitter runs, which are the rooms whose shelves they are most likely to be
   * republishing from. A live walk caught it: a leaders-only link in a space I
   * owned sailed through the gate.
   */
  for (const space of await db
    .selectDistinct({ id: Spaces.id, title: Spaces.title })
    .from(Spaces)
    .leftJoin(SpaceMemberships, eq(SpaceMemberships.spaceId, Spaces.id))
    .where(
      and(
        isNull(Spaces.deletedAt),
        or(eq(Spaces.userId, userId), eq(SpaceMemberships.userId, userId)),
      ),
    )) {
    owners.push({ ownerKind: 'space', ownerId: space.id, name: space.title ?? 'a shared space' });
  }

  if (owners.length === 0) return [];

  const rows = await db
    .select({
      id: ResourceLibraries.id,
      ownerKind: ResourceLibraries.ownerKind,
      ownerId: ResourceLibraries.ownerId,
    })
    .from(ResourceLibraries)
    .where(
      inArray(
        ResourceLibraries.ownerId,
        owners.map((o) => o.ownerId),
      ),
    );

  /* Matched on the pair, not on `ownerId` alone: the query above narrows by id
     only, and a Clerk user id could in principle equal a space id. */
  return rows.flatMap((row) => {
    const owner = owners.find((o) => o.ownerId === row.ownerId && o.ownerKind === row.ownerKind);
    return owner ? [{ libraryId: row.id, name: owner.name }] : [];
  });
}

/**
 * @param sourceUrl The URL as snapshotted. Normalised here with the same
 *   `validateResourceUrl` the install path uses, so the comparison matches how
 *   these rows are actually stored.
 */
export async function classifySubmittedResourceUrl(
  userId: string,
  sourceUrl: string,
): Promise<ChurchMaterialVerdict> {
  const validation = validateResourceUrl(sourceUrl);
  /* Nothing to compare against. The snapshot already accepted this URL, so a
     failure here is a shape this normaliser will not parse rather than a reason
     to refuse the submission. */
  if (!validation.isValid || !validation.normalizedUrl) return { kind: 'clear' };

  const shelves = await shelvesVisibleTo(userId);
  if (shelves.length === 0) return { kind: 'clear' };

  const matches = await db
    .select({ libraryId: LibraryItems.libraryId, access: LibraryItems.access })
    .from(LibraryItems)
    .where(
      and(
        inArray(
          LibraryItems.libraryId,
          shelves.map((s) => s.libraryId),
        ),
        eq(LibraryItems.sourceUrl, validation.normalizedUrl),
        isNull(LibraryItems.archivedAt),
      ),
    );
  if (matches.length === 0) return { kind: 'clear' };

  const nameFor = (libraryId: string) =>
    shelves.find((s) => s.libraryId === libraryId)?.name ?? 'your church';

  /* Leaders-only wins over a members-visible match elsewhere: the strictest
     shelf the link sits on is the one that decides. */
  const restricted = first(matches.filter((m) => m.access === 'leaders'));
  if (restricted) return { kind: 'restricted', sourceName: nameFor(restricted.libraryId) };

  return { kind: 'curated', sourceName: nameFor(matches[0].libraryId) };
}
