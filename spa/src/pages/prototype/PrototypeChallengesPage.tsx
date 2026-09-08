/**
 * `/challenges` — the paths in progress, and the ones already walked.
 *
 * There is no "browse all templates" gallery here on purpose. A challenge is bound to
 * something the reader already has — a Thread, a question they wrote, a link they made — so
 * the honest place to start one is beside that thing, not from a menu of four abstract shapes
 * that then asks which of your Threads you meant. This page is where the ones you started
 * live; Activity's Suggested row and the note menu are where they begin.
 */
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeHomeSection from './PrototypeHomeSection';
import PrototypeHomeRow from './PrototypeHomeRow';
import { useChallenges } from '../../hooks/queries/useChallenges';
import { useSetChallengeStatus } from '../../hooks/mutations/useChallengeMutations';
import { useHasFeature } from '../../hooks/useHasFeature';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import {
  PLUS_BADGE_COPY,
  REVIEW_RESUME_COPY,
} from './proto-review-copy';
import { prototypeChallengeRouteTo, prototypeHomeRouteTo } from '@/lib/prototype-path';

export default function PrototypeChallengesPage() {
  const navigate = useNavigate();
  const { isGuest } = useHarvousIdentity();
  const challenges = useHasFeature('challenges');
  const activeQuery = useChallenges('active');
  const pausedQuery = useChallenges('paused');
  const doneQuery = useChallenges('completed');
  const setStatus = useSetChallengeStatus();

  if (isGuest || (challenges.ready && !challenges.has)) {
    return (
      <div className="proto-feed">
        <article className="proto-feed-sheet">
          <header className="proto-feed-sheet__head">
            <div className="proto-feed-sheet__title">
              <h2 className="proto-feed-sheet__day">Challenges</h2>
            </div>
          </header>
          <div className="proto-feed-sheet__body">
            {isGuest ? (
              <p className="proto-feed-sheet__rest">
                A challenge is a short path through study you have already written. Make an
                account to start building one.
              </p>
            ) : (
              <PrototypeHomeSection title="Challenges">
                <PrototypeHomeRow
                  icon="list-check"
                  title="Short guided paths through your own study"
                  meta={['Strengthen a Thread, keep a verse, return to a question']}
                  onClick={() => void navigate({ to: '/upgrade' })}
                  trailing={<span className="proto-menu-item__badge">{PLUS_BADGE_COPY}</span>}
                />
              </PrototypeHomeSection>
            )}
          </div>
        </article>
      </div>
    );
  }

  if (activeQuery.isPending || !challenges.ready) {
    return <ProtoSpaceLoading label="Loading your challenges" />;
  }

  const active = activeQuery.data?.challenges ?? [];
  const paused = pausedQuery.data?.challenges ?? [];
  const completed = doneQuery.data?.challenges ?? [];
  const empty = active.length === 0 && paused.length === 0 && completed.length === 0;

  const open = (id: string) =>
    void navigate({ to: prototypeChallengeRouteTo(), params: { challengeId: id } });

  return (
    <div className="proto-feed">
      <article className="proto-feed-sheet">
        <header className="proto-feed-sheet__head">
          <div className="proto-feed-sheet__title">
            <h2 className="proto-feed-sheet__day">Challenges</h2>
            <button
              type="button"
              className="proto-sidebar-back-tile proto-feed-sheet__forward"
              onClick={() => void navigate({ to: prototypeHomeRouteTo() })}
              aria-label="Back to Activity"
              title="Back to Activity"
            >
              <Icon name="caret-right" size={16} aria-hidden />
            </button>
          </div>
        </header>

        <div className="proto-feed-sheet__body">
          {empty ? (
            <p className="proto-feed-sheet__rest">
              A challenge starts from something you already wrote — a Thread, a question, a
              verse you want to keep. Look for it on Activity, or in a note&apos;s menu.
            </p>
          ) : null}

          {active.length > 0 ? (
            <PrototypeHomeSection title="In progress">
              {active.map((challenge) => (
                <PrototypeHomeRow
                  key={challenge.id}
                  icon="list-check"
                  title={challenge.title}
                  meta={[
                    `Step ${Math.min(challenge.currentStepIndex + 1, challenge.totalSteps)} of ${challenge.totalSteps}`,
                  ]}
                  onClick={() => open(challenge.id)}
                />
              ))}
            </PrototypeHomeSection>
          ) : null}

          {paused.length > 0 ? (
            <PrototypeHomeSection title="Paused">
              {paused.map((challenge) => (
                <PrototypeHomeRow
                  key={challenge.id}
                  icon="circle-minus"
                  title={challenge.title}
                  meta={[REVIEW_RESUME_COPY]}
                  onClick={() =>
                    setStatus.mutate({ challengeId: challenge.id, status: 'active' })
                  }
                />
              ))}
            </PrototypeHomeSection>
          ) : null}

          {completed.length > 0 ? (
            <PrototypeHomeSection title="Walked">
              {completed.map((challenge) => (
                <PrototypeHomeRow
                  key={challenge.id}
                  icon="circle-check"
                  title={challenge.title}
                  onClick={() => open(challenge.id)}
                />
              ))}
            </PrototypeHomeSection>
          ) : null}
        </div>
      </article>
    </div>
  );
}
