/**
 * Public links for a personal Thread — a cluster of notes connected to each other.
 *
 * A personal Thread has no row of its own: it is addressed by its main note and recomputed from
 * `NoteConnections` every time it is read. Its link therefore lives in `StudyThreadShares`, a row
 * that names one member note (the anchor). Owner reads walk the cluster and take a share from
 * **any** member, so the link survives the main note changing as notes are connected; the public
 * read walks the cluster from the anchor, so the link is live — notes connected later appear,
 * notes disconnected leave.
 *
 * The rules are the ones every other public path makes, and the ones Discover's pack snapshot
 * makes for the same object: the owner's alone (not a Thread in a shared space), at least two
 * notes, encrypted notes never leave.
 */

import { db, Notes, Spaces, ResourceMetadata, StudyThreadShares, eq, and, inArray, first } from '../db';
import { generateShareToken } from '@/utils/ids';
import { nowISO } from '../db/dates';
import { collectStudyThreadGraphForScope } from './study-thread-space';
import { fetchStudyThreadNoteRows } from './study-thread-note-rows';
import { resolveStudyThreadClusterNaming } from './study-thread-cluster-naming';
import { isPgUndefinedRelation } from './pg-undefined-relation';
import {
  pickStudyThreadRepresentativeNoteId,
  type StudyThreadSuggestNode,
} from '@/utils/suggest-study-thread-title';

/** Before `server/db/manual/create-study-thread-shares.sql` is applied: nothing is shared. */
export function isStudyThreadSharesTableMissing(error: unknown): boolean {
  return isPgUndefinedRelation(error, 'StudyThreadShares');
}

export type PersonalStudyThread = {
  ok: true;
  /** The main note, as `GET /api/notes/:id/thread` names it. */
  repNoteId: string;
  title: string;
  spaceId: string | null;
  /** Members in the order the walk reached them. */
  nodeIds: string[];
};

export type PersonalStudyThreadRefusal = {
  ok: false;
  status: 400 | 404 | 409;
  code: 'THREAD_NOT_FOUND' | 'THREAD_IN_SHARED_SPACE' | 'EMPTY_PACK';
  error: string;
};

/**
 * The personal Thread a note belongs to, refused where it may not leave its owner.
 *
 * Walked the way `GET /api/notes/:id/thread` walks it — same scope rule, same graph, same name —
 * so what is shared is what the person was looking at when they pressed Share.
 */
export async function resolvePersonalStudyThread(
  noteId: string,
  userId: string,
  options: { preferredSpaceId?: string | null; maxNodes: number },
): Promise<PersonalStudyThread | PersonalStudyThreadRefusal> {
  const focus = first(
    await db
      .select({ id: Notes.id, spaceId: Notes.spaceId })
      .from(Notes)
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
      .limit(1),
  );
  if (!focus) return { ok: false, status: 404, code: 'THREAD_NOT_FOUND', error: 'Thread not found' };
  if (focus.spaceId) {
    const space = first(
      await db
        .select({ type: Spaces.type, deletedAt: Spaces.deletedAt })
        .from(Spaces)
        .where(eq(Spaces.id, focus.spaceId))
        .limit(1),
    );
    if (!space || space.deletedAt || space.type !== 'personal') {
      return {
        ok: false,
        status: 409,
        code: 'THREAD_IN_SHARED_SPACE',
        error: 'A thread in a shared space is the room’s, not yours alone to give away.',
      };
    }
  }

  const { graph } = await collectStudyThreadGraphForScope(focus.id, userId, {
    preferredSpaceId: options.preferredSpaceId ?? focus.spaceId,
    maxNodes: options.maxNodes,
  });
  /* One note is a note, and has its own way to be shared. */
  if (graph.nodeIds.length < 2) {
    return {
      ok: false,
      status: 400,
      code: 'EMPTY_PACK',
      error: 'Connect at least one more note before sharing this Thread.',
    };
  }

  /* The name, resolved as the Thread endpoint resolves it — a manual title if one was set, the
     suggestion from its notes otherwise — so the link is called what the app calls it. */
  const namingRows = await fetchStudyThreadNoteRows(graph.nodeIds, userId);
  const resourceIds = namingRows.filter((n) => n.noteType === 'resource').map((n) => n.id);
  const resourceText = new Map<string, { sourceTitle: string | null; sourceDescription: string | null }>();
  if (resourceIds.length > 0) {
    const rows = await db
      .select({
        noteId: ResourceMetadata.noteId,
        sourceTitle: ResourceMetadata.sourceTitle,
        sourceDescription: ResourceMetadata.sourceDescription,
      })
      .from(ResourceMetadata)
      .where(inArray(ResourceMetadata.noteId, resourceIds));
    for (const row of rows) resourceText.set(row.noteId, row);
  }
  const suggestNodes: StudyThreadSuggestNode[] = namingRows.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    noteType: n.noteType,
    resourceTitle: resourceText.get(n.id)?.sourceTitle ?? null,
    resourceDescription: resourceText.get(n.id)?.sourceDescription ?? null,
    updatedAt: n.updatedAt ? n.updatedAt.toISOString() : null,
  }));
  const namingRepId =
    pickStudyThreadRepresentativeNoteId(graph.degreeMap.keys(), graph.degreeMap) ?? focus.id;
  const naming = resolveStudyThreadClusterNaming(namingRows, suggestNodes, namingRepId);
  const title = naming.threadTitle?.trim() || naming.suggestedTitle?.trim() || 'Untitled Thread';

  return { ok: true, repNoteId: naming.repNoteId, title, spaceId: focus.spaceId, nodeIds: graph.nodeIds };
}

