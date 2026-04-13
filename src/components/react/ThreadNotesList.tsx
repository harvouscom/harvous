import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import InfiniteScrollList from './InfiniteScrollList';
import CardNote from './CardNote';
import ActionButton from './ActionButton';
import EraseConfirmDialog from './EraseConfirmDialog';
import { stripHtml } from '@/utils/html-stripper';
import { normalizeDate, sortByLastVisited, sortOnboardingThreadNotes } from '@/utils/sorting';
import { isOnboardingThread } from '@/utils/last-visited-sections';
import { debug } from '@/utils/logger';
import { isPWA, isStaleData } from '@/utils/content-list-helpers';
import { useOptimisticUpdates } from '@/hooks/useOptimisticUpdates';
import { useListKeyboardRoving } from '@/hooks/useListKeyboardRoving';
import { buildAPIUrl, referrerMatchesPattern } from '@/utils/safe-url';
import { idToUrl, extractIdFromPath, detectEntityTypeFromPath } from '@/utils/url-helpers';
import { deleteNoteOffline } from '@/utils/offline-mutations';
import { getPersistedUserId } from '@/utils/user-id';
import { getNotesForThreadLocal } from '@/utils/offline-read-layer';
import { isNetworkError } from '@/utils/network';
import { getTranslationAbbreviationDisplay } from '@/data/translations';
import { CONDENSED_NOTE_ROW_HEIGHT_PX } from '@/utils/condensed-note-row';
import {
  CondensedNoteRowLayout,
  condensedNoteRowIcon,
  getCondensedNoteAccentBarStyle,
  getCondensedNoteMeshGradient,
} from './CondensedNoteRowLayout';
import { getModalOverlayBaseStyle, useDesktopMainModalPortal } from '@/hooks/useDesktopMainModalPortal';

// ── Thread notes sessionStorage cache ──
const THREAD_CACHE_PREFIX = 'harvous-thread-notes-';
const THREAD_CACHE_INDEX = 'harvous-thread-notes-index';
const MAX_CACHED_THREADS = 5;
const MAX_CACHED_NOTES = 30;

function getThreadNotesCache(threadId: string): Note[] | undefined {
  try {
    const raw = sessionStorage.getItem(`${THREAD_CACHE_PREFIX}${threadId}`);
    return raw ? JSON.parse(raw) : undefined;
  } catch { return undefined; }
}

function setThreadNotesCache(threadId: string, notes: Note[]) {
  try {
    sessionStorage.setItem(
      `${THREAD_CACHE_PREFIX}${threadId}`,
      JSON.stringify(notes.slice(0, MAX_CACHED_NOTES))
    );
    let index: string[] = [];
    try {
      const raw = sessionStorage.getItem(THREAD_CACHE_INDEX);
      index = raw ? JSON.parse(raw) : [];
    } catch { index = []; }
    index = [threadId, ...index.filter(id => id !== threadId)];
    while (index.length > MAX_CACHED_THREADS) {
      const evicted = index.pop()!;
      sessionStorage.removeItem(`${THREAD_CACHE_PREFIX}${evicted}`);
    }
    sessionStorage.setItem(THREAD_CACHE_INDEX, JSON.stringify(index));
  } catch { /* quota or private browsing */ }
}

interface Note {
  id: string;
  title: string | null;
  content: string;
  contentEncrypted?: boolean;
  noteType?: 'default' | 'scripture' | 'resource';
  updatedAt?: Date;
  createdAt?: Date;
  lastVisited?: Date;
  // Resource metadata (for resource note type)
  resourceTitle?: string | null;
  resourceDescription?: string | null;
  resourceImage?: string | null;
  // Sync status for offline mode
  syncStatus?: 'synced' | 'pending' | 'conflict' | 'deleted';
  // Thread ID (used for optimistic updates filtering)
  threadId?: string;
  // Thread colors for note card accent (from getNotesForThread or optimistic threadColor)
  threadColors?: Array<{ color: string; frequency: number }>;
  // Bible translation abbreviation for scripture notes (e.g. 'ESV', 'KJV')
  version?: string;
}

interface NoteTypeCounts {
  all: number;
  default: number;
  scripture: number;
  resource: number;
}

interface ThreadNotesListProps {
  initialNotes: Note[];
  threadId: string;
  /** Current thread color (e.g. from currentThread.color). Used for optimistic notes and note card accent so thread color shows for members in shared spaces. */
  threadColor?: string | null;
  noteTypeFilter?: 'all' | 'default' | 'scripture' | 'resource';
  noteTypeCounts?: NoteTypeCounts;
  /** Optional callback to prefetch note details (e.g. on hover) so the note page loads instantly. */
  onPrefetchNote?: (noteId: string) => void;
  /** Optional callback when notes are loaded from the API; used to seed the note detail cache so opening a note shows content immediately. */
  onNotesLoaded?: (notes: Note[]) => void;
  'client:load'?: boolean;
  'client:visible'?: boolean;
  'client:idle'?: boolean;
  'client:only'?: string | boolean;
  [key: string]: any; // Allow Astro directives and other dynamic props
}

// Helper function to filter notes by type
// Matches OrganizedContentList.tsx line 307: item.noteType === 'default' || !item.noteType
function filterNotesByType(notes: Note[], filter?: 'all' | 'default' | 'scripture' | 'resource'): Note[] {
  if (!filter || filter === 'all') {
    return notes;
  }
  if (filter === 'default') {
    return notes.filter(note => note.noteType === 'default' || !note.noteType);
  }
  if (filter === 'scripture') {
    return notes.filter(note => note.noteType === 'scripture');
  }
  if (filter === 'resource') {
    return notes.filter(note => note.noteType === 'resource');
  }
  return notes;
}

/** Expected total notes for the active type tab — used for infinite scroll and loadMore refs. */
function totalCountForNoteFilter(
  noteTypeFilter: 'all' | 'default' | 'scripture' | 'resource' | undefined,
  noteTypeCounts: NoteTypeCounts | undefined,
  initialNotesLength: number,
  filteredLen: number,
  ntf: string,
): number {
  if (ntf === 'all' && initialNotesLength > 0) {
    return initialNotesLength;
  }
  if (!noteTypeCounts) {
    return filteredLen;
  }
  switch (noteTypeFilter) {
    case 'all':
      return noteTypeCounts.all;
    case 'default':
      return noteTypeCounts.default;
    case 'scripture':
      return noteTypeCounts.scripture;
    case 'resource':
      return noteTypeCounts.resource;
    default:
      return noteTypeCounts.all;
  }
}

/** Union by id; state wins so load-more rows survive while allFetchedNotesRef is only first pages. */
function mergeNotesByIdPreferState(refNotes: Note[], stateNotes: Note[]): Note[] {
  if (!refNotes.length) return stateNotes;
  if (!stateNotes.length) return [...refNotes];
  const m = new Map<string, Note>();
  for (const n of refNotes) m.set(n.id, n);
  for (const n of stateNotes) m.set(n.id, n);
  return Array.from(m.values());
}

type OptimisticMergeFn = (
  confirmedIds: Set<string>,
  maxAgeMs: number,
  belongsToThread: (note: Note) => boolean,
) => Note[];

/**
 * Single pipeline for tab filtering — used during render (useMemo) so the first paint matches
 * the selected tab, and in useLayoutEffect to keep `notes` state aligned.
 */
