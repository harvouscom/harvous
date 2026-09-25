import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import type { ChurchExerciseContent, ChurchExerciseKind } from '@/utils/church-exercise';

export type ChurchReviewChannel = {
  id: string;
  title: string;
  color: string | null;
  isActive: boolean;
  published: number;
  drafts: number;
};

export type ChurchReviewExercise = {
  id: string;
  channelSpaceId: string;
  kind: ChurchExerciseKind;
  prompt: string | null;
  content: ChurchExerciseContent | null;
  scriptureReference: string | null;
  origin: 'suggested' | 'authored';
  status: 'draft' | 'published' | 'archived';
  version: number;
  /** Null below five people — a count, never who. */
  answeredCount: number | null;
  publishedAt: string | null;
  updatedAt: string;
};

export type ChurchReviewSuggestion = {
  key: string;
  kind: 'verse' | 'chapter';
  reference: string;
  sourceNoteId: string | null;
  sourceNoteTitle: string | null;
  sourceServiceId: string | null;
  sourceServiceTitle: string | null;
  citedIn: number;
};

/** What a congregant is shown, for the editor's preview. Never a key. */
export type ChurchReviewPreview = {
  kind: ChurchExerciseKind;
  prompt?: string | null;
  reference?: string | null;
  reveal: {
    choice?: { options: string[] };
    sequence?: { phrases: string[] };
    match?: { left: string[]; right: string[] };
  };
};

export function churchReviewChannelsKey(userId: string | null | undefined, orgId: string | null | undefined) {
  return ['church-review-channels', userId ?? 'none', orgId ?? 'none'] as const;
}

export function churchReviewExercisesKey(
  userId: string | null | undefined,
  orgId: string | null | undefined,
  channelId: string | null | undefined,
) {
  return ['church-review-exercises', userId ?? 'none', orgId ?? 'none', channelId ?? 'none'] as const;
}

/** Staff only. Pass `enabled` once the viewer is known to be staff. */
export function useChurchReviewChannels(orgId: string | null | undefined, options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const id = orgId?.trim() || null;
  return useQuery({
    queryKey: churchReviewChannelsKey(userId, id),
    enabled: authReady && !!userId && !!id && options?.enabled !== false,
    queryFn: () =>
      api.get<{ channels: ChurchReviewChannel[] }>(`/api/church/review/channels?orgId=${encodeURIComponent(id!)}`),
    staleTime: 30_000,
    retry: false,
  });
}

export function useChurchReviewExercises(
  orgId: string | null | undefined,
  channelId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const org = orgId?.trim() || null;
  const channel = channelId?.trim() || null;
  return useQuery({
    queryKey: churchReviewExercisesKey(userId, org, channel),
    enabled: authReady && !!userId && !!org && !!channel && options?.enabled !== false,
    queryFn: () =>
      api.get<{
        channel: { id: string; title: string };
        exercises: ChurchReviewExercise[];
        suggestions: ChurchReviewSuggestion[];
      }>(
        `/api/church/review/exercises?orgId=${encodeURIComponent(org!)}&channelId=${encodeURIComponent(channel!)}`,
      ),
    staleTime: 15_000,
    retry: false,
  });
}

export type ChurchReviewDraft = {
  /** `passage`: the server decides verse or chapter from the reference. */
  kind: ChurchExerciseKind | 'passage';
  prompt?: string;
  content?: unknown;
  reference?: string;
};

type Action =
  | { type: 'create'; channelId: string; draft: ChurchReviewDraft; publish: boolean; fromSuggestion?: boolean; sourceNoteId?: string | null; sourceServiceId?: string | null }
  | { type: 'update'; exerciseId: string; draft: ChurchReviewDraft }
  | { type: 'publish' | 'archive'; exerciseId: string }
  | { type: 'dismiss'; channelId: string; reference: string };

/** Every staff write, with the channel's list refreshed after. Server-gated on `publish`. */
export function useChurchReviewActions(orgId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const org = orgId?.trim() || null;
  return useMutation({
    mutationFn: (action: Action) => {
      switch (action.type) {
        case 'create':
          return api.post('/api/church/review/exercises/create', {
            orgId: org,
            channelId: action.channelId,
            ...action.draft,
            status: action.publish ? 'published' : 'draft',
            fromSuggestion: action.fromSuggestion === true,
            sourceNoteId: action.sourceNoteId ?? null,
            sourceServiceId: action.sourceServiceId ?? null,
          });
        case 'update':
          return api.post('/api/church/review/exercises/update', { orgId: org, exerciseId: action.exerciseId, ...action.draft });
        case 'publish':
        case 'archive':
          return api.post(`/api/church/review/exercises/${action.type}`, { orgId: org, exerciseId: action.exerciseId });
        case 'dismiss':
          return api.post('/api/church/review/suggestions/dismiss', {
            orgId: org,
            channelId: action.channelId,
            reference: action.reference,
          });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['church-review-exercises', userId ?? 'none', org ?? 'none'] });
      void queryClient.invalidateQueries({ queryKey: churchReviewChannelsKey(userId, org) });
    },
  });
}

/** What a congregant would be shown for a draft. Nothing is saved. */
export function useChurchReviewPreview(orgId: string | null | undefined) {
  const org = orgId?.trim() || null;
  return useMutation({
    mutationFn: (draft: ChurchReviewDraft) =>
      api.post<ChurchReviewPreview>('/api/church/review/preview', { orgId: org, ...draft }),
  });
}
