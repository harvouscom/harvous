import React, { useEffect, useState } from 'react';
import { getThreadLocal, getNotesForThreadLocal } from '@/utils/offline-read-layer';
import { getPersistedUserId } from '@/utils/user-id';
import { getThreadGradientCSS, getThreadColorCSS } from '@/utils/colors';
import { normalizeDate } from '@/utils/sorting';
import { debug } from '@/utils/logger';

interface OfflineThreadLoaderProps {
  threadId: string;
}

/**
 * Client-side component that loads offline thread data from IndexedDB
 * and updates the page to display it. Used when navigating to a thread
 * that was created offline and hasn't synced to the server yet.
 */
export default function OfflineThreadLoader({ threadId }: OfflineThreadLoaderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadOfflineThread = async () => {
      // Only proceed if this is a local/offline thread ID
      if (!threadId.startsWith('local_')) {
        debug('[OfflineThreadLoader] Not an offline thread ID, skipping', { threadId });
        setIsLoading(false);
        return;
      }

      const userId = getPersistedUserId();
      if (!userId) {
        debug('[OfflineThreadLoader] No userId available');
        setError('User not authenticated');
        setIsLoading(false);
        return;
      }

      try {
        debug('[OfflineThreadLoader] Loading offline thread from IndexedDB', { threadId, userId });
        
        // Load thread from IndexedDB
        const thread = await getThreadLocal(userId, threadId);
        
        if (!thread) {
          debug('[OfflineThreadLoader] Thread not found in IndexedDB', { threadId });
          setError('Thread not found');
          setIsLoading(false);
          return;
        }

        // Load notes for this thread
        const notesResult = await getNotesForThreadLocal(userId, threadId, 100, 0);
        const notes = notesResult.notes || [];

        // Normalize dates
        const normalizedNotes = notes.map((note: any) => ({
          ...note,
          lastVisited: note.lastVisited ? (normalizeDate(note.lastVisited) || note.lastVisited) : note.lastVisited,
          createdAt: note.createdAt ? (normalizeDate(note.createdAt) || note.createdAt) : note.createdAt,
          updatedAt: note.updatedAt ? (normalizeDate(note.updatedAt) || note.updatedAt) : note.updatedAt,
        }));

        // Calculate note type counts
        const noteTypeCounts = {
          all: normalizedNotes.length,
          default: normalizedNotes.filter((n: any) => !n.noteType || n.noteType === 'default').length,
          scripture: normalizedNotes.filter((n: any) => n.noteType === 'scripture').length,
          resource: normalizedNotes.filter((n: any) => n.noteType === 'resource').length,
        };

        debug('[OfflineThreadLoader] Thread loaded successfully', {
          threadId,
          title: thread.title,
          noteCount: normalizedNotes.length,
        });

        // Update page title
        const titleElement = document.querySelector('title');
        if (titleElement) {
          titleElement.textContent = `${thread.title} - Harvous`;
        }

        // Update data attributes on main column for navigation context
        const mainColumn = document.querySelector('[slot="main"]');
        if (mainColumn) {
          mainColumn.setAttribute('data-title', thread.title);
          mainColumn.setAttribute('data-count', String(normalizedNotes.length));
          const backgroundGradient = getThreadGradientCSS(thread.color);
          mainColumn.setAttribute('data-background-gradient', backgroundGradient);
        }

        // Update CardStack title if it exists
        const cardStackTitle = document.querySelector('.card-stack__title');
        if (cardStackTitle) {
          cardStackTitle.textContent = thread.title;
        }

        // Update CardStack header background color
        const cardStackHeader = document.querySelector('.card-stack__header');
        if (cardStackHeader && thread.color) {
          const bgColor = getThreadColorCSS(thread.color);
          (cardStackHeader as HTMLElement).style.backgroundColor = bgColor;
        }

        // Dispatch threadLoaded event for other components
        window.dispatchEvent(new CustomEvent('offlineThreadLoaded', {
          detail: {
            thread: {
              id: thread.id,
              title: thread.title,
              subtitle: thread.subtitle,
              color: thread.color,
              spaceId: thread.spaceId,
              noteCount: normalizedNotes.length,
              backgroundGradient: getThreadGradientCSS(thread.color),
            },
            notes: normalizedNotes,
            noteTypeCounts,
          }
        }));

        // Update navigation history if needed
        try {
          const navHistory = localStorage.getItem('harvous-navigation-history-v2');
          if (navHistory) {
            const history = JSON.parse(navHistory);
            const existingIndex = history.findIndex((h: any) => h.id === thread.id);
            if (existingIndex === -1) {
              history.push({
                id: thread.id,
                title: thread.title,
                count: normalizedNotes.length,
                backgroundGradient: getThreadGradientCSS(thread.color),
                firstAccessed: Date.now(),
                lastAccessed: Date.now()
              });
              history.sort((a: any, b: any) => a.firstAccessed - b.firstAccessed);
              localStorage.setItem('harvous-navigation-history-v2', JSON.stringify(history));
            }
          }
        } catch (err) {
          console.error('[OfflineThreadLoader] Error updating navigation history:', err);
        }

        setIsLoading(false);
      } catch (err) {
        console.error('[OfflineThreadLoader] Error loading offline thread:', err);
        setError(err instanceof Error ? err.message : 'Failed to load thread');
        setIsLoading(false);
      }
    };

    loadOfflineThread();
  }, [threadId]);

  // This component doesn't render anything - it just loads data and updates the page
  // The actual thread content is rendered by ThreadNotesList which will load from IndexedDB
  return null;
}

