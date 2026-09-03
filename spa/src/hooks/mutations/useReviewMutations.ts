/**
 * Review's writes.
 *
 * All of them invalidate the `['review']` prefix rather than a specific key: an answer changes
 * the inbox, the session and the manage list at once, and enumerating which three would be a
 * list to keep in sync with every new surface.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  reviewQueryKey,
  reviewSessionQueryKey,
  type ReviewItemView,
} from '../queries/useReview';
import type { ReviewItemKind, ReviewItemStatus, ReviewOutcome } from '@/utils/review-item-kinds';

export interface AddReviewItemInput {
  kind: ReviewItemKind;
  noteId?: string;
  secondaryNoteId?: string;
  studyThreadEntryId?: string;
  scriptureReference?: string;
  translation?: string;
}

export function useAddReviewItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddReviewItemInput) =>
      api.post<{ item: ReviewItemView; created: boolean }>('/api/review/items', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reviewQueryKey });
    },
  });
}

export interface ReviewOutcomeInput {
  /** Which go this is, 1-based. Decides the interval, and whether a miss is final. */
  attemptNumber?: number;
  itemId: string;
  outcome: ReviewOutcome;
  attempt?: string;
  /**
   * The two graded rungs of the verse ladder. When present the server marks the answer and
   * ignores `outcome` — the page has no answer key to check against, by design.
   */
  answer?: { order?: number[]; option?: string; promptKey?: string; wordIndex?: number; words?: string[] };
}

export interface ReviewOutcomeResponse {
  /** What the server recorded. On a graded rung this is its verdict, not what the page sent. */
  outcome?: 'recalled' | 'almost' | 'revealed';
  /** Whether the answer was right, where the server marked one. */
  correct?: boolean;
  /**
   * False when a wrong answer still has a go left: nothing was written and the question stands.
   * Absent on the ungraded rungs, which finalize immediately.
   */
  finalized?: boolean;
  attemptsLeft?: number;
  /** The option that was right, sent only once the question is over and only where it is one. */
  correctAnswer?: string;
  item: ReviewItemView;
  next: { intervalDays: number; dueAt: string; recallState: string; label: string };
  /**
   * The verse a rung withheld while it was asking, handed back now the question is answered.
   *
   * Only present on the rungs that hid it — putting the words back in order, and naming the
   * reference. Absent everywhere else, including where the verse was on screen all along.
   */
  truth?: { verseText: string } | null;
}

/**
 * Answer an item.
 *
 * The optimistic update removes the item from the *session* list only, which is what makes
 * the next question appear immediately rather than after a round trip. The inbox and the
 * manage list are left to refetch: they are not on screen, and guessing their new contents
 * would mean reimplementing the scheduler on the client.
 */
export function useReviewOutcome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, outcome, attempt, attemptNumber, answer }: ReviewOutcomeInput) =>
      api.post<ReviewOutcomeResponse>(`/api/review/items/${encodeURIComponent(itemId)}/outcome`, {
        outcome,
        attempt,
        attemptNumber,
        answer,
      }),
    onMutate: async ({ itemId }) => {
      await queryClient.cancelQueries({ queryKey: reviewSessionQueryKey });
      const previous = queryClient.getQueryData<{ items: ReviewItemView[] }>(reviewSessionQueryKey);
      if (previous) {
        queryClient.setQueryData(reviewSessionQueryKey, {
          items: previous.items.filter((i) => i.id !== itemId),
        });
      }
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(reviewSessionQueryKey, context.previous);
    },
    onSuccess: (data, _input, context) => {
      /*
       * A wrong answer with a go left is not an answer yet. `onMutate` has already taken the item
       * out of the session so the next question can appear instantly on the common path, so a
       * non-final attempt has to put it back — the reader is still looking at it.
       */
      if (data.finalized === false && context?.previous) {
        queryClient.setQueryData(reviewSessionQueryKey, context.previous);
      }
    },
    onSettled: () => {
      // Not the session: refetching it mid-sitting would pull in items answered on another
      // device and reshuffle the queue under the reader.
      void queryClient.invalidateQueries({ queryKey: ['review', 'inbox'] });
      void queryClient.invalidateQueries({ queryKey: ['review', 'items'] });
      // A recall lengthens the note's resurfacing stability, which Home reads.
      void queryClient.invalidateQueries({ queryKey: ['note-fingerprints'] });
    },
  });
}

export function useDeferReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      api.post<{ dueAt: string }>(`/api/review/items/${encodeURIComponent(itemId)}/defer`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reviewQueryKey });
    },
  });
}

export function useSetReviewStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: ReviewItemStatus }) =>
      api.post<{ item: ReviewItemView }>(
        `/api/review/items/${encodeURIComponent(itemId)}/status`,
        { status },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reviewQueryKey });
    },
  });
}
