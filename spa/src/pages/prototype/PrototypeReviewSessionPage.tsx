/**
 * `/review/session` — a sitting.
 *
 * One question at a time, and the order of the screen is the whole design: the prompt, a place
 * to attempt it, and only then a way to see the answer. Nothing about the source is on the page
 * or in the page's memory until the reader asks — `useReviewReveal` stays disabled until they
 * do, so the note body is not one devtools tab away from making the exercise pointless.
 *
 * Which buttons appear afterwards depends on what actually happened, not on what the reader
 * says about themselves:
 *
 * - Wrote something, or said they had it in mind, *then* revealed → "I recalled it" / "I almost
 *   had it". They retrieved something and are the only one who can say how completely.
 * - Revealed cold → one button, "Got it now", recorded as `revealed`. Asking someone who just
 *   read the answer whether they recalled it invites a lie, and the schedule is downstream of
 *   the answer, so a lie there costs them a real interval.
 *
 * There is no grading. What they type is stored on the event and never compared to anything —
 * there is nothing to compare it to, because these are open questions about their own study.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import { useReviewReveal, useReviewSession } from '../../hooks/queries/useReview';
import { useReviewOutcome } from '../../hooks/mutations/useReviewMutations';
import { useHasFeature } from '../../hooks/useHasFeature';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import {
  REVIEW_ALMOST_COPY,
  REVIEW_ATTEMPT_PLACEHOLDER,
  REVIEW_EMPTY_COPY,
  REVIEW_HAVE_IT_COPY,
  REVIEW_RECALLED_COPY,
  REVIEW_REVEALED_ACK_COPY,
  REVIEW_REVEAL_COPY,
  REVIEW_REVEAL_VERSE_COPY,
} from './proto-review-copy';
import { prototypeHomeRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import { encodeNoteSlug } from '@/utils/ids';
import type { ReviewOutcome } from '@/utils/review-item-kinds';

export default function PrototypeReviewSessionPage() {
  const navigate = useNavigate();
  const { isGuest } = useHarvousIdentity();
  const review = useHasFeature('review');
  const sessionQuery = useReviewSession();
  const outcome = useReviewOutcome();

  const items = useMemo(() => sessionQuery.data?.items ?? [], [sessionQuery.data]);
  const item = items[0] ?? null;

  const [attempt, setAttempt] = useState('');
  const [revealed, setRevealed] = useState(false);
  /** Set by writing, or by saying so. Either counts as having tried before looking. */
  const [attempted, setAttempted] = useState(false);
  const [lastReturn, setLastReturn] = useState<string | null>(null);

  const reveal = useReviewReveal(item?.id ?? null, { enabled: revealed });

  /*
   * Memoized, not inline.
   *
   * A fresh `{ __html }` object every render makes React re-apply innerHTML every render, which
   * collapses any selection the reader has made inside the revealed text. That is exactly what
   * someone does here — read the note back, select the sentence they half-remembered — so the
   * bug would land on the feature's main action. Same fix as the reader's own passage markup.
   */
  const verseMarkup = useMemo(
    () => (reveal.data?.verseText ? { __html: reveal.data.verseText } : null),
    [reveal.data?.verseText],
  );

  // A new question is a clean slate. Without this the previous answer's text would sit in the
  // box under the next prompt, which reads as the app having already answered for them.
  useEffect(() => {
    setAttempt('');
    setRevealed(false);
    setAttempted(false);
  }, [item?.id]);

  const answer = useCallback(
    (value: ReviewOutcome) => {
      if (!item) return;
      outcome.mutate(
        { itemId: item.id, outcome: value, attempt: attempt.trim() || undefined },
        { onSuccess: (data) => setLastReturn(data.next.label) },
      );
    },
    [attempt, item, outcome],
  );

  if (isGuest || (review.ready && !review.has)) {
    void navigate({ to: prototypeHomeRouteTo(), replace: true });
    return <ProtoSpaceLoading label="Review" />;
  }

  if (sessionQuery.isPending || !review.ready) {
    return <ProtoSpaceLoading label="Loading your Review" />;
  }

  /*
   * The end of a sitting, and the last thing it says is not a count.
   *
   * "Nothing waiting. Keep studying." rather than "3 reviewed, 12 remaining" — a tally at the
   * end of a session is the thing that turns the next one into an obligation. If something is
   * still scheduled it is scheduled, and the day it comes back is the day to mention it.
   */
  if (!item) {
    return (
      <div className="proto-feed">
        <article className="proto-feed-sheet">
          <header className="proto-feed-sheet__head">
            <div className="proto-feed-sheet__title">
              <h2 className="proto-feed-sheet__day">Review</h2>
            </div>
          </header>
          <div className="proto-feed-sheet__body">
            <p className="proto-feed-sheet__rest">{REVIEW_EMPTY_COPY}</p>
            {lastReturn ? <p className="proto-caption">{lastReturn}.</p> : null}
            <button
              type="button"
              className="proto-settings-btn"
              onClick={() => void navigate({ to: prototypeHomeRouteTo() })}
            >
              Back to Activity
            </button>
          </div>
        </article>
      </div>
    );
  }

  const isVerse = item.kind === 'verse';
  const revealLabel = isVerse ? REVIEW_REVEAL_VERSE_COPY : REVIEW_REVEAL_COPY;
  const canJudge = attempted || attempt.trim().length > 0;

  return (
    <div className="proto-feed">
      <article className="proto-feed-sheet">
        <header className="proto-feed-sheet__head">
          <div className="proto-feed-sheet__title">
            <h2 className="proto-feed-sheet__day">Review</h2>
            <button
              type="button"
              className="proto-sidebar-back-tile proto-feed-sheet__forward"
              onClick={() => void navigate({ to: prototypeHomeRouteTo() })}
              aria-label="Leave Review"
              title="Leave Review"
            >
              <Icon name="caret-right" size={16} aria-hidden />
            </button>
          </div>
        </header>

        <div className="proto-feed-sheet__body proto-review-session">
          <p className="proto-review-session__prompt">{item.prompt}</p>

          {!revealed ? (
            <>
              <textarea
                className="proto-review-session__attempt"
                placeholder={REVIEW_ATTEMPT_PLACEHOLDER}
                value={attempt}
                onChange={(event) => setAttempt(event.target.value)}
                rows={4}
              />
              <div className="proto-review-session__actions">
                {/* For someone who thought it rather than typed it. Same meaning as writing:
                    they had a go before looking. */}
                <button
                  type="button"
                  className="proto-settings-btn proto-settings-btn--secondary"
                  onClick={() => {
                    setAttempted(true);
                    setRevealed(true);
                  }}
                >
                  {REVIEW_HAVE_IT_COPY}
                </button>
                <button
                  type="button"
                  className="proto-settings-btn"
                  onClick={() => setRevealed(true)}
                >
                  {revealLabel}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="proto-review-session__reveal">
                {reveal.isPending ? (
                  <p className="proto-caption">Fetching…</p>
                ) : (
                  <>
                    {verseMarkup ? (
                      <div className="proto-review-session__verse" dangerouslySetInnerHTML={verseMarkup} />
                    ) : null}
                    {reveal.data?.note ? (
                      <NoteReveal
                        title={reveal.data.note.title}
                        content={reveal.data.note.content}
                        noteId={reveal.data.note.id}
                      />
                    ) : null}
                    {reveal.data?.secondaryNote ? (
                      <NoteReveal
                        title={reveal.data.secondaryNote.title}
                        content={reveal.data.secondaryNote.content}
                        noteId={reveal.data.secondaryNote.id}
                      />
                    ) : null}
                    {reveal.data?.thread ? (
                      <div className="proto-review-session__thread">
                        <p className="proto-caption">{reveal.data.thread.title ?? 'This Thread'}</p>
                        <ul>
                          {reveal.data.thread.members.map((member) => (
                            <li key={member.id}>{member.title ?? 'Untitled'}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div className="proto-review-session__actions">
                {canJudge ? (
                  <>
                    <button
                      type="button"
                      className="proto-settings-btn proto-settings-btn--secondary"
                      disabled={outcome.isPending}
                      onClick={() => answer('almost')}
                    >
                      {REVIEW_ALMOST_COPY}
                    </button>
                    <button
                      type="button"
                      className="proto-settings-btn"
                      disabled={outcome.isPending}
                      onClick={() => answer('recalled')}
                    >
                      {REVIEW_RECALLED_COPY}
                    </button>
                  </>
                ) : (
                  /* Revealed without attempting. One button, and it records `revealed` — the
                     honest answer, and the one that brings this back tomorrow. */
                  <button
                    type="button"
                    className="proto-settings-btn"
                    disabled={outcome.isPending}
                    onClick={() => answer('revealed')}
                  >
                    {REVIEW_REVEALED_ACK_COPY}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </article>
    </div>
  );
}

/**
 * A revealed note, with the way into it.
 *
 * "Open note" rather than an inline editor: this is a moment of recognition, and dropping a
 * full editor into it would turn a five-second answer into a writing session. The reader who
 * wants to revise goes to the note, which is where revising belongs.
 */
function NoteReveal({
  title,
  content,
  noteId,
}: {
  title: string | null;
  content: string;
  noteId: string;
}) {
  const navigate = useNavigate();
  /* Memoized for the same reason as the verse above: an inline object re-applies innerHTML on
     every render and takes the reader's text selection with it. */
  const markup = useMemo(() => ({ __html: content }), [content]);
  return (
    <div className="proto-review-session__note">
      {title ? <p className="proto-review-session__note-title">{title}</p> : null}
      <div className="proto-review-session__note-body" dangerouslySetInnerHTML={markup} />
      <button
        type="button"
        className="proto-settings-btn proto-settings-btn--secondary"
        onClick={() =>
          void navigate({
            to: prototypeNoteRouteTo(),
            params: { noteId: encodeNoteSlug(noteId) },
          })
        }
      >
        Open note
      </button>
    </div>
  );
}
