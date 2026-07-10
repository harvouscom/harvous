import { db, Notes, NoteConnections, eq, and, or, first } from '../db';
import {
  collectStudyThreadGraph,
  studyThreadGraphHasEdgeOnNote,
  type StudyThreadGraph,
} from './study-thread-graph';

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

async function fetchDirectConnectionsOnNote(
  focusNoteId: string,
  userId: string,
): Promise<Array<{ fromNoteId: string; toNoteId: string; spaceId: string | null }>> {
  return db
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
    .limit(50);
}

/**
 * When scoped BFS misses edges that note details would show, fall back to unscoped traversal.
 * Exported for unit tests.
 */
export function shouldFallbackToUnscopedStudyThreadGraph(
  focusNoteId: string,
  graph: StudyThreadGraph,
  directConnectionCount: number,
): boolean {
  if (directConnectionCount === 0) return false;
  return !studyThreadGraphHasEdgeOnNote(focusNoteId, graph.edges);
}

export function shouldAttemptLegacyStudyThreadFallback(input: {
  hasExplicitSpaceContext: boolean;
  focusNoteId: string;
  graph: StudyThreadGraph;
  directConnectionCount: number;
}): boolean {
  return (
    !input.hasExplicitSpaceContext &&
    shouldFallbackToUnscopedStudyThreadGraph(
      input.focusNoteId,
      input.graph,
      input.directConnectionCount,
    )
  );
}

/**
 * Loads the connection cluster for a note in the resolved space scope.
 * If scoped BFS misses edges that exist on the focus note (null/wrong spaceId on rows),
 * re-runs BFS without space filtering so the thread popover matches note details.
 */
export async function collectStudyThreadGraphForScope(
  focusNoteId: string,
  userId: string,
  options?: { preferredSpaceId?: string | null; maxNodes?: number },
): Promise<{ graph: StudyThreadGraph; scopeSpaceId: string | null }> {
  const maxNodes = options?.maxNodes ?? 200;
  const hasExplicitScope = normalizeScopeSpaceId(options?.preferredSpaceId) !== null;
  let scopeSpaceId = await resolveStudyThreadScopeSpaceId(
    focusNoteId,
    userId,
    options?.preferredSpaceId,
  );

  let graph = await collectStudyThreadGraph(focusNoteId, userId, {
    spaceId: scopeSpaceId,
    maxNodes,
  });

  if (!hasExplicitScope && !studyThreadGraphHasEdgeOnNote(focusNoteId, graph.edges)) {
    const touchRows = await fetchDirectConnectionsOnNote(focusNoteId, userId);

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

    if (
      shouldAttemptLegacyStudyThreadFallback({
        hasExplicitSpaceContext: hasExplicitScope,
        focusNoteId,
        graph,
        directConnectionCount: touchRows.length,
      })
    ) {
      graph = await collectStudyThreadGraph(focusNoteId, userId, {
        spaceId: null,
        maxNodes,
      });
    }
  }

  return { graph, scopeSpaceId };
}