function computeThreadNotesViewList(options: {
  initialNotes: Note[];
  prevInitialNotesRef: MutableRefObject<Note[]>;
  allFetchedNotes: Note[];
  notesState: Note[];
  deletedNoteIds: Set<string>;
  noteTypeFilter: 'all' | 'default' | 'scripture' | 'resource' | undefined;
  ntf: string;
  threadId: string;
  getOptimisticItemsToMerge: OptimisticMergeFn;
}): Note[] {
  const initialNotesChanged = options.prevInitialNotesRef.current !== options.initialNotes;
  const hasFreshServerData = initialNotesChanged && options.initialNotes.length > 0;
  let sourceNotes = hasFreshServerData
    ? options.initialNotes
    : mergeNotesByIdPreferState(options.allFetchedNotes, options.notesState);

  const confirmedIds = new Set(sourceNotes.map((n) => n.id));
  const optimisticNotesToMerge = options.getOptimisticItemsToMerge(
    confirmedIds,
    5000,
    (note) => {
      const noteThreadId = (note as any).threadId;
      return (
        noteThreadId === options.threadId ||
        (options.threadId === 'thread_unorganized' &&
          (!noteThreadId || noteThreadId === 'thread_unorganized'))
      );
    },
  );

  if (optimisticNotesToMerge.length > 0) {
    sourceNotes = [...optimisticNotesToMerge, ...sourceNotes];
  }

  const filtered = sourceNotes.filter((note) => !options.deletedNoteIds.has(note.id));

  const normalized = filtered.map((note) => ({
    ...note,
    lastVisited: note.lastVisited ? normalizeDate(note.lastVisited) || note.lastVisited : note.lastVisited,
    updatedAt: note.updatedAt ? normalizeDate(note.updatedAt) || note.updatedAt : note.updatedAt,
    createdAt: note.createdAt ? normalizeDate(note.createdAt) || note.createdAt : note.createdAt,
  }));

  const typeFiltered =
    options.ntf === 'all' ? normalized : filterNotesByType(normalized, options.noteTypeFilter);

  const uniqueNotes = Array.from(new Map(typeFiltered.map((note) => [note.id, note])).values());

  return sortNotesByTime(uniqueNotes, options.threadId);
}

// Onboarding: pack order by simpleNoteId (seed uses one timestamp for all notes). Others: sortByLastVisited.
function sortNotesByTime(notes: Note[], threadId: string): Note[] {
  if (isOnboardingThread(threadId)) {
    return sortOnboardingThreadNotes(notes);
  }
  return sortByLastVisited(notes);
}

