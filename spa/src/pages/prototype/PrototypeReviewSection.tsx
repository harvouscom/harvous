import { Suspense, lazy, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import ProtoDeck from './ProtoDeck';
import { scrollCollapsedSectionIntoView } from '../../lib/proto-collapse-scroll';
import PrototypeHomeRow from './PrototypeHomeRow';
import PrototypeReviewRow, { reviewRowActions } from './PrototypeReviewRow';
import PrototypeReviewSittingCard from './PrototypeReviewSittingCard';
import { nextSittingAt, pickSittingHead } from './review-sitting-head';
import {
  reviewSampleDayKey,
  useReviewAccessLevel,
  useReviewInbox,
  useReviewItems,
  useReviewItemsSummary,
  useReviewSample,
  useReviewSession,
  type SampleExerciseKind,
} from '../../hooks/queries/useReview';
import { REVIEW_MAX_ATTEMPTS, REVIEW_INBOX_MAX_ROWS } from '@/utils/review-item-kinds';
/*
 * The one card here that only an account *without* Review ever renders — and it carries four
 * answer surfaces, its own copy and a chooser. Eagerly imported it sat on the critical path of
 * every route, including sign-in, for every subscriber who will never see it.
 */
const PrototypeReviewSample = lazy(() => import('./PrototypeReviewSample'));
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
  REVIEW_SECTION_TITLE,
  REVIEW_EMPTY_NOTHING_YET_TITLE,
  REVIEW_EMPTY_NOTHING_YET_BODY,
  reviewColdStartOpensCopy,
} from './proto-review-copy';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import { fillFraming } from '@/utils/review-framing';
import { reviewRowSource, reviewRowSubject } from '@/utils/review-row-subtitle';
import { reviewKindIcon } from './review-kind-icons';
import { describeNextDue } from '@/utils/review-scheduling';
import { recallChip } from './PrototypeRecallStateChip';
import { useDismissiblePlusPrompt } from './use-dismissible-plus-prompt';
import { useDismissibleReviewSample } from './use-dismissible-review-sample';

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

