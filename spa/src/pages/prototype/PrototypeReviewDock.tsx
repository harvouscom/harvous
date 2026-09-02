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
import {
  isPrototypeDraftNoteSlug,
  noteParamSlug,
  normalizeNoteIdFromParam,
} from './proto-route-slugs';
import {
  matchPrototypeNoteId,
  matchPrototypeReadParams,
  prototypeNoteRouteTo,
} from '@/lib/prototype-path';
import { bookFromSlug } from '@/utils/bible-book-chapters';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import { threadClusterDrillSlug } from '@/utils/thread-cluster-bulk-actions';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { useHasFeature } from '../../hooks/useHasFeature';
import { useReviewItems, useReviewReveal, useReviewSession } from '../../hooks/queries/useReview';
import { useAddReviewItem, useReviewOutcome } from '../../hooks/mutations/useReviewMutations';
import { useLibraryPanelNav } from './library-panel/use-library-panel-nav';
import { buildReviewCardStackOrigin } from './paper-stack-origins';
import {
  REVIEW_ADDED_COPY,
  REVIEW_ADD_COPY,
  REVIEW_ALMOST_COPY,
  REVIEW_ATTEMPT_PLACEHOLDER,
  REVIEW_EMPTY_COPY,
  REVIEW_HAVE_IT_COPY,
  REVIEW_RECALLED_COPY,
  REVIEW_REVEALED_ACK_COPY,
  REVIEW_REVEAL_COPY,
  REVIEW_REVEAL_VERSE_COPY,
} from './proto-review-copy';

/** Kinds whose answer is another surface: the note itself, or the Thread beside you. */
function revealsElsewhere(kind: string, noteId: string | null): boolean {
  if (kind === 'thread') return true;
  return (kind === 'note' || kind === 'connection' || kind === 'highlight') && Boolean(noteId);
}

export default function PrototypeReviewDock() {
  const {
    reviewDock,
    closeReviewDock,
    setReviewDockExpanded,
    setReviewDockItem,
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
  const [attempted, setAttempted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [lastReturn, setLastReturn] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const reveal = useReviewReveal(item?.id ?? null, { enabled: revealed });
  const outcome = useReviewOutcome();
  const addItem = useAddReviewItem();

  // A new question is a clean slate; the previous attempt must not sit under it.
  useEffect(() => {
    setAttempt('');
    setAttempted(false);
    setRevealed(false);
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

  /** What the `+` would add here: the note being read, or the verse being looked at. */
  const addTarget = useMemo(() => {
    const noteSlug = matchPrototypeNoteId(pathname);
    if (noteSlug && !isPrototypeDraftNoteSlug(noteSlug)) {
      return { kind: 'note' as const, noteId: normalizeNoteIdFromParam(noteSlug) };
    }
    const read = matchPrototypeReadParams(pathname);
    const verse = typeof search.v === 'string' ? search.v : null;
    if (read && verse) {
      const book = bookFromSlug(read.bookSlug);
      if (book) {
        return {
          kind: 'verse' as const,
          scriptureReference: `${book} ${read.chapter}:${verse}`,
          translation: typeof search.t === 'string' ? search.t : undefined,
        };
      }
    }
    return null;
  }, [pathname, search]);

  const answer = useCallback(
    (value: 'recalled' | 'almost' | 'revealed') => {
      if (!item) return;
      outcome.mutate(
        { itemId: item.id, outcome: value, attempt: attempt.trim() || undefined },
        {
          onSuccess: (data) => {
            setLastReturn(data.next.label);
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
    [attempt, item, outcome, setReviewDockItem],
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
    const snapshot = { attempted, attempt: attempt.trim() || undefined };
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
  }, [attempt, attempted, item, libraryNav, navigate, pathname, setReviewDockExpanded, stackNote]);

  const verseMarkup = useMemo(
    () => (reveal.data?.verseText ? { __html: reveal.data.verseText } : null),
    [reveal.data?.verseText],
  );

  if (!reviewDock || isGuest || !review.has) return null;

  const answeringOnNote = paperStack?.origin.review?.itemId === item?.id && Boolean(item);
  const isVerse = item?.kind === 'verse';
  const canJudge = canJudgeRecall({ attempted, attempt });

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
      headerPrimaryActions={
        <button
          type="button"
          className="study-dock-card__header-btn"
          disabled={!addTarget || addItem.isPending || added}
          aria-label={added ? REVIEW_ADDED_COPY : REVIEW_ADD_COPY}
          title={addTarget ? REVIEW_ADD_COPY : 'Open a note or a verse to add it'}
          onClick={() => {
            if (!addTarget) return;
            addItem.mutate(addTarget, {
              onSuccess: () => {
                setAdded(true);
                window.setTimeout(() => setAdded(false), 1400);
              },
            });
          }}
        >
          <Icon name={added ? 'circle-check' : 'plus'} size={13} aria-hidden />
        </button>
      }
    >
      <div className="proto-review-dock__body">
        {!item ? (
          <>
            <p className="proto-review-dock__empty">{REVIEW_EMPTY_COPY}</p>
            {lastReturn ? <p className="proto-caption">{lastReturn}.</p> : null}
          </>
        ) : answeringOnNote ? (
          /* The question has moved to the stack's edge, at the top of the note. Saying so beats
             repeating the prompt down here, where it would read as a second, separate ask. */
          <p className="proto-review-dock__handoff">Answer at the top of your note.</p>
        ) : !revealed ? (
          <>
            <p className="proto-review-dock__prompt">{item.prompt}</p>
            <textarea
              className="proto-review-dock__attempt"
              placeholder={REVIEW_ATTEMPT_PLACEHOLDER}
              value={attempt}
              onChange={(event) => setAttempt(event.target.value)}
              rows={3}
            />
            <div className="proto-review-dock__actions">
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
                onClick={() => {
                  setAttempted(true);
                  if (revealsElsewhere(item.kind, item.noteId)) revealElsewhere();
                  else setRevealed(true);
                }}
              >
                {REVIEW_HAVE_IT_COPY}
              </button>
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--compact"
                onClick={() => {
                  if (revealsElsewhere(item.kind, item.noteId)) revealElsewhere();
                  else setRevealed(true);
                }}
              >
                {isVerse ? REVIEW_REVEAL_VERSE_COPY : REVIEW_REVEAL_COPY}
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
