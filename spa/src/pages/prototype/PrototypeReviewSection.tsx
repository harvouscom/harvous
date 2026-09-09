import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import PrototypeHomeSection from './PrototypeHomeSection';
import PrototypeHomeRow from './PrototypeHomeRow';
import PrototypeReviewRow, { reviewRowActions } from './PrototypeReviewRow';
import {
  reviewSampleDayKey,
  useReviewInbox,
  useReviewItems,
  useReviewItemsSummary,
  useReviewSample,
  type ReviewItemView,
} from '../../hooks/queries/useReview';
import { REVIEW_MAX_ATTEMPTS, REVIEW_INBOX_MAX_ROWS } from '@/utils/review-item-kinds';
import PrototypeReviewSample from './PrototypeReviewSample';
import { useHomeChallenges } from '../../hooks/queries/useChallenges';
import { useDeferReview, useSetReviewStatus } from '../../hooks/mutations/useReviewMutations';
import { useHasFeature } from '../../hooks/useHasFeature';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { useProtoShell } from '../../layouts/proto-shell-context';
import {
  PLUS_BADGE_COPY,
  REVIEW_PLUS_META,
  REVIEW_PLUS_TITLE,
  REVIEW_SEE_ALL_COPY,
  REVIEW_RESUME_COPY,
  REVIEW_SEE_LESS_COPY,
  reviewComingBackCopy,
  reviewSetAsideCopy,
  REVIEW_SECTION_TITLE,
  REVIEW_EMPTY_NOTHING_YET_TITLE,
  REVIEW_EMPTY_NOTHING_YET_BODY,
  reviewColdStartOpensCopy,
} from './proto-review-copy';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import { prototypeChallengeRouteTo } from '@/lib/prototype-path';
import { type ReviewItemKind } from '@/utils/review-item-kinds';
import { fillFraming } from '@/utils/review-framing';
import { reviewRowSource, reviewRowSubject } from '@/utils/review-row-subtitle';
import { reviewKindIcon } from './review-kind-icons';
import { describeNextDue } from '@/utils/review-scheduling';
import { recallChip } from './PrototypeRecallStateChip';
import { reviewFoldRemainder } from './review-fold-remainder';
import { useDismissiblePlusPrompt } from './use-dismissible-plus-prompt';
import { useDismissibleReviewSample } from './use-dismissible-review-sample';

const PASSAGE_KINDS = new Set<ReviewItemKind>(['verse', 'highlight', 'chapter']);