/**
 * Review on Home, as a deck: the question you would be asked next on top, the rest of today's
 * sitting peeking out under it.
 *
 * It was a section — a heading over the sitting card, two rows of the next questions, the
 * active challenge and a "See all" bar. The two rows were the same promise as the card ("there
 * is more after this one") said twice, and they are what the deck's edges now say without words.
 * The fold stays, at the card's foot, for anyone who wants the whole list. The challenge moved
 * to Pick up (`PrototypeChallengeContinueRow`): a challenge in progress is something you were
 * doing, not a question.
 *
 * Who sees what is unchanged: a guest nothing, an account without Review the daily sample and
 * the Plus offer (as two cards), a cold start its empty state, Plus with nothing due nothing.
 */
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
  /*
   * The sitting the dock will ask, already warm — Home fetches it with its other queries
   * (`use-home-surface-data.ts`), under the same key. Read here only to pick the card's question,
   * so that what the card shows is exactly what Begin opens.
   */
  const sessionQuery = useReviewSession();
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
      <ProtoDeck label={REVIEW_SECTION_TITLE} pager="foot">
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
      </ProtoDeck>
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
  /* The card's question — see `pickSittingHead` for why it is not simply the shelf's first. */
  const head = pickSittingHead(sessionQuery.data?.items, inboxItems);
  /* Never listed twice: the card is where the head is, so the rows start after it. */
  const items = (expanded ? (dueActive ?? inboxItems) : inboxItems)
    .filter((item) => item.id !== head?.id)
    .slice(0, REVIEW_INBOX_MAX_ROWS);
  const today = inboxQuery.data?.today ?? null;
  /*
   * The rest of today, behind the card. Closed, none of it is listed — the deck's edges are what
   * say it is there — so the fold has more of today to open whenever anything follows the head.
   */
  const inboxShown = inboxItems.filter((item) => item.id !== head?.id).slice(0, REVIEW_INBOX_MAX_ROWS);
  const moreToday = inboxShown.length > 0;
  /*
   * The bar opens the other two sections as well, so it shows whenever any of the three has
   * something in it — including when today is finished and only the later ones remain.
   *
   * But it only says "See all" (or how far through today) while there is more of today behind
   * it. Once today is all on screen or done, "See all" promised more questions and opened onto
   * none — the reader pressed it and found only things not due yet. Then the bar names what it
   * actually opens: what is coming back later, else what was set aside.
   */
  const canExpand = moreToday || expanded || comingBackCount > 0 || setAside.length > 0;

  const hasRows =
    Boolean(head) || items.length > 0 || comingBackCount > 0 || setAside.length > 0;

  /*
   * Today is finished — the one state the shelf could never reach, because a sitting that
   * refilled itself had no end and `!hasRows` returned null rather than saying so.
   */
  const doneForToday = Boolean(
    today && today.goal > 0 && today.answered >= today.goal && inboxItems.length === 0,
  );

  const coldStart = inboxQuery.data?.coldStart ?? null;
  if (!hasRows && coldStart) {
    const opensIn = describeNextDue(coldStart.opensAt);
    return (
      <ProtoDeck label={REVIEW_SECTION_TITLE}>
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
      </ProtoDeck>
    );
  }

  // A church reader whose church has not given them anything yet: the ordinary offer.
  if (accessLevel === 'church' && !hasRows && !doneForToday) {
    return inboxQuery.isSettled ? renderOffer() : null;
  }

  if (!hasRows && !doneForToday) return null;

  const openInDock = (itemId: string) => openReviewDock(itemId);

  const nextReturn = doneForToday ? describeNextDue(nextSittingAt(summaryItems, nowMs)) : null;

  /*
   * The card on top: the sitting's question, or the day's full stop. Without either — nothing due
   * now, only things coming back later or set aside — the rows themselves are the cards.
   */
  const reviewRow = (item: (typeof items)[number]) => (
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
  );
  const hasCard = Boolean(head) || doneForToday;
  /* One edge per question still to come today, at most two — the deck is as deep as the sitting. */
  const peek = (hasCard && !doneForToday ? Math.min(2, inboxShown.length) : undefined) as
    | 0
    | 1
    | 2
    | undefined;

  const footer = (
    <>
      {/*
        * The fold says only "See all". Today's progress is on the card above, which outlives the
        * fold — answer down to the last question and there is nothing left to open, which is
        * exactly when a reader most wants to see how close they are — and the deck must never
        * carry two things saying the same number.
        */}
      {canExpand ? (
        <button
          type="button"
          className="proto-feed-part__more"
          /* Collapsing brings the deck's top back, because this bar is below the rows it just
             removed. */
          onClick={(e) => {
            if (expanded) scrollCollapsedSectionIntoView(e.currentTarget.closest('.proto-deck'));
            setExpanded((open) => !open);
          }}
        >
          <span>
            {expanded
              ? REVIEW_SEE_LESS_COPY
              : moreToday
                ? REVIEW_SEE_ALL_COPY
                : comingBackCount > 0
                  ? REVIEW_COMING_BACK_HEADING
                  : REVIEW_SET_ASIDE_HEADING}
          </span>
          <Icon name={expanded ? 'caret-up' : 'caret-down'} size={10} />
        </button>
      ) : null}

      {/* Opened, one list: the rest of today, then what is coming back, then what was set
          aside — headings inside it rather than three more buttons. */}
      {expanded && hasCard ? items.map(reviewRow) : null}

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
    </>
  );

  return (
    <ProtoDeck label={REVIEW_SECTION_TITLE} counter={!hasCard} peek={peek} footer={footer}>
      {hasCard ? (
        <PrototypeReviewSittingCard
          head={doneForToday ? null : head}
          today={today}
          nextReturn={nextReturn}
          onBegin={openInDock}
        />
      ) : (
        items.map(reviewRow)
      )}
    </ProtoDeck>
  );
}
