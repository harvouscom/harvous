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
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import ProtoLoadingDots from './ProtoLoadingDots';
import StudyDockCardShell from '@/components/react/StudyDockCardShell';
import { canJudgeRecall, resolveReviewDockItem } from '@/utils/review-dock-state';
import { reviewRowSubtitle } from '@/utils/review-row-subtitle';
import { noteParamSlug } from './proto-route-slugs';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import { threadClusterDrillSlug } from '@/utils/thread-cluster-bulk-actions';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { isTypingInInput } from '@/utils/keyboard-shortcuts';
import { reviewRungIsGraded } from '@/utils/review-prompts';
import { fillFraming } from '@/utils/review-framing';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { useHasFeature } from '../../hooks/useHasFeature';
import {
  useReviewItems,
  useReviewReveal,
  usePrefetchReviewReveal,
  useReviewSession,
  type ReviewItemView,
} from '../../hooks/queries/useReview';
import { useReviewOutcome, useSetReviewStatus, useStepBackReview } from '../../hooks/mutations/useReviewMutations';
import { useLibraryPanelNav } from './library-panel/use-library-panel-nav';
import { buildReviewCardStackOrigin } from './paper-stack-origins';
import {
  REVIEW_ALMOST_COPY,
  REVIEW_ATTEMPT_PLACEHOLDER,
  REVIEW_EMPTY_COPY,
  REVIEW_LOADING_LABEL,
  REVIEW_RECALLED_COPY,
  REVIEW_REVEALED_ACK_COPY,
  REVIEW_CHECK_COPY,
  REVIEW_CROSSED_TO_HOLDING_COPY,
  REVIEW_PAUSE_COPY,
  REVIEW_SLIPPING_COPY,
  REVIEW_STEP_BACK_COPY,
  REVIEW_STEPPED_BACK_COPY,
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
  REVIEW_INITIALS_PLACEHOLDER,
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

/**
 * The options on a multiple-choice rung.
 *
 * One component for four rungs. It was three copies of the same eleven lines before `verse.next`
 * would have made a fourth, and they had already begun to differ — one passed `promptKey` back
 * with the answer and the others did not.
 *
 * Every rung sends `almost` as its outcome and lets the server decide. The client has no answer
 * key and must not appear to: sending `recalled` here would be the page asserting something it
 * cannot know.
 */
const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/** The rungs whose answer key is the curated index rather than the text or the reader. */
const INDEX_KEYED_RUNGS = new Set(['verse.theme', 'verse.person', 'verse.crossref', 'chapter.person']);

/**
 * The options on a multiple-choice rung.
 *
 * One component for four rungs. It was three copies of the same eleven lines before `verse.next`
 * would have made a fourth, and they had already begun to differ — one passed `promptKey` back
 * with the answer and the others did not.
 *
 * Every rung sends `almost` as its outcome and lets the server decide. The client has no answer
 * key and must not appear to: sending `recalled` here would be the page asserting something it
 * cannot know.
 *
 * The letters are real. A keycap that shows "A" and does nothing when you press A is a lie, so
 * the bare letters are bound while a choice is on screen — guarded by `isTypingInInput`, since
 * the dock stays open over a note and a review must never eat a keystroke meant for the page.
 * Bare rather than the toolbar's Cmd+Shift chord: these are the only controls on the card, and
 * a quiz that needs a chord to answer is not a quiz.
 */
/**
 * The rung that asks for the verse in your own typing. One, now: the first rung asked for it
 * too until it became the recognition tap its name always meant.
 */
const FREE_RECALL_RUNGS = new Set(['verse.recall']);

function ReviewChoiceChips({
  options,
  disabled,
  onPick,
  opening = false,
  missed = [],
  correct,
}: {
  options: readonly string[];
  disabled: boolean;
  onPick: (option: string) => void;
  /** Options already tried and wrong. Marked, and not offered again. */
  missed?: readonly string[];
  /**
   * The option the server just marked right, held for a beat before the result takes the card.
   *
   * The page has no answer key, so this is only ever what came back from marking — never a
   * guess made here.
   */
  correct?: string | null;
  /**
   * These options are the *first words* of something longer, so they trail off.
   *
   * Display only. The value handed back is the option itself — the server rebuilds the same
   * exercise to mark the tap, and an ellipsis baked into the string would not match.
   */
  opening?: boolean;
}) {
  const pick = useRef(onPick);
  pick.current = onPick;
  const missedRef = useRef(missed);
  missedRef.current = missed;

  useEffect(() => {
    if (disabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingInInput()) return;
      const index = CHOICE_LETTERS.indexOf(
        event.key.toUpperCase() as (typeof CHOICE_LETTERS)[number],
      );
      if (index < 0 || index >= options.length) return;
      // A key for an option already ruled out does nothing, as its chip does.
      if (missedRef.current.includes(options[index])) return;
      event.preventDefault();
      pick.current(options[index]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [options, disabled]);

  return (
    <div className="proto-review-dock__chips">
      {options.map((option, index) => (
        <button
          key={option}
          type="button"
          className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact proto-review-dock__choice"
          data-missed={missed.includes(option) ? '' : undefined}
          data-correct={correct === option ? '' : undefined}
          disabled={disabled || missed.includes(option)}
          onClick={() => pick.current(option)}
        >
          {/* aria-hidden: the letter is a way to reach the button, not part of what it says. */}
          <kbd className="proto-kbd proto-kbd--compact proto-review-dock__choice-key" aria-hidden>
            {CHOICE_LETTERS[index]}
          </kbd>
          <span className="proto-review-dock__choice-label">
            {opening ? `${option}…` : option}
          </span>
        </button>
      ))}
    </div>
  );
}

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

  const queued = useMemo(
    () => resolveReviewDockItem(reviewDock?.itemId, sessionItems, itemsQuery.data?.items ?? []),
    [reviewDock?.itemId, sessionItems, itemsQuery.data],
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
  const [sitting, setSitting] = useState({ answered: 0, holding: 0 });

  /*
   * A graded rung fetches without being revealed, because on those the puzzle *is* the question
   * — there is nothing to write first. No payload carries an answer key, and the locate rung's
   * deliberately withholds the verse text as well.
   */
  const isGradedRung = item ? reviewRungIsGraded(item) : false;
  const reveal = useReviewReveal(item?.id ?? null, { enabled: revealed || isGradedRung });
  // The one after this one, fetched while the reader is still on this one.
  const nextItem = sessionItems[sessionItems.findIndex((i) => i.id === item?.id) + 1];
  usePrefetchReviewReveal(nextItem && reviewRungIsGraded(nextItem) ? nextItem.id : null);
  const outcome = useReviewOutcome();
  const stepBack = useStepBackReview();
  const setStatus = useSetReviewStatus();
  // What the reader chose for a slipping item, so the offer is made once and answered once.
  const [leechAction, setLeechAction] = useState<'stepped' | 'paused' | null>(null);
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
      <p className="proto-caption proto-review-dock__retry">
        {verdict.parts && verdict.parts.length > 1
          ? reviewPartsAgainCopy(verdict.parts.filter(Boolean).length, verdict.parts.length)
          : REVIEW_TRY_AGAIN_COPY}
      </p>
    ) : null;

  /** What this rung allows: the server's answer once it has spoken, else the rung's own rule. */
  const goesTotal = attemptsTotal ?? (item ? maxAttemptsFor(item.promptKey) : 0);

  const lastResult = reviewDock?.lastResult ?? null;

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
  }, [item?.id]);

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
                attempt: FREE_RECALL_RUNGS.has(item.promptKey) ? attempt.trim() || null : null,
                attemptParts: FREE_RECALL_RUNGS.has(item.promptKey) ? (data.parts ?? null) : null,
                reached: data.reached ?? null,
                fromIndex: INDEX_KEYED_RUNGS.has(item.promptKey),
                leech: data.leech === true,
                itemId: item.id,
                at: Date.now(),
              });
              setLeechAction(null);
              setSitting((current) => ({
                answered: current.answered + 1,
                holding: current.holding + (data.next.recallState === 'durable' ? 1 : 0),
              }));
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

  const verdictRow = (
    <div className="proto-review-dock__actions">
      {canJudge ? (
        <>
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
            disabled={outcome.isPending}
            onClick={() => answer('almost')}
          >
            {REVIEW_ALMOST_COPY}
          </button>
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--compact"
            disabled={outcome.isPending}
            onClick={() => answer('recalled')}
          >
            {REVIEW_RECALLED_COPY}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="proto-settings-btn proto-settings-btn--compact"
          disabled={outcome.isPending}
          onClick={() => answer('revealed')}
        >
          {REVIEW_REVEALED_ACK_COPY}
        </button>
      )}
    </div>
  );

  return (
    <StudyDockCardShell
      rootClassName="proto-review-dock"
      accentColor="var(--pds-accent)"
      ariaLabel="Review"
      expanded={reviewDock.expanded}
      onToggleExpanded={() => setReviewDockExpanded(!reviewDock.expanded)}
      onDismiss={closeReviewDock}
      headerIcon={<Icon name="arrows-rotate" size={13} aria-hidden />}
      headerTrailing={
        /*
         * The goes this question has, one dot each, spent ones dimmed. No numerals and no
         * words: the vocabulary here avoids counting what is owed, and a dot that has gone out
         * says "that one is used" without saying it. Only while a marked question is up.
         */
        item && isGradedRung && goesTotal > 1 && !lastResult ? (
          <span
            className="proto-review-dock__goes"
            aria-label={`Attempt ${Math.min(attemptNumber, goesTotal)} of ${goesTotal}`}
          >
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
          {/* Only while collapsed. Expanded, the question is the first thing in the body, and a
              muted copy of it in the header asked the same thing twice in two lines. */}
          {item && !reviewDock.expanded ? (
            <span className="proto-review-dock__header-prompt">{item.prompt}</span>
          ) : null}
        </span>
      }
    >
      {/* Keyed on the question, so each new one plays its own entrance. */}
      <div className="proto-review-dock__body" key={item?.id ?? 'empty'}>
        {lastResult ? (
          /*
           * The moment after an answer, and the thing the first preview had nothing of: a
           * verdict went in and the card silently moved on, so there was no way to tell that
           * anything had been recorded. It says what you did, when it comes back, and — once,
           * on the answer that earns it — that it is holding now.
           */
          <div className="proto-review-dock__result">
            {/* The verse first, the verdict under it: what the reader came back for is the
                text, not the bookkeeping. */}
            {lastResult.correctAnswer ? (
              <div className="proto-review-dock__answer">
                <p className="proto-caption proto-review-dock__truth-label">
                  {/* A miss on a curated rung is a disagreement with the index, not a lapse of
                      memory, and the label says whose reading this is. */}
                  {lastResult.fromIndex ? REVIEW_INDEX_ANSWER_LABEL : REVIEW_ANSWER_LABEL}
                </p>
                <p className="proto-review-dock__verse">{lastResult.correctAnswer}</p>
              </div>
            ) : null}
            {lastResult.attempt ? (
              /*
               * Their sentence, with the words that landed marked. The marks index their own
               * typing, so this says how much of the verse they reached without printing the
               * verse's vocabulary at them — the verse itself is directly below, in full.
               */
              <div className="proto-review-dock__answer">
                <p className="proto-caption proto-review-dock__truth-label">
                  {REVIEW_YOUR_WORDS_LABEL}
                </p>
                <p className="proto-review-dock__verse proto-review-dock__verse--yours">
                  {lastResult.attempt.split(/\s+/).map((word, index) => (
                    <Fragment key={`${index}-${word}`}>
                      {index > 0 ? ' ' : null}
                      <span data-answer={lastResult.attemptParts?.[index] ? 'right' : undefined}>
                        {word}
                      </span>
                    </Fragment>
                  ))}
                </p>
                {lastResult.reached ? (
                  <p className="proto-caption proto-review-dock__retry">
                    {reviewReachedCopy(lastResult.reached.matched, lastResult.reached.total)}
                  </p>
                ) : null}
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
            <div className="proto-review-dock__verdict" data-outcome={lastResult.outcome}>
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
            {/*
              * The reader decides when the next one comes. Both ways are offered: stopping
              * after one is a whole act, and a card with only "next" on it would say otherwise.
              */}
            <div className="proto-review-dock__actions">
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
                onClick={closeReviewDock}
              >
                {REVIEW_ENOUGH_COPY}
              </button>
            </div>
            {lastResult.leech && lastResult.itemId ? (
              /* Four misses since it was last held. The one place Review says a thing is not
                 working rather than asking again, and it offers the way down, not a lecture. */
              <div className="proto-review-dock__slipping">
                {leechAction ? (
                  <p className="proto-caption proto-review-dock__retry">
                    {leechAction === 'stepped' ? REVIEW_STEPPED_BACK_COPY : REVIEW_PAUSE_COPY}
                  </p>
                ) : (
                  <>
                    <p className="proto-caption proto-review-dock__retry">{REVIEW_SLIPPING_COPY}</p>
                    <div className="proto-review-dock__actions">
                      <button
                        type="button"
                        className="proto-settings-btn proto-settings-btn--compact"
                        onClick={() => {
                          setLeechAction('stepped');
                          stepBack.mutate({ itemId: lastResult.itemId! });
                        }}
                      >
                        {REVIEW_STEP_BACK_COPY}
                      </button>
                      <button
                        type="button"
                        className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
                        onClick={() => {
                          setLeechAction('paused');
                          setStatus.mutate({ itemId: lastResult.itemId!, status: 'paused' });
                        }}
                      >
                        {REVIEW_PAUSE_COPY}
                      </button>
                    </div>
                  </>
                )}
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
            <ProtoLoadingDots label={REVIEW_LOADING_LABEL} />
          ) : (
            <>
              <p className="proto-review-dock__empty">{REVIEW_EMPTY_COPY}</p>
              {sitting.answered > 0 ? (
                <p className="proto-caption">{sittingCloseLine(sitting)}</p>
              ) : null}
            </>
          )
        ) : answeringOnNote ? (
          /* The question has moved to the stack's edge, at the top of the note. Saying so beats
             repeating the prompt down here, where it would read as a second, separate ask. */
          <p className="proto-review-dock__handoff">Answer at the top of your note.</p>
        ) : noteChoice ? (
          /*
           * A note rung. The fragment is the reader's own writing, quoted back — and the
           * question above already says what is being asked, so this needs no other framing.
           */
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            {/* Which note is being asked about. `note.passage` and `note.connect` name it in the
                sentence when it has a name, and say nothing when it does not — this is the line
                that answers "which note?" for a nameless one. */}
            {subtitle ? <p className="proto-review-dock__subject">{subtitle}</p> : null}
            {noteChoice.span ? (
              /* The span the reader marked, with the words either side of it. The run-up is
                 what stops a quote that begins mid-clause reading as a grammar puzzle; the
                 marked words stay the emphasis. */
              <p className="proto-review-dock__verse">
                {noteChoice.span.before ? <span>{noteChoice.span.before} </span> : null}
                <strong>{noteChoice.span.quote}</strong>
                {noteChoice.span.after ? <span> {noteChoice.span.after}</span> : null}
              </p>
            ) : noteChoice.fragment ? (
              <p className="proto-review-dock__verse">“{noteChoice.fragment}”</p>
            ) : null}
            {retryLine}
            <ReviewChoiceChips
              options={noteChoice.options}
              disabled={outcome.isPending}
              missed={missed}
              correct={verdict?.state === 'right' ? verdict.option : null}
              onPick={(option) => answer('almost', { option, promptKey: item.promptKey })}
            />
          </>
        ) : clozeExercise && clozeExercise.blankLengths.length > 0 ? (
          /*
           * Fill in the missing words, in the gaps themselves.
           *
           * The server has built this cloze since the rung shipped and nothing ever rendered it,
           * because the rung was not graded and the reveal arrived only after the reader had
           * already been shown a textarea. It is graded now — and the gaps are inputs rather
           * than a picture of inputs, so the words go where they belong instead of being retyped
           * into a box underneath in an order the reader has to keep track of.
           *
           * Each input is sized by the word it stands for, which is the same hint the underscore
           * run always gave.
           */
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            <p className="proto-challenge__cloze">
              {clozeExercise.segments.map((segment, index) => (
                <Fragment key={index}>
                  {segment}
                  {index < clozeExercise.blankLengths.length ? (
                    <input
                      type="text"
                      className="proto-review-dock__blank"
                      data-answer={partState(index)}
                      style={{ width: `${Math.max(4, clozeExercise.blankLengths[index]) + 1}ch` }}
                      value={blanks[index] ?? ''}
                      onChange={(event) => {
                        const next = [...blanks];
                        next[index] = event.target.value;
                        setBlanks(next);
                      }}
                      aria-label={`Missing word ${index + 1}`}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={outcome.isPending}
                    />
                  ) : null}
                </Fragment>
              ))}
            </p>
            {retryLine}
            <div className="proto-review-dock__actions">
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
                disabled={outcome.isPending || blanks.some((b) => !b?.trim())}
                onClick={() =>
                  answer('almost', {
                    words: clozeExercise.blankLengths.map((_, i) => blanks[i] ?? ''),
                    promptKey: item.promptKey,
                  })
                }
              >
                {REVIEW_CHECK_COPY}
              </button>
            </div>
          </>
        ) : sequenceExercise ? (
          /*
           * Put the phrases back in order. Tap to place, tap a placed one to take it back —
           * no drag library, which would be a dependency and a touch-target problem for a
           * puzzle of four chips.
           */
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            <ol className="proto-review-dock__chips proto-review-dock__chips--placed">
              {placed.map((index, position) => (
                <li key={`${index}-${position}`}>
                  {/* The order you built is the answer, so the whole row wears the verdict. */}
                  <button
                    type="button"
                    className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact proto-review-dock__choice"
                    data-missed={partState(position) === 'wrong' ? '' : undefined}
                    data-correct={partState(position) === 'right' ? '' : undefined}
                    disabled={outcome.isPending}
                    onClick={() => setPlaced((current) => current.filter((_, i) => i !== position))}
                  >
                    {sequenceExercise.phrases[index]}
                  </button>
                </li>
              ))}
            </ol>
            <div className="proto-review-dock__chips">
              {sequenceExercise.phrases.map((phrase, index) =>
                placed.includes(index) ? null : (
                  <button
                    key={index}
                    type="button"
                    className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
                    onClick={() => setPlaced((current) => [...current, index])}
                  >
                    {phrase}
                  </button>
                ),
              )}
            </div>
            {retryLine}
            <div className="proto-review-dock__actions">
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--compact"
                disabled={outcome.isPending || placed.length !== sequenceExercise.phrases.length}
                onClick={() => answer('almost', { order: placed })}
              >
                {REVIEW_CHECK_COPY}
              </button>
            </div>
          </>
        ) : alteredExercise ? (
          /*
           * The one rung that shows words which are not what the passage says.
           *
           * The question above states that before the reader reaches the text, and the caption
           * below repeats it on the block itself — a prompt can be scrolled past, cropped out
           * of a screenshot or skipped by someone tapping straight at the words, and the
           * warning has to travel with them. Deliberately not `--scripture`: this is the one
           * place a line must not be dressed as the real thing.
           */
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            <div className="proto-review-dock__altered">
              <p className="proto-caption proto-review-dock__altered-caption">
                {REVIEW_ALTERED_CAPTION}
              </p>
              <p className="proto-review-dock__altered-text">
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
                        )
                      }
                    >
                      {token}
                    </button>
                  </Fragment>
                ))}
              </p>
            </div>
          </>
        ) : initialsExercise ? (
          /*
           * The classic memory-verse aid: the first letter of every word, and the reader writes
           * the verse back. Graded on the content words, in order — connectives and case are
           * forgiven, because "the" for "a" is not forgetting.
           */
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            <p className="proto-challenge__cloze">{initialsExercise.initials}</p>
            <textarea
              className="proto-review-dock__attempt"
              placeholder={REVIEW_INITIALS_PLACEHOLDER}
              value={attempt}
              onChange={(event) => setAttempt(event.target.value)}
              rows={3}
            />
            {retryLine}
            <div className="proto-review-dock__actions">
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
                disabled={outcome.isPending || !attempt.trim()}
                onClick={() => answer('almost', { text: attempt, promptKey: item.promptKey })}
              >
                {REVIEW_CHECK_COPY}
              </button>
            </div>
          </>
        ) : keywordsExercise ? (
          /* Free recall, the lightest rung: any three words that are actually in the verse. */
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            <p className="proto-challenge__cloze">
              {Array.from({ length: keywordsExercise.count }, (_, index) => (
                <Fragment key={index}>
                  {index > 0 ? ' ' : null}
                  <input
                    type="text"
                    className="proto-review-dock__blank"
                    data-answer={partState(index)}
                    style={{ width: '10ch' }}
                    value={blanks[index] ?? ''}
                    onChange={(event) => {
                      const next = [...blanks];
                      next[index] = event.target.value;
                      setBlanks(next);
                    }}
                    aria-label={`Word ${index + 1}`}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={outcome.isPending}
                  />
                </Fragment>
              ))}
            </p>
            {retryLine}
            <div className="proto-review-dock__actions">
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
                disabled={
                  outcome.isPending ||
                  Array.from({ length: keywordsExercise.count }).some((_, i) => !blanks[i]?.trim())
                }
                onClick={() =>
                  answer('almost', {
                    words: Array.from({ length: keywordsExercise.count }, (_, i) => blanks[i] ?? ''),
                    promptKey: item.promptKey,
                  })
                }
              >
                {REVIEW_CHECK_COPY}
              </button>
            </div>
          </>
        ) : beforeExercise ? (
          /* Two openings from the same chapter; the verse itself is one of them, so it stays off
             screen. */
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            {retryLine}
            <ReviewChoiceChips
              options={beforeExercise.options}
              disabled={outcome.isPending}
              missed={missed}
              correct={verdict?.state === 'right' ? verdict.option : null}
              opening
              onPick={(option) => answer('almost', { option, promptKey: item.promptKey })}
            />
          </>
        ) : contextChoice ? (
          /*
           * The context step: which note cites this, which theme it carries, who it is about,
           * what it is cross-referenced with. The verse stays on screen — it is the question —
           * and the options are the whole exercise.
           */
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            {verseMarkup ? (
              <p className="proto-review-dock__verse proto-review-dock__verse--scripture" dangerouslySetInnerHTML={verseMarkup} />
            ) : null}
            {retryLine}
            <ReviewChoiceChips
              options={contextChoice.options}
              disabled={outcome.isPending}
              missed={missed}
              correct={verdict?.state === 'right' ? verdict.option : null}
              opening={contextChoice.opening}
              onPick={(option) => answer('almost', { option, promptKey: item.promptKey })}
            />
          </>
        ) : nextExercise ? (
          /*
           * "What comes after this?" — the verse in question stays on screen above the options,
           * because it is the question. Only the four openings are offered; the next verse's
           * reference never reaches the page, or the answer would be arithmetic.
           */
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            {verseMarkup ? (
              <p className="proto-review-dock__verse proto-review-dock__verse--scripture" dangerouslySetInnerHTML={verseMarkup} />
            ) : null}
            {retryLine}
            <ReviewChoiceChips
              options={nextExercise.options}
              disabled={outcome.isPending}
              missed={missed}
              correct={verdict?.state === 'right' ? verdict.option : null}
              opening
              onPick={(option) => answer('almost', { option, promptKey: item.promptKey })}
            />
          </>
        ) : locateExercise ? (
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            <p className="proto-review-dock__verse proto-review-dock__verse--scripture">“{locateExercise.phrase}…”</p>
            {retryLine}
            <ReviewChoiceChips
              options={locateExercise.options}
              disabled={outcome.isPending}
              missed={missed}
              correct={verdict?.state === 'right' ? verdict.option : null}
              onPick={(option) => answer('almost', { option, promptKey: item.promptKey })}
            />
          </>
        ) : FREE_RECALL_RUNGS.has(item.promptKey) ? (
          /*
           * Write the verse out, and have it marked. Forgivingly — content words, in order,
           * case and punctuation and the small words all forgiven — because the thing being
           * tested is the verse, not the typing. What you wrote comes back with the verse.
           */
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            <textarea
              className="proto-review-dock__attempt"
              data-answer={verdict?.state ?? undefined}
              placeholder={REVIEW_ATTEMPT_PLACEHOLDER}
              value={attempt}
              onChange={(event) => setAttempt(event.target.value)}
              rows={3}
              disabled={outcome.isPending}
            />
            {retryLine}
            <div className="proto-review-dock__actions">
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
                disabled={outcome.isPending || !attempt.trim()}
                onClick={() => answer('almost', { text: attempt, promptKey: item.promptKey })}
              >
                {REVIEW_CHECK_COPY}
              </button>
            </div>
          </>
        ) : isGradedRung && (reveal.isPending || reveal.isFetching) ? (
          /*
           * The question, and dots where its exercise will be.
           *
           * Every exercise branch above is keyed on a field of the reveal, so until it lands
           * they are all empty and the chain fell through to the free-text fallback below —
           * the reader saw a textarea and a "check the verse" button, which then vanished and
           * became four options. Showing the wrong exercise is worse than showing none, and
           * the prompt is the part they should be reading first anyway.
           */
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            {subtitle ? <p className="proto-review-dock__subject">{subtitle}</p> : null}
            <ProtoLoadingDots label={REVIEW_LOADING_LABEL} />
          </>
        ) : !revealed ? (
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            {/* Which note is being asked about, when the question does not already say. The
                row on Activity carries this too, and it is the difference between answering
                about your note and guessing which note it means. */}
            {subtitle ? <p className="proto-review-dock__subject">{subtitle}</p> : null}
            <textarea
              className="proto-review-dock__attempt"
              placeholder={REVIEW_ATTEMPT_PLACEHOLDER}
              value={attempt}
              onChange={(event) => setAttempt(event.target.value)}
              rows={2}
            />
            {/*
              * One action, because there was only ever one.
              *
              * There used to be an "I have it in mind" beside this, for someone who retrieved the
              * note mentally without typing. Both buttons revealed; the only difference was an
              * invisible flag deciding which verdicts appeared afterwards, which is why it read
              * as two ways to do the same thing. It also asked the reader to declare a mental
              * state *before* checking it, which is the same invitation to a comfortable lie that
              * the cold-reveal rule exists to avoid — and the strategy doc is explicit that
              * "whether they attempt recall before revealing a note" is something to infer from
              * behaviour, not to ask about. Writing something is the attempt.
              */}
            {retryLine}
            <div className="proto-review-dock__actions">
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--compact"
                onClick={() => {
                  if (revealsElsewhere(item.kind, item.noteId)) revealElsewhere();
                  else setRevealed(true);
                }}
              >
                {revealLabelFor(item.kind)}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            {item.kind === 'thread' ? (
              <p className="proto-caption">Your Thread is open beside you.</p>
            ) : reveal.isPending ? (
              <p className="proto-caption">Fetching…</p>
            ) : verseMarkup ? (
              <div className="proto-review-dock__verse proto-review-dock__verse--scripture" dangerouslySetInnerHTML={verseMarkup} />
            ) : null}
            {verdictRow}
          </>
        )}
      </div>
    </StudyDockCardShell>
  );
}
