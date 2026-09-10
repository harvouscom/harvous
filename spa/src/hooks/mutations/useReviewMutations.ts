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
  type SampleExerciseKind,
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
      void queryClient.invalidateQueries({ queryKey: reviewQueryKey });
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reviewQueryKey });
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
