import React, { useState, useEffect, useCallback } from 'react';
import SquareButton from './SquareButton';
import TabNav from './TabNav';
import CondensedNoteItem from './CondensedNoteItem';
import CondensedThreadItem from './CondensedThreadItem';
import ActionButton from './ActionButton';
import { safeNavigate } from '@/utils/safe-navigate';
import { idToUrl } from '@/utils/url-helpers';
import { toast } from '@/utils/toast';
import { getCachedPanelData, setCachedPanelData, invalidatePanelDataCache, PANEL_CACHE_KEYS } from '@/utils/panel-data-cache';
import SubtleContentMount from './SubtleContentMount';

type SharingFilter = 'all' | 'threads' | 'notes' | 'spaces';

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

interface OwnedSharedSpace {
  id: string;
  title: string;
  color?: string | null;
  memberCount: number;
  shareToken?: string | null;
  shareUrl?: string;
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
  const [ownedSpaces, setOwnedSpaces] = useState<OwnedSharedSpace[]>([]);
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

  const fetchShared = useCallback(async (backgroundRefetch = false) => {
    if (!backgroundRefetch) setIsLoading(true);
    setError(null);
    try {
      const [sharingRes, spacesRes] = await Promise.all([
        fetch('/api/profile/my-sharing', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/profile/my-shared-spaces', { credentials: 'include', cache: 'no-store' })
      ]);
      const sharingData = await sharingRes.json();
      if (!sharingRes.ok) throw new Error(sharingData.error || 'Failed to load');
      const newThreads = sharingData.threads ?? [];
      const newNotes = sharingData.notes ?? [];
      setThreads(newThreads);
      setNotes(newNotes);

      let newOwnedSpaces: OwnedSharedSpace[] = [];
      if (spacesRes.ok) {
        const spacesData = await spacesRes.json();
        newOwnedSpaces = spacesData.owned ?? [];
        setOwnedSpaces(newOwnedSpaces);
      } else {
        const spacesData = await spacesRes.json().catch(() => ({}));
        const msg = (spacesData as { error?: string }).error || 'Failed to load shared spaces';
        toast.error(msg);
        setOwnedSpaces([]);
      }
      setCachedPanelData(PANEL_CACHE_KEYS.sharing, { threads: newThreads, notes: newNotes, ownedSpaces: newOwnedSpaces });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      toast.error(message);
      setThreads([]);
      setNotes([]);
      setOwnedSpaces([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = getCachedPanelData<{ threads: SharedThread[]; notes: SharedNote[]; ownedSpaces: OwnedSharedSpace[] }>(PANEL_CACHE_KEYS.sharing);
    if (cached) {
      setThreads(cached.threads ?? []);
      setNotes(cached.notes ?? []);
      setOwnedSpaces(cached.ownedSpaces ?? []);
      setIsLoading(false);
      fetchShared(true);
    } else {
      fetchShared(false);
    }
  }, [fetchShared]);

  // Refetch when sharing is changed elsewhere (e.g. share link generated in EditSpacePanel)
  useEffect(() => {
    const handleInvalidate = () => fetchShared(true);
    window.addEventListener('mySharingInvalidate', handleInvalidate);
    return () => window.removeEventListener('mySharingInvalidate', handleInvalidate);
  }, [fetchShared]);

  // Refetch when My Sharing panel is opened (so list is fresh without manual refresh)
  useEffect(() => {
    const handlePanelOpened = (event: CustomEvent) => {
      if (event.detail?.panelName === 'mySharing') {
        fetchShared(true);
      }
    };
    window.addEventListener('openProfilePanel', handlePanelOpened as EventListener);
    return () => window.removeEventListener('openProfilePanel', handlePanelOpened as EventListener);
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
      invalidatePanelDataCache(PANEL_CACHE_KEYS.sharing);
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
      invalidatePanelDataCache(PANEL_CACHE_KEYS.sharing);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      toast.success('Note is now private');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to make private. Please try again.');
    } finally {
      setDisablingId(null);
    }
  };

  const spacesCount = ownedSpaces.length;
  const isEmpty = !isLoading && !error && threads.length === 0 && notes.length === 0 && spacesCount === 0;
  const showThreads = activeFilter === 'all' || activeFilter === 'threads';
  const showNotes = activeFilter === 'all' || activeFilter === 'notes';
  const showSpaces = activeFilter === 'all' || activeFilter === 'spaces';
  const hasItemsForFilter =
    activeFilter === 'all' ? threads.length + notes.length + spacesCount > 0 :
    activeFilter === 'threads' ? threads.length > 0 :
    activeFilter === 'notes' ? notes.length > 0 : spacesCount > 0;

  const sharingTabs = [
    { id: 'all', label: 'All', isActive: activeFilter === 'all', count: threads.length + notes.length + spacesCount },
    { id: 'notes', label: 'Notes', isActive: activeFilter === 'notes', count: notes.length },
    { id: 'threads', label: 'Threads', isActive: activeFilter === 'threads', count: threads.length },
    { id: 'spaces', label: 'Spaces', isActive: activeFilter === 'spaces', count: spacesCount }
  ];

  const handleCopySpaceLink = async (space: OwnedSharedSpace) => {
    if (!space.shareUrl) return;
    try {
      await navigator.clipboard.writeText(space.shareUrl);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  const handleOpenSpace = (spaceId: string) => {
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    safeNavigate(idToUrl(spaceId), { history: 'replace' });
  };

  const openThread = (threadId: string) => {
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    safeNavigate(idToUrl(threadId));
  };

  const openNote = (noteId: string) => {
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    safeNavigate(idToUrl(noteId));
  };

  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
      <div className={inBottomSheet ? 'flex-fill flex-stack' : 'flex-stack'} style={{ position: 'relative', gap: 0 }}>
        <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
          <div className="panel__header">
            <div className="panel__title">
              <p>My Sharing</p>
            </div>
          </div>

          <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
            <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
              {isLoading ? (
                <div className="w-full p-8 text-center">
                  <p className="font-sans" style={{ color: 'var(--color-pebble-grey)', fontSize: '16px' }}>
                    Loading…
                  </p>
                </div>
              ) : (
                <SubtleContentMount>
                  {!error && !isEmpty && (
                    <TabNav
                      tabs={sharingTabs}
                      onTabChange={(tabId) => setActiveFilter(tabId as SharingFilter)}
                    />
                  )}

                  {error ? (
                    <div className="w-full p-4 rounded-xl mb-3" style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-pebble-grey)' }}>
                      <p className="text-sm font-sans" style={{ color: 'var(--color-deep-grey)' }}>{error}</p>
                    </div>
                  ) : null}

                  {isEmpty ? (
                    <div className="w-full p-8 text-center">
                      <p className="font-sans" style={{ color: 'var(--color-pebble-grey)', fontSize: '16px', textWrap: 'balance' }}>
                        Turn on sharing from a note, a thread, or a space to see them here
                      </p>
                    </div>
                  ) : null}

                  {!error && activeFilter === 'spaces' && spacesCount === 0 ? (
                    <div className="w-full p-8 text-center">
                      <p className="font-sans" style={{ color: 'var(--color-pebble-grey)', fontSize: '16px', textWrap: 'balance' }}>
                        Spaces you create and invite people to will appear here.
                      </p>
                    </div>
                  ) : null}

                  {!isEmpty && hasItemsForFilter ? (
                    <div className="flex-stack w-full" style={{ gap: '0.5rem' }}>
                      <ul className="flex-stack list-none p-0 m-0" role="list" style={{ gap: '0.5rem' }}>
                        {showThreads && threads.map((thread) => (
                          <li key={thread.id}>
                            <CondensedThreadItem
                              title={thread.title}
                              color={thread.color ?? undefined}
                              isPublic={true}
                              icon="layer-group"
                              onOpen={() => openThread(thread.id)}
                              action={
                                <ActionButton
                                  variant="Remove"
                                  onClick={() => handleDisableThread(thread)}
                                  disabled={disablingId === thread.id}
                                  aria-label={`Make private: ${thread.title}`}
                                  className="w-8 h-8"
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
                              onOpen={() => openNote(note.id)}
                              action={
                                <ActionButton
                                  variant="Remove"
                                  onClick={() => handleDisableNote(note)}
                                  disabled={disablingId === note.id}
                                  aria-label={`Make private: ${note.title}`}
                                  className="w-8 h-8"
                                />
                              }
                            />
                          </li>
                        ))}
                        {showSpaces && ownedSpaces.map((space) => (
                          <li key={`owned-${space.id}`}>
                            <CondensedThreadItem
                              title={space.title}
                              color={space.color ?? undefined}
                              icon="cube"
                              onOpen={() => handleOpenSpace(space.id)}
                              action={
                                <div className="flex-row" style={{ gap: '0.25rem' }}>
                                  {space.shareUrl && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopySpaceLink(space)}
                                      className="text-sm font-semibold px-2 py-1 rounded-lg"
                                      style={{ color: 'var(--color-bold-blue)', backgroundColor: 'transparent' }}
                                      aria-label={`Copy invite link: ${space.title}`}
                                    >
                                      Copy link
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenSpace(space.id)}
                                    className="text-sm font-semibold px-2 py-1 rounded-lg"
                                    style={{ color: 'var(--color-bold-blue)', backgroundColor: 'transparent' }}
                                    aria-label={`Open: ${space.title}`}
                                  >
                                    Open
                                  </button>
                                </div>
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {!isEmpty && !hasItemsForFilter && !(activeFilter === 'spaces' && spacesCount === 0) ? (
                    <div className="w-full p-8 text-center">
                      <p className="font-sans" style={{ color: 'var(--color-pebble-grey)', fontSize: '16px' }}>
                        No {activeFilter === 'threads' ? 'threads' : activeFilter === 'notes' ? 'notes' : 'shared spaces'} yet
                      </p>
                    </div>
                  ) : null}
                </SubtleContentMount>
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
