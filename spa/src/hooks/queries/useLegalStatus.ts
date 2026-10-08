/**
 * Which Privacy Policy and Terms this account has acknowledged, and an acknowledgment to record.
 *
 * Read by the feature callout to decide whether the "we've updated" notice is due. Signed-in
 * accounts only: a guest has nothing to acknowledge until they make an account, and sign-up
 * records it there.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { useHarvousIdentity } from '../useHarvousIdentity';
import type { LegalAcknowledgmentSurface, LegalDocument } from '@/utils/legal-versions';

export interface LegalStatus {
  current: Record<LegalDocument, string>;
  acknowledged: Record<LegalDocument, string | null>;
  due: LegalDocument[];
}

export const LEGAL_STATUS_KEY = ['user', 'legal-status'] as const;

export function useLegalStatus() {
  const authReady = useAuthReady();
  const { isGuest } = useHarvousIdentity();
  return useQuery({
    queryKey: LEGAL_STATUS_KEY,
    queryFn: () => api.get<LegalStatus>('/api/user/legal-status'),
    enabled: authReady && !isGuest,
    // Changes only when a document's version does (a release) or the reader acknowledges it.
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

export function postLegalAcknowledgment(
  documents: readonly LegalDocument[],
  surface: LegalAcknowledgmentSurface,
): Promise<LegalStatus> {
  return api.post<LegalStatus>('/api/user/legal-acknowledge', { documents, surface });
}

export function useAcknowledgeLegal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documents, surface }: { documents: LegalDocument[]; surface: LegalAcknowledgmentSurface }) =>
      postLegalAcknowledgment(documents, surface),
    /* Clear the notice the moment it is answered, whether or not the write lands: the reader has
       seen it, and a notice that reappears because a request failed reads as a bug. The server's
       answer replaces this when it arrives; a failed write simply shows the notice next visit. */
    onMutate: ({ documents }) => {
      queryClient.setQueryData<LegalStatus>(LEGAL_STATUS_KEY, (prev) =>
        prev ? { ...prev, due: prev.due.filter((doc) => !documents.includes(doc)) } : prev,
      );
    },
    onSuccess: (status) => queryClient.setQueryData(LEGAL_STATUS_KEY, status),
  });
}
