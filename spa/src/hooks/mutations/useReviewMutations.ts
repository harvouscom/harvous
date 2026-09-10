/**
 * Review's writes.
 *
 * All of them invalidate the `['review']` prefix rather than a specific key: an answer changes
 * the inbox, the session and the manage list at once, and enumerating which three would be a
 * list to keep in sync with every new surface.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { toast } from '@/utils/toast';
import { toastError } from '../../lib/error-copy';
import {
  reviewQueryKey,
  reviewSessionQueryKey,
  type ReviewItemView,
} from '../queries/useReview';
import {
  REVIEW_DEFERRED_TOAST,
  REVIEW_DEFER_FAILED_TOAST,
  REVIEW_PAUSED_TOAST,
  REVIEW_PAUSE_FAILED_TOAST,
  REVIEW_REMOVED_TOAST,
  REVIEW_REMOVE_FAILED_TOAST,
  REVIEW_RESUMED_TOAST,
} from '../../pages/prototype/proto-review-copy';
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
  attemptNumber?: number;
  itemId: string;
  outcome: ReviewOutcome;
  attempt?: string;
  answer?: {
    order?: number[];
    option?: string;
    promptKey?: string;
    wordIndex?: number;
    words?: string[];
    text?: string;
    translation?: string;
  };
}

export interface ReviewOutcomeResponse {
  outcome?: 'recalled' | 'almost' | 'revealed';
  correct?: boolean;
  finalized?: boolean;
  attemptsLeft?: number;
  attempts?: { used: number; total: number };
  correctAnswer?: string;
  parts?: boolean[];
  reached?: { matched: number; total: number };
  leech?: boolean;
  item: ReviewItemView;
  next: { intervalDays: number; dueAt: string; recallState: string; label: string };
  truth?: { verseText: string } | null;
}

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
      if (data.finalized === false && context?.previous) {
        queryClient.setQueryData(reviewSessionQueryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['review', 'inbox'] });
      void queryClient.invalidateQueries({ queryKey: ['review', 'items'] });
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
      toast.success(REVIEW_DEFERRED_TOAST);
      void queryClient.invalidateQueries({ queryKey: reviewQueryKey });
    },
    onError: (error) => {
      toastError(error, REVIEW_DEFER_FAILED_TOAST, { scope: 'review-defer' });
    },
  });
}

export function useStepBackReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId }: { itemId: string }) =>
      api.post<{ item: ReviewItemView }>(`/api/review/items/${encodeURIComponent(itemId)}/step-back`, {}),
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
    /*
     * Spoken here rather than at the two call sites (the Home row menu and the dock's leech
     * result) so both say the same thing, and so a third surface cannot ship silent.
     */
    onSuccess: (_data, { status }) => {
      if (status === 'archived') toast.success(REVIEW_REMOVED_TOAST);
      else if (status === 'paused') toast.success(REVIEW_PAUSED_TOAST);
      else if (status === 'active') toast.success(REVIEW_RESUMED_TOAST);
      void queryClient.invalidateQueries({ queryKey: reviewQueryKey });
    },
    onError: (error, { status }) => {
      toastError(
        error,
        status === 'archived' ? REVIEW_REMOVE_FAILED_TOAST : REVIEW_PAUSE_FAILED_TOAST,
        { scope: 'review-status' },
      );
    },
  });
}

export interface ReviewSampleAnswerResponse {
  correct: boolean;
  finalized: boolean;
  attemptsLeft?: number;
  reference?: string;
  verseText?: string;
}

export function useAnswerReviewSample() {
  return useMutation({
    mutationFn: ({
      day,
      words,
      attemptNumber,
      translation,
    }: {
      day: string;
      words: string[];
      attemptNumber: number;
      translation?: string;
    }) => api.post<ReviewSampleAnswerResponse>('/api/review/sample/answer', { day, words, attemptNumber, translation }),
  });
}
