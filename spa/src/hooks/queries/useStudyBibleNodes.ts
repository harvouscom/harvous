/**
 * The reader's Study Bible layer, for Home.
 *
 * Not gated on a feature key. Review is Plus; what a person has been studying is not, and the
 * arcs on Activity have always been shown to everyone.
 *
 * What this buys Home: honest counts. Every arc derive next door bails with `if (hasMoreNotes)
 * return undefined`, because counting themes across a reader's study needs the whole note set
 * in the browser and a paginated reader never has it. These counts were accumulated server-side
 * as the study happened, so they do not have that problem.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { useHarvousIdentity } from '../useHarvousIdentity';
import type { NodeKind } from '@/utils/study-bible-nodes';

export interface StudyBibleNode {
  nodeKind: NodeKind;
  nodeKey: string;
  label: string | null;
  noteId: string | null;
  exposureCount: number;
  revisitCount: number;
  explicitConnectionCount: number;
  expansionCount: number;
  synthesisCount: number;
  reviewCount: number;
  firstStudiedAt: string;
  lastSeenAt: string;
  meta: string | null;
}

export const studyBibleQueryKey = ['study-bible'] as const;
export const studyBibleNodesQueryKey = (kinds: readonly NodeKind[]) =>
  ['study-bible', 'nodes', [...kinds].sort().join(',')] as const;

/**
 * Nodes of the given kinds, most recently studied first.
 *
 * A guest has no layer — nothing they do is recorded against an account — so the request is
 * not made rather than returning an empty list from the server.
 */
export function useStudyBibleNodes(kinds: readonly NodeKind[], options?: { limit?: number }) {
  const authReady = useAuthReady();
  const { isGuest } = useHarvousIdentity();

  return useQuery({
    queryKey: studyBibleNodesQueryKey(kinds),
    queryFn: () => {
      const params = new URLSearchParams();
      if (kinds.length) params.set('kind', [...kinds].join(','));
      if (options?.limit) params.set('limit', String(options.limit));
      const query = params.toString();
      return api.get<{ nodes: StudyBibleNode[] }>(
        `/api/study-bible/nodes${query ? `?${query}` : ''}`,
      );
    },
    enabled: authReady && !isGuest,
    // The layer moves as the reader studies, not between renders.
    staleTime: 5 * 60 * 1000,
  });
}
