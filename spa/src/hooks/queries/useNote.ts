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
  simpleNoteId?: number | null;
  createdAt?: string;
  updatedAt?: string;
  resourceTitle?: string | null;
  resourceDescription?: string | null;
  resourceImage?: string | null;
  userId?: string;
  version?: string;
}

export interface NoteDetail {
  id: string;
  title: string | null;
  content: string | null;
  noteType: string;
  /** 'system' = onboarding seed notes; treat as read-only in the UI. */
  addedBy?: string;
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

const NOTE_DETAIL_CACHE_PREFIX = 'harvous-note-detail-';
const NOTE_DETAIL_CACHE_INDEX = 'harvous-note-detail-index';
const MAX_CACHED_NOTE_DETAILS = 10;

function getCachedNoteDetail(noteId: string): NoteDetail | undefined {
  try {
    const raw = sessionStorage.getItem(`${NOTE_DETAIL_CACHE_PREFIX}${noteId}`);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function clearCachedNoteDetail(noteId: string): void {
  try {
    sessionStorage.removeItem(`${NOTE_DETAIL_CACHE_PREFIX}${noteId}`);
    const raw = sessionStorage.getItem(NOTE_DETAIL_CACHE_INDEX);
    if (raw) {
      const index: string[] = JSON.parse(raw).filter((id: string) => id !== noteId);
      sessionStorage.setItem(NOTE_DETAIL_CACHE_INDEX, JSON.stringify(index));
    }
  } catch {
    /* quota or private browsing */
  }
}

/**
 * Scans localStorage for all note-thread cache entries pointing to `threadId`
 * and removes them. Call on threadDeleted so notes don't back-link to a 404 thread.
 */
export function clearNoteParentThreadCacheByThreadId(threadId: string): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('harvous-note-thread-')) continue;
      // Skip the -data- variant here; we'll remove it by derived key below
      if (key.startsWith('harvous-note-thread-data-')) continue;
      const storedThreadId = localStorage.getItem(key);
      if (storedThreadId === threadId) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      const noteId = key.slice('harvous-note-thread-'.length);
      localStorage.removeItem(key);
      localStorage.removeItem(`harvous-note-thread-data-${noteId}`);
    }
  } catch {
    /* ignore */
  }
}

function setCachedNoteDetail(noteId: string, detail: NoteDetail) {
  try {
    sessionStorage.setItem(`${NOTE_DETAIL_CACHE_PREFIX}${noteId}`, JSON.stringify(detail));
    let index: string[] = [];
    try {
      const raw = sessionStorage.getItem(NOTE_DETAIL_CACHE_INDEX);
      index = raw ? JSON.parse(raw) : [];
    } catch {
      index = [];
    }
    index = [noteId, ...index.filter((id) => id !== noteId)];
    while (index.length > MAX_CACHED_NOTE_DETAILS) {
      const evicted = index.pop()!;
      sessionStorage.removeItem(`${NOTE_DETAIL_CACHE_PREFIX}${evicted}`);
    }
    sessionStorage.setItem(NOTE_DETAIL_CACHE_INDEX, JSON.stringify(index));
  } catch {
    /* quota or private browsing */
  }
}

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
    simpleNoteId: listNote.simpleNoteId ?? undefined,
    createdAt: listNote.createdAt ?? new Date().toISOString(),
    updatedAt: listNote.updatedAt ?? listNote.createdAt ?? new Date().toISOString(),
    threads: [thread],
    tags: [],
    resourceTitle: listNote.resourceTitle ?? null,
    resourceDescription: listNote.resourceDescription ?? null,
    resourceImage: listNote.resourceImage ?? null,
    version: listNote.version ?? undefined,
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
  setCachedNoteDetail(listNote.id, detail);
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
      setCachedNoteDetail(noteId, note);
      return note;
    },
    staleTime: NOTE_STALE_TIME,
  };
}

export function useNote(noteId: string) {
  const options = getNoteQueryOptions(noteId);
  const cachedDetail = noteId ? getCachedNoteDetail(noteId) : undefined;
  return useQuery({
    ...options,
    enabled: !!noteId,
    initialData: cachedDetail,
    initialDataUpdatedAt: cachedDetail ? Date.now() - 5_000 : undefined,
  });
}
