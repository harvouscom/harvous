/**
 * The Study Inbox — at most three things worth returning to, on Activity.
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
 * A cold-start reader with study but no queue gets the seed offer instead: three notes chosen
 * by meaning and fade rather than recency, so the first questions are ones they might actually
 * have forgotten.
 */
import { useNavigate } from '@tanstack/react-router';
import PrototypeHomeSection from './PrototypeHomeSection';
import PrototypeHomeRow from './PrototypeHomeRow';
import PrototypeStudyInboxRow, { reviewRowActions } from './PrototypeStudyInboxRow';
import { useReviewInbox } from '../../hooks/queries/useReview';
import { useChallenges } from '../../hooks/queries/useChallenges';
import {
  useDeferReview,
  useSeedReviews,
  useSetReviewStatus,
} from '../../hooks/mutations/useReviewMutations';
import { useHasFeature } from '../../hooks/useHasFeature';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { useProtoShell } from '../../layouts/proto-shell-context';
import {
  PLUS_BADGE_COPY,
  REVIEW_PLUS_META,
  REVIEW_PLUS_TITLE,
  REVIEW_SEED_META,
  REVIEW_SEED_TITLE,
  REVIEW_SEE_ALL_COPY,
  STUDY_INBOX_TITLE,
} from './proto-review-copy';
import { prototypeChallengeRouteTo, prototypeReviewRouteTo } from '@/lib/prototype-path';
import { RECALL_STATE_LABELS } from '@/utils/review-item-kinds';
import { useDismissiblePlusPrompt } from './use-dismissible-plus-prompt';

/**
 * The line under the question, when there is something left to say.
 *
 * A note prompt already names its subject — "what did you observe in My journey?" — so
 * repeating "My journey" underneath says the same thing twice in two lines. Only shown when
 * the question does not already contain it, which is the case for a Thread or a bare verse.
 */
function rowSubtitle(item: { prompt: string; noteTitle: string | null; scriptureReference: string | null }): string | null {
  const subject = item.noteTitle ?? item.scriptureReference;
  if (!subject) return null;
  return item.prompt.includes(subject) ? null : subject;
}

export default function PrototypeStudyInbox() {
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
  const seed = useSeedReviews();

  // A guest has nothing to upgrade and no queue to hold. Nothing at all.
  if (isGuest) return null;

  const hasAny = review.has || challengesFeature.has;

  if (!hasAny) {
    // Still loading is not "no" — a subscriber must never be shown a paywall on a cold load.
    if (!review.ready) return null;
    if (plusPromptDismissed) return null;
    return (
      <PrototypeHomeSection title={STUDY_INBOX_TITLE}>
        <PrototypeHomeRow
          icon="arrows-rotate"
          title={REVIEW_PLUS_TITLE}
          meta={[REVIEW_PLUS_META]}
          onClick={() => void navigate({ to: '/upgrade' })}
          trailing={
            <span className="proto-study-inbox__plus">
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
  const canSeed = Boolean(inboxQuery.data?.canSeed);

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

  const hasRows = reviewRows.length > 0 || Boolean(challengeRow) || canSeed;
  if (!hasRows) return null;

  // The question opens where you are, not on a page of its own — see PrototypeReviewDock.
  const openInDock = (itemId: string) => openReviewDock(itemId);

  return (
    <PrototypeHomeSection title={STUDY_INBOX_TITLE}>
      {reviewRows.map((item) => (
        <PrototypeStudyInboxRow
          key={item.id}
          icon={item.kind === 'verse' ? 'book-open' : 'arrows-rotate'}
          title={item.prompt}
          meta={[
            rowSubtitle(item),
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

      {canSeed ? (
        <PrototypeHomeRow
          icon="arrows-rotate"
          title={REVIEW_SEED_TITLE}
          meta={[REVIEW_SEED_META]}
          disabled={seed.isPending}
          onClick={() => seed.mutate()}
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
