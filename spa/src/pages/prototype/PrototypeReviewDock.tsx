/**
 * Review, as a card in the study-dock band rather than a page of its own.
 *
 * It shipped as a full-screen session first, and that was the wrong shape twice over: a page
 * of mostly white space around two sentences, and a destination you had to leave your study to
 * visit. A question about a note belongs beside the note, in the furniture the app already uses
 * to put something beside a note — the same floating card a scripture pill or a highlight opens.
 *
 * Three properties follow from living in that band, and they are the point:
 *
 * - **It persists.** The host is `PrototypeEditorChromeBar`, a layout sibling outside the
 *   router's Outlet, so the card is the same React instance on Activity, in a note, and in the
 *   reader. A question asked on Activity survives opening the note it is about.
 * - **It shares.** On a note it sits beside the note's own dock carousel in one band, collapsed
 *   to its header line, so it never covers the editor and never competes for the bottom of the
 *   screen.
 * - **It hands off.** Revealing a note-backed item does not render the note in here; it stacks
 *   the real note over the card and puts the verdicts on the stack's edge. The reader answers
 *   while looking at their actual note, in the actual editor, and the old reveal's raw-HTML
 *   rendering — which mis-rendered scripture quote blocks — is gone entirely.
 *
 * The dock rules from the strategy doc hold here: it never covers the editor (the band floats
 * above the chrome row and only cards take pointer events), and it never steals focus — the
 * textarea has no autofocus, because a card that appears while you are typing and takes the
 * caret is the interruption this whole feature is supposed not to be.
 */
import { maxAttemptsFor } from '@/utils/review-item-kinds';
import { describeNextDue } from '@/utils/review-scheduling';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import {
  echoMatchesAnswer,
  reviewAnswerEcho,
  reviewResultSubject,
  type ReviewEchoShown,
} from '@/utils/review-answer-echo';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { prototypeHref } from '@/lib/prototype-path';
import Icon from '@/components/react/Icon';
import ProtoLoadingDots from './ProtoLoadingDots';
import StudyDockCardShell from '@/components/react/StudyDockCardShell';
import {
  canJudgeRecall,
  resolveReviewDockItem,
  reviewQuestionKey,
  shouldReleaseHeldItem,
  sittingIsStale,
  sittingProgress,
} from '@/utils/review-dock-state';
import { reviewRowSubtitle } from '@/utils/review-row-subtitle';
import { noteParamSlug } from './proto-route-slugs';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import { threadClusterDrillSlug } from '@/utils/thread-cluster-bulk-actions';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { reviewRungIsGraded } from '@/utils/review-prompts';
import { toast } from '@/utils/toast';
import { fillFraming } from '@/utils/review-framing';
/*
 * For `.scripture-pill-chrome__trans-chip` on the header's translation badge. Imported here the
 * way `PassageContextStrip` and the reader pane import it — the sheet is only in the bundle
 * because a component that needs it asked for it, and the dock can be the first thing on screen
 * with no reader ever mounted.
 */
import '@/styles/scripture-pill-chrome.css';
import '../../styles/review-exercises.css';
import { ExerciseStage, heroSize } from './review-exercises/ExerciseStage';
import { ChoiceOptions } from './review-exercises/ChoiceOptions';
import { GapLine } from './review-exercises/GapLine';
import { nextOpenGap, WordBankLine, WordTray } from './review-exercises/WordBank';
import { OrderSlots, OrderTray } from './review-exercises/OrderPieces';
import { OpeningLine, PairRail, Rail, slotFill } from './review-exercises/RailSlot';
import { landAgain, readerRouteForReference } from '../../utils/reader-nav';
import { isSubmitKey, isTypingTarget } from './review-dock-keys';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { useHasFeature } from '../../hooks/useHasFeature';
import {
  useReviewItems,
  useReviewReveal,
  usePrefetchReviewReveals,
  useReviewSession,
  type ReviewItemView,
} from '../../hooks/queries/useReview';
import {
  useReviewFeedback,
  useDeferReview,
  useReviewOutcome,
  useSetReviewStatus,
  type ReviewOutcomeResponse,
} from '../../hooks/mutations/useReviewMutations';
import { useLibraryPanelNav } from './library-panel/use-library-panel-nav';
import { buildReviewCardStackOrigin } from './paper-stack-origins';
import {
  REVIEW_ECHO_LABEL,
  REVIEW_EMPTY_NOTHING_YET_BODY,
  REVIEW_EMPTY_NOTHING_YET_TITLE,
  REVIEW_EMPTY_UP_TO_DATE_TITLE,
  REVIEW_SITTING_DONE_TITLE,
  REVIEW_PRACTICE_LABEL,
  REVIEW_SITTING_PROGRESS_LABEL,
  reviewNextDueCopy,
  REVIEW_ALMOST_COPY,
  REVIEW_ATTEMPT_PLACEHOLDER,
  REVIEW_LOADING_LABEL,
  REVIEW_REVEAL_FAILED_COPY,
  REVIEW_REVEAL_RETRY_COPY,
  REVIEW_RECALLED_COPY,
  REVIEW_REVEALED_ACK_COPY,
  REVIEW_CHECK_COPY,
  REVIEW_CROSSED_TO_HOLDING_COPY,
  REVIEW_DEFER_COPY,
  REVIEW_PAUSE_COPY,
  REVIEW_FEEDBACK_ACK_COPY,
  REVIEW_FEEDBACK_DOWN_COPY,
  REVIEW_FEEDBACK_SETTINGS_LINK_COPY,
  REVIEW_FEEDBACK_UP_COPY,
  reviewFeedbackOfferCopy,
  REVIEW_OUTCOME_ACK_COPY,
  REVIEW_REVEAL_CONNECTION_COPY,
  REVIEW_REVEAL_COPY,
  REVIEW_REVEAL_THREAD_COPY,
  REVIEW_REVEAL_VERSE_COPY,
  REVIEW_REVEAL_CHAPTER_COPY,
  REVIEW_ALTERED_CAPTION,
  REVIEW_TRUTH_LABEL,
  REVIEW_YOUR_WORDS_LABEL,
  REVIEW_ENOUGH_COPY,
  REVIEW_NEXT_COPY,
  REVIEW_TRY_AGAIN_COPY,
  reviewPartsAgainCopy,
  reviewReachedCopy,
  REVIEW_ANSWER_LABEL,
  REVIEW_INDEX_ANSWER_LABEL,
  REVIEW_CONTEXT_LABEL,
  REVIEW_PART_STATE_LABEL,
  REVIEW_CONTEXT_MARKED_LABEL,
  REVIEW_CONTEXT_OPEN_NOTE_COPY,
  REVIEW_CONTEXT_OPEN_READER_COPY,
  REVIEW_CONTEXT_WROTE_LABEL,
  REVIEW_INITIALS_PLACEHOLDER,
  reviewHintLeadCopy,
  reviewHintLetterCopy,
  reviewHintWordCopy,
} from './proto-review-copy';

/** Kinds whose answer is another surface: the note itself, or the Thread beside you. */
function revealsElsewhere(kind: string, noteId: string | null): boolean {
  if (kind === 'thread') return true;
  return (kind === 'note' || kind === 'connection' || kind === 'highlight') && Boolean(noteId);
}

/**
 * The one line at the end of a sitting.
 *
 * Counts of what was *done*, never of what remains — the difference between "you returned to
 * three things" and "27 due" is the whole posture of the feature.
 */
function sittingCloseLine(sitting: { answered: number; holding: number }): string {
  const things = sitting.answered === 1 ? 'one thing' : `${sitting.answered} things`;
  if (sitting.holding === 0) return `You returned to ${things}.`;
  const holding = sitting.holding === 1 ? 'One is holding' : `${sitting.holding} are holding`;
  return `You returned to ${things}. ${holding}.`;
}

/**
 * What the reveal button says, which is where it takes you.
 *
 * A verse opens the passage, a Thread opens the Thread, a connection opens both notes. Naming
 * the destination is also the honest thing: this button no longer shows a panel, it navigates.
 */
function revealLabelFor(kind: ReviewItemView['kind']): string {
  switch (kind) {
    case 'verse':
      return REVIEW_REVEAL_VERSE_COPY;
    case 'chapter':
      return REVIEW_REVEAL_CHAPTER_COPY;
    case 'thread':
      return REVIEW_REVEAL_THREAD_COPY;
    case 'connection':
      return REVIEW_REVEAL_CONNECTION_COPY;
    default:
      return REVIEW_REVEAL_COPY;
  }
}

/** The rungs whose answer key is the curated index rather than the text or the reader. */
const INDEX_KEYED_RUNGS = new Set([
  'verse.theme',
  'verse.person',
  'verse.place',
  'verse.crossref',
  'chapter.person',
  'chapter.place',
]);

/**
 * The rung that asks for the verse in your own typing. One, now: the first rung asked for it
 * too until it became the recognition tap its name always meant.
 */
const FREE_RECALL_RUNGS = new Set(['verse.recall']);

/*
 * The rungs drawn as a rail, and what their empty place is called. The label names the kind of
 * answer, never the answer: "Next verse", not a reference, or the question becomes arithmetic.
 */
const NOTE_RAIL_SLOT: Partial<Record<string, string>> = {
  'note.passage': 'A passage you cited',
  'note.annotation': 'Written on',
  'note.connect': 'Linked to',
};
const VERSE_RAIL_SLOT: Partial<Record<string, string>> = {
  'verse.crossref': 'Cross-referenced with',
  'verse.connect': 'Cited in',
};
/* The rungs whose answer is a verse's opening, asked with the reference and a gap. */
const OPENING_LINE_RUNGS = new Set(['verse.recognize', 'chapter.verse']);

