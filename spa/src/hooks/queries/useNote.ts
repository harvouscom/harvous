import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface NoteDetail {
  id: string;
  title: string | null;
  content: string | null;
  noteType: string;
  contentEncrypted: boolean;
  version?: string;
  resourceTitle?: string | null;
  resourceDescription?: string | null;
  resourceImage?: string | null;
  resourceUrl?: string | null;
  simpleNoteId?: number | null;
  isPublic: boolean;
  shareToken?: string | null;
  userId?: string;
  createdAt: string;
  updatedAt: string;
  threads: { id: string; title: string; color: string | null; backgroundGradient?: string }[];
  tags: { id: string; name: string }[];
  spaces?: { id: string; title: string }[];
}

interface NoteDetailResponse {
  success: boolean;
  note: Omit<NoteDetail, 'threads' | 'tags' | 'spaces'>;
  threads: NoteDetail['threads'];
  tags?: NoteDetail['tags'];
}

export function getCachedNoteParentThreadId(noteId: string): string | null {
  try { return localStorage.getItem(`harvous-note-thread-${noteId}`); } catch { return null; }
}

export interface CachedThread {
  id: string;
  title: string;
  noteCount: number;
  backgroundGradient: string;
  spaceId?: string | null;
}

export function getCachedNoteParentThread(noteId: string): CachedThread | null {
  try {
    const raw = localStorage.getItem(`harvous-note-thread-data-${noteId}`);
    return raw ? JSON.parse(raw) as CachedThread : null;
  } catch { return null; }
}

function setCachedNoteParentThread(noteId: string, thread: CachedThread) {
  try { localStorage.setItem(`harvous-note-thread-data-${noteId}`, JSON.stringify(thread)); } catch { /* ignore */ }
}

export function useNote(noteId: string) {
  return useQuery({
    queryKey: ['note', noteId],
    queryFn: async () => {
      const res = await api.get<NoteDetailResponse>(`/api/notes/${noteId}/details`);
      const note = {
        ...res.note,
        threads: res.threads ?? [],
        tags: res.tags ?? [],
      } as NoteDetail;
      // Cache the parent thread so AppLayout can highlight it immediately on next visit
      const parentThread = note.threads?.[0];
      if (parentThread?.id) {
        try { localStorage.setItem(`harvous-note-thread-${noteId}`, parentThread.id); } catch { /* ignore */ }
        const threadWithCount = parentThread as { count?: number; spaceId?: string | null };
        setCachedNoteParentThread(noteId, {
          id: parentThread.id,
          title: parentThread.title,
          noteCount: threadWithCount.count ?? 0,
          backgroundGradient: parentThread.backgroundGradient ?? '',
          spaceId: threadWithCount.spaceId ?? null,
        });
      }
      return note;
    },
    enabled: !!noteId,
    staleTime: 10_000,
  });
}
