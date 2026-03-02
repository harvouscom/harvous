import { useQuery, QueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

/** Thread context when seeding note cache from a list (thread/space page). */
export interface NoteSeedThreadContext {
  id: string;
  title: string;
  color: string | null;
  backgroundGradient: string;
}

/** List note shape from GET /api/threads/:id/notes (or similar). */
export interface ListNoteForSeed {
  id: string;
  title?: string | null;
  content?: string | null;
  contentEncrypted?: boolean;
  noteType?: string;
  threadId?: string;
  spaceId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  resourceTitle?: string | null;
  resourceDescription?: string | null;
  resourceImage?: string | null;
  userId?: string;
}

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

const NOTE_STALE_TIME = 10_000;

/**
 * Converts a list note (from thread/space notes API) into NoteDetail shape
 * so it can be used as cached data for the note detail query.
 */
export function listNoteToNoteDetail(
  listNote: ListNoteForSeed,
  threadContext: NoteSeedThreadContext
): NoteDetail {
  const threadId = listNote.threadId ?? threadContext.id;
  const thread = {
    id: threadId,
    title: threadContext.title,
    color: threadContext.color,
    backgroundGradient: threadContext.backgroundGradient,
  };
  return {
    id: listNote.id,
    title: listNote.title ?? null,
    content: listNote.content ?? null,
    noteType: listNote.noteType ?? 'default',
    contentEncrypted: listNote.contentEncrypted ?? false,
    isPublic: false,
    userId: listNote.userId ?? undefined,
    createdAt: listNote.createdAt ?? new Date().toISOString(),
    updatedAt: listNote.updatedAt ?? listNote.createdAt ?? new Date().toISOString(),
    threads: [thread],
    tags: [],
    resourceTitle: listNote.resourceTitle ?? null,
    resourceDescription: listNote.resourceDescription ?? null,
    resourceImage: listNote.resourceImage ?? null,
  };
}

/**
 * Seeds the note detail cache from a list response so that opening the note
 * shows content immediately. Call when thread/space/dashboard notes are loaded.
 */
export function seedNoteFromList(
  queryClient: QueryClient,
  listNote: ListNoteForSeed,
  threadContext: NoteSeedThreadContext
): void {
  if (!listNote?.id) return;
  const detail = listNoteToNoteDetail(listNote, threadContext);
  queryClient.setQueryData(['note', listNote.id], detail);
}

export function getNoteQueryOptions(noteId: string) {
  return {
    queryKey: ['note', noteId] as const,
    queryFn: async (): Promise<NoteDetail> => {
      const res = await api.get<NoteDetailResponse>(`/api/notes/${noteId}/details`);
      const note = {
        ...res.note,
        threads: res.threads ?? [],
        tags: res.tags ?? [],
      } as NoteDetail;
      const parentThread = note.threads?.[0];
      if (parentThread?.id) {
        try { localStorage.setItem(`harvous-note-thread-${noteId}`, parentThread.id); } catch { /* ignore */ }
        const threadWithCount = parentThread as { count?: number; spaceId?: string | null };
        setCachedNoteParentThread(noteId, {
          id: parentThread.id,
          title: parentThread.title,
          noteCount: threadWithCount.count ?? 0,
          backgroundGradient: parentThread.backgroundGradient ?? 'var(--color-gradient-gray)',
          spaceId: threadWithCount.spaceId ?? null,
        });
      }
      return note;
    },
    staleTime: NOTE_STALE_TIME,
  };
}

export function useNote(noteId: string) {
  const options = getNoteQueryOptions(noteId);
  return useQuery({
    ...options,
    enabled: !!noteId,
  });
}
