import { db, Notes, NoteConnections, eq, and, or, first } from '../db';
import { collectStudyThreadGraph, type StudyThreadGraph } from './study-thread-graph';

function normalizeScopeSpaceId(spaceId: string | null | undefined): string | null {
  if (!spaceId || !spaceId.trim()) return null;
  const t = spaceId.trim();
  return t.startsWith('space_') ? t : `space_${t}`;
}

/**
 * Space used for study-thread BFS — matches Threads list when preferredSpaceId is set.
 */
export async function resolveStudyThreadScopeSpaceId(
  focusNoteId: string,
  userId: string,
  preferredSpaceId?: string | null,
): Promise<string | null> {
  const preferred = normalizeScopeSpaceId(preferredSpaceId);
  if (preferred) return preferred;

  const focus = first(
    await db
      .select({ spaceId: Notes.spaceId })
      .from(Notes)
      .where(and(eq(Notes.id, focusNoteId), eq(Notes.userId, userId)))
      .limit(1),
  );
  return normalizeScopeSpaceId(focus?.spaceId ?? null);
}

/**
 * Loads the connection cluster for a note in the resolved space scope.
 * If the first BFS finds no edges, infers spaceId from any edge touching the focus note.
 */
export async function collectStudyThreadGraphForScope(
  focusNoteId: string,
  userId: string,
  options?: { preferredSpaceId?: string | null; maxNodes?: number },
): Promise<{ graph: StudyThreadGraph; scopeSpaceId: string | null }> {
  const maxNodes = options?.maxNodes ?? 200;
  let scopeSpaceId = await resolveStudyThreadScopeSpaceId(
    focusNoteId,
    userId,
    options?.preferredSpaceId,
  );

  let graph = await collectStudyThreadGraph(focusNoteId, userId, {
    spaceId: scopeSpaceId,
    maxNodes,
  });

  if (graph.edges.length === 0) {
    const touchRows = await db
      .select({
        fromNoteId: NoteConnections.fromNoteId,
        toNoteId: NoteConnections.toNoteId,
        spaceId: NoteConnections.spaceId,
      })
      .from(NoteConnections)
      .where(
        and(
          eq(NoteConnections.userId, userId),
          or(
            eq(NoteConnections.fromNoteId, focusNoteId),
            eq(NoteConnections.toNoteId, focusNoteId),
          ),
        ),
      )
      .limit(20);

    const inferred = touchRows
      .map((r) => normalizeScopeSpaceId(r.spaceId))
      .find((id): id is string => Boolean(id));

    if (inferred && inferred !== scopeSpaceId) {
      scopeSpaceId = inferred;
      graph = await collectStudyThreadGraph(focusNoteId, userId, {
        spaceId: scopeSpaceId,
        maxNodes,
      });
    }
  }

  return { graph, scopeSpaceId };
}
