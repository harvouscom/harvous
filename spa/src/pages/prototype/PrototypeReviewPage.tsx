/**
 * `/review` — everything in Review, and the way into a sitting.
 *
 * The counterpart to the Review section's three rows: this is where the rest lives, and where a
 * reader manages what they have added. Deliberately a page rather than a panel, because
 * managing a queue is a different posture from being offered three things on the way past.
 *
 * Grouped by what the reader can do about each group rather than by due date. "Waiting" is
 * what a sitting would ask; "Coming back later" is scheduled and needs nothing; "Paused" and
 * "Put down" are things they set aside and might want back. No group carries a count in its
 * heading — the rows are right there to be counted by anyone who wants to.
 */
import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeHomeSection from './PrototypeHomeSection';
import PrototypeHomeRow from './PrototypeHomeRow';
import PrototypeReviewRow, { reviewRowActions } from './PrototypeReviewRow';
import { useReviewItems, type ReviewItemView } from '../../hooks/queries/useReview';
import { useChallenges } from '../../hooks/queries/useChallenges';
import { useDeferReview, useSetReviewStatus } from '../../hooks/mutations/useReviewMutations';
import { useHasFeature } from '../../hooks/useHasFeature';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { useProtoShell } from '../../layouts/proto-shell-context';
import {
  PLUS_BADGE_COPY,
  REVIEW_EMPTY_COPY,
  REVIEW_PLUS_META,
  REVIEW_PLUS_TITLE,
  REVIEW_RESUME_COPY,
} from './proto-review-copy';
import { RECALL_STATE_LABELS } from '@/utils/review-item-kinds';
import { prototypeChallengeRouteTo, prototypeHomeRouteTo } from '@/lib/prototype-path';

function rowMeta(item: ReviewItemView): (string | null)[] {
  const subject = item.noteTitle ?? item.scriptureReference;
  return [
    // Omitted when the question already names it — see PrototypeReviewSection's `rowSubtitle`.
    subject && !item.prompt.includes(subject) ? subject : null,
    item.sourceLabel,
    item.recallState === 'new' ? null : RECALL_STATE_LABELS[item.recallState],
  ];
}

