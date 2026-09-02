/**
 * "Strengthen your Covenant Thread" — the one place a challenge is offered unasked.
 *
 * Derived entirely on the client from Threads the reader already has, because there is nothing
 * to ask the server that it does not already answer: `usePrototypeStudyThreads` returns the
 * clusters, `useChallenges('active')` returns what is already open, and the offer is the
 * difference. An endpoint for that would be a join the client can do for free.
 *
 * Deliberately one row, for one Thread. Every qualifying Thread listed here would turn a
 * suggestion into a backlog, which is the shape this whole feature is trying not to be.
 *
 * The Thread it picks is the largest one with no path open — the one where a path has most to
 * work with. Stable between renders because the underlying list is ordered by the server.
 */
import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import PrototypeHomeRow from './PrototypeHomeRow';
import { usePrototypeStudyThreads } from '../../hooks/queries/usePrototypeStudyThreads';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { useChallenges } from '../../hooks/queries/useChallenges';
import {
  challengeConflictId,
  useCreateChallenge,
} from '../../hooks/mutations/useChallengeMutations';
import { useHasFeature } from '../../hooks/useHasFeature';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { prototypeChallengeRouteTo } from '@/lib/prototype-path';

/**
 * Below three notes a Thread has nothing for a path to work on.
 *
 * The path asks for the central question, evidence in one note, a link to another, and a
 * tension between them — all of which need a cluster with something in it. Two notes is a
 * connection, and "Trace a connection" is the right path for that.
 */
const STRENGTHEN_MIN_NOTES = 3;

export default function PrototypeStrengthenThreadRow() {
  const navigate = useNavigate();
  const { isGuest } = useHarvousIdentity();
  const { has, ready } = useHasFeature('challenges');
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const threadsQuery = usePrototypeStudyThreads(homeSpaceId ?? undefined);
  const activeQuery = useChallenges('active');
  const pausedQuery = useChallenges('paused');
  const createChallenge = useCreateChallenge();

  const candidate = useMemo(() => {
    const threads = threadsQuery.data ?? [];
    // A Thread with a path already open — or one the reader paused — is not an offer.
    const taken = new Set(
      [...(activeQuery.data?.challenges ?? []), ...(pausedQuery.data?.challenges ?? [])]
        .map((c) => c.sourceNoteId)
        .filter((id): id is string => Boolean(id)),
    );
    return (
      threads
        .filter((t) => t.noteCount >= STRENGTHEN_MIN_NOTES && !taken.has(t.id))
        .sort((a, b) => b.noteCount - a.noteCount)[0] ?? null
    );
  }, [threadsQuery.data, activeQuery.data, pausedQuery.data]);

  // No offer to a guest, to a free account, or before the answer is known — an upsell for
  // Challenges already has its one row in the Review section above, and two would be two.
  if (isGuest || !ready || !has || !candidate) return null;

  const title = candidate.title?.trim() || candidate.suggestedTitle?.trim() || 'this Thread';

  return (
    <PrototypeHomeRow
      icon="layer-group"
      title={`Strengthen your ${title} Thread`}
      meta={[`${candidate.noteCount} notes`]}
      disabled={createChallenge.isPending}
      onClick={() =>
        createChallenge.mutate(
          { templateKey: 'strengthen_thread', repNoteId: candidate.id },
          {
            onSuccess: (data) =>
              void navigate({
                to: prototypeChallengeRouteTo(),
                params: { challengeId: data.challenge.id },
              }),
            /* A 409 means one is already open — race with another device, or a stale list.
               Open the one that exists rather than reporting an error about a path the reader
               cannot see. */
            onError: (error) => {
              const existing = challengeConflictId(error);
              if (existing) {
                void navigate({
                  to: prototypeChallengeRouteTo(),
                  params: { challengeId: existing },
                });
              }
            },
          },
        )
      }
    />
  );
}
