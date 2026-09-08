/**
 * "Add to Review" in a note's ⋯ menu — and, for a note titled as a question, a path to start.
 *
 * Its own component rather than two more branches inside `PrototypeNoteMoreMenu`, because it
 * needs four hooks of its own (the two feature keys, the note's title, the mutation) and the
 * menu is already long. Renders null more often than it renders: no key, a guest, or someone
 * else's note.
 *
 * Showing nothing to a free account is deliberate. A locked row here would be the second
 * paywall in a session that already met one on Activity, and the note's menu is the last place
 * a study app should sell anything — the reader opened it to do something to their note.
 */
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { useAddReviewItem } from '../../hooks/mutations/useReviewMutations';
import {
  challengeConflictId,
  useCreateChallenge,
} from '../../hooks/mutations/useChallengeMutations';
import { useHasFeature } from '../../hooks/useHasFeature';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { useNote } from '../../hooks/queries/useNote';
import { isQuestionNoteTitle } from '@/utils/challenge-templates';
import { REVIEW_ADDED_COPY, REVIEW_ADD_COPY } from './proto-review-copy';
import { prototypeChallengeRouteTo } from '@/lib/prototype-path';

export default function PrototypeAddToReviewItem({
  noteId,
  readOnlyForeign,
  onDone,
}: {
  noteId: string;
  /** Someone else's note in a shared space — Review asks what *you* wrote. */
  readOnlyForeign: boolean;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const { isGuest } = useHarvousIdentity();
  const review = useHasFeature('review');
  const challenges = useHasFeature('challenges');
  const addItem = useAddReviewItem();
  const createChallenge = useCreateChallenge();
  const [added, setAdded] = useState(false);

  const noteQuery = useNote(noteId);
  const title = noteQuery.data?.title ?? null;
  const isQuestion = isQuestionNoteTitle(title);

  if (isGuest || readOnlyForeign) return null;
  if (!review.has && !challenges.has) return null;

  return (
    <>
      {review.has ? (
        <button
          type="button"
          role="menuitem"
          className="proto-menu-item"
          disabled={addItem.isPending || added}
          onClick={() => {
            addItem.mutate(
              { kind: 'note', noteId },
              {
                // Stays open for a beat showing "In Review", so the reader sees the answer
                // rather than watching the menu vanish and wondering whether it worked.
                onSuccess: () => {
                  setAdded(true);
                  window.setTimeout(onDone, 700);
                },
                onError: onDone,
              },
            );
          }}
        >
          <span className="proto-menu-item__icon" aria-hidden>
            <Icon name={added ? 'circle-check' : 'arrows-rotate'} size={14} />
          </span>
          <span className="proto-menu-item__label">
            {added ? REVIEW_ADDED_COPY : REVIEW_ADD_COPY}
          </span>
        </button>
      ) : null}

      {challenges.has && isQuestion ? (
        <button
          type="button"
          role="menuitem"
          className="proto-menu-item"
          disabled={createChallenge.isPending}
          onClick={() => {
            createChallenge.mutate(
              { templateKey: 'return_to_question', noteId },
              {
                onSuccess: (data) => {
                  onDone();
                  void navigate({
                    to: prototypeChallengeRouteTo(),
                    params: { challengeId: data.challenge.id },
                  });
                },
                onError: (error) => {
                  onDone();
                  const existing = challengeConflictId(error);
                  if (existing) {
                    void navigate({
                      to: prototypeChallengeRouteTo(),
                      params: { challengeId: existing },
                    });
                  }
                },
              },
            );
          }}
        >
          <span className="proto-menu-item__icon" aria-hidden>
            <Icon name="list-check" size={14} />
          </span>
          <span className="proto-menu-item__label">Return to this question</span>
        </button>
      ) : null}
    </>
  );
}
