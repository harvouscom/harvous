import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

export interface SharedNoteItem {
  id: string;
  title: string;
  preview?: string;
  updatedAt?: string | null;
  createdAt?: string;
  /** When the link was made — what Settings › Sharing sorts by. Absent on older responses. */
  sharedAt?: string | null;
  shareToken: string;
  shareUrl: string;
  /**
   * What the link opens. Absent means a note. `thread` is a personal Thread (connected notes),
   * whose `id` is the note the link is anchored to — any member answers for the whole Thread.
   */
  entity?: 'note' | 'thread';
}

/** A personal Thread's public link — see `server/utils/study-thread-share.ts`. */
export interface SharedStudyThreadItem {
  id: string;
  title: string;
  sharedAt?: string | null;
  shareToken: string;
  shareUrl: string;
}

export interface SharedThreadItem {
  id: string;
  title: string;
  color?: string | null;
  shareToken: string;
  shareUrl: string;
}

export interface MySharingResponse {
  threads: SharedThreadItem[];
  notes: SharedNoteItem[];
  /** Absent on servers that predate Thread links. */
  studyThreads?: SharedStudyThreadItem[];
}

export const mySharingQueryKey = ['profile', 'my-sharing'] as const;

export function useMySharing() {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: mySharingQueryKey,
    queryFn: () => api.get<MySharingResponse>('/api/profile/my-sharing'),
    enabled: authReady,
    staleTime: 30_000,
  });
}
