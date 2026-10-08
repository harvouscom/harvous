/**
 * The challenge you are partway through, as one row: its title and which step you are on.
 *
 * It used to sit inside the Review section, under the review rows. A challenge in progress is
 * something you were doing, not a question being put to you, so on Home it belongs with the
 * other things you can pick up — the note you were in, the chapter you were reading — in the
 * Pick up deck. Renders nothing for a guest, without the feature (the query gates itself on
 * access), or with no challenge active.
 */
import { useNavigate } from '@tanstack/react-router';
import PrototypeHomeRow from './PrototypeHomeRow';
import { useHomeChallenges } from '../../hooks/queries/useChallenges';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { prototypeChallengeRouteTo } from '@/lib/prototype-path';

export default function PrototypeChallengeContinueRow() {
  const navigate = useNavigate();
  const { isGuest } = useHarvousIdentity();
  const challengesQuery = useHomeChallenges();

  if (isGuest) return null;
  const challenge = (challengesQuery.data?.challenges ?? []).find((c) => c.status === 'active');
  if (!challenge) return null;

  const step = Math.min(challenge.currentStepIndex + 1, challenge.totalSteps);
  return (
    <PrototypeHomeRow
      deckId={`challenge:${challenge.id}`}
      icon="list-check"
      title={challenge.title}
      meta={[`Step ${step} of ${challenge.totalSteps}`]}
      onClick={() =>
        void navigate({
          to: prototypeChallengeRouteTo(),
          params: { challengeId: challenge.id },
        })
      }
    />
  );
}