function collapsedReviewRows(items: readonly ReviewItemView[]): ReviewItemView[] {
  const note = items.find((item) => !PASSAGE_KINDS.has(item.kind));
  const passage = items.find((item) => PASSAGE_KINDS.has(item.kind));
  return items.filter((item) => item === note || item === passage);
}

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
  const { dismissed: sampleDismissed, dismiss: dismissSample } = useDismissibleReviewSample();

  const [expanded, setExpanded] = useState(false);
  const [setAsideOpen, setSetAsideOpen] = useState(false);
  const [comingBackOpen, setComingBackOpen] = useState(false);
  const inboxQuery = useReviewInbox();
  const activeSummaryQuery = useReviewItemsSummary('active');
  const activeBuiltQuery = useReviewItems('active', { enabled: expanded || comingBackOpen });
  const nothingActive =
    activeSummaryQuery.isFetched && (activeSummaryQuery.data?.items?.length ?? 0) === 0;
  const allQuery = useReviewItems(undefined, {
    enabled: expanded || setAsideOpen || nothingActive,
  });
  const challengesQuery = useHomeChallenges();
  const hasAnyFeature = review.has || challengesFeature.has;
  const sampleQuery = useReviewSample({
    enabled: review.ready && !hasAnyFeature && !sampleDismissed,
  });
  const [sampleAnswered, setSampleAnswered] = useState(false);
  const defer = useDeferReview();
  const setStatus = useSetReviewStatus();

  if (isGuest) return null;

  const hasAny = review.has || challengesFeature.has;

  if (!hasAny) {
    if (!review.ready) return null;
    const sample = sampleQuery.data?.sample ?? null;
    if (plusPromptDismissed && !sample) return null;
    return (
      <PrototypeHomeSection title={REVIEW_SECTION_TITLE}>
        {sample ? (
          <PrototypeReviewSample
            sample={sample}
            day={reviewSampleDayKey()}
            maxAttempts={REVIEW_MAX_ATTEMPTS}
            onSeePlus={() => void navigate({ to: '/upgrade' })}
            onNotNow={dismissSample}
            onAnswered={() => setSampleAnswered(true)}
          />
        ) : null}
        {plusPromptDismissed || sampleAnswered ? null : (
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
                <Icon name="xmark" size={12} aria-hidden />
              </button>
            </span>
          }
        />
        )}
      </PrototypeHomeSection>
    );
  }

  const inboxItems = inboxQuery.data?.items ?? [];
  const everyItem = allQuery.data?.items ?? null;
  const nowMs = Date.now();
  const summaryItems = activeSummaryQuery.data?.items ?? null;
  const comingBackCount = summaryItems
    ? summaryItems.filter((item) => Date.parse(item.dueAt) > nowMs).length
    : 0;

  const builtItems = activeBuiltQuery.data?.items ?? null;
  const dueActive = builtItems
    ? builtItems.filter((item) => Date.parse(item.dueAt) <= nowMs)
    : null;
  const comingBack = builtItems
    ? builtItems.filter((item) => Date.parse(item.dueAt) > nowMs)
    : [];
  const setAside = everyItem
    ? everyItem.filter((item) => item.status === 'paused' || item.status === 'archived')
    : [];
  const items = (expanded ? (dueActive ?? inboxItems) : inboxItems).slice(0, REVIEW_INBOX_MAX_ROWS);
  const activeChallenges = (challengesQuery.data?.challenges ?? []).filter(
    (c) => c.status === 'active',
  );

  const challengeRow = activeChallenges[0];
  const reviewRows = expanded ? items : collapsedReviewRows(items);
  const folded = expanded ? 0 : reviewFoldRemainder(items.length, reviewRows.length);
  const moreThanShown = folded > 0;

  const hasRows =
    reviewRows.length > 0 || Boolean(challengeRow) || comingBackCount > 0 || setAside.length > 0;

  const coldStart = inboxQuery.data?.coldStart ?? null;
  if (!hasRows && coldStart) {
    const opensIn = describeNextDue(coldStart.opensAt);
    return (
      <PrototypeHomeSection title={REVIEW_SECTION_TITLE}>
        <PrototypeListEmptyState
          iconName="seedling"
          title={REVIEW_EMPTY_NOTHING_YET_TITLE}
          description={
            <>
              <p className="proto-list-empty-state__line">{REVIEW_EMPTY_NOTHING_YET_BODY}</p>
              {opensIn ? (
                <p className="proto-list-empty-state__line">{reviewColdStartOpensCopy(opensIn)}</p>
              ) : null}
            </>
          }
        />
      </PrototypeHomeSection>
    );
  }

  if (!hasRows) return null;

  const openInDock = (itemId: string) => openReviewDock(itemId);

  return (
    <PrototypeHomeSection title={REVIEW_SECTION_TITLE}>
      {reviewRows.map((item) => (
        <PrototypeReviewRow
          key={item.id}
          icon={reviewKindIcon(item.kind)}
          title={reviewRowSubject(item)}
          meta={[
            item.task,
            item.framing ? fillFraming(item.framing) : reviewRowSource(item, reviewRowSubject(item)),
          ]}
          titleTrailing={recallChip(item)}
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
          meta={[`Step ${Math.min(challengeRow.currentStepIndex + 1, challengeRow.totalSteps)} of ${challengeRow.totalSteps}`]}
          onClick={() =>
            void navigate({
              to: prototypeChallengeRouteTo(),
              params: { challengeId: challengeRow.id },
            })
          }
        />
      ) : null}

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

      {comingBackCount > 0 ? (
        <>
          <button
            type="button"
            className="proto-feed-part__more"
            onClick={() => setComingBackOpen((open) => !open)}
          >
            <span>{reviewComingBackCopy(comingBackCount)}</span>
            <Icon name={comingBackOpen ? 'caret-up' : 'caret-down'} size={10} />
          </button>
          {comingBackOpen
            ? comingBack.slice(0, REVIEW_INBOX_MAX_ROWS).map((item) => (
                <PrototypeReviewRow
                  key={item.id}
                  icon={reviewKindIcon(item.kind)}
                  title={reviewRowSubject(item)}
                  meta={[item.task, describeNextDue(item.dueAt)]}
                  titleTrailing={recallChip(item)}
                  onOpen={() => openInDock(item.id)}
                  actions={reviewRowActions({
                    onDefer: () => defer.mutate(item.id),
                    onPause: () => setStatus.mutate({ itemId: item.id, status: 'paused' }),
                    onRemove: () => setStatus.mutate({ itemId: item.id, status: 'archived' }),
                  })}
                />
              ))
            : null}
        </>
      ) : null}

      {setAside.length > 0 ? (
        <>
          <button
            type="button"
            className="proto-feed-part__more"
            onClick={() => setSetAsideOpen((open) => !open)}
          >
            <span>{reviewSetAsideCopy(setAside.length)}</span>
            <Icon name={setAsideOpen ? 'caret-up' : 'caret-down'} size={10} />
          </button>
          {setAsideOpen
            ? setAside.map((item) => (
                <PrototypeHomeRow
                  key={item.id}
                  icon={item.status === 'paused' ? 'circle-minus' : 'eye-slash'}
                  title={reviewRowSubject(item)}
                  meta={[REVIEW_RESUME_COPY]}
                  onClick={() => setStatus.mutate({ itemId: item.id, status: 'active' })}
                />
              ))
            : null}
        </>
      ) : null}
    </PrototypeHomeSection>
  );
}
