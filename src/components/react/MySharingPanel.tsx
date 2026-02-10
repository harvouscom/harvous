import React, { useState, useEffect, useCallback } from 'react';
import SquareButton from './SquareButton';
import TabNav from './TabNav';
import CondensedNoteItem from './CondensedNoteItem';
import CondensedThreadItem from './CondensedThreadItem';
import ActionButton from './ActionButton';
import { toast } from '@/utils/toast';

type SharingFilter = 'all' | 'threads' | 'notes';

interface SharedThread {
  id: string;
  title: string;
  color?: string | null;
  shareToken: string;
  shareUrl: string;
}

interface SharedNote {
  id: string;
  title: string;
  shareToken: string;
  shareUrl: string;
}

interface MySharingPanelProps {
  onClose?: () => void;
  inBottomSheet?: boolean;
}

export default function MySharingPanel({
  onClose,
  inBottomSheet = false
}: MySharingPanelProps) {
  const [threads, setThreads] = useState<SharedThread[]>([]);
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disablingId, setDisablingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<SharingFilter>('all');

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    }
  };

  const fetchShared = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/profile/my-sharing', {
        credentials: 'include',
        cache: 'no-store'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setThreads(data.threads ?? []);
      setNotes(data.notes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setThreads([]);
      setNotes([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShared();
  }, [fetchShared]);

  const handleDisableThread = async (thread: SharedThread) => {
    setDisablingId(thread.id);
    try {
      const res = await fetch(`/api/threads/${thread.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'disable' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to turn off sharing');
      setThreads((prev) => prev.filter((t) => t.id !== thread.id));
      toast.success('Thread is now private');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to make private. Please try again.');
    } finally {
      setDisablingId(null);
    }
  };

  const handleDisableNote = async (note: SharedNote) => {
    setDisablingId(note.id);
    try {
      const res = await fetch(`/api/notes/${note.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'disable' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to turn off sharing');
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      toast.success('Note is now private');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to make private. Please try again.');
    } finally {
      setDisablingId(null);
    }
  };

  const isEmpty = !isLoading && !error && threads.length === 0 && notes.length === 0;
  const showThreads = activeFilter === 'all' || activeFilter === 'threads';
  const showNotes = activeFilter === 'all' || activeFilter === 'notes';
  const hasItemsForFilter =
    activeFilter === 'all' ? threads.length + notes.length > 0 :
    activeFilter === 'threads' ? threads.length > 0 : notes.length > 0;

  const sharingTabs = [
    { id: 'all', label: 'All', isActive: activeFilter === 'all', count: threads.length + notes.length },
    { id: 'threads', label: 'Threads', isActive: activeFilter === 'threads', count: threads.length },
    { id: 'notes', label: 'Notes', isActive: activeFilter === 'notes', count: notes.length }
  ];

  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
      <div className={inBottomSheet ? 'flex-1 flex flex-col min-h-0' : 'flex flex-col'}>
        <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''} ${isLoading ? 'opacity-60 pointer-events-none' : ''}`}>
          <div className="panel__header">
            <div className="panel__title">
              <p>My Sharing</p>
            </div>
          </div>

          <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
            <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
              {!isLoading && !error && !isEmpty && (
                <div className="mb-3">
                  <TabNav
                    tabs={sharingTabs}
                    onTabChange={(tabId) => setActiveFilter(tabId as SharingFilter)}
                  />
                </div>
              )}

              {error && (
                <div className="w-full p-4 rounded-xl mb-3" style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-pebble-grey)' }}>
                  <p className="text-sm font-sans" style={{ color: 'var(--color-deep-grey)' }}>{error}</p>
                </div>
              )}

              {isLoading && (
                <div className="w-full py-8 text-center">
                  <p className="font-sans" style={{ color: 'var(--color-pebble-grey)', fontSize: '16px' }}>Loading...</p>
                </div>
              )}

              {isEmpty && !isLoading && (
                <div className="w-full p-8 text-center">
                  <p className="font-sans" style={{ color: 'var(--color-pebble-grey)', fontSize: '16px', textWrap: 'balance' }}>
                    Turn on sharing from a thread or a note to see them here.
                  </p>
                </div>
              )}

              {!isLoading && !isEmpty && hasItemsForFilter && (
                <div className="flex flex-col gap-2 w-full">
                  <ul className="flex flex-col gap-2 list-none p-0 m-0" role="list">
                    {showThreads && threads.map((thread) => (
                      <li key={thread.id}>
                        <CondensedThreadItem
                          title={thread.title}
                          color={thread.color ?? undefined}
                          isPublic={true}
                          action={
                            <ActionButton
                              variant="Remove"
                              onClick={() => handleDisableThread(thread)}
                              disabled={disablingId === thread.id}
                              aria-label={`Make private: ${thread.title}`}
                            />
                          }
                        />
                      </li>
                    ))}
                    {showNotes && notes.map((note) => (
                      <li key={note.id}>
                        <CondensedNoteItem
                          title={note.title}
                          noteType="default"
                          itemType="note"
                          action={
                            <ActionButton
                              variant="Remove"
                              onClick={() => handleDisableNote(note)}
                              disabled={disablingId === note.id}
                              aria-label={`Make private: ${note.title}`}
                            />
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!isLoading && !isEmpty && !hasItemsForFilter && (
                <div className="w-full p-8 text-center">
                  <p className="font-sans" style={{ color: 'var(--color-pebble-grey)', fontSize: '16px' }}>
                    No {activeFilter === 'threads' ? 'threads' : 'notes'} shared yet.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="panel__footer--buttons">
        <SquareButton variant="Back" onClick={handleClose} inBottomSheet={inBottomSheet} />
      </div>
    </div>
  );
}
