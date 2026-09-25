import { Suspense, lazy, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import PrototypeHomeSection from './PrototypeHomeSection';
import {
  enclosingHomeSection,
  scrollCollapsedSectionIntoView,
} from '../../lib/proto-collapse-scroll';
import PrototypeHomeRow from './PrototypeHomeRow';
import PrototypeReviewRow, { reviewRowActions } from './PrototypeReviewRow';
import {
  reviewSampleDayKey,
  useReviewAccessLevel,
  useReviewInbox,
  useReviewItems,
  useReviewItemsSummary,
  useReviewSample,
  type SampleExerciseKind,
} from '../../hooks/queries/useReview';
import { REVIEW_MAX_ATTEMPTS, REVIEW_INBOX_MAX_ROWS } from '@/utils/review-item-kinds';
/*
 * The one card here that only an account *without* Review ever renders — and it carries four
 * answer surfaces, its own copy and a chooser. Eagerly imported it sat on the critical path of
 * every route, including sign-in, for every subscriber who will never see it.
 */
const PrototypeReviewSample = lazy(() => import('./PrototypeReviewSample'));
import { useHomeChallenges } from '../../hooks/queries/useChallenges';
import { useDeferReview, useSetReviewStatus } from '../../hooks/mutations/useReviewMutations';
import { useHasFeature } from '../../hooks/useHasFeature';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { useProtoShell } from '../../layouts/proto-shell-context';
import {
  PLUS_BADGE_COPY,
  REVIEW_PLUS_META,
  REVIEW_OWN_STUDY_PLUS_TITLE,
  REVIEW_PLUS_TITLE,
  REVIEW_SEE_ALL_COPY,
  REVIEW_RESUME_COPY,
  REVIEW_SEE_LESS_COPY,
  REVIEW_COMING_BACK_HEADING,
  REVIEW_SET_ASIDE_HEADING,
  REVIEW_TODAY_DONE_COPY,
  reviewNextReturnCopy,
  reviewTodayProgressCopy,
  REVIEW_SECTION_TITLE,
  REVIEW_EMPTY_NOTHING_YET_TITLE,
  REVIEW_EMPTY_NOTHING_YET_BODY,
  reviewColdStartOpensCopy,
} from './proto-review-copy';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import { prototypeChallengeRouteTo } from '@/lib/prototype-path';
import { fillFraming } from '@/utils/review-framing';
import { reviewRowSource, reviewRowSubject } from '@/utils/review-row-subtitle';
import { reviewKindIcon } from './review-kind-icons';
import { describeNextDue } from '@/utils/review-scheduling';
import { recallChip } from './PrototypeRecallStateChip';
import { collapsedReviewRows } from './review-collapsed-rows';
import { useDismissiblePlusPrompt } from './use-dismissible-plus-prompt';
import { useDismissibleReviewSample } from './use-dismissible-review-sample';

/**
 * What the one fold says when it is closed.
 *
 * It used to read "N more", which was `min(8, rows) - 2` and could not move: the inbox refilled
 * to eight on every read, including with the items just answered. So the number stood still
 * while the reader worked, directly above "18 coming back later", which climbed as they did.
 * Between them they said, accurately, that nothing you do here makes any difference.
 *
 * Progress through today's sitting instead — a finite thing that ends. Falls back to "See all"
 * when the server sent no day, which is the label it always had.
 */
function foldedLabel(today: { answered: number; goal: number } | null): string {
  if (!today || today.goal <= 0) return REVIEW_SEE_ALL_COPY;
  return reviewTodayProgressCopy(today.answered, today.goal);
}

/**
 * The task line, with the exercise it is wearing named in front of it.
 *
 * One word — "Blanks · Fill in the blanks" — so a reader scanning the shelf can see which rows
 * are a tap and which will want typing, and pick the one they have a minute for.
 *
 * **No glyph here, though the dock has one.** A row already carries an icon for its subject, and
 * a second one for the exercise put two glyphs and two labels in front of the thing being
 * reviewed. The dock has one card and room to spare; a shelf does not.
 *
 * Falls back to the bare task for an item from before the server sent a family.
 */
function reviewRowTask(item: { task: string; exercise?: { label: string } | null }) {
  if (!item.exercise) return item.task;
  return (
    <>
      <span className="proto-review-row__exercise">{item.exercise.label}</span>
      {' · '}
      {item.task}
    </>
  );
}

export default function PrototypeReviewSection() {
  const navigate = useNavigate();
  const { openReviewDock } = useProtoShell();
  const { isGuest } = useHarvousIdentity();
  const review = useHasFeature('review');
  /* Plus, a church's questions only, or neither — see useReviewAccessLevel. */
  const accessLevel = useReviewAccessLevel();
  const challengesFeature = useHasFeature('challenges');
  const { dismissed: plusPromptDismissed, dismiss: dismissPlusPrompt } = useDismissiblePlusPrompt();
  const { dismissed: sampleDismissed, dismiss: dismissSample } = useDismissibleReviewSample();

  /*
   * One fold, not three. "N more", "18 coming back later" and "2 set aside" were three bars
   * stacked under two rows of content, each opening a list of its own — a lane whose controls
   * outnumbered the thing it was offering. Opened, this one shows the rest of today first and
   * then the other two as quiet headings inside the same list, which is where they belong: they
   * are parts of the same queue, not separate places.
   */
  const [expanded, setExpanded] = useState(false);
  const inboxQuery = useReviewInbox();
  const activeSummaryQuery = useReviewItemsSummary('active');
  const activeBuiltQuery = useReviewItems('active', { enabled: expanded });
  const nothingActive =
    activeSummaryQuery.isFetched && (activeSummaryQuery.data?.items?.length ?? 0) === 0;
  const allQuery = useReviewItems(undefined, {
    enabled: expanded || nothingActive,
  });
  const challengesQuery = useHomeChallenges();
  const hasAnyFeature = accessLevel === 'full' || challengesFeature.has;
  /*
   * Which verse, in which translation, asked which way — the three things the sample card can
   * change. All three are query inputs rather than card state, because the question is built on
   * the server and marked there: the card cannot rebuild one locally without the two ends
   * disagreeing about what was asked.
   */
  const [sampleTranslation, setSampleTranslation] = useState<string | undefined>(undefined);
  const [sampleExercise, setSampleExercise] = useState<SampleExerciseKind | undefined>(undefined);
  const sampleQuery = useReviewSample({
    enabled: review.ready && !hasAnyFeature && !sampleDismissed,
    translation: sampleTranslation,
    exercise: sampleExercise,
  });
  const [sampleAnswered, setSampleAnswered] = useState(false);
  const defer = useDeferReview();
  const setStatus = useSetReviewStatus();

  if (isGuest) return null;

  const hasAny = accessLevel !== 'none' || challengesFeature.has;

  /* What someone without their own Review sees: the daily sample and the Plus offer. Also what a
     church reader sees before their church has given them anything. */
  const renderOffer = () => {
    if (!review.ready) return null;
    const sample = sampleQuery.data?.sample ?? null;
    if (plusPromptDismissed && !sample) return null;
    return (
      <PrototypeHomeSection title={REVIEW_SECTION_TITLE}>
        {sample ? (
          /* No fallback: the card only exists once its own fetch has answered, and a
             placeholder would flash where it is about to be. */
          <Suspense fallback={null}>
          <PrototypeReviewSample
            sample={sample}
            day={reviewSampleDayKey()}
            maxAttempts={REVIEW_MAX_ATTEMPTS}
            onSeePlus={() => void navigate({ to: '/upgrade' })}
            onNotNow={dismissSample}
            onAnswered={() => setSampleAnswered(true)}
            onTranslationChange={setSampleTranslation}
            onExerciseChange={setSampleExercise}
          />
          </Suspense>
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
  };

  if (!hasAny) return renderOffer();

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
  const today = inboxQuery.data?.today ?? null;
  const moreThanShown = items.length > reviewRows.length;
  /* The bar opens the other two sections as well, so it shows whenever any of the three has
     something in it — including when today is finished and only the later ones remain. */
  const canExpand =
    moreThanShown || expanded || comingBackCount > 0 || setAside.length > 0;

  const hasRows =
    reviewRows.length > 0 || Boolean(challengeRow) || comingBackCount > 0 || setAside.length > 0;

  /*
   * Today is finished — the one state the shelf could never reach, because a sitting that
   * refilled itself had no end and `!hasRows` returned null rather than saying so.
   */
  const doneForToday = Boolean(
    today && today.goal > 0 && today.answered >= today.goal && reviewRows.length === 0,
  );

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

  // A church reader whose church has not given them anything yet: the ordinary offer.
  if (accessLevel === 'church' && !hasRows && !doneForToday && !challengeRow) {
    return inboxQuery.isSettled ? renderOffer() : null;
  }

  if (!hasRows && !doneForToday) return null;

  const openInDock = (itemId: string) => openReviewDock(itemId);

  const nextUp = comingBack.length ? describeNextDue(comingBack[0].dueAt) : null;

  return (
    <PrototypeHomeSection title={REVIEW_SECTION_TITLE}>
      {doneForToday ? (
        /* Said once, quietly, and not as a row that can be pressed — there is nothing to press.
           The next return is named because "done" without "and then?" is a dead end. */
        <p className="proto-review-section__done">
          {REVIEW_TODAY_DONE_COPY}
          {nextUp ? ` ${reviewNextReturnCopy(nextUp)}` : ''}
        </p>
      ) : null}
      {reviewRows.map((item) => (
        <PrototypeReviewRow
          key={item.id}
          icon={reviewKindIcon(item.kind)}
          title={reviewRowSubject(item)}
          meta={[
            reviewRowTask(item),
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

      {/*
        * Progress lives in the lane, not on the control.
        *
        * The fold only exists when there is something behind it, and the day's progress has to
        * outlast that: answer down to the last two questions and there is nothing left to open,
        * which is exactly the moment a reader most wants to see how close they are. Same slot,
        * never both at once — a statement when there is nothing to open, the fold's own label
        * when there is, so the lane never carries two things saying the same thing.
        */}
      {!canExpand && !doneForToday && today && today.goal > 0 ? (
        <p className="proto-review-section__progress">{foldedLabel(today)}</p>
      ) : null}

      {canExpand ? (
        <button
          type="button"
          className="proto-feed-part__more"
          /* Same as every other fold on Home: collapsing brings the lane's top
             back, because this bar is below the rows it just removed. Found from
             the button rather than a ref — this toggle lives inside a
             `PrototypeHomeSection` it does not own. */
          onClick={(e) => {
            if (expanded) scrollCollapsedSectionIntoView(enclosingHomeSection(e.currentTarget));
            setExpanded((open) => !open);
          }}
        >
          <span>{expanded ? REVIEW_SEE_LESS_COPY : foldedLabel(today)}</span>
          <Icon name={expanded ? 'caret-up' : 'caret-down'} size={10} />
        </button>
      ) : null}

      {/*
        * Opened, the lane reads as one list: the rest of today, then what is coming back, then
        * what has been set aside. Headings rather than three more buttons — these are parts of
        * the same queue, and pressing a second control to reach the second part of a list you
        * have already opened is a control that earns nothing.
        */}
      {expanded && comingBack.length > 0 ? (
        <>
          <p className="proto-review-section__subhead">{REVIEW_COMING_BACK_HEADING}</p>
          {comingBack.slice(0, REVIEW_INBOX_MAX_ROWS).map((item) => (
            <PrototypeReviewRow
              key={item.id}
              icon={reviewKindIcon(item.kind)}
              title={reviewRowSubject(item)}
              meta={[reviewRowTask(item), describeNextDue(item.dueAt)]}
              titleTrailing={recallChip(item)}
              onOpen={() => openInDock(item.id)}
              actions={reviewRowActions({
                onDefer: () => defer.mutate(item.id),
                onPause: () => setStatus.mutate({ itemId: item.id, status: 'paused' }),
                onRemove: () => setStatus.mutate({ itemId: item.id, status: 'archived' }),
              })}
            />
          ))}
        </>
      ) : null}

      {expanded && setAside.length > 0 ? (
        <>
          <p className="proto-review-section__subhead">{REVIEW_SET_ASIDE_HEADING}</p>
          {setAside.slice(0, REVIEW_INBOX_MAX_ROWS).map((item) => (
            <PrototypeHomeRow
              key={item.id}
              icon={item.status === 'paused' ? 'circle-minus' : 'eye-slash'}
              title={reviewRowSubject(item)}
              meta={[REVIEW_RESUME_COPY]}
              onClick={() => setStatus.mutate({ itemId: item.id, status: 'active' })}
            />
          ))}
        </>
      ) : null}

      {/*
        * A church reader's Review is their church's questions. Their own study coming back on a
        * schedule is Plus — offered once, quietly, at the foot, and dismissible like the offer a
        * reader without Review sees.
        */}
      {accessLevel === 'church' && !plusPromptDismissed ? (
        <PrototypeHomeRow
          icon="arrows-rotate"
          title={REVIEW_OWN_STUDY_PLUS_TITLE}
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
      ) : null}
    </PrototypeHomeSection>
  );
}
