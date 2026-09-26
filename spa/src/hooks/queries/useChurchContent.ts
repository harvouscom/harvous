import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

export type ContentStatus = 'in_review' | 'scheduled' | 'published' | 'declined' | 'withdrawn' | 'failed';

type ChannelRef = { id: string; title: string; color: string | null };
type AuthorRef = { displayName: string; isYou: boolean };

export type ChurchContentSubmission = {
  id: string;
  status: ContentStatus;
  noteId: string;
  title: string;
  channel: ChannelRef;
  author: AuthorRef;
  publishAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export type ChurchPublishedItem = {
  noteId: string;
  title: string;
  channel: ChannelRef;
  author: AuthorRef;
  publishedAt: string | null;
};

export type ChurchContentResponse = {
  canReview: boolean;
  approvalOn: boolean;
  submissions: ChurchContentSubmission[];
  published: ChurchPublishedItem[];
};

export type NoteSubmission = {
  id: string;
  status: 'in_review' | 'scheduled';
  channelSpaceId: string;
  publishAt: string | null;
};

export type NoteSubmissionsResponse = {
  submissions: NoteSubmission[];
  /** Churches where this author's channel posts need approval. */
  approvalRequiredOrgIds: string[];
};

export type SubmissionPreview = {
  note: { id: string; title: string; content: string; noteType: string };
  editedSinceSubmitted: boolean;
};

export function churchContentQueryKey(userId: string | null | undefined, orgId: string | null | undefined) {
  return ['church-content', userId ?? 'none', orgId ?? 'none'] as const;
}

export function noteSubmissionsQueryKey(userId: string | null | undefined, noteId: string | null | undefined) {
  return ['church-content-note', userId ?? 'none', noteId ?? 'none'] as const;
}

/** Staff: the Content list. Reviewers see everyone's open submissions; others their own. */
export function useChurchContent(orgId: string | null | undefined, options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const id = orgId?.trim() || null;
  return useQuery({
    queryKey: churchContentQueryKey(userId, id),
    enabled: authReady && !!userId && !!id && options?.enabled !== false,
    queryFn: () => api.get<ChurchContentResponse>(`/api/church/content?orgId=${encodeURIComponent(id!)}`),
    staleTime: 30_000,
    retry: false,
  });
}

/** The author's open submissions for one note — the destination menu's scheduled/in-review rows. */
export function useNoteChurchSubmissions(noteId: string | null | undefined, options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const id = noteId?.trim() || null;
  return useQuery({
    queryKey: noteSubmissionsQueryKey(userId, id),
    enabled: authReady && !!userId && !!id && options?.enabled !== false,
    queryFn: () => api.get<NoteSubmissionsResponse>(`/api/church/content/for-note/${encodeURIComponent(id!)}`),
    staleTime: 30_000,
    retry: false,
  });
}

/** The note behind a submission, for a reviewer to read before deciding. */
export function useSubmissionPreview(submissionId: string | null | undefined) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const id = submissionId?.trim() || null;
  return useQuery({
    queryKey: ['church-content-preview', userId ?? 'none', id ?? 'none'],
    enabled: authReady && !!userId && !!id,
    queryFn: () => api.get<SubmissionPreview>(`/api/church/content/submissions/${encodeURIComponent(id!)}`),
    staleTime: 0,
    retry: false,
  });
}

export type ContentAction =
  | { type: 'submit'; noteId: string; channelSpaceId: string; publishAt?: string | null }
  | { type: 'approve'; submissionId: string; publishAt?: string | null }
  | { type: 'decline'; submissionId: string; note?: string | null }
  | { type: 'publish-now'; submissionId: string }
  | { type: 'reschedule'; submissionId: string; publishAt: string }
  | { type: 'withdraw'; submissionId: string };

export type ContentActionResponse = { success: boolean; status: ContentStatus; submissionId?: string };

/** Every content write. Refreshes the list, the note's rows, and — once something went live — the feed and the note. */
export function useChurchContentActions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: ContentAction) => {
      const { type, ...rest } = action;
      return api.post<ContentActionResponse>(`/api/church/content/${type}`, rest);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['church-content'] });
      void queryClient.invalidateQueries({ queryKey: ['church-content-note'] });
      if (data?.status === 'published') {
        void queryClient.invalidateQueries({ queryKey: ['church-feed'] });
        void queryClient.invalidateQueries({ queryKey: ['navigation'] });
        void queryClient.invalidateQueries({ queryKey: ['note'] });
        void queryClient.invalidateQueries({ queryKey: ['space'] });
      }
    },
  });
}

/** "Sun, Sep 27, 8:00 AM" — the viewer's clock. */
export function formatPublishAt(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** A `datetime-local` value for a Date, in the viewer's clock. */
export function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The next occurrence of a day at 8:00 local — the default a schedule picker opens on. */
export function defaultPublishAt(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setDate(next.getDate() + ((7 - next.getDay()) % 7 || 7)); // next Sunday
  next.setHours(8, 0, 0, 0);
  return next;
}
