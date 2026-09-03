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
  itemId: string;
  outcome: ReviewOutcome;
  attempt?: string;
  /**
   * The two graded rungs of the verse ladder. When present the server marks the answer and
   * ignores `outcome` — the page has no answer key to check against, by design.
   */
  answer?: { order?: number[]; option?: string; promptKey?: string };
}

export interface ReviewOutcomeResponse {
  item: ReviewItemView;
  next: { intervalDays: number; dueAt: string; recallState: string; label: string };
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
    mutationFn: ({ itemId, outcome, attempt, answer }: ReviewOutcomeInput) =>
      api.post<ReviewOutcomeResponse>(`/api/review/items/${encodeURIComponent(itemId)}/outcome`, {
        outcome,
        attempt,
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
