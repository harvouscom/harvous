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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import StudyDockCardShell from '@/components/react/StudyDockCardShell';
import { canJudgeRecall, resolveReviewDockItem } from '@/utils/review-dock-state';
import { reviewRowSubtitle } from '@/utils/review-row-subtitle';
import { noteParamSlug } from './proto-route-slugs';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import { threadClusterDrillSlug } from '@/utils/thread-cluster-bulk-actions';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { PROTO_REVIEW_RESULT_DWELL_MS } from '../../layouts/proto-motion';
import { reviewRungIsGraded } from '@/utils/review-prompts';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { useHasFeature } from '../../hooks/useHasFeature';
import {
  useReviewItems,
  useReviewReveal,
  useReviewSession,
  type ReviewItemView,
} from '../../hooks/queries/useReview';
import { useReviewOutcome } from '../../hooks/mutations/useReviewMutations';
import { useLibraryPanelNav } from './library-panel/use-library-panel-nav';
import { buildReviewCardStackOrigin } from './paper-stack-origins';
import {
  REVIEW_ALMOST_COPY,
  REVIEW_ATTEMPT_PLACEHOLDER,
  REVIEW_EMPTY_COPY,
  REVIEW_RECALLED_COPY,
  REVIEW_REVEALED_ACK_COPY,
  REVIEW_CHECK_COPY,
  REVIEW_CROSSED_TO_HOLDING_COPY,
  REVIEW_OUTCOME_ACK_COPY,
  REVIEW_REVEAL_CONNECTION_COPY,
  REVIEW_REVEAL_COPY,
  REVIEW_REVEAL_THREAD_COPY,
  REVIEW_REVEAL_VERSE_COPY,
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
function ReviewChoiceChips({
  options,
  disabled,
  onPick,
  opening = false,
}: {
  options: readonly string[];
  disabled: boolean;
  onPick: (option: string) => void;
  /**
   * These options are the *first words* of something longer, so they trail off.
   *
   * Display only. The value handed back is the option itself — the server rebuilds the same
   * exercise to mark the tap, and an ellipsis baked into the string would not match.
   */
  opening?: boolean;
}) {
  return (
    <div className="proto-review-dock__chips">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
          disabled={disabled}
          onClick={() => onPick(option)}
        >
          {opening ? `${option}…` : option}
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

  const item = useMemo(
    () => resolveReviewDockItem(reviewDock?.itemId, sessionItems, itemsQuery.data?.items ?? []),
    [reviewDock?.itemId, sessionItems, itemsQuery.data],
  );

  const [attempt, setAttempt] = useState('');
  const [revealed, setRevealed] = useState(false);
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
  const outcome = useReviewOutcome();

  const lastResult = reviewDock?.lastResult ?? null;

  /*
   * The result holds for a beat, then the next question takes the card.
   *
   * A timer rather than a tap-to-continue: the reader has just answered, and asking them to
   * acknowledge their own acknowledgement is one interaction too many. Long enough to read a
   * short line, short enough that a sitting does not feel gated on it.
   */
  useEffect(() => {
    if (!lastResult) return;
    const timer = setTimeout(() => setReviewDockResult(null), PROTO_REVIEW_RESULT_DWELL_MS);
    return () => clearTimeout(timer);
  }, [lastResult, setReviewDockResult]);

  // A new question is a clean slate; the previous attempt must not sit under it.
  useEffect(() => {
    setAttempt('');
    setRevealed(false);
    setPlaced([]);
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
      graded?: { order?: number[]; option?: string; promptKey?: string },
    ) => {
      if (!item) return;
      outcome.mutate(
        {
          itemId: item.id,
          outcome: value,
          attempt: attempt.trim() || undefined,
          // On a graded rung the server decides; `value` is only the fallback if it cannot.
          answer: graded,
        },
        {
          onSuccess: (data) => {
            const crossedToDurable =
              item.recallState !== 'durable' && data.next.recallState === 'durable';
            setReviewDockResult({
              outcome: value,
              label: data.next.label,
              recallState: data.next.recallState,
              crossedToDurable,
              at: Date.now(),
            });
            setSitting((current) => ({
              answered: current.answered + 1,
              holding: current.holding + (data.next.recallState === 'durable' ? 1 : 0),
            }));
            /*
             * Hand the dock back to the queue rather than leaving it pointed at what was just
             * answered.
             *
             * The answered item does not vanish — it is rescheduled, so it is still in the full
             * item list the fallback lookup reads. Leaving the pointer on it made the dock
             * resurrect the question it had just accepted an answer for, wearing a freshly
             * rotated prompt because its review count had gone up. Null means "whatever is next".
             */
            setReviewDockItem(null);
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

  if (!reviewDock || isGuest || !review.has) return null;

  const answeringOnNote = paperStack?.origin.review?.itemId === item?.id && Boolean(item);
  const isVerse = item?.kind === 'verse';
  // `reviewRowSubtitle` suppresses itself on a graded rung — see its docblock.
  const subtitle = item ? reviewRowSubtitle(item) : null;
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
      <div className="proto-review-dock__body">
        {lastResult ? (
          /*
           * The moment after an answer, and the thing the first preview had nothing of: a
           * verdict went in and the card silently moved on, so there was no way to tell that
           * anything had been recorded. It says what you did, when it comes back, and — once,
           * on the answer that earns it — that it is holding now.
           */
          <div className="proto-review-dock__result">
            <span className="proto-dock-check" aria-hidden>
              <Icon name="check" size={12} />
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
        ) : !item ? (
          <>
            <p className="proto-review-dock__empty">{REVIEW_EMPTY_COPY}</p>
            {sitting.answered > 0 ? (
              <p className="proto-caption">{sittingCloseLine(sitting)}</p>
            ) : null}
          </>
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
            {noteChoice.fragment ? (
              <p className="proto-review-dock__verse">“{noteChoice.fragment}”</p>
            ) : null}
            <ReviewChoiceChips
              options={noteChoice.options}
              disabled={outcome.isPending}
              onPick={(option) => answer('almost', { option, promptKey: item.promptKey })}
            />
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
                  <button
                    type="button"
                    className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
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
        ) : nextExercise ? (
          /*
           * "What comes after this?" — the verse in question stays on screen above the options,
           * because it is the question. Only the four openings are offered; the next verse's
           * reference never reaches the page, or the answer would be arithmetic.
           */
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            {verseMarkup ? (
              <p className="proto-review-dock__verse" dangerouslySetInnerHTML={verseMarkup} />
            ) : null}
            <ReviewChoiceChips
              options={nextExercise.options}
              disabled={outcome.isPending}
              opening
              onPick={(option) => answer('almost', { option, promptKey: item.promptKey })}
            />
          </>
        ) : locateExercise ? (
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            <p className="proto-review-dock__verse">“{locateExercise.phrase}…”</p>
            <ReviewChoiceChips
              options={locateExercise.options}
              disabled={outcome.isPending}
              onPick={(option) => answer('almost', { option, promptKey: item.promptKey })}
            />
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
              <div className="proto-review-dock__verse" dangerouslySetInnerHTML={verseMarkup} />
            ) : null}
            {verdictRow}
          </>
        )}
      </div>
    </StudyDockCardShell>
  );
}