export default function ThreadNotesList({
  initialNotes,
  threadId,
  threadColor,
  noteTypeFilter = 'all',
  noteTypeCounts,
  onPrefetchNote,
  onNotesLoaded,
}: ThreadNotesListProps) {
  const { portalTarget, overlayUsesMainColumn } = useDesktopMainModalPortal();

  // Widen noteTypeFilter to string so TS doesn't narrow the default literal type
  // and flag comparisons with other union members (e.g. 'notes', 'resources') as always-false.
  const ntf = noteTypeFilter as string;
  debug('[ThreadNotesList] Component mounted/rendered', { threadId, noteTypeFilter: ntf, initialNotesCount: initialNotes.length });
  
  // Manage notes list state for real-time updates
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [deletedNoteIds, setDeletedNoteIds] = useState<Set<string>>(new Set());
  // Tracks which filter the current `notes` state was computed for.
  // Only advances to match noteTypeFilter after setNotes() runs — both updates
  // happen in the same React batch so the empty state never flashes between them.
  const [committedFilter, setCommittedFilter] = useState<string>(noteTypeFilter);
  const deletedNoteIdsRef = useRef<Set<string>>(new Set());
  // Holds the full unfiltered set of notes from the last API fetch.
  // Used as the source when the noteTypeFilter changes, so tab switching
  // never loses notes (notesRef.current reflects the *filtered* view).
  const allFetchedNotesRef = useRef<Note[]>(initialNotes);
  
  // State for delete confirmation dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  // True until first load completes (or timeout); used to show progress bar instead of full loading block
  const [isInitialLoadPending, setIsInitialLoadPending] = useState(() => initialNotes.length === 0);

  // Sync reset: when threadId changes while the component stays mounted (same-route navigation),
  // immediately swap to the new thread's cached notes (or clear stale notes). This runs during
  // render (before paint) so the old thread's notes never flash on screen.
  const prevCacheThreadRef = useRef(threadId);
  if (prevCacheThreadRef.current !== threadId) {
    prevCacheThreadRef.current = threadId;
    const cached = getThreadNotesCache(threadId);
    if (cached && cached.length > 0) {
      setNotes(cached);
      allFetchedNotesRef.current = cached;
      setIsInitialLoadPending(false);
    } else {
      setNotes([]);
      allFetchedNotesRef.current = [];
      setIsInitialLoadPending(true);
    }
    setDeletedNoteIds(new Set());
    deletedNoteIdsRef.current = new Set();
  }

  // Keep ref in sync with state
  useEffect(() => {
    deletedNoteIdsRef.current = deletedNoteIds;
  }, [deletedNoteIds]);

  // Track total count for filter and accumulated filtered items count
  const totalCountForFilterRef = useRef<number>(0);
  const accumulatedFilteredCountRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  useListKeyboardRoving(containerRef);
  // Track the actual database offset (total notes fetched from API, not filtered)
  // This is critical because the API doesn't filter by type, so we need to track
  // how many notes we've actually fetched from the database
  const databaseOffsetRef = useRef<number>(0);

  // Track previous values to detect what changed
  const prevInitialNotesRef = useRef<Note[]>(initialNotes);
  const isMountedRef = useRef<boolean>(true);
  // Always reflects the current threadId; checked after async gaps to discard stale responses.
  const activeThreadIdRef = useRef(threadId);
  activeThreadIdRef.current = threadId;
  const hasRefreshedOnMountRef = useRef<boolean>(false);
  // Track refreshing state
  const isRefreshingRef = useRef<boolean>(false);
  const lastBackgroundTimeRef = useRef<number>(0);
  const lastVisibilityRefreshRef = useRef<number>(0);
  // Track optimistically added notes that haven't been confirmed by API yet
  const {
    getOptimisticItemsToMerge,
    addOptimistic,
    removeOptimistic,
    hasOptimistic,
  } = useOptimisticUpdates<Note>();
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  
  // Handle both initialNotes changes and noteTypeFilter changes before paint so the list
  // matches the selected tab immediately (useEffect caused a visible lag after tab changes).
  useLayoutEffect(() => {
    const initialNotesChanged = prevInitialNotesRef.current !== initialNotes;

    const sortedNotes = computeThreadNotesViewList({
      initialNotes,
      prevInitialNotesRef,
      allFetchedNotes: allFetchedNotesRef.current,
      notesState: notes,
      deletedNoteIds,
      noteTypeFilter,
      ntf,
      threadId,
      getOptimisticItemsToMerge,
    });

    setNotes(sortedNotes);
    setCommittedFilter(noteTypeFilter);
    accumulatedFilteredCountRef.current = sortedNotes.length;
    totalCountForFilterRef.current = totalCountForNoteFilter(
      noteTypeFilter,
      noteTypeCounts,
      initialNotes.length,
      sortedNotes.length,
      ntf,
    );

    if (initialNotesChanged) {
      databaseOffsetRef.current = initialNotes.length;
    }

    prevInitialNotesRef.current = initialNotes;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- omit `notes`: would re-run every loadMore and loop setNotes; closure notes is correct when filter/initial/deleted change
  }, [initialNotes, deletedNoteIds, noteTypeFilter, threadId, noteTypeCounts, ntf, getOptimisticItemsToMerge]);

  // Use ref to track current notes without causing effect re-runs
  const notesRef = useRef<Note[]>(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  // Track previous pathname to detect navigation TO thread
  const previousPathnameRef = useRef<string>(typeof window !== 'undefined' ? window.location.pathname : '');

  // PHASE 2: Unified refresh function with verification-based approach
  const refreshNotesList = useCallback(async (expectedNoteId?: string): Promise<boolean> => {
    if (!isMountedRef.current) return false;

    // If offline OR thread is a local/offline thread (hasn't synced yet), load from IndexedDB
    const isLocalThread = threadId.startsWith('local_');
    if (!navigator.onLine || isLocalThread) {
      const userId = getPersistedUserId();
      if (!userId) {
        debug('[ThreadNotesList] Offline/local thread but no userId, skipping refresh');
        return false;
      }

      try {
        debug('[ThreadNotesList] Loading notes from IndexedDB', { threadId, reason: !navigator.onLine ? 'offline' : 'local_thread' });
        const localResult = await getNotesForThreadLocal(userId, threadId, 100, 0);
        if (activeThreadIdRef.current !== threadId) return false;
        const localNotes = localResult.notes || [];

        // Normalize dates and preserve syncStatus
        const normalized = localNotes.map((note: any) => ({
          ...note,
          lastVisited: note.lastVisited ? (normalizeDate(note.lastVisited) || note.lastVisited) : note.lastVisited,
          createdAt: note.createdAt ? (normalizeDate(note.createdAt) || note.createdAt) : note.createdAt,
          updatedAt: note.updatedAt ? (normalizeDate(note.updatedAt) || note.updatedAt) : note.updatedAt,
          syncStatus: note.syncStatus || 'synced' // Preserve syncStatus from IndexedDB
        }));

        // Filter out deleted notes
        const filtered = normalized.filter((note: Note) => !deletedNoteIdsRef.current.has(note.id));

        // Store full unfiltered result for tab switching
        allFetchedNotesRef.current = filtered;

        // Apply note type filter
        const typeFiltered = ntf ==='all'
          ? filtered
          : filterNotesByType(filtered, noteTypeFilter);

        // Deduplicate and sort
        const uniqueNotes = Array.from(
          new Map(typeFiltered.map((note: Note) => [note.id, note])).values()
        );
        const sortedNotes = sortNotesByTime(uniqueNotes, threadId);

        setNotes(sortedNotes);
        accumulatedFilteredCountRef.current = sortedNotes.length;
        databaseOffsetRef.current = localNotes.length;

        debug('[ThreadNotesList] Loaded notes from IndexedDB', { count: sortedNotes.length });
        return true;
      } catch (error) {
        console.error('[ThreadNotesList] Error loading notes from IndexedDB:', error);
        return false;
      }
    }

    // Verification-based refresh: poll until note appears or timeout
    const verifyAndRefresh = async (maxAttempts = 3): Promise<boolean> => {
      // Skip API verification for local threads - they don't exist on server yet
      const isLocalThread = threadId.startsWith('local_');
      if (isLocalThread) {
        debug('[ThreadNotesList] Skipping API verification for local thread', { threadId });
        return true; // Return true since we already loaded from IndexedDB above
      }

      const delays = [100, 200, 400]; // Exponential backoff in ms
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const url = buildAPIUrl(`/api/threads/${threadId}/notes`, {
            offset: '0',
            limit: '100'
          });

          if (!url) {
            throw new Error('Failed to build verification URL');
          }

          const response = await fetch(url, {
            credentials: 'include',
            cache: 'no-store'
          });

          if (!response.ok) {
            console.error('[ThreadNotesList] Failed to refresh notes:', response.status);
            if (attempt < maxAttempts - 1) {
              await new Promise(resolve => setTimeout(resolve, delays[attempt]));
            }
            continue;
          }

          const data = await response.json();
          const freshNotesRaw = data.notes || [];

          if (!isMountedRef.current || activeThreadIdRef.current !== threadId) return false;

          // Seed note detail cache so opening a note shows content immediately
          onNotesLoaded?.(freshNotesRaw);

          // Normalize dates in fresh notes
          const freshNotes = freshNotesRaw.map((note: any) => ({
            ...note,
            lastVisited: note.lastVisited ? (normalizeDate(note.lastVisited) || note.lastVisited) : note.lastVisited,
            createdAt: note.createdAt ? (normalizeDate(note.createdAt) || note.createdAt) : note.createdAt,
            updatedAt: note.updatedAt ? (normalizeDate(note.updatedAt) || note.updatedAt) : note.updatedAt
          }));

          // If we're looking for a specific note, check if it exists
          if (expectedNoteId) {
            const noteExists = freshNotes.some((n: Note) => n.id === expectedNoteId);
            if (!noteExists && attempt < maxAttempts - 1) {
              // Note not found yet, wait and retry
              await new Promise(resolve => setTimeout(resolve, delays[attempt]));
              continue;
            }
          }

          // Filter out deleted notes
          const filtered = freshNotes.filter((note: Note) => !deletedNoteIdsRef.current.has(note.id));
          
          // Merge with optimistic notes that haven't been confirmed yet
          const confirmedNoteIds = new Set<string>(filtered.map((note: Note) => note.id));
          const optimisticNotesToKeep = getOptimisticItemsToMerge(
            confirmedNoteIds,
            5000, // 5 seconds
            (note) => {
              // Check if note matches current filter
              const matchesFilter = ntf ==='all' ||
                                   (ntf ==='scripture' && note.noteType === 'scripture') ||
                                   (ntf ==='resource' && note.noteType === 'resource') ||
                                   ((ntf ==='default' || ntf ==='notes') && (note.noteType === 'default' || !note.noteType));
              return matchesFilter && !deletedNoteIdsRef.current.has(note.id);
            }
          );

          // Store full unfiltered result for tab switching
          allFetchedNotesRef.current = filtered;
          setThreadNotesCache(threadId, filtered);

          // Combine API notes with optimistic notes
          const combinedNotes = [...filtered, ...optimisticNotesToKeep];

          // Apply note type filter
          const typeFiltered = ntf ==='all'
            ? combinedNotes
            : filterNotesByType(combinedNotes, noteTypeFilter);

          // Deduplicate by note ID
          const uniqueNotes = Array.from(
            new Map(typeFiltered.map((note: Note) => [note.id, note])).values()
          );

          // sortByLastVisited (same as space notes); keeps list order stable for row animations
          const sortedNotes = sortNotesByTime(uniqueNotes, threadId);

          setNotes(sortedNotes);
          accumulatedFilteredCountRef.current = sortedNotes.length;
          databaseOffsetRef.current = freshNotes.length;

          // If we're looking for a specific note and it exists (in API or optimistic), remove from optimistic tracking
          if (expectedNoteId) {
            const noteExists = sortedNotes.some(note => note.id === expectedNoteId);
            if (noteExists && confirmedNoteIds.has(expectedNoteId)) {
              removeOptimistic(expectedNoteId);
            }
          }
          
          return true; // Success
        } catch (error) {
          console.error('[ThreadNotesList] Error refreshing notes:', error);
          if (attempt < maxAttempts - 1) {
            await new Promise(resolve => setTimeout(resolve, delays[attempt]));
          }
        }
      }
      
      return false; // Failed after all attempts
    };

    // If no expected note ID, just refresh once
    if (!expectedNoteId) {
      return await verifyAndRefresh(1);
    } else {
      // Verify note exists with retries
      const success = await verifyAndRefresh(3);
      // PHASE 4: Return success status so caller can clean up sessionStorage
      return success;
    }
  }, [threadId, noteTypeFilter, getOptimisticItemsToMerge, removeOptimistic, onNotesLoaded]);

  // Unified event handler for all note-related events
  useEffect(() => {
    const handleNoteDeleted = (event: CustomEvent) => {
      const { noteId, threadId: deletedThreadId } = event.detail;
      // Only remove if the note belongs to this thread or if threadId matches
      if (noteId && (deletedThreadId === threadId || !deletedThreadId)) {
        // Remove from optimistic tracking if it exists
        removeOptimistic(noteId);
        
        setDeletedNoteIds(prev => {
          const newSet = new Set([...prev, noteId]);
          deletedNoteIdsRef.current = newSet;
          return newSet;
        });
        // Remove from notes list immediately
        setNotes(prev => prev.filter(note => note.id !== noteId));
      }
    };

    const handleNoteAddedToThread = async (event: CustomEvent) => {
      const { noteId, threadId: eventThreadId } = event.detail;
      
      // Only process if this is the current thread
      if (eventThreadId === threadId && noteId) {
        // Check if note is already in the list using ref
        const noteExists = notesRef.current.some(note => note.id === noteId);
        if (noteExists) {
          return; // Already in list, skip
        }

        try {
          // Fetch note details
          const response = await fetch(`/api/notes/${noteId}/details`, {
            credentials: 'include'
          });

          if (response.ok) {
            const data = await response.json();
            const noteData = data.note; // Extract note from response
            const newNote: Note = {
              id: noteData.id,
              title: noteData.title,
              content: noteData.content,
              noteType: noteData.noteType,
              updatedAt: noteData.updatedAt ? new Date(noteData.updatedAt) : undefined,
              createdAt: noteData.createdAt ? new Date(noteData.createdAt) : undefined,
              lastVisited: noteData.lastVisited ? new Date(noteData.lastVisited) : undefined,
              resourceTitle: noteData.resourceTitle || null,
              resourceDescription: noteData.resourceDescription || null,
              resourceImage: noteData.resourceImage || null,
            };

            // Add note to the beginning of the list (most recent first)
            // Only add if it matches the current filter
            setNotes(prev => {
              // Check if note already exists (double-check with current state)
              if (prev.some(n => n.id === noteId)) {
                return prev;
              }
              
              // Check if note matches the current filter
              const matchesFilter = ntf ==='all'
                || ((ntf ==='default' || ntf ==='notes') && (newNote.noteType === 'default' || !newNote.noteType))
                || (ntf ==='scripture' && newNote.noteType === 'scripture')
                || (ntf ==='resource' && newNote.noteType === 'resource');
              
              if (!matchesFilter) {
                return prev; // Don't add if it doesn't match filter
              }
              
              // Add new note and deduplicate
              const newNotes = [newNote, ...prev];
              const uniqueNotes = Array.from(
                new Map(newNotes.map(note => [note.id, note])).values()
              );
              
              return sortNotesByTime(uniqueNotes, threadId);
            });
          }
        } catch (error) {
          console.error('Error fetching note details:', error);
        }
      }
    };

    const handleNoteRemovedFromThread = (event: CustomEvent) => {
      const { noteId, threadId: eventThreadId } = event.detail;
      
      // Only process if this is the current thread
      if (eventThreadId === threadId && noteId) {
        // Remove note from list immediately
        setNotes(prev => prev.filter(note => note.id !== noteId));
      }
    };

    const handleNoteCreated = async (event: CustomEvent) => {
      // PHASE 2: Use event detail as primary source (includes threadId and noteId)
      const { note, actualThreadId, threadId: eventThreadId, noteId: eventNoteId } = event.detail;
      
      // Use threadId from event detail first, fallback to actualThreadId, then note.threadId
      // Improved matching: check both eventThreadId and actualThreadId
      const noteThreadId = eventThreadId || actualThreadId || note?.threadId;
      const noteId = eventNoteId || note?.id;
      
      debug('[ThreadNotesList] noteCreated event received', {
        noteId,
        noteThreadId,
        currentThreadId: threadId,
        hasNote: !!note
      });
      
      // Check if note was created in the current thread
      // For unorganized thread: if threadId is null/undefined, treat as unorganized
      const isUnorganizedNote = !noteThreadId || noteThreadId === 'thread_unorganized';
      const matchesCurrentThread = noteThreadId === threadId || 
                                 (isUnorganizedNote && threadId === 'thread_unorganized') ||
                                 actualThreadId === threadId ||
                                 eventThreadId === threadId;
      
      if (matchesCurrentThread && noteId) {
        // Check if note is already in the list
        const noteExists = notesRef.current.some(n => n.id === noteId);
        if (noteExists) {
          return; // Already in list, skip
        }

        // IMMEDIATE OPTIMISTIC UPDATE: Add note synchronously before any async operations
        // Create note object from event data, or minimal placeholder if incomplete (include threadId for filtering)
        const threadColorsForNote = threadColor ? [{ color: threadColor, frequency: 1 }] : (note as any)?.threadColors;
        const noteToAdd: Note = note ? {
          id: note.id || noteId,
          title: note.title || null,
          content: note.content || '',
          noteType: note.noteType || 'default',
          updatedAt: note.updatedAt ? new Date(note.updatedAt) : undefined,
          createdAt: note.createdAt ? new Date(note.createdAt) : new Date(),
          lastVisited: note.lastVisited ? new Date(note.lastVisited) : undefined,
          resourceTitle: note.resourceTitle || null,
          resourceDescription: note.resourceDescription || null,
          resourceImage: note.resourceImage || null,
          threadId: noteThreadId, // Track which thread this note belongs to
          threadColors: threadColorsForNote,
        } : {
          // Minimal placeholder if note data isn't available
          id: noteId,
          title: 'Untitled Note',
          content: '',
          noteType: 'default',
          createdAt: new Date(),
          threadId: noteThreadId, // Track which thread this note belongs to
          threadColors: threadColorsForNote,
        };

        // Check if note matches current filter
        const matchesFilter = ntf ==='all' ||
                             (ntf ==='scripture' && noteToAdd.noteType === 'scripture') ||
                             (ntf ==='resource' && noteToAdd.noteType === 'resource') ||
                             ((ntf ==='default' || ntf ==='notes') && (noteToAdd.noteType === 'default' || !noteToAdd.noteType));

        if (matchesFilter) {
          debug('[ThreadNotesList] Adding note optimistically', { noteId, title: noteToAdd.title });
          
          // Track as optimistic note
          addOptimistic(noteId, noteToAdd);

          // Add note optimistically (synchronous - happens immediately)
          setNotes(prev => {
            // Check if already exists
            if (prev.some(n => n.id === noteId)) {
              return prev;
            }
            // Add new note and re-sort
            const updated = [noteToAdd, ...prev];
            return sortNotesByTime(updated, threadId);
          });
        }

        // Use verification-based refresh with noteId from event (with retries to preserve optimistic note)
        // Don't await - let it happen asynchronously so UI update isn't blocked
        // PHASE 4: Only remove from sessionStorage after successful verification
        refreshNotesList(noteId).then((success) => {
          if (success) {
            // Note confirmed in list, remove from sessionStorage after a short delay
            // This ensures the note is fully rendered before cleanup
            setTimeout(() => {
              try {
                const recentNotesStr = sessionStorage.getItem('recentlyCreatedNotes');
                if (recentNotesStr) {
                  const recentNotes = JSON.parse(recentNotesStr);
                  const filtered = recentNotes.filter((n: any) => 
                    !(n.threadId === threadId && n.noteId === noteId)
                  );
                  sessionStorage.setItem('recentlyCreatedNotes', JSON.stringify(filtered));
                }
              } catch (error) {
                console.error('[ThreadNotesList] Error cleaning up sessionStorage:', error);
              }
            }, 500); // Small delay to ensure note is fully rendered
          } else {
            // Verification failed after all attempts - check if we should remove optimistic note
            // Only remove if it's been more than 2 seconds since creation (database likely doesn't have it)
            if (hasOptimistic(noteId)) {
              // Check timestamp from the ref (hook doesn't expose timestamp directly)
              // For now, just remove if verification failed - the hook will clean up old items
              removeOptimistic(noteId);
              setNotes(prev => prev.filter(n => n.id !== noteId));
            }
          }
        });
      }
    };

    // Register all event listeners
    window.addEventListener('noteDeleted', handleNoteDeleted as EventListener);
    window.addEventListener('noteAddedToThread', handleNoteAddedToThread as unknown as EventListener);
    window.addEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as EventListener);
    window.addEventListener('noteCreated', handleNoteCreated as unknown as EventListener);

    return () => {
      window.removeEventListener('noteDeleted', handleNoteDeleted as EventListener);
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread as unknown as EventListener);
      window.removeEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as EventListener);
      window.removeEventListener('noteCreated', handleNoteCreated as unknown as EventListener);
    };
  }, [threadId, threadColor, noteTypeFilter, addOptimistic, removeOptimistic, hasOptimistic, refreshNotesList]);

  // PHASE 4: Check sessionStorage on mount for recently created notes
  // Only remove from sessionStorage after successful verification
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    debug('[ThreadNotesList] Checking sessionStorage on mount', { threadId });
    
    try {
      const recentNotesStr = sessionStorage.getItem('recentlyCreatedNotes');
      let recentNotes: any[] = [];
      
      if (recentNotesStr) {
        try {
          recentNotes = JSON.parse(recentNotesStr);
        } catch (e) {
          console.error('[ThreadNotesList] Error parsing sessionStorage:', e);
          recentNotes = [];
        }
      }
      
      debug('[ThreadNotesList] sessionStorage data', { 
        hasData: !!recentNotesStr,
        recentNotesCount: recentNotes.length,
        currentThreadId: threadId
      });
      
      if (recentNotes.length === 0) {
        return;
      }
      
      // Increased window to 30 seconds to handle navigation delays
      const thirtySecondsAgo = Date.now() - 30000;
      const recentNotesInWindow = recentNotes.filter((n: any) => n.timestamp > thirtySecondsAgo);
      
      // Check if any note was created in this thread within last 30 seconds
      // Match by threadId (exact match) or check if threadId matches any variation
      // IMPORTANT: If we're on a thread page and there's a recent note, check if it might belong here
      // This handles cases where the note was just created and we navigated back
      
      debug('[ThreadNotesList] Checking for relevant notes', {
        recentNotesCount: recentNotes.length,
        recentNotesInWindowCount: recentNotesInWindow.length,
        threadId
      });
      
      // First try exact threadId match
      let relevantNote = recentNotesInWindow.find((n: any) => {
        const matchesThreadId = n.threadId === threadId;
        const isUnorganizedMatch = (threadId === 'thread_unorganized' && (!n.threadId || n.threadId === 'thread_unorganized'));
        return matchesThreadId || isUnorganizedMatch;
      });
      
      // If no exact match but there are very recent notes (within 10 seconds), 
      // check if we should refresh anyway (handles threadId mismatches from navigation)
      if (!relevantNote && recentNotesInWindow.length > 0) {
        const tenSecondsAgo = Date.now() - 10000;
        const veryRecentNotes = recentNotesInWindow.filter((n: any) => n.timestamp > tenSecondsAgo);
        
        // If there's a very recent note (within 10 seconds), refresh to check if it belongs to this thread
        // This handles cases where the note was just created and we're navigating back
        if (veryRecentNotes.length > 0) {
          // Use the most recent note
          relevantNote = veryRecentNotes.sort((a: any, b: any) => b.timestamp - a.timestamp)[0];
          debug('[ThreadNotesList] Using very recent note for refresh check', {
            noteId: relevantNote.noteId,
            noteThreadId: relevantNote.threadId,
            currentThreadId: threadId
          });
        }
      }
      
      if (relevantNote) {
        debug('[ThreadNotesList] Found relevant note in sessionStorage, adding optimistically and refreshing', {
          noteId: relevantNote.noteId,
          noteThreadId: relevantNote.threadId,
          currentThreadId: threadId
        });
        
        // OPTIMISTIC UPDATE: Add note immediately if it's very recent (within 10 seconds)
        // This provides instant feedback while API refresh happens
        const tenSecondsAgo = Date.now() - 10000;
        const isVeryRecent = relevantNote.timestamp > tenSecondsAgo;
        
        if (isVeryRecent) {
          // Check if note is already in the list
          const noteExists = notesRef.current.some(n => n.id === relevantNote.noteId);
          if (!noteExists) {
            // Create minimal note object for optimistic update (include threadId for filtering, threadColors for accent)
            const optimisticNote: Note = {
              id: relevantNote.noteId,
              title: 'Untitled Note',
              content: '',
              noteType: 'default',
              createdAt: new Date(relevantNote.timestamp),
              threadId: threadId, // Track which thread this note belongs to
              threadColors: threadColor ? [{ color: threadColor, frequency: 1 }] : undefined,
            };
            
            debug('[ThreadNotesList] Adding note optimistically from sessionStorage', {
              noteId: optimisticNote.id
            });
            
            // Track as optimistic note
            addOptimistic(relevantNote.noteId, optimisticNote);
            
            // Add note optimistically (synchronous - happens immediately)
            setNotes(prev => {
              if (prev.some(n => n.id === relevantNote.noteId)) {
                return prev;
              }
              const updated = [optimisticNote, ...prev];
              return sortNotesByTime(updated, threadId);
            });
          }
        }
        
        // Force immediate refresh with verification (will update with real data)
        refreshNotesList(relevantNote.noteId).then((success) => {
          // PHASE 4: Only remove from sessionStorage after successful verification
          // Check if note is now in the list before removing
          if (success) {
            const noteExists = notesRef.current.some(n => n.id === relevantNote.noteId);
            if (noteExists) {
              // Note confirmed in list, safe to remove from sessionStorage
              const filtered = recentNotes.filter((n: any) => 
                !(n.threadId === threadId && n.noteId === relevantNote.noteId)
              );
              sessionStorage.setItem('recentlyCreatedNotes', JSON.stringify(filtered));
            }
            // If note not found, keep in sessionStorage for retry on next mount
          }
          // If refresh failed, keep in sessionStorage for retry
        });
      }
      
      // Clean up old entries (older than 60 seconds) to prevent sessionStorage from growing
      // Increased from 10 to 60 seconds to handle navigation delays
      const sixtySecondsAgo = Date.now() - 60000;
      const cleanedNotes = recentNotes.filter((n: any) => n.timestamp > sixtySecondsAgo);
      if (cleanedNotes.length !== recentNotes.length) {
        sessionStorage.setItem('recentlyCreatedNotes', JSON.stringify(cleanedNotes));
      }
    } catch (error) {
      console.error('[ThreadNotesList] Error checking sessionStorage:', error);
    }
  }, [threadId, refreshNotesList]);


  // SPA context: when no initial notes are provided (no SSR pre-fetch), load immediately on mount.
  // If sessionStorage has cached notes for this thread, show them instantly and refetch in the background.
  useEffect(() => {
    if (initialNotes.length > 0) {
      setIsInitialLoadPending(false);
      return;
    }
    const cached = getThreadNotesCache(threadId);
    if (cached && cached.length > 0) {
      setNotes(cached);
      allFetchedNotesRef.current = cached;
      setIsInitialLoadPending(false);
      refreshNotesList();
      return;
    }
    setIsInitialLoadPending(true);
    const timeoutId = setTimeout(() => setIsInitialLoadPending(false), 3000);
    refreshNotesList().finally(() => {
      setIsInitialLoadPending(false);
      clearTimeout(timeoutId);
    });
    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]); // Only re-run when threadId changes, not on every refreshNotesList recreation

  // Refresh notes on View Transitions navigation
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
    const DEBOUNCE_MS = 300;

    const handlePageLoad = () => {
      // Clear any pending refresh
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      const currentPath = window.location.pathname;
      const currentThreadId = extractIdFromPath(currentPath) || '';
      const previousPath = previousPathnameRef.current;
      const previousThreadId = extractIdFromPath(previousPath) || '';

      // Detect if we've navigated TO this thread (not just refreshed on it)
      const navigatedToThread = currentThreadId === threadId && previousThreadId !== threadId;
      // Detect if we navigated from a note page (likely after creating a note)
      const navigatedFromNote = previousPath.startsWith('/note/');

      // Check sessionStorage for recently created notes when navigating TO thread
      let shouldForceRefresh = navigatedToThread;
      if (navigatedToThread) {
        try {
          const recentNotesStr = sessionStorage.getItem('recentlyCreatedNotes');
          if (recentNotesStr) {
            const recentNotes = JSON.parse(recentNotesStr);
            const thirtySecondsAgo = Date.now() - 30000;
            const hasRecentNote = recentNotes.some((n: any) => 
              n.threadId === threadId && n.timestamp > thirtySecondsAgo
            );
            if (hasRecentNote) {
              shouldForceRefresh = true;
            }
          }
        } catch (error) {
          console.error('[ThreadNotesList] Error checking sessionStorage in handlePageLoad:', error);
        }
      }

      // Use unified refresh function instead of arbitrary delays
      // Debounce to prevent multiple rapid refreshes
      refreshTimeout = setTimeout(() => {
        refreshTimeout = null;
        if (shouldForceRefresh || navigatedFromNote) {
          // Use verification-based refresh when navigating from note creation
          refreshNotesList();
        } else {
          // Regular refresh for other navigation
          refreshNotesList();
        }
      }, DEBOUNCE_MS);

      // Update previous pathname for next navigation
      previousPathnameRef.current = currentPath;
    };

    // Initialize previous pathname on mount
    if (previousPathnameRef.current === '') {
      previousPathnameRef.current = window.location.pathname;
    }

    // Check if we're coming from a note page (full page reload scenario)
    // This handles the case where navigation used window.location.href (full reload)
    // or when route change didn't fire app:route-change
    // Works for both regular threads and unorganized thread
    // Also check for PWA context and stale data
    const checkAndRefreshOnMount = () => {
      if (hasRefreshedOnMountRef.current) return;
      
      const referrer = document.referrer;
      const currentPath = window.location.pathname;
      // Use extractIdFromPath so /thread/abc123 → thread_abc123 (matches threadId prop)
      const currentThreadId = extractIdFromPath(currentPath);
      
      // Only refresh if we're on the correct thread page (including unorganized)
      if (currentThreadId !== threadId) {
        return;
      }
      
      // Check if running in PWA context - always refresh to get fresh data
      const inPWA = isPWA();
      
      // Check if initial data is stale
      const dataIsStale = isStaleData(initialNotes, (note) => note.lastVisited);
      
      // Check if we came from a note page
      const cameFromNotePage = referrerMatchesPattern('/note/');
      
      // Also check if previous pathname was a note (for View Transitions scenarios)
      const previousWasNote = previousPathnameRef.current.startsWith('/note/');
      
      // Check sessionStorage for recently created notes (30s window to match sessionStorage-on-mount effect)
      let hasRecentNote = false;
      let relevantNote: any = null;
      try {
        const recentNotesStr = sessionStorage.getItem('recentlyCreatedNotes');
        if (recentNotesStr) {
          const recentNotes = JSON.parse(recentNotesStr);
          const thirtySecondsAgo = Date.now() - 30000;
          relevantNote = recentNotes.find((n: any) => 
            n.threadId === threadId && n.timestamp > thirtySecondsAgo
          );
          hasRecentNote = !!relevantNote;
        }
      } catch (error) {
        console.error('[ThreadNotesList] Error checking sessionStorage in checkAndRefreshOnMount:', error);
      }
      
      // Also refresh if initialNotes is empty (SPA context - no SSR pre-fetch)
      const hasNoInitialData = initialNotes.length === 0;

      // Refresh if: PWA context, stale data, coming from note page, has recent note, or no initial data
      if (inPWA || dataIsStale || cameFromNotePage || previousWasNote || hasRecentNote || hasNoInitialData) {
        hasRefreshedOnMountRef.current = true;
        // If we have a recent note, use verification-based refresh with noteId
        // Otherwise, use regular refresh
        const refreshFn = hasRecentNote && relevantNote?.noteId 
          ? () => refreshNotesList(relevantNote.noteId)
          : () => refreshNotesList();
        
        // Immediate refresh for PWA/stale data, otherwise use unified refresh function
        const delay = (inPWA || dataIsStale) ? 50 : 0;
        if (delay > 0) {
          setTimeout(() => {
            if (isMountedRef.current && extractIdFromPath(window.location.pathname) === threadId) {
              refreshFn();
            }
          }, delay);
        } else {
          refreshFn();
        }
      }
    };

    // Check on mount (for full page reloads)
    checkAndRefreshOnMount();

    document.addEventListener('app:route-change', handlePageLoad);

    return () => {
      document.removeEventListener('app:route-change', handlePageLoad);
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
    };
  }, [threadId, noteTypeFilter, refreshNotesList]);

  // Listen for visibility changes to refresh when PWA comes to foreground
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const MIN_BACKGROUND_TIME = 30000; // 30 seconds
    const MIN_REFRESH_INTERVAL = 2000; // 2 seconds between refreshes

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // App went to background - record time
        lastBackgroundTimeRef.current = Date.now();
      } else {
        // App came to foreground
        const currentPath = window.location.pathname;
        // Use extractIdFromPath so /thread/abc123 → thread_abc123 (matches threadId prop)
        const currentThreadId = extractIdFromPath(currentPath);
        
        // Only refresh if we're on the correct thread page (including unorganized)
        if (currentThreadId !== threadId) return;

        // Skip refresh if offline - refreshNotesList will handle loading from IndexedDB
        if (!navigator.onLine) {
          debug('[ThreadNotesList] Visibility change but offline, skipping refresh');
          return;
        }

        const timeInBackground = lastBackgroundTimeRef.current > 0 
          ? Date.now() - lastBackgroundTimeRef.current 
          : 0;
        const timeSinceLastRefresh = Date.now() - lastVisibilityRefreshRef.current;
        const inPWA = isPWA();

        // Only refresh if:
        // 1. Was in background for > 30 seconds, OR
        // 2. This is PWA (always refresh for PWA on foreground), OR
        // 3. First time coming to foreground (lastBackgroundTimeRef was 0)
        const shouldRefresh = (timeInBackground > MIN_BACKGROUND_TIME || inPWA || lastBackgroundTimeRef.current === 0) &&
                              timeSinceLastRefresh > MIN_REFRESH_INTERVAL &&
                              !isRefreshingRef.current &&
                              isMountedRef.current;

        if (shouldRefresh) {
          lastVisibilityRefreshRef.current = Date.now();
          isRefreshingRef.current = true;

          debug('[ThreadNotesList] Visibility change: refreshing notes', {
            timeInBackground,
            inPWA,
            timeSinceLastRefresh,
            threadId
          });

          refreshNotesList().then((success) => {
            isRefreshingRef.current = false;
            debug('[ThreadNotesList] Visibility refresh completed', { success });
          }).catch((error) => {
            isRefreshingRef.current = false;
            console.error('[ThreadNotesList] Visibility refresh failed:', error);
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [threadId, refreshNotesList]);

  // Check if this is the unorganized thread
  const isUnorganizedThread = threadId === 'thread_unorganized';

  // Handle delete button click
  const handleDeleteClick = (e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    e.stopPropagation();
    setNoteToDelete(note);
    setShowDeleteConfirm(true);
  };

  // Handle delete confirmation
  const handleConfirmDelete = async () => {
    if (!noteToDelete) return;

    setShowDeleteConfirm(false);
    
    try {
      // OFFLINE-FIRST: Delete note from local IndexedDB immediately
      const userId = getPersistedUserId();
      
      if (userId) {
        try {
          await deleteNoteOffline(userId, noteToDelete.id);
          console.log('[ThreadNotesList] Note deleted locally in IndexedDB', { noteId: noteToDelete.id });
        } catch (err) {
          console.error('[ThreadNotesList] Failed to delete note offline:', err);
          // Continue with server API call
        }
      }
      
      // Optimistically remove from local state first
      setDeletedNoteIds(prev => {
        const newSet = new Set([...prev, noteToDelete.id]);
        deletedNoteIdsRef.current = newSet;
        return newSet;
      });
      setNotes(prev => prev.filter(note => note.id !== noteToDelete.id));
      
      // Show success message immediately for offline-first experience
      if ((window as any).toast) {
        (window as any).toast.success('Note erased!');
      }
      
      // Then try to push deletion to server
      const response = await fetch(`/api/notes/delete?noteId=${encodeURIComponent(noteToDelete.id)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error || 'Failed to sync deletion with server';
        console.error('[ThreadNotesList] Server deletion failed:', errorMessage);
        // Note is already deleted locally, server sync will handle recovery
      } else {
        // Dispatch noteDeleted event
        window.dispatchEvent(new CustomEvent('noteDeleted', {
          detail: { 
            noteId: noteToDelete.id,
            threadId: threadId
          }
        }));
      }

      setNoteToDelete(null);
    } catch (error) {
      console.error('Error deleting note:', error);
      
      // Check if it's a network error - the note is already deleted locally
      if (isNetworkError(error)) {
        // Network error but local deletion succeeded - this is fine for offline-first
        console.log('[ThreadNotesList] Network error during deletion, but note deleted locally');
        
        // Dispatch noteDeleted event so UI updates happen
        window.dispatchEvent(new CustomEvent('noteDeleted', {
          detail: { 
            noteId: noteToDelete.id,
            threadId: threadId
          }
        }));
        
        // Don't show an error - the deletion worked locally and will sync later
        setNoteToDelete(null);
        return;
      }
      
      // Non-network error - show error message
      if ((window as any).toast) {
        (window as any).toast.error('Failed to delete note');
      } else {
        alert('Failed to delete note. Please check the console for details.');
      }
      setNoteToDelete(null);
    }
  };

  // Handle delete cancellation
  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
    setNoteToDelete(null);
  };

  // Derive visible rows from current tab + merged fetch state on every render so the first paint
  // after switching to Scripture (etc.) never shows the previous tab's CardNote rows.
  const filteredNotes = useMemo(
    () =>
      computeThreadNotesViewList({
        initialNotes,
        prevInitialNotesRef,
        allFetchedNotes: allFetchedNotesRef.current,
        notesState: notes,
        deletedNoteIds,
        noteTypeFilter,
        ntf,
        threadId,
        getOptimisticItemsToMerge,
      }),
    [initialNotes, notes, deletedNoteIds, noteTypeFilter, ntf, threadId, getOptimisticItemsToMerge],
  );

  const totalCountForFilter = totalCountForNoteFilter(
    noteTypeFilter,
    noteTypeCounts,
    initialNotes.length,
    filteredNotes.length,
    ntf,
  );
  // hasMore is true if we have fewer filtered items than the total count for this filter type
  // This ensures we continue loading until all matching notes are loaded
  const initialHasMore = filteredNotes.length < totalCountForFilter;

  // Update refs when total count or filtered notes change
  // This ensures refs are always in sync with the actual filtered count
  useEffect(() => {
    totalCountForFilterRef.current = totalCountForFilter;
    // Always update accumulatedFilteredCountRef to match the actual filtered notes length
    // This is critical for accurate hasMore calculation in loadMore
    accumulatedFilteredCountRef.current = filteredNotes.length;
  }, [totalCountForFilter, filteredNotes.length]);


  const loadMore = useCallback(async (offset: number, limit: number) => {
    // Early return if we've already reached the expected count for this filter
    if (accumulatedFilteredCountRef.current >= totalCountForFilterRef.current && totalCountForFilterRef.current > 0) {
      return {
        items: [],
        hasMore: false
      };
    }
    
    // If this is a local thread, load from IndexedDB instead of API
    const isLocalThread = threadId.startsWith('local_');
    if (isLocalThread) {
      const userId = getPersistedUserId();
      if (!userId) {
        return { items: [], hasMore: false };
      }

      try {
        const dbOffset = databaseOffsetRef.current;
        const localResult = await getNotesForThreadLocal(userId, threadId, limit, dbOffset);
        const localNotes = localResult.notes || [];

        // Normalize dates
        const normalized = localNotes.map((note: any) => ({
          ...note,
          lastVisited: note.lastVisited ? (normalizeDate(note.lastVisited) || note.lastVisited) : note.lastVisited,
          createdAt: note.createdAt ? (normalizeDate(note.createdAt) || note.createdAt) : note.createdAt,
          updatedAt: note.updatedAt ? (normalizeDate(note.updatedAt) || note.updatedAt) : note.updatedAt,
        }));

        // Filter out deleted notes
        const filteredDeleted = normalized.filter((note: Note) => !deletedNoteIdsRef.current.has(note.id));
        // Apply note type filter
        const filteredByType = filterNotesByType(filteredDeleted, noteTypeFilter);

        // Update database offset
        databaseOffsetRef.current = dbOffset + localNotes.length;

        // Update accumulated filtered count
        const currentActualFilteredCount = accumulatedFilteredCountRef.current;
        const newFilteredCount = currentActualFilteredCount + filteredByType.length;
        accumulatedFilteredCountRef.current = newFilteredCount;

        // Determine hasMore
        const hasReachedExpectedCount = newFilteredCount >= totalCountForFilterRef.current;
        const hasMore = !hasReachedExpectedCount && localResult.hasMore;

        return {
          items: filteredByType,
          hasMore
        };
      } catch (error) {
        console.error('[ThreadNotesList] Error loading more notes from IndexedDB:', error);
        return { items: [], hasMore: false };
      }
    }
    
    // Use the database offset ref for API calls (since API doesn't filter by type)
    // The API needs to know how many total notes we've fetched, not how many filtered items we've displayed
    const dbOffset = databaseOffsetRef.current;
    
    const url = buildAPIUrl(`/api/threads/${threadId}/notes`, {
      offset: dbOffset.toString(),
      limit: limit.toString()
    });

    if (!url) {
      throw new Error('Failed to build load-more URL');
    }

    const response = await fetch(url, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to load more notes');
    }

    const data = await response.json();

    // Seed note detail cache so opening a note shows content immediately
    onNotesLoaded?.(data.notes || []);

    // Update database offset to reflect how many notes we've now fetched total
    databaseOffsetRef.current = dbOffset + data.notes.length;
    
    // Filter out deleted notes from loaded notes using ref to get latest state
    const filteredDeleted = data.notes.filter((note: Note) => !deletedNoteIdsRef.current.has(note.id));
    // Apply note type filter
    const filteredByType = filterNotesByType(filteredDeleted, noteTypeFilter);
    
    // Get the current actual filtered count from the ref
    const currentActualFilteredCount = accumulatedFilteredCountRef.current;
    const newFilteredCount = currentActualFilteredCount + filteredByType.length;
    
    // Update the ref with the new count immediately
    accumulatedFilteredCountRef.current = newFilteredCount;
    
    // Determine hasMore based on whether we've reached the expected count for this filter type
    // Continue fetching until filteredNotes.length >= noteTypeCounts[noteTypeFilter]
    const hasReachedExpectedCount = newFilteredCount >= totalCountForFilterRef.current;
    
    // If we've reached the expected count, we're done
    if (hasReachedExpectedCount && totalCountForFilterRef.current > 0) {
      return {
        items: filteredByType,
        hasMore: false
      };
    }
    
    // We haven't reached the expected count yet
    // Continue loading until we reach the expected filtered count
    // Key fix: Set hasMore = true if filtered count < expected count, regardless of API's hasMore value
    // This ensures we continue loading until all matching notes are loaded
    // Stop only if:
    // 1. We've reached expected count, OR
    // 2. API returned no items (exhausted all items from database)
    const apiHasMore = data.hasMore;
    const gotNoItems = data.notes.length === 0;
    
    // Continue loading if we haven't reached expected count AND we haven't exhausted all items
    const hasMore = !hasReachedExpectedCount && !gotNoItems;
    
    return {
      items: filteredByType,
      hasMore
    };
  }, [threadId, noteTypeFilter, onNotesLoaded]);

  // Handle items change from InfiniteScrollList (when loading more)
  const handleItemsChange = useCallback((newItems: Note[]) => {
    // Deduplicate by note ID to prevent duplicates
    const uniqueNotes = Array.from(
      new Map(newItems.map(note => [note.id, note])).values()
    );
    
    const sortedNotes = sortNotesByTime(uniqueNotes, threadId);
    
    setNotes(sortedNotes);
    
    // Update accumulated filtered count based on actual filtered items
    const filtered = sortedNotes.filter(note => !deletedNoteIdsRef.current.has(note.id));
    const typeFiltered = filterNotesByType(filtered, noteTypeFilter);
    accumulatedFilteredCountRef.current = typeFiltered.length;
    // Note: databaseOffsetRef is updated in loadMore, not here
  }, [noteTypeFilter]);

  const renderItem = (note: Note, index: number) => {
    const isScriptureNote = note.noteType === 'scripture';
    const isEncrypted = note.contentEncrypted === true;
    const cleanContent = isEncrypted ? '' : stripHtml(note.content);
    const truncatedContent = cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : "");

    return (
      <div 
        data-keyboard-row
        className={`content-item note-item card-enter ${isUnorganizedThread ? 'panel__item-list-item' : ''}`}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <a
          href={idToUrl(note.id, threadId)}
          className={`block transition-transform duration-200 active:scale-[0.99] ${isUnorganizedThread ? 'panel__item-list-item-link' : ''}`}
          style={{ touchAction: 'manipulation' }}
          onMouseEnter={() => onPrefetchNote?.(note.id)}
          onFocus={() => onPrefetchNote?.(note.id)}
          onMouseDown={() => onPrefetchNote?.(note.id)}
        >
          {isScriptureNote ? (
            (() => {
              const tc =
                note.threadColors ?? (threadColor ? [{ color: threadColor, frequency: 1 }] : undefined);
              const mesh = getCondensedNoteMeshGradient(tc, note.id);
              return (
                <CondensedNoteRowLayout
                  accentBarStyle={getCondensedNoteAccentBarStyle(mesh)}
                  icon={condensedNoteRowIcon({ noteType: 'scripture' })}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 700,
                        color: 'var(--color-deep-grey)',
                        fontSize: '16px',
                        lineHeight: 1.2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {note.title || 'Untitled Note'}
                    </div>
                    {note.version && (
                      <span
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '12px',
                          fontWeight: 'normal',
                          color: 'var(--color-stone-grey)',
                          flexShrink: 0,
                        }}
                      >
                        {getTranslationAbbreviationDisplay(note.version)}
                      </span>
                    )}
                  </div>
                </CondensedNoteRowLayout>
              );
            })()
          ) : (
            // Full CardNote for non-scripture notes – pass threadColors so accent shows (e.g. member in shared space)
            <CardNote 
              title={note.noteType === 'resource' && note.resourceTitle ? note.resourceTitle : (note.title || "Untitled Note")}
              content={note.noteType === 'resource' && note.resourceDescription ? note.resourceDescription : truncatedContent}
              noteType={(note.noteType as 'default' | 'scripture' | 'resource' | undefined) || 'default'}
              resourceTitle={note.noteType === 'resource' ? (note.resourceTitle || null) : undefined}
              resourceDescription={note.noteType === 'resource' ? (note.resourceDescription || null) : undefined}
              resourceImage={note.noteType === 'resource' ? (note.resourceImage || null) : undefined}
              noteId={note.id}
              isPendingSync={note.syncStatus === 'pending'}
              contentEncrypted={note.contentEncrypted === true}
              threadColors={note.threadColors ?? (threadColor ? [{ color: threadColor, frequency: 1 }] : undefined)}
            />
          )}
        </a>
        
        {/* Delete button - only show on unorganized thread and on hover */}
        {isUnorganizedThread && (
          <ActionButton
            variant="default"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDeleteClick(e, note);
            }}
            aria-label="Delete note"
            className="panel__item-list-item-actions"
          >
            <svg 
              viewBox="0 0 576 512" 
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: '16px', height: '16px', fill: 'var(--color-pebble-grey)' }}
            >
              <path d="M290.7 57.4L57.4 290.7c-25 25-25 65.5 0 90.5l80 80c12 12 28.3 18.7 45.3 18.7L288 480l9.4 0L512 480c17.7 0 32-14.3 32-32s-14.3-32-32-32l-124.1 0L518.6 285.3c25-25 25-65.5 0-90.5L381.3 57.4c-25-25-65.5-25-90.5 0zM297.4 416l-9.4 0-105.4 0-80-80L227.3 211.3 364.7 348.7 297.4 416z"/>
            </svg>
          </ActionButton>
        )}
      </div>
    );
  };

  return (
    <>
      <div ref={containerRef} style={{ paddingBottom: '12px' }}>
        {filteredNotes.length > 0 ? (
          <InfiniteScrollList
            key={`${threadId}-${noteTypeFilter}`}
            initialItems={filteredNotes}
            items={filteredNotes}
            onItemsChange={handleItemsChange}
            loadMore={loadMore}
            renderItem={renderItem}
            itemKey={(note) => note.id}
            limit={20}
            className="flex-stack"
            initialHasMore={initialHasMore}
            minimumExpectedCount={totalCountForFilter}
          />
        ) : isInitialLoadPending ? (
          <div style={{ minHeight: `${CONDENSED_NOTE_ROW_HEIGHT_PX}px` }} aria-hidden="true" />
        ) : committedFilter !== noteTypeFilter ? null : (
          <div style={{ textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
            <p style={{ fontWeight: 600, color: 'var(--color-pebble-grey)', fontSize: '18px' }}>
              {ntf ==='scripture' ? 'No scripture notes in this thread' :
               ntf ==='resource' || ntf ==='resources' ? 'No resources in this thread' :
               ntf ==='default' || ntf ==='notes' ? 'No notes in this thread' :
               'No notes found in this thread'}
            </p>
          </div>
        )}
      </div>

      {/* Delete confirmation — desktop: centered in main column */}
      {showDeleteConfirm && noteToDelete && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-overlay-enter"
          role="dialog"
          aria-modal="true"
          style={getModalOverlayBaseStyle(overlayUsesMainColumn)}
          onClick={(e) => {
            // Close dialog if clicking on the overlay (but not the dialog content)
            if (e.target === e.currentTarget) {
              handleCancelDelete();
            }
          }}
        >
          <div 
            className="modal-content-enter"
            onClick={(e) => e.stopPropagation()}
            style={{ 
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              maxWidth: '28rem',
              width: '100%',
              pointerEvents: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
          >
            <h3 style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--color-deep-grey)',
              marginBottom: '0.5rem'
            }}>
              Erase Note?
            </h3>
            <p style={{
              color: 'var(--color-pebble-grey)',
              marginBottom: '1.5rem'
            }}>
              Are you sure you want to permanently erase this note? This action cannot be undone. The note will be permanently removed from your Harvous.
            </p>
            <EraseConfirmDialog
              contentType="note"
              onCancel={handleCancelDelete}
              onConfirm={handleConfirmDelete}
            />
          </div>
        </div>,
        portalTarget
      )}
    </>
  );
}

