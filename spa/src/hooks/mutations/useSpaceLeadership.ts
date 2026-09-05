import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

/**
 * Grant or revoke leadership of one space.
 *
 * Two lanes behind one call. In a church room this is the volunteer path: a
 * youth leader who holds no Clerk staff seat can be given the Youth channel —
 * publish, structure, and its teaching plan — and nothing else. In a Shared
 * Space with no church behind it, it is the owner naming a second person who
 * can invite, pin and start a study.
 *
 * The `/api/church/` path serves both, as the space plan's already does — the
 * lane is decided server-side by the space, never by the caller. See
 * `server/utils/church-space-leaders.ts` for the boundary.
 */
export function useSpaceLeadership(spaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  const trimmed = spaceId?.trim() || null;

  return useMutation({
    mutationFn: ({ userId, grant }: { userId: string; grant: boolean }) =>
      api.post(
        `/api/church/spaces/${encodeURIComponent(trimmed ?? '')}/leaders/${grant ? 'grant' : 'revoke'}`,
        { userId },
      ),
    onSettled: () => {
      // The roster carries the role and its provenance, so the people sheet
      // re-reads both. The space plan is unaffected — a grant changes who may
      // edit it, not what it holds.
      void queryClient.invalidateQueries({ queryKey: ['space', trimmed, 'members'] });
    },
  });
}
