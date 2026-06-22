import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { normalizeNoteIdFromParam } from '../../pages/prototype/proto-route-slugs';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';

/** A single node in the study thread graph. */
export interface StudyThreadNodeFlat {
  id: string;
  title: string | null;
  content: string | null;
  simpleNoteId: number | null;
  noteType: 'default' | 'scripture' | 'resource' | string;
  resourceTitle: string | null;
  resourceDescription: string | null;
  resourceImage: string | null;
  updatedAt: string | null;
}

/** A directed edge in the study thread graph. */
export interface StudyThreadEdge {
  fromId: string;
  toId: string;
}

export interface StudyThreadResponse {
  success: boolean;
  focusNoteId: string;
  /** Highest-degree node — carries thread name flags + optional manual title. */
  repNoteId: string;
  /** Display title (manual override or auto suggestion). */
  threadTitle: string | null;
  /** Keyword-based name from all connected notes (never the manual override). */
  suggestedTitle: string | null;
  studyThreadUserOverride: boolean;
  studyThreadPinned: boolean;
  nodes: StudyThreadNodeFlat[];
  edges: StudyThreadEdge[];
  nodeCount: number;
}

/** Query key for a note's study thread (connection graph). */
export function studyThreadQueryKey(noteId: string | undefined, spaceId?: string | null) {
  const scope = normalizePrototypeApiSpaceId(spaceId) ?? '';
  return ['prototype', 'note', noteId, 'thread', scope] as const;
}

/**
 * Loads the study thread graph a note belongs to:
 * all notes reachable from the focus note via NoteConnections (bidirectional BFS).
 * Returns flat nodes + edges — no nested tree.
 */
export function usePrototypeStudyThread(noteId: string | undefined, spaceId?: string | null) {
  const scopeId = normalizePrototypeApiSpaceId(spaceId);
  return useQuery({
    queryKey: studyThreadQueryKey(noteId, scopeId),
    enabled: Boolean(noteId && scopeId),
    queryFn: async () => {
      const fullId = normalizeNoteIdFromParam(noteId!);
      const qs = scopeId ? `?spaceId=${encodeURIComponent(scopeId)}` : '';
      const res = await api.get<StudyThreadResponse>(
        `/api/notes/${encodeURIComponent(fullId)}/thread${qs}`,
      );
      if (!res.success) {
        throw new Error('Could not load thread');
      }
      return res;
    },
  });
}
