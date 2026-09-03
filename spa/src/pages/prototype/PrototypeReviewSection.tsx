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
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import PrototypeHomeSection from './PrototypeHomeSection';
import PrototypeHomeRow from './PrototypeHomeRow';
import PrototypeReviewRow, { reviewRowActions } from './PrototypeReviewRow';
import { useReviewInbox, useReviewItems, type ReviewItemView } from '../../hooks/queries/useReview';
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
  REVIEW_SEE_LESS_COPY,
  REVIEW_SECTION_TITLE,
} from './proto-review-copy';
import { prototypeChallengeRouteTo } from '@/lib/prototype-path';
import { RECALL_STATE_LABELS, type ReviewItemKind } from '@/utils/review-item-kinds';
import { reviewRowSource, reviewRowSubject } from '@/utils/review-row-subtitle';
import { reviewKindIcon } from './review-kind-icons';
import { useDismissiblePlusPrompt } from './use-dismissible-plus-prompt';

/**
 * Kinds that are about a note, and kinds that are about a passage.
 *
 * `highlight` sits with the passages because that is what the reader marked, and `connection`
 * and `thread` sit with the notes because both are questions about their own writing.
 */
const PASSAGE_KINDS = new Set<ReviewItemKind>(['verse', 'highlight']);

/**
 * One of each, closed: a note and a passage.
 *
 * Three of anything invites scanning; one of each invites answering, and it guarantees the two
 * halves of the feature are both visible rather than three notes crowding the verse out. The
 * rest is one tap away and nothing is hidden — see the fold below.
 */
function collapsedReviewRows(items: readonly ReviewItemView[]): ReviewItemView[] {
  const note = items.find((item) => !PASSAGE_KINDS.has(item.kind));
  const passage = items.find((item) => PASSAGE_KINDS.has(item.kind));
  return items.filter((item) => item === note || item === passage);
}

/** "3 more" once the full list is known, and "See all" while it is not. */
function foldedLabel(folded: number | null): string {
  return folded !== null && folded > 0 ? `${folded} more` : REVIEW_SEE_ALL_COPY;
}

export default function PrototypeReviewSection() {
  const navigate = useNavigate();
  const { openReviewDock } = useProtoShell();
  const { isGuest } = useHarvousIdentity();
  const review = useHasFeature('review');
  const challengesFeature = useHasFeature('challenges');
  const { dismissed: plusPromptDismissed, dismiss: dismissPlusPrompt } = useDismissiblePlusPrompt();

  const [expanded, setExpanded] = useState(false);
  const inboxQuery = useReviewInbox();
  /*
   * The full list, fetched only once the reader asks for it. The inbox read is capped at three
   * and cannot answer "show me the rest", and paying for every waiting item on every Activity
   * load would be a cost nobody asked for.
   */
  const allQuery = useReviewItems('active', { enabled: expanded });
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

  const inboxItems = inboxQuery.data?.items ?? [];
  // While the expanded list is still in flight, keep showing the three we already have rather
  // than collapsing to nothing and back.
  const items = expanded ? (allQuery.data?.items ?? inboxItems) : inboxItems;
  const activeChallenges = challengesQuery.data?.challenges ?? [];

  /*
   * Reviews first, then one challenge, and the cap applies to the whole stack.
   *
   * One challenge rather than all of them because a path is a sitting's worth of work on its
   * own; three open paths listed together is a backlog wearing a different hat. The rest are
   * on the Review page.
   */
  const challengeRow = activeChallenges[0];
  const reviewRows = expanded ? items : collapsedReviewRows(items);
  /*
   * How many are folded away, or null when that is not known.
   *
   * The inbox read is capped at three and reports `hasMore` as a boolean, deliberately — a
   * number in that payload is a number that eventually gets rendered as "27 due". So until the
   * full list has been fetched once, the count behind the fold is genuinely unknown, and the
   * label says "See all" rather than guessing. Guessing printed "1 more" over two items.
   */
  const fullList = allQuery.data?.items ?? null;
  const folded =
    fullList !== null
      ? Math.max(0, fullList.length - reviewRows.length)
      : inboxQuery.data?.hasMore
        ? null
        : Math.max(0, items.length - reviewRows.length);
  const moreThanShown = folded === null || folded > 0;

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
          /*
           * The subject on top, what to do underneath — the way Home reads. The question used to
           * be the title, which left a shelf of rows all asking things with no visible subject.
           * The full question is in the dock, where the card stands alone.
           */
          title={reviewRowSubject(item)}
          meta={[
            item.task,
            // Why it is here, dropped when the subject above already said it.
            reviewRowSource(item, reviewRowSubject(item)),
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

      {/*
        * The study feed's own fold, not a list row.
        *
        * A row with a chevron is how you say "this goes somewhere". This goes nowhere — it
        * unfolds what is already here — which is exactly what `.proto-feed-part__more` above
        * the Review section already means, a few centimetres up the same page.
        */}
      {(moreThanShown || expanded) && reviewRows.length > 0 ? (
        <button
          type="button"
          className="proto-feed-part__more"
          onClick={() => setExpanded((open) => !open)}
        >
          <span>{expanded ? REVIEW_SEE_LESS_COPY : foldedLabel(folded)}</span>
          <Icon name={expanded ? 'caret-up' : 'caret-down'} size={10} />
        </button>
      ) : null}
    </PrototypeHomeSection>
  );
}