export default function PrototypeReviewPage() {
  const navigate = useNavigate();
  const { openReviewDock } = useProtoShell();
  const { isGuest } = useHarvousIdentity();
  const review = useHasFeature('review');
  const itemsQuery = useReviewItems();
  const challengesQuery = useChallenges('active');
  const defer = useDeferReview();
  const setStatus = useSetReviewStatus();

  const items = useMemo(() => itemsQuery.data?.items ?? [], [itemsQuery.data]);
  const now = Date.now();

  const { waiting, scheduled, paused, archived } = useMemo(() => {
    const waiting: ReviewItemView[] = [];
    const scheduled: ReviewItemView[] = [];
    const paused: ReviewItemView[] = [];
    const archived: ReviewItemView[] = [];
    for (const item of items) {
      if (item.status === 'paused') paused.push(item);
      else if (item.status === 'archived') archived.push(item);
      else if (Date.parse(item.dueAt) <= now) waiting.push(item);
      else scheduled.push(item);
    }
    return { waiting, scheduled, paused, archived };
  }, [items, now]);

  if (isGuest || (review.ready && !review.has)) {
    return (
      <div className="proto-feed">
        <article className="proto-feed-sheet">
          <header className="proto-feed-sheet__head">
            <div className="proto-feed-sheet__title">
              <h2 className="proto-feed-sheet__day">Review</h2>
            </div>
          </header>
          <div className="proto-feed-sheet__body">
            {isGuest ? (
              <p className="proto-feed-sheet__rest">
                Review comes back to your own notes on a schedule. Make an account to keep study
                you can return to.
              </p>
            ) : (
              <PrototypeHomeSection title="Review">
                <PrototypeHomeRow
                  icon="arrows-rotate"
                  title={REVIEW_PLUS_TITLE}
                  meta={[REVIEW_PLUS_META]}
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

  if (itemsQuery.isPending || !review.ready) {
    return <ProtoSpaceLoading label="Loading your Review" />;
  }

  const activeChallenges = challengesQuery.data?.challenges ?? [];
  const nothingAtAll =
    items.length === 0 && activeChallenges.length === 0;

  return (
    <div className="proto-feed">
      <article className="proto-feed-sheet">
        <header className="proto-feed-sheet__head">
          <div className="proto-feed-sheet__title">
            <h2 className="proto-feed-sheet__day">Review</h2>
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
          {/* No offer to "start reviewing": the engine fills the queue from what the reader
              has already studied, so an empty page means it found nothing quiet enough to ask
              about yet, not that they forgot to switch something on. */}
          {nothingAtAll ? <p className="proto-feed-sheet__rest">{REVIEW_EMPTY_COPY}</p> : null}

          {waiting.length > 0 ? (
            <PrototypeHomeSection title="Waiting">
              {waiting.map((item) => (
                <PrototypeReviewRow
                  key={item.id}
                  icon={item.kind === 'verse' ? 'book-open' : 'arrows-rotate'}
                  title={item.prompt}
                  meta={rowMeta(item)}
                  onOpen={() => openReviewDock(item.id)}
                  actions={reviewRowActions({
                    onDefer: () => defer.mutate(item.id),
                    onPause: () => setStatus.mutate({ itemId: item.id, status: 'paused' }),
                    onRemove: () => setStatus.mutate({ itemId: item.id, status: 'archived' }),
                  })}
                />
              ))}
            </PrototypeHomeSection>
          ) : null}

          {activeChallenges.length > 0 ? (
            <PrototypeHomeSection title="Challenges">
              {activeChallenges.map((challenge) => (
                <PrototypeHomeRow
                  key={challenge.id}
                  icon="list-check"
                  title={challenge.title}
                  meta={[
                    `Step ${Math.min(challenge.currentStepIndex + 1, challenge.totalSteps)} of ${challenge.totalSteps}`,
                  ]}
                  onClick={() =>
                    void navigate({
                      to: prototypeChallengeRouteTo(),
                      params: { challengeId: challenge.id },
                    })
                  }
                />
              ))}
            </PrototypeHomeSection>
          ) : null}

          {scheduled.length > 0 ? (
            <PrototypeHomeSection title="Coming back later">
              {scheduled.map((item) => (
                <PrototypeReviewRow
                  key={item.id}
                  icon={item.kind === 'verse' ? 'book-open' : 'arrows-rotate'}
                  title={item.noteTitle ?? item.scriptureReference ?? 'A note'}
                  meta={[
                    item.recallState === 'new' ? null : RECALL_STATE_LABELS[item.recallState],
                  ]}
                  onOpen={() => openReviewDock(item.id)}
                  actions={reviewRowActions({
                    onDefer: () => defer.mutate(item.id),
                    onPause: () => setStatus.mutate({ itemId: item.id, status: 'paused' }),
                    onRemove: () => setStatus.mutate({ itemId: item.id, status: 'archived' }),
                  })}
                />
              ))}
            </PrototypeHomeSection>
          ) : null}

          {/* Paused and put-down items keep one action each: the way back. Anything the reader
              set aside should cost one tap to un-set-aside and nothing else. */}
          {paused.length > 0 ? (
            <PrototypeHomeSection title="Paused">
              {paused.map((item) => (
                <PrototypeHomeRow
                  key={item.id}
                  icon="circle-minus"
                  title={item.noteTitle ?? item.scriptureReference ?? 'A note'}
                  onClick={() => setStatus.mutate({ itemId: item.id, status: 'active' })}
                  meta={[REVIEW_RESUME_COPY]}
                />
              ))}
            </PrototypeHomeSection>
          ) : null}

          {archived.length > 0 ? (
            <PrototypeHomeSection title="Put down">
              {archived.map((item) => (
                <PrototypeHomeRow
                  key={item.id}
                  icon="eye-slash"
                  title={item.noteTitle ?? item.scriptureReference ?? 'A note'}
                  onClick={() => setStatus.mutate({ itemId: item.id, status: 'active' })}
                  meta={[REVIEW_RESUME_COPY]}
                />
              ))}
            </PrototypeHomeSection>
          ) : null}
        </div>
      </article>
    </div>
  );
}