export type StudyThreadShareRow = { id: string; anchorNoteId: string; shareToken: string; createdAt: Date };

/** The link on any member of this Thread, if there is one. Unmigrated database → none. */
export async function findStudyThreadShare(
  userId: string,
  nodeIds: readonly string[],
): Promise<StudyThreadShareRow | null> {
  if (nodeIds.length === 0) return null;
  try {
    return first(
      await db
        .select({
          id: StudyThreadShares.id,
          anchorNoteId: StudyThreadShares.anchorNoteId,
          shareToken: StudyThreadShares.shareToken,
          createdAt: StudyThreadShares.createdAt,
        })
        .from(StudyThreadShares)
        .where(and(eq(StudyThreadShares.userId, userId), inArray(StudyThreadShares.anchorNoteId, [...nodeIds])))
        .limit(1),
    ) ?? null;
  } catch (error) {
    if (isStudyThreadSharesTableMissing(error)) return null;
    throw error;
  }
}

/** A new link on the main note. Callers clear the old one first when they mean "replace". */
export async function createStudyThreadShare(userId: string, anchorNoteId: string): Promise<StudyThreadShareRow> {
  const row = {
    id: `stshare_${generateShareToken()}${generateShareToken()}`,
    userId,
    anchorNoteId,
    shareToken: generateShareToken(),
    createdAt: nowISO(),
  };
  await db.insert(StudyThreadShares).values(row);
  return { id: row.id, anchorNoteId: row.anchorNoteId, shareToken: row.shareToken, createdAt: row.createdAt };
}

/** Every link on every member — two Threads that were joined may each have brought one. */
export async function deleteStudyThreadShares(userId: string, nodeIds: readonly string[]): Promise<void> {
  if (nodeIds.length === 0) return;
  await db
    .delete(StudyThreadShares)
    .where(and(eq(StudyThreadShares.userId, userId), inArray(StudyThreadShares.anchorNoteId, [...nodeIds])));
}

/** Who shared it and from which note, for the public read. Unmigrated database → not found. */
export async function findStudyThreadShareByToken(
  shareToken: string,
): Promise<{ userId: string; anchorNoteId: string; createdAt: Date } | null> {
  try {
    return first(
      await db
        .select({
          userId: StudyThreadShares.userId,
          anchorNoteId: StudyThreadShares.anchorNoteId,
          createdAt: StudyThreadShares.createdAt,
        })
        .from(StudyThreadShares)
        .where(eq(StudyThreadShares.shareToken, shareToken))
        .limit(1),
    ) ?? null;
  } catch (error) {
    if (isStudyThreadSharesTableMissing(error)) return null;
    throw error;
  }
}

/**
 * The shared Thread behind a public token: its owner, name and the members that may be shown,
 * in walk order. `null` when the link is gone, the anchor note is gone, the Thread has moved into
 * a shared space, or it has shrunk to a single note.
 */
export async function loadSharedStudyThread(shareToken: string): Promise<{
  anchorNoteId: string;
  userId: string;
  title: string;
  createdAt: Date;
  nodeIds: string[];
} | null> {
  const share = await findStudyThreadShareByToken(shareToken);
  if (!share) return null;
  const thread = await resolvePersonalStudyThread(share.anchorNoteId, share.userId, { maxNodes: 200 });
  if (!thread.ok) return null;
  return {
    anchorNoteId: share.anchorNoteId,
    userId: share.userId,
    title: thread.title,
    createdAt: share.createdAt,
    nodeIds: thread.nodeIds,
  };
}

/**
 * Every Thread link this person has out, for Settings › Sharing — named as the app names each
 * Thread now. A link whose Thread can no longer be shared (moved into a shared space, down to one
 * note, anchor deleted) still lists, so it can be found and turned off; the public read already
 * refuses it.
 */
export async function listStudyThreadShares(userId: string, origin: string): Promise<Array<{
  id: string;
  title: string;
  sharedAt: Date;
  shareToken: string;
  shareUrl: string;
}>> {
  let rows: Array<{ anchorNoteId: string; shareToken: string; createdAt: Date }>;
  try {
    rows = await db
      .select({
        anchorNoteId: StudyThreadShares.anchorNoteId,
        shareToken: StudyThreadShares.shareToken,
        createdAt: StudyThreadShares.createdAt,
      })
      .from(StudyThreadShares)
      .where(eq(StudyThreadShares.userId, userId))
      .limit(50);
  } catch (error) {
    if (isStudyThreadSharesTableMissing(error)) return [];
    throw error;
  }
  return Promise.all(
    rows.map(async (row) => {
      const thread = await resolvePersonalStudyThread(row.anchorNoteId, userId, { maxNodes: 200 });
      return {
        id: row.anchorNoteId,
        title: thread.ok ? thread.title : 'Untitled Thread',
        sharedAt: row.createdAt,
        shareToken: row.shareToken,
        shareUrl: `${origin}/shared/thread/${row.shareToken}`,
      };
    }),
  );
}