export default function PrototypeReviewDock() {
  const {
    reviewDock,
    closeReviewDock,
    setReviewDockExpanded,
    setReviewDockItem,
    setReviewDockResult,
    stackNote,
    paperStack,
  } = useProtoShell();
  const { isGuest } = useHarvousIdentity();
  const review = useHasFeature('review');
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const libraryNav = useLibraryPanelNav();

  const open = Boolean(reviewDock);
  const sessionQuery = useReviewSession({ enabled: open });
  const sessionItems = useMemo(() => sessionQuery.data?.items ?? [], [sessionQuery.data]);
  /*
   * The full list is only fetched when the session cannot answer. A row on the Review page can
   * ask about something scheduled for next week, which is by definition not in the due queue.
   */
  const needsFallback = Boolean(
    reviewDock?.itemId && !sessionItems.some((i) => i.id === reviewDock.itemId),
  );
  const itemsQuery = useReviewItems(undefined, { enabled: open && needsFallback });
  /** The queue has not answered yet — neither "here is a question" nor "there is nothing". */
  const settling =
    sessionQuery.isPending || sessionQuery.isFetching || (needsFallback && itemsQuery.isPending);

  const fallbackPending = needsFallback && itemsQuery.isPending;
  const queued = useMemo(
    () =>
      resolveReviewDockItem(reviewDock?.itemId, sessionItems, itemsQuery.data?.items ?? [], {
        fallbackPending,
      }),
    [reviewDock?.itemId, sessionItems, itemsQuery.data, fallbackPending],
  );

  /*
   * The question stays put while its answer is being shown.
   *
   * Answering takes the item out of the session optimistically, so the moment the reply landed
   * the queue resolved to the *next* question and the card swapped to it — then swapped back a
   * beat later when the verdict handed over to the result. Choosing an answer flashed the next
   * question at the reader before showing them how they had done.
   *
   * So the answered question is held until the handover, and only then does the queue decide.
   */
  const [heldItem, setHeldItem] = useState<ReviewItemView | null>(null);
  const item = heldItem ?? queued;

  const [attempt, setAttempt] = useState('');
  const [revealed, setRevealed] = useState(false);
  /** One string per gap on the cloze rung. Keyed to the item so a new question starts empty. */
  const [blanks, setBlanks] = useState<string[]>([]);
  /*
   * Which go this is, and what was already tried.
   *
   * A graded rung gets two: being told "back in 4 days" the instant you slip teaches nothing,
   * and trying again while the question is still in front of you is where the repetition works.
   */
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [missed, setMissed] = useState<string[]>([]);
  /*
   * Read through a ref inside `answer`.
   *
   * The callback is memoised on the item and the typed attempt, and adding the go number to its
   * dependencies would rebuild it — and the keyboard handler bound to it — on every miss. Sent
   * from state instead, it went out as 1 both times and the second miss never finalised.
   */
  const attemptNumberRef = useRef(1);
  attemptNumberRef.current = attemptNumber;
  /** Display indices the reader has placed, in the order they placed them. */
  const [placed, setPlaced] = useState<number[]>([]);
  /*
   * What this sitting came to, counted only as it happens.
   *
   * Never a count of what is left — the strategy doc's named failure mode is "27 due", and the
   * cure is that no surface anywhere is able to say a number about work not yet done. This is
   * the opposite number: what you did.
   */
  const [sitting, setSitting] = useState({ answered: 0, holding: 0, practiced: 0 });

  /*
   * A graded rung fetches without being revealed, because on those the puzzle *is* the question
   * — there is nothing to write first. No payload carries an answer key, and the locate rung's
   * deliberately withholds the verse text as well.
   */
  const isGradedRung = item ? reviewRungIsGraded(item) : false;
  /* What identifies the question rather than the item — see `reviewQuestionKey`. */
  const questionKey = reviewQuestionKey(item);
  /* This copy of the item is the second look at something missed, appended by the mutation. */
  const isPractice = item?.practice === true;
  /*
   * Derived from what is still in the queue, not captured when the sitting opened.
   *
   * A sitting is no longer a fixed length: a missed question comes back once, which adds to both
   * halves. A total captured at the start would sit at "8 of 8" with two questions still on the
   * card.
   */
  const progress = sittingProgress(sitting, sessionItems.length);
  /*
   * Keyed by the wording too. The key has carried a translation slot since it was written and
   * nothing ever filled it, so a reader who changed their default mid-session would have been
   * served a cached reveal in the old words.
   */
  const reveal = useReviewReveal(item?.id ?? null, {
    enabled: revealed || isGradedRung,
    translation: item?.translation,
  });
  // Every marked question in the sitting, warmed once the session lands — see the hook.
  usePrefetchReviewReveals(sessionItems);
  const outcome = useReviewOutcome();
  const setStatus = useSetReviewStatus();
  const defer = useDeferReview();
  /*
   * The reader's rating of the question, and the family Settings may be offered for.
   *
   * Both keyed to `lastResult.at` — a fresh result gets a fresh control — and both local, because
   * a vote is a log line rather than state the server hands back on the next fetch. There is no
   * undo: the log is append-only, and a rating that could be taken back would be a setting.
   */
  const feedback = useReviewFeedback();
  const [feedbackVote, setFeedbackVote] = useState<'liked' | 'disliked' | null>(null);
  const [feedbackOffer, setFeedbackOffer] = useState<string | null>(null);
  /*
   * How the last answer went, while the card still has the question on it.
   *
   * The page cannot mark anything, so this is set from the server's reply and nothing else. It
   * exists because a right answer used to be invisible: the card flipped to the result the
   * instant the request came back, so the only feedback on the thing you had just filled in was
   * that it disappeared. `settled` holds the answered question on screen for a beat with its
   * line in the accent blue, then the result takes over.
   */
  /**
   * The goes this question allows. The server decides — it resolves the rung — so this is only
   * a first guess for the first attempt, replaced by what comes back.
   */
  const [attemptsTotal, setAttemptsTotal] = useState<number | null>(null);
  /** Words already tried and wrong on the altered rung, by index. Spent, like a spent chip. */
  const [spentWords, setSpentWords] = useState<number[]>([]);
  /*
   * What the server has handed over after a miss, in the order it handed it over.
   *
   * A retry that repeats the identical question with no new information is a second chance to
   * make the same mistake. One piece per go, and only while a go remains — the finalized answer
   * carries the real answer, so a hint beside it would be a worse version of what is already
   * there. Keyed to the item like every other attempt state, so a new question starts clean.
   */
  const [hints, setHints] = useState<NonNullable<ReviewOutcomeResponse['hint']>[]>([]);
  /** Gaps the server filled in. Locked, because they are no longer being asked. */
  const givenBlanks = useMemo(() => {
    const out = new Map<number, string>();
    for (const hint of hints) if (hint.kind === 'blank') out.set(hint.index, hint.word);
    return out;
  }, [hints]);
  /** The most recent hint that is a line to read rather than a gap to fill. */
  const spokenHint = [...hints].reverse().find((hint) => hint.kind !== 'blank') ?? null;
  const [verdict, setVerdict] = useState<{
    state: 'right' | 'wrong';
    option: string | null;
    /** Per part of what was submitted; absent on rungs whose answer is a single tap. */
    parts?: boolean[];
    reached?: { matched: number; total: number };
  } | null>(null);
  /*
   * A part's own verdict, falling back to the whole answer's. A right answer is right in every
   * part, so only a miss ever differs — which is the case the reader needs broken down.
   */
  const partState = (index: number): 'right' | 'wrong' | undefined => {
    if (!verdict) return undefined;
    if (!verdict.parts) return verdict.state;
    return verdict.parts[index] ? 'right' : 'wrong';
  };

  /*
   * One line after a miss, said as specifically as the answer allows: how many parts landed
   * where there were parts, "not that one" where the answer was a single tap.
   */
  const retryLine =
    verdict?.state === 'wrong' ? (
      /*
       * Announced. The card changes under a screen reader with nothing said about it — the
       * marking is colour and an underline, both invisible to the one reader who most needs to
       * be told they have another go.
       */
      <p className="proto-caption proto-review-dock__retry" role="status" aria-live="polite">
        {verdict.parts && verdict.parts.length > 1
          ? reviewPartsAgainCopy(verdict.parts.filter(Boolean).length, verdict.parts.length)
          : REVIEW_TRY_AGAIN_COPY}
      </p>
    ) : null;

  /**
   * The one thing handed over after a miss, where it is a line rather than a filled gap.
   *
   * Sits above the retry line, so the order reads as "here is something" then "have another go".
   * A `blank` hint never reaches here — it goes into the gap it names, which is the point of the
   * gaps being inputs.
   */
  const hintLine = spokenHint ? (
    <p className="proto-caption proto-review-dock__hint" role="status" aria-live="polite">
      {spokenHint.kind === 'lead'
        ? reviewHintLeadCopy(spokenHint.text)
        : spokenHint.kind === 'word'
          ? reviewHintWordCopy(spokenHint.word)
          : reviewHintLetterCopy(spokenHint.letter)}
    </p>
  ) : null;

  /** What this rung allows: the server's answer once it has spoken, else the rung's own rule. */
  const goesTotal = attemptsTotal ?? (item ? maxAttemptsFor(item.promptKey) : 0);

  const lastResult = reviewDock?.lastResult ?? null;

  /*
   * Where the question came from, under the verdict.
   *
   * This is the gap the feature had: the card said what was asked, what the reader answered and
   * when it comes back, and nothing about the thing in their Harvous it was made from. A verse
   * is in Review *because* they marked it while reading or wrote on it, and that connection —
   * the one the whole feature exists to make — was the part never shown.
   *
   * Rendered only where something is actually known. An empty "From your Harvous" heading over
   * nothing would be worse than no heading, and plenty of items legitimately have no annotation
   * and no framing line.
   */
  /*
   * What the reader wrote on this passage, under the verdict.
   *
   * **Their words only.** This started as a general "where did this come from" block and
   * rendered whatever it could find — a note id, or a provenance line like "Cross-referenced 27
   * times." Neither earns the heading: the first is a button, and the second is a fact from the
   * curated index that is already on the row the reader tapped to get here. A heading reading
   * "From your Harvous" over an index statistic is a claim the block cannot keep.
   *
   * What was actually missing is the one thing the reveal never fetched: the highlight they
   * marked and the thought they wrote on it. So that is all this is, and on an item with
   * neither it renders nothing at all — which is most of them, and correct.
   *
   * The two ways back are buttons and live in the card's own actions row; see below.
   */
  const resultContextBlock = (() => {
    const annotation = lastResult?.context?.annotation;
    const quote = annotation?.quote?.trim() || null;
    const thought = annotation?.thought?.trim() || null;
    if (!quote && !thought) return null;
    return (
      <div className="proto-review-dock__context">
        <p className="proto-caption proto-review-dock__truth-label">{REVIEW_CONTEXT_LABEL}</p>
        {quote ? (
          <>
            <p className="proto-caption proto-review-dock__context-label">
              {REVIEW_CONTEXT_MARKED_LABEL}
            </p>
            <p className="proto-review-dock__verse proto-review-dock__context-quote">{quote}</p>
          </>
        ) : null}
        {thought ? (
          <>
            <p className="proto-caption proto-review-dock__context-label">
              {REVIEW_CONTEXT_WROTE_LABEL}
            </p>
            <p className="proto-review-dock__context-thought">{thought}</p>
          </>
        ) : null}
      </div>
    );
  })();

  /*
   * The ways back, as buttons in the actions row. Offered, never taken: the dock collapses
   * rather than closing and keeps its result, so coming back finds the card as it was.
   */
  const resultContextLinks = (() => {
    const context = lastResult?.context;
    if (!context) return null;
    const reader = context.reference
      ? readerRouteForReference(context.reference, context.translation || 'NET')
      : null;
    if (!context.note && !reader) return null;
    return (
      <>
        {context.note ? (
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
            onClick={() => {
              setReviewDockExpanded(false);
              void navigate({
                to: prototypeNoteRouteTo(),
                params: { noteId: noteParamSlug(context.note!.id) },
                search: PROTOTYPE_NOTE_LIST_NAV_SEARCH,
              });
            }}
          >
            {REVIEW_CONTEXT_OPEN_NOTE_COPY}
          </button>
        ) : null}
        {reader ? (
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
            onClick={() => {
              setReviewDockExpanded(false);
              void navigate(landAgain(reader));
            }}
          >
            {REVIEW_CONTEXT_OPEN_READER_COPY}
          </button>
        ) : null}
      </>
    );
  })();

  /*
   * A new result is a new question, so the rating starts over.
   *
   * Keyed on the timestamp rather than reset inside the answer handler, because the paper-stack
   * path sets `lastResult` from the shell and never runs this component's handler at all.
   */
  useEffect(() => {
    setFeedbackVote(null);
    setFeedbackOffer(null);
  }, [lastResult?.at]);

  const castFeedback = useCallback(
    (vote: 'liked' | 'disliked') => {
      const itemId = lastResult?.itemId;
      if (!itemId) return;
      // Shown as taken straight away: the card should not sit inert while a log line is written.
      setFeedbackVote(vote);
      feedback.mutate(
        { itemId, vote },
        {
          onSuccess: (data) => {
            if (data.offerSettings && data.family) setFeedbackOffer(data.family.label);
          },
          // Put the blocks back rather than leaving a rating that was never recorded.
          onError: () => {
            setFeedbackVote(null);
            setFeedbackOffer(null);
          },
        },
      );
    },
    [feedback, lastResult?.itemId],
  );
  /*
   * When the next scheduled thing comes back, for the empty card.
   *
   * Two sources, because neither alone is right at both moments. The session carries it for the
   * dock opened with nothing already due — but a sitting is deliberately never refetched
   * (`staleTime: Infinity`), or the queue would reshuffle under the reader mid-answer, so its
   * copy is stale the instant they clear the last item. The active list is invalidated by every
   * answer and is already in cache from Home, so it is the one that can speak after a sitting.
   * The freshest wins; the weekday is rendered here because it is the reader's.
   */
  const scheduledQuery = useReviewItems('active', { enabled: open && !queued });
  const nextDueFromItems = useMemo(() => {
    const now = Date.now();
    const soonest = (scheduledQuery.data?.items ?? [])
      .map((i) => Date.parse(i.dueAt))
      .filter((at) => Number.isFinite(at) && at > now)
      .sort((a, b) => a - b)[0];
    return soonest ? new Date(soonest).toISOString() : null;
  }, [scheduledQuery.data]);
  const nextDue = describeNextDue(nextDueFromItems ?? sessionQuery.data?.nextDueAt ?? null);

  /*
   * The result stays until the reader moves on.
   *
   * It used to clear on a timer, on the reasoning that asking someone to acknowledge their own
   * acknowledgement is one interaction too many. That was wrong in both directions: a verse
   * you got wrong and its correction is exactly the thing you want to sit with, and a sitting
   * that advances on its own is a sitting you cannot leave. Nothing here is a queue to clear,
   * so the next question waits to be asked for.
   */

  // A new question is a clean slate; the previous attempt must not sit under it.
  useEffect(() => {
    setAttempt('');
    setRevealed(false);
    setPlaced([]);
    setBlanks([]);
    setAttemptNumber(1);
    setMissed([]);
    setSpentWords([]);
    setVerdict(null);
    setAttemptsTotal(null);
    setHints([]);
    /*
     * Keyed on the *question*, not the item.
     *
     * A missed item comes back once at the tail of the same sitting, so the same id can be asked
     * twice — and on an id-keyed reset the second asking inherited the first's typed answer, its
     * verdict and the truth it had already revealed. `reviewQuestionKey` carries the rung and the
     * review count, which is what the seed builds a question from.
     */
  }, [questionKey]);

  /*
   * Let go of the pinned question once it is no longer the one being looked at.
   *
   * The pin was cleared in exactly one place — the "Next one" button — so every other way out
   * of a result kept it: leaving from the result card and tapping a different row rendered the
   * question that had just been answered while the pointer named the new one, and answering it
   * again re-recorded an outcome against an item that was already rescheduled. The rule is
   * `shouldReleaseHeldItem`, kept pure next door because the interesting cases are timing ones.
   */
  useEffect(() => {
    if (
      shouldReleaseHeldItem({
        heldId: heldItem?.id ?? null,
        requestedId: reviewDock?.itemId,
        hasResult: Boolean(lastResult),
        hasVerdict: Boolean(verdict),
        pending: outcome.isPending,
        dockOpen: open,
      })
    ) {
      setHeldItem(null);
    }
  }, [heldItem?.id, reviewDock?.itemId, lastResult, verdict, outcome.isPending, open]);

  /*
   * A sitting belongs to the open dock, not to the tab.
   *
   * The count is of what the reader did just now; carrying it across a close and a reopen would
   * make the closing line describe two sittings as one.
   */
  useEffect(() => {
    if (!open) setSitting({ answered: 0, holding: 0, practiced: 0 });
  }, [open]);

  /*
   * A sitting that has been sitting there is re-composed as the dock opens.
   *
   * `useReviewSession` is `staleTime: Infinity` so the queue cannot reshuffle under someone
   * mid-answer, which is right for the minutes a sitting lasts and wrong for the hours a tab
   * stays open: the morning's dock was serving yesterday's questions against yesterday's clock.
   * Checked only on the open edge, never while the dock is in use, so the freeze still holds
   * exactly where it was written to.
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (opening && sittingIsStale(sessionQuery.dataUpdatedAt)) void sessionQuery.refetch();
  }, [open, sessionQuery]);

  /*
   * Closing a sitting says what it came to.
   *
   * `sittingCloseLine` existed and was rendered in exactly one place: the empty state, which is
   * reached only by answering every last thing in the queue. Stop after three — which is the
   * normal, encouraged way to stop, and what "one sitting, not a queue to clear" asks for — and
   * the line was never said at all. The one number this feature counts is what was *done*, and
   * it was reserved for the readers who least needed telling.
   */
  const closeSitting = useCallback(() => {
    if (sitting.answered > 0) toast.success(sittingCloseLine(sitting));
    closeReviewDock();
  }, [closeReviewDock, sitting]);

  /*
   * Escape puts the card away without answering it.
   *
   * Never out from under someone mid-word: a gap, a textarea and anything contenteditable are
   * all places the key already belongs to whatever they are typing. It collapses rather than
   * closes, because closing would read as the question having been dealt with.
   */
  useEffect(() => {
    if (!open || !reviewDock?.expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isTypingTarget(event.target)) return;
      setReviewDockExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, reviewDock?.expanded, setReviewDockExpanded]);

  /*
   * Keep the dock's pointer on an item that still exists.
   *
   * Answering drops the item from the session optimistically. Without this the dock would keep
   * naming something that has gone and show its empty state while the queue still has work.
   */
  useEffect(() => {
    if (!reviewDock?.itemId) return;
    // Only ever forward, and never onto something the resolver reached through the fallback:
    // the pointer is cleared on answer, so anything still set here is a live request.
    if (item && item.id !== reviewDock.itemId && sessionItems.some((i) => i.id === item.id)) {
      setReviewDockItem(item.id);
    }
  }, [item, reviewDock?.itemId, sessionItems, setReviewDockItem]);

  const answer = useCallback(
    (
      value: 'recalled' | 'almost' | 'revealed',
      graded?: {
        order?: number[];
        option?: string;
        promptKey?: string;
        wordIndex?: number;
        words?: string[];
        text?: string;
      },
      /**
       * What the reader tapped, for colouring it once the server has marked it. Defaults to
       * the option, which is what it is on every rung whose answer is a chip; the altered rung
       * passes its word index instead, since that is what identifies the thing tapped there.
       */
      picked: string | null = graded?.option ?? null,
      /**
       * What was on screen, for the two answers that are indices into it.
       *
       * Passed in from the render rather than read at handover: this callback is memoised on
       * the item, and the reveal payloads are not in its dependency list — reading
       * `sequenceExercise` inside it would hand back whatever it was when the callback was
       * built, which on a fresh question is null.
       */
      shown?: ReviewEchoShown,
    ) => {
      if (!item) return;
      /*
       * Pinned *before* the request, not on its reply. The mutation drops the item from the
       * session optimistically in `onMutate`, so between tap and reply the queue resolved to the
       * next question — the keyed body remounted, its state reset, and by the time the verdict
       * arrived it was writing into a card that had already moved on and back.
       */
      setHeldItem(item);
      outcome.mutate(
        {
          itemId: item.id,
          outcome: value,
          attemptNumber: attemptNumberRef.current,
          attempt: attempt.trim() || undefined,
          // On a graded rung the server decides; `value` is only the fallback if it cannot.
          answer: graded,
          /* A second look changes nothing about the schedule — see the practice branch in the
             outcome route. The server guards it; this only declares what the card is doing. */
          practice: isPractice,
        },
        {
          onSuccess: (data) => {
            /*
             * Wrong, but not out of goes: keep the question up, mark what was tried, and say so.
             * Nothing was recorded, so there is no result to show and no next question yet.
             */
            if (data.finalized === false) {
              setAttemptNumber((n) => n + 1);
              // The same question, still up: hold it against the refetch the answer kicked off.
              setHeldItem(item);
              if (data.attempts) setAttemptsTotal(data.attempts.total);
              setVerdict({ state: 'wrong', option: picked, parts: data.parts, reached: data.reached });
              /*
               * One thing to go on. A `blank` hint is applied to the gap it names rather than
               * printed as a line — the reader watches the word appear where it belongs, which
               * is the whole point of the gaps being inputs.
               */
              if (data.hint) {
                const hint = data.hint;
                setHints((current) => [...current, hint]);
                if (hint.kind === 'blank') {
                  setBlanks((current) => {
                    const next = [...current];
                    next[hint.index] = hint.word;
                    return next;
                  });
                }
              }
              if (graded?.option) setMissed((m) => [...m, graded.option!]);
              // The altered rung answers with an index, not an option, so it never entered
              // `missed` — a word tapped wrongly stayed live and unmarked on the second go.
              if (Number.isInteger(graded?.wordIndex)) setSpentWords((w) => [...w, graded!.wordIndex!]);
              return;
            }
            // Marked, and shown as marked before the card moves on. Only where the server
            // actually marked something: an ungraded rung has no verdict to colour.
            if (typeof data.correct === 'boolean') {
              setHeldItem(item);
              setVerdict({
                state: data.correct ? 'right' : 'wrong',
                option: picked,
                parts: data.parts,
                reached: data.reached,
              });
              // The last wrong pick is spent like the ones before it, and reads the same.
              if (!data.correct && graded?.option) setMissed((m) => [...m, graded.option!]);
              if (!data.correct && Number.isInteger(graded?.wordIndex)) {
                setSpentWords((w) => [...w, graded!.wordIndex!]);
              }
            }
            const crossedToDurable =
              item.recallState !== 'durable' && data.next.recallState === 'durable';
            const handOver = () => {
              setReviewDockResult({
                // The server's verdict where it marked one; `value` only where it could not.
                outcome: data.outcome ?? value,
                label: data.next.label,
                recallState: data.next.recallState,
                crossedToDurable,
                // The verse the rung withheld. Without it, answering "put these back in order"
                // leaves the reader holding four shuffled phrases and no verse.
                verseText: data.truth?.verseText ?? null,
                correctAnswer: data.correctAnswer ?? null,
                /*
                 * And where the question came from, which the card never said.
                 *
                 * Assembled from the two places that already know: the item carries its own
                 * provenance line and reference, and the reveal carries the highlight and the
                 * thought written on it. Read through the ref — see above.
                 */
                context: {
                  sourceLabel: item.sourceLabel ?? null,
                  sourceAt: item.sourceAt ?? null,
                  framing: item.framing ? fillFraming(item.framing) : null,
                  annotation: revealRef.current?.context?.annotation ?? null,
                  note: item.noteId ? { id: item.noteId, title: item.noteTitle } : null,
                  reference: item.scriptureReference ?? null,
                  translation: item.translation ?? null,
                },
                /*
                 * The question and what was said about it, so the result is a recap rather than
                 * a loose answer. Every rung's submission shape is handled in one place — see
                 * `buildReviewAnswerEcho` — and the two rungs whose answer is a set of indices
                 * are resolved back to words here, where the exercise they indexed is in scope.
                 */
                prompt: item.prompt,
                subject: reviewResultSubject(item),
                echo: reviewAnswerEcho({
                  submitted: graded ?? null,
                  shown,
                  parts: data.parts ?? null,
                  correct: data.correct ?? null,
                }),
                reached: data.reached ?? null,
                fromIndex: INDEX_KEYED_RUNGS.has(item.promptKey),
                leech: data.leech === true,
                stalled: data.stalled === true,
                itemId: item.id,
                at: Date.now(),
              });
              /*
               * A second look counts as work done, and not as an answer.
               *
               * `answered` is what the closing line reports, and a practice pass is the same
               * question a second time — counting it there would tell someone who answered six
               * questions that they answered seven. It still moves the progress bar, because it
               * is a thing they did and a thing that is no longer ahead of them.
               */
              setSitting((current) =>
                isPractice
                  ? { ...current, practiced: current.practiced + 1 }
                  : {
                      ...current,
                      answered: current.answered + 1,
                      holding: current.holding + (data.next.recallState === 'durable' ? 1 : 0),
                    },
              );
              /*
               * Hand the dock back to the queue rather than leaving it pointed at what was just
               * answered.
               *
               * The answered item does not vanish — it is rescheduled, so it is still in the
               * full item list the fallback lookup reads. Leaving the pointer on it made the
               * dock resurrect the question it had just accepted an answer for, wearing a
               * freshly rotated prompt because its review count had gone up. Null means
               * "whatever is next".
               */
              /*
               * The pointer stays off the answered item — it is rescheduled, so leaving the
               * dock pointed at it would resurrect the question it just accepted an answer for
               * — but the item itself stays held so the result has something under it. The
               * pin lifts when the reader asks for the next one.
               */
              setReviewDockItem(null);
            };
            /*
             * A beat before the card moves on, so a marked answer is seen as marked. Skipped
             * where nothing was marked — an ungraded rung has no verdict to show, and waiting
             * would just be a pause.
             */
            /*
             * Straight to the result, with the question still under it. There is no hold to
             * time any more: the card stays on what just happened until the reader asks for
             * the next one, which also ends the race the hold created — the answered item
             * leaves the queue optimistically, so anything on a timer was competing with a
             * refetch to decide what the card showed.
             */
            handOver();
          },
        },
      );
    },
    [attempt, item, outcome, setReviewDockItem, setReviewDockResult],
  );

  /**
   * Reveal by opening the thing the question is about.
   *
   * The note is stacked rather than navigated to plainly, so the card that asked stays on screen
   * as the stack's edge and carries the verdicts. Collapsing the dock at the same time is
   * deliberate: with the note up, the question has moved to the top of the screen, and leaving
   * an expanded card at the bottom would ask it twice.
   */
  const revealElsewhere = useCallback(() => {
    if (!item) return;
    const snapshot = { attempted: attempt.trim().length > 0, attempt: attempt.trim() || undefined };
    if (item.kind === 'thread' && item.noteId) {
      libraryNav.openThread(threadClusterDrillSlug(item.noteId));
      setRevealed(true);
      return;
    }
    if (!item.noteId) return;
    stackNote(
      buildReviewCardStackOrigin(item, snapshot, { to: pathname }),
      item.noteId,
    );
    setReviewDockExpanded(false);
    void navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: noteParamSlug(item.noteId) },
      search: PROTOTYPE_NOTE_LIST_NAV_SEARCH,
    });
  }, [attempt, item, libraryNav, navigate, pathname, setReviewDockExpanded, stackNote]);

  const verseMarkup = useMemo(
    () => (reveal.data?.verseText ? { __html: reveal.data.verseText } : null),
    [reveal.data?.verseText],
  );

  /*
   * The reveal, readable at handover.
   *
   * `answer` is memoised on the item and the typed attempt, and the reveal is deliberately not
   * in its dependency list — adding it would rebuild the callback, and the keyboard handler
   * bound to it, every time a payload landed. A ref is how the handover reads the annotation
   * without the callback having to depend on it.
   */
  const revealRef = useRef(reveal.data);
  revealRef.current = reveal.data;

  /*
   * The rungs the app can mark. They arrive with the reveal because the puzzle *is* the question
   * here — there is nothing to write first, so the reader taps rather than judging themselves
   * afterwards. No payload carries its answer; the server marks the tap.
   */
  const sequenceExercise = reveal.data?.sequence ?? null;
  const locateExercise = reveal.data?.locate ?? null;
  const noteChoice = reveal.data?.noteChoice ?? null;
  const nextExercise = reveal.data?.next ?? null;
  const alteredExercise = reveal.data?.altered ?? null;
  const contextChoice = reveal.data?.choice ?? null;
  const initialsExercise = reveal.data?.initials ?? null;
  const recallExercise = reveal.data?.recall ?? null;
  const keywordsExercise = reveal.data?.keywords ?? null;
  const beforeExercise = reveal.data?.before ?? null;
  const clozeExercise = reveal.data?.cloze ?? null;

  if (!reviewDock || isGuest || !review.has) return null;

  const answeringOnNote = paperStack?.origin.review?.itemId === item?.id && Boolean(item);
  const isVerse = item?.kind === 'verse';
  // `reviewRowSubtitle` suppresses itself on a graded rung — see its docblock.
  // What this is to the reader, else which thing is being asked about.
  const subtitle = item ? (item.framing ? fillFraming(item.framing) : reviewRowSubtitle(item)) : null;
  const canJudge = canJudgeRecall({ attempt });

  /*
   * The self-rated verdicts, in the footer where every other card's action is. Only the one
   * accent button: "I recalled it" where there was an attempt to judge, "I've seen it" where
   * there was not.
   */
  const verdictButtons = canJudge ? (
    <>
      <button
        type="button"
        className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact rx-primary"
        disabled={outcome.isPending}
        onClick={() => answer('almost')}
      >
        {REVIEW_ALMOST_COPY}
      </button>
      <button
        type="button"
        className="proto-settings-btn proto-settings-btn--compact rx-primary"
        disabled={outcome.isPending}
        onClick={() => answer('recalled')}
      >
        {REVIEW_RECALLED_COPY}
      </button>
    </>
  ) : (
    <button
      type="button"
      className="proto-settings-btn proto-settings-btn--compact rx-primary"
      disabled={outcome.isPending}
      onClick={() => answer('revealed')}
    >
      {REVIEW_REVEALED_ACK_COPY}
    </button>
  );

  /* What the card says about the last go, for the stage's footer band. Hint first, then the
     retry line, so it reads as "here is something" then "have another go". */
  const say = hintLine || retryLine ? (
    <>
      {hintLine}
      {retryLine}
    </>
  ) : null;
  const missedNow = verdict?.state === 'wrong';
  /* Only ever what came back from marking — the page holds no answer key. */
  const correctOption = verdict?.state === 'right' ? verdict.option : null;
  /* The option on its way to the server, so a tap is seen to land before the reply does. */
  const pendingOption = outcome.isPending ? (outcome.variables?.answer?.option ?? null) : null;
  /* What the rail's empty place holds — see `slotFill`. */
  const railFill = slotFill({
    pending: pendingOption,
    correct: correctOption,
    wrong: verdict?.state === 'wrong' ? verdict.option : null,
  });
  /* Every gap has something in it — the gate on Check and on Enter from the last gap. */
  const gapsFilled = (total: number) =>
    Array.from({ length: total }).every((_, i) => Boolean(blanks[i]?.trim()));
  const submitGaps = (total: number) => {
    if (!item) return;
    answer('almost', {
      words: Array.from({ length: total }, (_, i) => blanks[i] ?? ''),
      promptKey: item.promptKey,
    });
  };

  return (
    <StudyDockCardShell
      rootClassName="proto-review-dock"
      accentColor="var(--pds-accent)"
      ariaLabel="Review"
      expanded={reviewDock.expanded}
      onToggleExpanded={() => setReviewDockExpanded(!reviewDock.expanded)}
      onDismiss={closeReviewDock}
      headerIcon={<Icon name="arrows-rotate" size={13} aria-hidden />}
      headerActions={
        /*
         * A way to put the question down.
         *
         * These lived only on the Home rows, so once the dock had asked, the only exits were
         * answering it, "Enough for now", or the ×. A question you cannot answer and cannot set
         * aside is the one dead end the strategy doc's "meaningful controls" list exists to
         * prevent — and the reader who most needs the option is the one stuck on the question.
         *
         * Not while a result is up: nothing is being asked then, and the slipping offer on the
         * card below is the better-worded version of the same thing.
         */
        lastResult?.itemId ? (
          /*
           * Rating the question, where the other header controls are.
           *
           * It was a labelled block at the foot of the result card — a caption, then two icon
           * blocks with words under them — which gave the quietest thing on the card the most
           * room on it. The verdict, the answer and where the question came from are what the
           * reader is there for; how they felt about the exercise is an aside, and an aside
           * belongs in the chrome. Two glyphs, titled, in the row that already holds every other
           * "do something to this card" control.
           */
          <>
            <button
              type="button"
              className="study-dock-card__header-btn"
              aria-label={REVIEW_FEEDBACK_UP_COPY}
              title={REVIEW_FEEDBACK_UP_COPY}
              data-selected={feedbackVote === 'liked' ? '' : undefined}
              disabled={Boolean(feedbackVote)}
              onClick={() => castFeedback('liked')}
            >
              <Icon name="thumbs-up" size={13} aria-hidden />
            </button>
            <button
              type="button"
              className="study-dock-card__header-btn"
              aria-label={REVIEW_FEEDBACK_DOWN_COPY}
              title={REVIEW_FEEDBACK_DOWN_COPY}
              data-selected={feedbackVote === 'disliked' ? '' : undefined}
              disabled={Boolean(feedbackVote)}
              onClick={() => castFeedback('disliked')}
            >
              <Icon name="thumbs-down" size={13} aria-hidden />
            </button>
          </>
        ) : item ? (
          <>
            <button
              type="button"
              className="study-dock-card__header-btn"
              aria-label={REVIEW_DEFER_COPY}
              title={REVIEW_DEFER_COPY}
              onClick={() => {
                defer.mutate(item.id);
                setReviewDockItem(null);
                setHeldItem(null);
              }}
            >
              <Icon name="clock-rotate-left" size={13} aria-hidden />
            </button>
            <button
              type="button"
              className="study-dock-card__header-btn"
              aria-label={REVIEW_PAUSE_COPY}
              title={REVIEW_PAUSE_COPY}
              onClick={() => {
                setStatus.mutate({ itemId: item.id, status: 'paused' });
                setReviewDockItem(null);
                setHeldItem(null);
              }}
            >
              <Icon name="circle-minus" size={13} aria-hidden />
            </button>
          </>
        ) : null
      }
      headerTrailing={
        /*
         * The goes this question has, one dot each, spent ones dimmed. No numerals and no
         * words: the vocabulary here avoids counting what is owed, and a dot that has gone out
         * says "that one is used" without saying it. Only while a marked question is up.
         */
        item && isGradedRung && goesTotal > 1 && !lastResult ? (
          /*
           * No label. The dots say "that one is used" without saying a number, and the
           * `aria-label` here said "Attempt 2 of 3" — the one place in the whole feature that
           * counts work owed, audible only to the readers who cannot see how gentle the dots
           * are. The retry line below already says there is another go, in words.
           */
          <span className="proto-review-dock__goes" aria-hidden>
            {Array.from({ length: goesTotal }, (_, index) => (
              <span
                key={index}
                className="proto-review-dock__go"
                data-spent={index < attemptNumber - 1 ? '' : undefined}
                data-current={index === attemptNumber - 1 ? '' : undefined}
                aria-hidden
              />
            ))}
          </span>
        ) : null
      }
      headerTitle={
        <span className="study-dock-card__header-primary-text">
          Review
          {/*
            * Collapsed: the question, since the body is not showing it.
            *
            * Expanded: which kind of exercise it is. That began as an eyebrow above the prompt
            * and was a whole extra tier — a third text size and a second glyph stacked between
            * the card's title and its question, on a card whose entire job is to ask one thing.
            * This slot already exists, already sits at the header's own size, and is already the
            * muted half of the line, so the name costs no new hierarchy at all.
            */}
          {item ? (
            <span className="proto-review-dock__header-prompt">
              {/* A second look says so, quietly, so the same question coming round again reads
                  as deliberate rather than as the card repeating itself. */}
              {isPractice
                ? REVIEW_PRACTICE_LABEL
                : reviewDock.expanded
                  ? item.exercise?.label ?? null
                  : item.prompt}
            </span>
          ) : null}
          {/*
            * Which translation the question is in.
            *
            * Every exercise built out of Bible text is built out of *a* wording of it: the gaps
            * in a cloze are that translation's words, the first letters are its letters, and
            * "as it actually reads" reads that way in one Bible and differently in another. A
            * reader filling in blanks from the NIV against text fetched as NET is being marked
            * wrong for knowing a different true thing, and until now the card never said which
            * one it meant.
            *
            * In the header rather than beside each block, because it is a property of the whole
            * question — the asking, the retry and the answer are all the same wording — and
            * because it stays put while the body changes underneath it. The same chip the
            * reader already knows from scripture pills and the reader's own translation control.
            *
            * Verse and chapter only. A note rung's answer is a reference or one of the reader's
            * own notes; no wording of Scripture is being tested, so the chip would be noise.
            *
            * Printed, never derived. The value is resolved server-side — the item's own wording
            * where it has one, the account's default otherwise — and the profile carries
            * `defaultTranslation`, so re-deriving it here would be wrong for every item that
            * carries a wording of its own. This read `item.translation ?? 'NET'` when the view
            * did not carry the field at all, so it said NET for everything.
            */}
          {item && reviewDock.expanded && (item.kind === 'verse' || item.kind === 'chapter') ? (
            <span className="scripture-pill-chrome__trans-chip proto-review-dock__header-trans">
              {item.translation}
            </span>
          ) : null}
        </span>
      }
    >
      {/*
        * How far through the sitting, as a bar and nothing else.
        *
        * No numerals, which is the whole reason it can exist here at all: the vocabulary rule
        * bars any surface from printing a count of work not yet done, and a bar that fills says
        * "you are getting somewhere" without naming what is left. The evidence for short
        * sessions is really evidence for *visibly finite* ones — a queue with no visible end is
        * the thing a reader gives up in the middle of.
        *
        * Hidden for a sitting of one, where a bar would be a full-width way of saying "this is
        * the only question".
        */}
      {progress.total > 1 ? (
        <div
          className="proto-review-dock__progress"
          role="progressbar"
          aria-label={REVIEW_SITTING_PROGRESS_LABEL}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          aria-valuetext={`${progress.done} of ${progress.total}`}
        >
          <span
            className="proto-review-dock__progress-fill"
            style={{ transform: `scaleX(${progress.fraction})` }}
          />
        </div>
      ) : null}
      {/* Keyed on the question, so each new one plays its own entrance. */}
      <div className="proto-review-dock__body" key={questionKey}>
        {lastResult ? (
          /*
           * The moment after an answer, and the thing the first preview had nothing of: a
           * verdict went in and the card silently moved on, so there was no way to tell that
           * anything had been recorded. It says what you did, when it comes back, and — once,
           * on the answer that earns it — that it is holding now.
           */
          <div className="proto-review-dock__result">
            {/*
              * Everything the reader reads scrolls; the way on does not.
              *
              * A result card grows with what it has to say — the question, their answer, the
              * verse restored, the verdict, what they wrote on the passage — and on a long one
              * the buttons were simply below the fold, so "Next one" was a scroll away on
              * exactly the cards that were most work to get through. Same shape as the planner
              * editor's rail: a scrolling body over a footer that owns the bottom edge.
              */}
            <div className="proto-review-dock__result-scroll">
            {/*
              * The question, first, because a result that does not say what was asked is a
              * sentence with no subject. It is also the one line that makes the index-keyed
              * rungs read as anything at all: "The reference works say / Moses" means nothing
              * until "Pick who appears in John 3." is sitting above it.
              */}
            {lastResult.prompt ? (
              <p className="proto-review-dock__prompt proto-review-dock__prompt--asked">
                {lastResult.prompt}
              </p>
            ) : null}
            {/* Only where the question does not already name the thing — and on the rungs that
                hid it while asking, this is where it is finally safe to say. */}
            {lastResult.subject && !lastResult.prompt?.includes(lastResult.subject) ? (
              <p className="proto-review-dock__subject">{lastResult.subject}</p>
            ) : null}
            {lastResult.echo ? (
              /*
               * What the reader said, marked. Their own words and taps rather than the verse's,
               * so the card says how it went without printing the answer twice.
               */
              <div className="proto-review-dock__answer">
                <p className="proto-caption proto-review-dock__truth-label">
                  {REVIEW_ECHO_LABEL[lastResult.echo.manner]}
                </p>
                {lastResult.echo.layout === 'rows' ? (
                  <ol className="proto-review-dock__verse proto-review-dock__verse--yours proto-review-dock__echo-rows">
                    {lastResult.echo.parts.map((part, index) => (
                      <li key={`${index}-${part.text}`} data-answer={part.state}>
                        {part.text}
                        {/* Right and wrong were colour and an underline and nothing else, which
                            is the one reader who cannot see either being told nothing at all. */}
                        {part.state ? (
                          <span className="proto-visually-hidden">{` ${REVIEW_PART_STATE_LABEL[part.state]}`}</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p
                    className={`proto-review-dock__verse proto-review-dock__verse--yours${
                      // One tapped thing, which may be marked either way — see the CSS.
                      lastResult.echo.layout === 'line' ? ' proto-review-dock__verse--pick' : ''
                    }`}
                  >
                    {lastResult.echo.parts.map((part, index) => (
                      <Fragment key={`${index}-${part.text}`}>
                        {index > 0 ? ' ' : null}
                        <span data-answer={part.state}>
                          {part.text}
                          {part.state ? (
                            <span className="proto-visually-hidden">{` ${REVIEW_PART_STATE_LABEL[part.state]}`}</span>
                          ) : null}
                        </span>
                      </Fragment>
                    ))}
                  </p>
                )}
                {lastResult.reached ? (
                  <p className="proto-caption proto-review-dock__retry">
                    {reviewReachedCopy(lastResult.reached.matched, lastResult.reached.total)}
                  </p>
                ) : null}
              </div>
            ) : null}
            {/* The verse first, the verdict under it: what the reader came back for is the
                text, not the bookkeeping. Skipped where the echo above already carries these
                exact words, or the card prints one sentence under two headings. */}
            {lastResult.correctAnswer && !echoMatchesAnswer(lastResult.echo, lastResult.correctAnswer) ? (
              <div className="proto-review-dock__answer">
                <p className="proto-caption proto-review-dock__truth-label">
                  {/* A miss on a curated rung is a disagreement with the index, not a lapse of
                      memory, and the label says whose reading this is. */}
                  {lastResult.fromIndex ? REVIEW_INDEX_ANSWER_LABEL : REVIEW_ANSWER_LABEL}
                </p>
                <p className="proto-review-dock__verse">{lastResult.correctAnswer}</p>
              </div>
            ) : null}
            {lastResult.verseText ? (
              <div className="proto-review-dock__answer">
                <p className="proto-caption proto-review-dock__truth-label">{REVIEW_TRUTH_LABEL}</p>
                <p
                  className="proto-review-dock__verse proto-review-dock__verse--scripture"
                  dangerouslySetInnerHTML={{ __html: lastResult.verseText }}
                />
              </div>
            ) : null}
            <div
              className="proto-review-dock__verdict"
              data-outcome={lastResult.outcome}
              role="status"
              aria-live="polite"
            >
              {/*
                * The icon says which way it went. A check on "Read again." was the app
                * congratulating someone for getting it wrong — and inside a filled orb it read
                * as a badge awarded, which is the one thing this feature does not do.
                */}
              <span className="proto-review-dock__verdict-icon" aria-hidden>
                <Icon name={lastResult.outcome === 'revealed' ? 'xmark' : 'check'} size={13} />
              </span>
              <p className="proto-review-dock__result-text">
                <span className="proto-review-dock__result-outcome">
                  {REVIEW_OUTCOME_ACK_COPY[lastResult.outcome]}
                </span>
                <span className="proto-review-dock__result-next">{lastResult.label}.</span>
                {lastResult.crossedToDurable ? (
                  <span className="proto-review-dock__result-crossed">
                    {REVIEW_CROSSED_TO_HOLDING_COPY}
                  </span>
                ) : null}
              </p>
            </div>
            {resultContextBlock}
            </div>
            {/*
              * The reader decides when the next one comes. Both ways are offered: stopping
              * after one is a whole act, and a card with only "next" on it would say otherwise.
              * The ways back sit after them, in the same row.
              */}
            <div className="proto-review-dock__actions proto-review-dock__actions--footer">
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--compact"
                onClick={() => {
                  setReviewDockResult(null);
                  setHeldItem(null);
                }}
              >
                {REVIEW_NEXT_COPY}
              </button>
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
                onClick={closeSitting}
              >
                {REVIEW_ENOUGH_COPY}
              </button>
              {resultContextLinks}
            </div>
            {lastResult.itemId && feedbackVote ? (
              /*
               * What came of the rating. The buttons themselves are in the header now — see
               * `headerActions` — so all that is left in the body is the one thing a tooltip
               * cannot carry: that the vote landed, and, on the third dislike of a family, the
               * offer to ask for less of it in Settings. Absent until there is a vote, which is
               * most of the time.
               */
              <div className="proto-review-dock__feedback">
                <p className="proto-caption proto-review-dock__feedback-caption">
                  {feedbackOffer ? reviewFeedbackOfferCopy(feedbackOffer) : REVIEW_FEEDBACK_ACK_COPY}
                  {feedbackOffer ? (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="proto-review-dock__feedback-link"
                        onClick={() =>
                          void navigate({ to: prototypeHref('settings/review-exercises') })
                        }
                      >
                        {REVIEW_FEEDBACK_SETTINGS_LINK_COPY}
                      </button>
                    </>
                  ) : null}
                </p>
              </div>
            ) : null}
          </div>
        ) : !item ? (
          /*
           * "Nothing waiting" is a claim, so it waits until the queue has actually answered.
           * Said while the request was still in flight, it met a first-time reader with an
           * empty product a beat before their question arrived.
           */
          settling ? (
            /*
             * Dots rather than a sentence. "One moment." is a thing to read on the way to the
             * thing you came to read, and by the time the eye has parsed it the question has
             * usually arrived — the dots say the same and ask for nothing.
             */
            <div className="proto-review-dock__loading">
              <ProtoLoadingDots label={REVIEW_LOADING_LABEL} />
            </div>
          ) : (
            /*
             * An empty card is a card that has to explain itself. This one used to be a single
             * left-aligned sentence where every other empty surface in the app gets an icon, a
             * title and a line saying what happens next — so "Nothing waiting" read as much
             * like a fault as like a rest.
             */
            /*
             * Three endings, not two. An empty dock someone just worked through is a finish and
             * should say so — "You are up to date" is what a dock opened onto nothing says, and
             * reading it after eight questions makes the work you just did sound like a state
             * you happened to already be in.
             */
            <PrototypeListEmptyState
              iconName={sitting.answered > 0 || nextDue ? 'circle-check' : 'seedling'}
              title={
                sitting.answered > 0
                  ? REVIEW_SITTING_DONE_TITLE
                  : nextDue
                    ? REVIEW_EMPTY_UP_TO_DATE_TITLE
                    : REVIEW_EMPTY_NOTHING_YET_TITLE
              }
              description={
                <>
                  {nextDue ? (
                    <p className="proto-list-empty-state__line">{reviewNextDueCopy(nextDue)}</p>
                  ) : (
                    <p className="proto-list-empty-state__line">{REVIEW_EMPTY_NOTHING_YET_BODY}</p>
                  )}
                  {/* What this sitting came to — the one number this feature counts, because it
                      is what was done rather than what is owed. */}
                  {sitting.answered > 0 ? (
                    <p className="proto-list-empty-state__line">{sittingCloseLine(sitting)}</p>
                  ) : null}
                </>
              }
            />
          )
        ) : answeringOnNote ? (
          /* The question has moved to the stack's edge, at the top of the note. Saying so beats
             repeating the prompt down here, where it would read as a second, separate ask. */
          <p className="proto-review-dock__handoff">Answer at the top of your note.</p>
        ) : noteChoice && NOTE_RAIL_SLOT[item.promptKey] ? (
          /*
           * A note rung that asks what goes with the note: the passage it cites, the passage a
           * highlight was written on, the note it links to. The reader's line on the rail, in the
           * body face (it is their prose, not Scripture), and the place the answer goes under it.
           */
          <ExerciseStage
            task={item.prompt}
            subject={subtitle}
            scene={
              <Rail
                /*
                 * A line of the note where the server sent one, under the note's name; where it
                 * sent none (a `note.passage` stem is often just the note), the name is the card.
                 */
                fromLabel={
                  item.promptKey === 'note.annotation'
                    ? 'What you wrote'
                    : noteChoice.span || noteChoice.fragment
                      ? item.noteTitle?.trim() || 'Your note'
                      : 'Your note'
                }
                from={
                  noteChoice.span ? (
                    <p>
                      {noteChoice.span.leading ? '… ' : ''}
                      {noteChoice.span.before ? `${noteChoice.span.before} ` : ''}
                      <strong>{noteChoice.span.quote}</strong>
                      {noteChoice.span.after ? ` ${noteChoice.span.after}` : ''}
                      {noteChoice.span.trailing ? '…' : ''}
                    </p>
                  ) : noteChoice.fragment ? (
                    <p>
                      “{noteChoice.leading ? '…' : ''}{noteChoice.fragment}{noteChoice.truncated ? '…' : ''}”
                    </p>
                  ) : (
                    <p>{item.noteTitle?.trim() || 'This note'}</p>
                  )
                }
                slotLabel={NOTE_RAIL_SLOT[item.promptKey]!}
                fill={railFill}
                join="link"
              />
            }
            say={say}
            missed={missedNow}
          >
            <ChoiceOptions
              options={noteChoice.options}
              disabled={outcome.isPending}
              missed={missed}
              correct={correctOption}
              pending={pendingOption}
              onPick={(option) => answer('almost', { option, promptKey: item.promptKey })}
            />
          </ExerciseStage>
        ) : noteChoice ? (
          /*
           * A note rung. The fragment is the reader's own writing, quoted back — in the body face,
           * never the reading face, because it is their prose and not Scripture. The question above
           * already says what is being asked, so it needs no other framing.
           */
          <ExerciseStage
            task={item.prompt}
            /* Which note is being asked about. `note.passage` and `note.connect` name it in the
               sentence when it has a name, and say nothing when it does not — this is the line
               that answers "which note?" for a nameless one. */
            subject={subtitle}
            scene={
              noteChoice.span ? (
                /*
                 * The span the reader marked, inside the sentence they marked it in. The sentence
                 * is what stops a bold clause reading as a grammar puzzle before it reads as a
                 * question about their study; the marked words stay the emphasis.
                 *
                 * Ellipses only where the server says something was actually dropped.
                 */
                <p
                  className="rx-hero"
                  data-size={heroSize(
                    `${noteChoice.span.before} ${noteChoice.span.quote} ${noteChoice.span.after}`,
                  )}
                >
                  {noteChoice.span.leading ? <span>… </span> : null}
                  {noteChoice.span.before ? <span>{noteChoice.span.before} </span> : null}
                  <strong>{noteChoice.span.quote}</strong>
                  {noteChoice.span.after ? <span> {noteChoice.span.after}</span> : null}
                  {noteChoice.span.trailing ? <span>…</span> : null}
                </p>
              ) : noteChoice.fragment ? (
                /* An ellipsis at each end that was cut, so a clause is not passed off as one. */
                <p className="rx-hero" data-size={heroSize(noteChoice.fragment)}>
                  “{noteChoice.leading ? '…' : ''}{noteChoice.fragment}{noteChoice.truncated ? '…' : ''}”
                </p>
              ) : null
            }
            say={say}
            missed={missedNow}
          >
            <ChoiceOptions
              options={noteChoice.options}
              disabled={outcome.isPending}
              missed={missed}
              correct={correctOption}
              pending={pendingOption}
              onPick={(option) => answer('almost', { option, promptKey: item.promptKey })}
            />
          </ExerciseStage>
        ) : clozeExercise && clozeExercise.blankLengths.length > 0 && clozeExercise.bank?.length ? (
          /*
           * The gentlest form of the cloze: the missing words as tiles, among a few that do not
           * belong. Recognition before production — from tier 1 the same gaps are typed (the
           * branch below). The server decides which by sending a bank or not; the page never
           * offers the easier form.
           */
          <ExerciseStage
            task={item.prompt}
            subject={subtitle}
            scene={
              <WordBankLine
                hero={heroSize(clozeExercise.segments.join(' '))}
                segments={clozeExercise.segments}
                blankLengths={clozeExercise.blankLengths}
                values={blanks}
                given={givenBlanks}
                partState={partState}
                disabled={outcome.isPending}
                onClear={(index) => {
                  const next = [...blanks];
                  next[index] = '';
                  setBlanks(next);
                }}
              />
            }
            say={say}
            missed={missedNow}
            primary={{
              label: REVIEW_CHECK_COPY,
              disabled: outcome.isPending || !gapsFilled(clozeExercise.blankLengths.length),
              onClick: () => submitGaps(clozeExercise.blankLengths.length),
            }}
          >
            <WordTray
              bank={clozeExercise.bank}
              values={blanks}
              disabled={outcome.isPending}
              onPlace={(word) => {
                const at = nextOpenGap(clozeExercise.blankLengths.length, blanks, givenBlanks);
                if (at === null) return;
                const next = [...blanks];
                next[at] = word;
                setBlanks(next);
              }}
            />
          </ExerciseStage>
        ) : clozeExercise && clozeExercise.blankLengths.length > 0 ? (
          /*
           * Fill in the blanks, in the blanks themselves.
           *
           * The gaps are inputs rather than a picture of inputs, so the words go where they belong
           * instead of being retyped into a box underneath in an order the reader has to keep
           * track of. Each input is sized by the word it stands for, which is the same hint the
           * underscore run always gave — until the top tier, where that hint is withdrawn and every
           * gap is the same width. See `review-difficulty.ts`.
           */
          <ExerciseStage
            task={item.prompt}
            subject={subtitle}
            scene={
              <GapLine
                hero={heroSize(clozeExercise.segments.join(' '))}
                segments={clozeExercise.segments}
                blankLengths={clozeExercise.blankLengths}
                values={blanks}
                given={givenBlanks}
                partState={partState}
                disabled={outcome.isPending}
                onChange={(index, value) => {
                  const next = [...blanks];
                  next[index] = value;
                  setBlanks(next);
                }}
                onSubmit={() => {
                  if (outcome.isPending || !gapsFilled(clozeExercise.blankLengths.length)) return;
                  submitGaps(clozeExercise.blankLengths.length);
                }}
              />
            }
            say={say}
            missed={missedNow}
            primary={{
              label: REVIEW_CHECK_COPY,
              disabled: outcome.isPending || !gapsFilled(clozeExercise.blankLengths.length),
              onClick: () => submitGaps(clozeExercise.blankLengths.length),
            }}
          />
        ) : sequenceExercise ? (
          /* Put the phrases back in order — see `OrderPieces`. */
          <ExerciseStage
            task={item.prompt}
            scene={
              <OrderSlots
                phrases={sequenceExercise.phrases}
                placed={placed}
                partState={partState}
                disabled={outcome.isPending}
                onRemove={(position) => setPlaced((current) => current.filter((_, i) => i !== position))}
              />
            }
            say={say}
            missed={missedNow}
            primary={{
              label: REVIEW_CHECK_COPY,
              disabled: outcome.isPending || placed.length !== sequenceExercise.phrases.length,
              onClick: () =>
                answer('almost', { order: placed }, null, { phrases: sequenceExercise.phrases }),
            }}
          >
            {/* Gone once every piece is placed, so the card is the verse and its Check. */}
            {placed.length < sequenceExercise.phrases.length ? (
              <OrderTray
                phrases={sequenceExercise.phrases}
                placed={placed}
                disabled={outcome.isPending}
                onPlace={(index) => setPlaced((current) => [...current, index])}
              />
            ) : null}
          </ExerciseStage>
        ) : alteredExercise ? (
          /*
           * The one rung that shows words which are not what the passage says.
           *
           * The question above states that before the reader reaches the text, and the caption on
           * the scene repeats it — a prompt can be scrolled past, cropped out of a screenshot or
           * skipped by someone tapping straight at the words, and the warning has to travel with
           * them. Deliberately not the reading face and not the scripture panel: the scene takes
           * its dashed, warm `altered` tone so this line is never dressed as the real thing.
           */
          <ExerciseStage
            task={item.prompt}
            sceneTone="altered"
            scene={
              <>
                <p className="rx-eyebrow">{REVIEW_ALTERED_CAPTION}</p>
                <p className="rx-hero" data-size={heroSize(alteredExercise.tokens.join(' '))}>
                  {alteredExercise.tokens.map((token, index) => (
                    /* The space is its own text node, outside the buttons. Without it the words
                       are separated only by margin: the line looks right and reads as
                       "Iamthevine" to a screen reader, and copies out that way too. */
                    <Fragment key={`${index}-${token}`}>
                      {index > 0 ? ' ' : null}
                      <button
                        type="button"
                        className="proto-review-dock__altered-word"
                        /* The index identifies the word, so the one just tapped wears the verdict. */
                        data-answer={
                          spentWords.includes(index)
                            ? 'wrong'
                            : verdict?.option === String(index)
                              ? verdict.state
                              : undefined
                        }
                        disabled={outcome.isPending || spentWords.includes(index)}
                        onClick={() =>
                          answer(
                            'almost',
                            { wordIndex: index, promptKey: item.promptKey },
                            String(index),
                            { word: token },
                          )
                        }
                      >
                        {token}
                      </button>
                    </Fragment>
                  ))}
                </p>
              </>
            }
            say={say}
            missed={missedNow}
          />
        ) : initialsExercise?.segments && initialsExercise.segments.blankLengths.length > 0 ? (
          /*
           * The staged form: a share of the words standing on their first letter, the rest of the
           * verse shown, and each reduced word typed back in place.
           *
           * This rung is on step 1, which is an *opening* step — so before it was staged, roughly
           * half of all new verses met "write the whole thing from its first letters" as the very
           * first question Review ever asked them. The top tier is still that exercise; this is the
           * way up to it.
           */
          <ExerciseStage
            task={item.prompt}
            subject={subtitle}
            scene={
              <GapLine
                hero={heroSize(initialsExercise.segments.segments.join(' '))}
                segments={initialsExercise.segments.segments}
                blankLengths={initialsExercise.segments.blankLengths}
                letters={initialsExercise.segments.letters}
                values={blanks}
                given={givenBlanks}
                partState={partState}
                disabled={outcome.isPending}
                onChange={(index, value) => {
                  const next = [...blanks];
                  next[index] = value;
                  setBlanks(next);
                }}
                onSubmit={() => {
                  const total = initialsExercise.segments!.blankLengths.length;
                  if (outcome.isPending || !gapsFilled(total)) return;
                  submitGaps(total);
                }}
              />
            }
            say={say}
            missed={missedNow}
            primary={{
              label: REVIEW_CHECK_COPY,
              disabled:
                outcome.isPending || !gapsFilled(initialsExercise.segments.blankLengths.length),
              onClick: () => submitGaps(initialsExercise.segments!.blankLengths.length),
            }}
          />
        ) : initialsExercise ? (
          /*
           * The top tier, and what this rung has always been: the first letter of every word, and
           * the reader writes the verse back. Graded on the content words, in order — connectives
           * and case are forgiven, because "the" for "a" is not forgetting.
           */
          <ExerciseStage
            task={item.prompt}
            subject={subtitle}
            scene={
              <p
                className="rx-hero proto-review-dock__initials"
                data-scripture=""
                data-size={heroSize(initialsExercise.initials)}
              >
                {initialsExercise.initials}
              </p>
            }
            say={say}
            missed={missedNow}
            primary={{
              label: REVIEW_CHECK_COPY,
              disabled: outcome.isPending || !attempt.trim(),
              onClick: () => answer('almost', { text: attempt, promptKey: item.promptKey }),
            }}
          >
            <textarea
              className="proto-review-dock__attempt"
              placeholder={REVIEW_INITIALS_PLACEHOLDER}
              value={attempt}
              onChange={(event) => setAttempt(event.target.value)}
              onKeyDown={(event) => {
                if (!isSubmitKey(event) || outcome.isPending || !attempt.trim()) return;
                event.preventDefault();
                answer('almost', { text: attempt, promptKey: item.promptKey });
              }}
              rows={3}
            />
          </ExerciseStage>
        ) : keywordsExercise ? (
          /* Free recall, the lightest rung: any three words that are actually in the verse. The
             verse stays off the card — it is the question — so the boxes are the card. */
          <ExerciseStage
            task={item.prompt}
            say={say}
            missed={missedNow}
            primary={{
              label: REVIEW_CHECK_COPY,
              disabled: outcome.isPending || !gapsFilled(keywordsExercise.count),
              onClick: () => submitGaps(keywordsExercise.count),
            }}
          >
            <p className="rx-keywords">
              {Array.from({ length: keywordsExercise.count }, (_, index) => (
                <Fragment key={index}>
                  {index > 0 ? ' ' : null}
                  <input
                    type="text"
                    className="proto-review-dock__blank"
                    data-answer={partState(index)}
                    style={{ width: '9ch' }}
                    value={blanks[index] ?? ''}
                    onChange={(event) => {
                      const next = [...blanks];
                      next[index] = event.target.value;
                      setBlanks(next);
                    }}
                    onKeyDown={(event) => {
                      if (!isSubmitKey(event) || outcome.isPending) return;
                      event.preventDefault();
                      if (gapsFilled(keywordsExercise.count)) submitGaps(keywordsExercise.count);
                    }}
                    aria-label={`Word ${index + 1}`}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={outcome.isPending}
                  />
                </Fragment>
              ))}
            </p>
          </ExerciseStage>
        ) : beforeExercise ? (
          /* Two openings from the same chapter; the verse itself is one of them, so it stays off
             the card. Two places on the rail: the pick goes first and the other follows it, so the
             answer reads as an order rather than one of two buttons. */
          <ExerciseStage
            task={item.prompt}
            scene={<PairRail options={beforeExercise.options} fill={railFill} />}
            say={say}
            missed={missedNow}
          >
            <ChoiceOptions
              options={beforeExercise.options}
              disabled={outcome.isPending}
              missed={missed}
              correct={correctOption}
              pending={pendingOption}
              opening
              onPick={(option) =>
                answer('almost', { option, promptKey: item.promptKey }, option, { opening: true })
              }
            />
          </ExerciseStage>
        ) : contextChoice && VERSE_RAIL_SLOT[item.promptKey] && verseMarkup ? (
          /*
           * What goes with this verse: its cross-reference, the note it was cited in. The verse on
           * the rail, a link, and the place the answer goes.
           */
          <ExerciseStage
            task={item.prompt}
            scene={
              <Rail
                fromLabel={item.scriptureReference ?? 'This verse'}
                from={<p dangerouslySetInnerHTML={verseMarkup} />}
                scripture
                slotLabel={VERSE_RAIL_SLOT[item.promptKey]!}
                fill={railFill}
                join="link"
                /* Cross-references arrive as verse openings: they trail off, in the reading face. */
                trailing={contextChoice.opening}
                slotScripture={contextChoice.opening}
              />
            }
            say={say}
            missed={missedNow}
          >
            <ChoiceOptions
              options={contextChoice.options}
              disabled={outcome.isPending}
              missed={missed}
              correct={correctOption}
              pending={pendingOption}
              opening={contextChoice.opening}
              onPick={(option) =>
                answer('almost', { option, promptKey: item.promptKey }, option, {
                  opening: contextChoice.opening,
                })
              }
            />
          </ExerciseStage>
        ) : contextChoice && OPENING_LINE_RUNGS.has(item.promptKey) ? (
          /*
           * How it begins: the reference, and a gap at the head of a line that trails off. The rest
           * of the verse is withheld — it would answer the question — so the gap is the question.
           */
          <ExerciseStage
            task={item.prompt}
            scene={<OpeningLine reference={item.scriptureReference ?? ''} fill={railFill} />}
            say={say}
            missed={missedNow}
          >
            <ChoiceOptions
              options={contextChoice.options}
              disabled={outcome.isPending}
              missed={missed}
              correct={correctOption}
              pending={pendingOption}
              opening={contextChoice.opening}
              onPick={(option) =>
                answer('almost', { option, promptKey: item.promptKey }, option, {
                  opening: contextChoice.opening,
                })
              }
            />
          </ExerciseStage>
        ) : contextChoice ? (
          /*
           * The context step: which note cites this, which theme it carries, who it is about,
           * what it is cross-referenced with. The verse stays on the card — it is the question —
           * and the options are the whole exercise.
           */
          <ExerciseStage
            task={item.prompt}
            scene={
              verseMarkup ? (
                <p
                  className="rx-hero"
                  data-scripture=""
                  data-size={heroSize(reveal.data?.verseText)}
                  dangerouslySetInnerHTML={verseMarkup}
                />
              ) : null
            }
            say={say}
            missed={missedNow}
          >
            <ChoiceOptions
              options={contextChoice.options}
              disabled={outcome.isPending}
              missed={missed}
              correct={correctOption}
              pending={pendingOption}
              opening={contextChoice.opening}
              onPick={(option) =>
                answer('almost', { option, promptKey: item.promptKey }, option, {
                  opening: contextChoice.opening,
                })
              }
            />
          </ExerciseStage>
        ) : nextExercise ? (
          /*
           * "What comes after this?" — the verse in question stays on the card above the options,
           * because it is the question. Only the openings are offered; the next verse's reference
           * never reaches the page, or the answer would be arithmetic.
           */
          <ExerciseStage
            task={item.prompt}
            scene={
              verseMarkup ? (
                <Rail
                  fromLabel={item.scriptureReference ?? 'This verse'}
                  from={<p dangerouslySetInnerHTML={verseMarkup} />}
                  scripture
                  slotLabel="Next verse"
                  fill={railFill}
                  trailing
                  slotScripture
                />
              ) : null
            }
            say={say}
            missed={missedNow}
          >
            <ChoiceOptions
              options={nextExercise.options}
              disabled={outcome.isPending}
              missed={missed}
              correct={correctOption}
              pending={pendingOption}
              opening
              onPick={(option) =>
                answer('almost', { option, promptKey: item.promptKey }, option, { opening: true })
              }
            />
          </ExerciseStage>
        ) : locateExercise ? (
          <ExerciseStage
            task={item.prompt}
            scene={
              /* The trailing ellipsis was hardcoded, so a phrase running to the end of the verse
                 claimed there was more; there was never a leading one, so a phrase deliberately
                 starting past the opening read as the opening. `trailing !== false` keeps a
                 payload built before this rendering exactly as it did. */
              <p className="rx-hero" data-scripture="" data-size={heroSize(locateExercise.phrase)}>
                “{locateExercise.leading ? '…' : ''}{locateExercise.phrase}
                {locateExercise.trailing !== false ? '…' : ''}”
              </p>
            }
            say={say}
            missed={missedNow}
          >
            <ChoiceOptions
              options={locateExercise.options}
              disabled={outcome.isPending}
              missed={missed}
              correct={correctOption}
              pending={pendingOption}
              onPick={(option) => answer('almost', { option, promptKey: item.promptKey })}
            />
          </ExerciseStage>
        ) : FREE_RECALL_RUNGS.has(item.promptKey) ? (
          /*
           * Write the verse out, and have it marked. Forgivingly — content words, in order, case
           * and punctuation and the small words all forgiven — because the thing being tested is
           * the verse, not the typing. What you wrote comes back with the verse.
           *
           * The way in, at the tiers that give one, is the scene: most of the verse to finish, or
           * its opening few words to carry on from. Nothing at the top tier, which is the bare
           * reference this rung always was, and the writing area is the card.
           */
          <ExerciseStage
            task={item.prompt}
            subject={subtitle}
            scene={
              recallExercise?.shown ? (
                <p className="rx-hero" data-scripture="" data-size={heroSize(recallExercise.shown)}>
                  {recallExercise.shown} …
                </p>
              ) : null
            }
            say={say}
            missed={missedNow}
            primary={{
              label: REVIEW_CHECK_COPY,
              disabled: outcome.isPending || !attempt.trim(),
              onClick: () => answer('almost', { text: attempt, promptKey: item.promptKey }),
            }}
          >
            <textarea
              className="proto-review-dock__attempt"
              data-answer={verdict?.state ?? undefined}
              aria-invalid={verdict?.state === 'wrong' ? true : undefined}
              placeholder={REVIEW_ATTEMPT_PLACEHOLDER}
              value={attempt}
              onChange={(event) => setAttempt(event.target.value)}
              onKeyDown={(event) => {
                if (!isSubmitKey(event) || outcome.isPending || !attempt.trim()) return;
                event.preventDefault();
                answer('almost', { text: attempt, promptKey: item.promptKey });
              }}
              rows={3}
              disabled={outcome.isPending}
            />
          </ExerciseStage>
        ) : isGradedRung && reveal.isError ? (
          /*
           * The reveal *is* the question on a graded rung, so a failed one is a question with no
           * body. Without this the chain fell past every exercise branch to the free-text
           * fallback — the same wrong-exercise flash the loading branch below was written to
           * prevent, except permanent, and with a "check the verse" button that would record an
           * answer to a question the reader was never shown.
           */
          <ExerciseStage
            task={item.prompt}
            subject={subtitle}
            scene={<p className="proto-review-dock__caption">{REVIEW_REVEAL_FAILED_COPY}</p>}
            primary={{ label: REVIEW_REVEAL_RETRY_COPY, onClick: () => void reveal.refetch() }}
          />
        ) : isGradedRung && (reveal.isPending || reveal.isFetching) ? (
          /*
           * The question, and dots where its exercise will be.
           *
           * Every exercise branch above is keyed on a field of the reveal, so until it lands they
           * are all empty and the chain fell through to the free-text fallback below — the reader
           * saw a textarea and a "check the verse" button, which then vanished and became four
           * options. Showing the wrong exercise is worse than showing none. On the stage, so the
           * card is already its full size when the exercise lands in it.
           */
          <ExerciseStage
            task={item.prompt}
            subject={subtitle}
            scene={
              <div className="proto-review-dock__loading">
                <ProtoLoadingDots label={REVIEW_LOADING_LABEL} />
              </div>
            }
          />
        ) : !revealed ? (
          /*
           * The self-rated kinds: write what you remember, then go and look.
           *
           * One action, because there was only ever one. There used to be an "I have it in mind"
           * beside this, for someone who retrieved the note mentally without typing. Both buttons
           * revealed; the only difference was an invisible flag deciding which verdicts appeared
           * afterwards. It also asked the reader to declare a mental state *before* checking it,
           * which is the same invitation to a comfortable lie that the cold-reveal rule exists to
           * avoid — writing something is the attempt.
           */
          <ExerciseStage
            task={item.prompt}
            /* Which note is being asked about, when the question does not already say. */
            subject={subtitle}
            say={say}
            missed={missedNow}
            primary={{
              label: revealLabelFor(item.kind),
              onClick: () => {
                if (revealsElsewhere(item.kind, item.noteId)) revealElsewhere();
                else setRevealed(true);
              },
            }}
          >
            <textarea
              className="proto-review-dock__attempt"
              placeholder={REVIEW_ATTEMPT_PLACEHOLDER}
              value={attempt}
              onChange={(event) => setAttempt(event.target.value)}
              rows={3}
            />
          </ExerciseStage>
        ) : (
          <ExerciseStage
            task={item.prompt}
            scene={
              item.kind === 'thread' ? (
                <p className="proto-caption">Your Thread is open beside you.</p>
              ) : reveal.isPending ? (
                <p className="proto-caption">Fetching…</p>
              ) : verseMarkup ? (
                <div
                  className="rx-hero"
                  data-scripture=""
                  data-size={heroSize(reveal.data?.verseText)}
                  dangerouslySetInnerHTML={verseMarkup}
                />
              ) : null
            }
            actions={verdictButtons}
          />
        )}
      </div>
    </StudyDockCardShell>
  );
}
