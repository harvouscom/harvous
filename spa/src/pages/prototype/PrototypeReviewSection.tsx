/**
 * Review — at most three things worth returning to, on Activity.
 *
 * A calm curated stack, not a task manager. The cap is three (`REVIEW_INBOX_MAX_ROWS`), the
 * server never sends a count of what it is not showing, and there is no badge anywhere: the
 * named failure mode in the strategy doc is an escalating "27 due", and every mechanism that
 * could produce one has been left out rather than styled down.
 *
 * Four states, and each is deliberate:
 *
 * - **Guest** renders nothing. A guest has no account to attach a subscription to, so an
 *   upgrade prompt would be asking them to buy before they can sign in.
 * - **Signed in without Plus** gets one row, dismissible, that names what Review is. One,
 *   because a paywall repeated per feature is how an app starts to feel like a trial.
 * - **Plus with nothing due** renders nothing and the section collapses. "Nothing waiting" is
 *   said by the absence, not by a row saying so — the day's own record is below and is better
 *   company than an empty state.
 * - **Plus with something due** gets the rows, each with an overflow, and a way to see the rest.
 *
 * Nobody has to fill it. The engine reads the reader's own Study Bible layer and adds a few
 * a day — a verse they highlighted, a link they drew, a Thread that has grown — and each row
 * says where it came from, so the section reads as their study coming back rather than as work
 * assigned to them.
 */
import { useNavigate } from '@tanstack/react-router';
import PrototypeHomeSection from './PrototypeHomeSection';
import PrototypeHomeRow from './PrototypeHomeRow';
import PrototypeReviewRow, { reviewRowActions } from './PrototypeReviewRow';
import { useReviewInbox } from '../../hooks/queries/useReview';
import { useChallenges } from '../../hooks/queries/useChallenges';
import { useDeferReview, useSetReviewStatus } from '../../hooks/mutations/useReviewMutations';
import { useHasFeature } from '../../hooks/useHasFeature';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { useProtoShell } from '../../layouts/proto-shell-context';
import {
  PLUS_BADGE_COPY,
  REVIEW_PLUS_META,
  REVIEW_PLUS_TITLE,
  REVIEW_SEE_ALL_COPY,
  REVIEW_SECTION_TITLE,
} from './proto-review-copy';
import { prototypeChallengeRouteTo, prototypeReviewRouteTo } from '@/lib/prototype-path';
import { RECALL_STATE_LABELS } from '@/utils/review-item-kinds';
import { reviewRowSource, reviewRowSubtitle } from '@/utils/review-row-subtitle';
import { reviewKindIcon } from './review-kind-icons';
import { useDismissiblePlusPrompt } from './use-dismissible-plus-prompt';

export default function PrototypeReviewSection() {
  const navigate = useNavigate();
  const { openReviewDock } = useProtoShell();
  const { isGuest } = useHarvousIdentity();
  const review = useHasFeature('review');
  const challengesFeature = useHasFeature('challenges');
  const { dismissed: plusPromptDismissed, dismiss: dismissPlusPrompt } = useDismissiblePlusPrompt();

  const inboxQuery = useReviewInbox();
  const challengesQuery = useChallenges('active');
  const defer = useDeferReview();
  const setStatus = useSetReviewStatus();

  // A guest has nothing to upgrade and no queue to hold. Nothing at all.
  if (isGuest) return null;

  const hasAny = review.has || challengesFeature.has;

  if (!hasAny) {
    // Still loading is not "no" — a subscriber must never be shown a paywall on a cold load.
    if (!review.ready) return null;
    if (plusPromptDismissed) return null;
    return (
      <PrototypeHomeSection title={REVIEW_SECTION_TITLE}>
        <PrototypeHomeRow
          icon="arrows-rotate"
          title={REVIEW_PLUS_TITLE}
          meta={[REVIEW_PLUS_META]}
          onClick={() => void navigate({ to: '/upgrade' })}
          trailing={
            <span className="proto-review-section__plus">
              <span className="proto-menu-item__badge">{PLUS_BADGE_COPY}</span>
              <button
                type="button"
                className="proto-side-panel__action-btn"
                aria-label="Hide this"
                onClick={(event) => {
                  event.stopPropagation();
                  dismissPlusPrompt();
                }}
              >
                <span aria-hidden>×</span>
              </button>
            </span>
          }
        />
      </PrototypeHomeSection>
    );
  }

  const items = inboxQuery.data?.items ?? [];
  const activeChallenges = challengesQuery.data?.challenges ?? [];

  /*
   * Reviews first, then one challenge, and the cap applies to the whole stack.
   *
   * One challenge rather than all of them because a path is a sitting's worth of work on its
   * own; three open paths listed together is a backlog wearing a different hat. The rest are
   * on the Review page.
   */
  const challengeRow = activeChallenges[0];
  const reviewRowCount = challengeRow ? Math.max(0, 3 - 1) : 3;
  const reviewRows = items.slice(0, reviewRowCount);

  const hasRows = reviewRows.length > 0 || Boolean(challengeRow);
  if (!hasRows) return null;

  // The question opens where you are, not on a page of its own — see PrototypeReviewDock.
  const openInDock = (itemId: string) => openReviewDock(itemId);

  return (
    <PrototypeHomeSection title={REVIEW_SECTION_TITLE}>
      {reviewRows.map((item) => (
        <PrototypeReviewRow
          key={item.id}
          icon={reviewKindIcon(item.kind)}
          title={item.prompt}
          meta={[
            // Which note, then why it is here — and the second is dropped when the first
            // already said it. See review-row-subtitle.ts.
            reviewRowSubtitle(item),
            reviewRowSource(item, reviewRowSubtitle(item)),
            // The recall state as a word, never a percentage. "New" says nothing useful on a
            // row that is by definition being asked for the first time.
            item.recallState === 'new' ? null : RECALL_STATE_LABELS[item.recallState],
          ]}
          onOpen={() => openInDock(item.id)}
          actions={reviewRowActions({
            onDefer: () => defer.mutate(item.id),
            onPause: () => setStatus.mutate({ itemId: item.id, status: 'paused' }),
            onRemove: () => setStatus.mutate({ itemId: item.id, status: 'archived' }),
          })}
        />
      ))}

      {challengeRow ? (
        <PrototypeHomeRow
          icon="list-check"
          title={challengeRow.title}
          meta={[
            // "Step 2 of 5" is a position, not a score — it says where you are, not how far
            // behind you are.
            `Step ${Math.min(challengeRow.currentStepIndex + 1, challengeRow.totalSteps)} of ${challengeRow.totalSteps}`,
          ]}
          onClick={() =>
            void navigate({
              to: prototypeChallengeRouteTo(),
              params: { challengeId: challengeRow.id },
            })
          }
        />
      ) : null}

      {reviewRows.length > 0 || activeChallenges.length > 1 ? (
        <PrototypeHomeRow
          icon="list-check"
          title={REVIEW_SEE_ALL_COPY}
          onClick={() => void navigate({ to: prototypeReviewRouteTo() })}
        />
      ) : null}
    </PrototypeHomeSection>
  );
}
