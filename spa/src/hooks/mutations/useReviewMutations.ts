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
  type SampleExerciseKind,
} from '../queries/useReview';
import {
  REVIEW_DEFERRED_TOAST,
  REVIEW_DEFER_FAILED_TOAST,
  REVIEW_PAUSED_TOAST,
  REVIEW_PAUSE_FAILED_TOAST,
  REVIEW_REMOVED_TOAST,
  REVIEW_REMOVE_FAILED_TOAST,
  REVIEW_RESUMED_TOAST,
  REVIEW_FEEDBACK_FAILED_TOAST,
  REVIEW_OUTCOME_FAILED_TOAST,
  REVIEW_STEP_BACK_FAILED_TOAST,
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
  /** The item has never once been recalled; the offer is worded for that. */
  stalled?: boolean;
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
    /*
     * Put the queue back, and say so.
     *
     * The rollback was here from the start and the telling was not, which made this the quietest
     * failure in the feature: the question stays on screen either way, so a lost answer looked
     * exactly like a tap that had not registered. The card holds its question (see the dock) so
     * the reader can simply answer again.
     */
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(reviewSessionQueryKey, context.previous);
      toastError(error, REVIEW_OUTCOME_FAILED_TOAST, { scope: 'review-outcome' });
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

export interface ReviewFeedbackResponse {
  offerSettings: boolean;
  family: { id: string; label: string } | null;
}

/**
 * What the reader thought of the question.
 *
 * **Invalidates nothing.** A sitting is a fixed set of questions on purpose — `useReviewSession`
 * is `staleTime: Infinity` so the queue cannot reshuffle under someone mid-answer — and quieting
 * a family is a server-derived fact that takes effect the next time a sitting is composed. Doing
 * it sooner would mean the page and the server disagreeing about which question is being asked,
 * which is the drift the rung resolution is careful to avoid.
 *
 * On failure the card restores its buttons and says so quietly. A vote is a log line, not a
 * setting; losing one is not worth interrupting a sitting for.
 */
export function useReviewFeedback() {
  return useMutation({
    mutationFn: ({ itemId, vote }: { itemId: string; vote: 'liked' | 'disliked' }) =>
      api.post<ReviewFeedbackResponse>(
        `/api/review/items/${encodeURIComponent(itemId)}/feedback`,
        { vote },
      ),
    onError: (error) => {
      toastError(error, REVIEW_FEEDBACK_FAILED_TOAST, { scope: 'review-feedback' });
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
    onError: (error) => {
      toastError(error, REVIEW_STEP_BACK_FAILED_TOAST, { scope: 'review-step-back' });
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
      attemptNumber,
      translation,
      exercise,
      ...answer
    }: {
      day: string;
      attemptNumber: number;
      translation?: string;
      exercise?: SampleExerciseKind;
      /** One of these, depending on the exercise. The server marks against what it asked. */
      words?: string[];
      text?: string;
      order?: number[];
      option?: string;
    }) =>
      api.post<ReviewSampleAnswerResponse>('/api/review/sample/answer', {
        day,
        attemptNumber,
        translation,
        exercise,
        ...answer,
      }),
  });
}
