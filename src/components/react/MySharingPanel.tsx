import React, { useState, useEffect, useCallback } from 'react';
import SquareButton from './SquareButton';
import { toast } from '@/utils/toast';

interface SharedThread {
  id: string;
  title: string;
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
      toast.success(`Sharing turned off for "${thread.title}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to turn off sharing. Please try again.');
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
      toast.success(`Sharing turned off for "${note.title}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to turn off sharing. Please try again.');
    } finally {
      setDisablingId(null);
    }
  };

  const isEmpty = !isLoading && !error && threads.length === 0 && notes.length === 0;

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
                  <p className="font-sans mb-2" style={{ color: 'var(--color-pebble-grey)', fontSize: '16px' }}>
                    You haven&apos;t shared any threads or notes yet.
                  </p>
                  <p className="font-sans text-sm" style={{ color: 'var(--color-stone-grey)' }}>
                    Turn on sharing from a thread or note to see it here.
                  </p>
                </div>
              )}

              {!isLoading && !isEmpty && (
                <div className="flex flex-col gap-4 w-full">
                  {threads.length > 0 && (
                    <section aria-labelledby="my-sharing-threads-heading">
                      <h2 id="my-sharing-threads-heading" className="text-[12px] font-sans mb-2" style={{ color: 'var(--color-stone-grey)' }}>
                        Threads
                      </h2>
                      <ul className="flex flex-col gap-2 list-none p-0 m-0">
                        {threads.map((thread) => (
                          <li key={thread.id}>
                            <div
                              className="relative rounded-xl w-full overflow-hidden flex items-center gap-3 px-3 py-3 min-h-[56px]"
                              style={{ backgroundColor: 'white' }}
                            >
                              <div className="flex-1 min-w-0">
                                <span className="font-sans text-[16px] font-medium block truncate" style={{ color: 'var(--color-deep-grey)' }}>
                                  {thread.title}
                                </span>
                                <span className="text-[12px] font-sans" style={{ color: 'var(--color-stone-grey)' }}>Thread</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDisableThread(thread)}
                                disabled={disablingId === thread.id}
                                className="shrink-0 rounded-xl px-3 py-2 text-sm font-sans font-medium transition-opacity"
                                style={{
                                  color: 'var(--color-deep-grey)',
                                  backgroundColor: 'var(--color-gradient-gray)',
                                  opacity: disablingId === thread.id ? 0.6 : 1
                                }}
                                aria-label={`Turn off sharing for ${thread.title}`}
                              >
                                {disablingId === thread.id ? 'Turning off...' : 'Turn off sharing'}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {notes.length > 0 && (
                    <section aria-labelledby="my-sharing-notes-heading">
                      <h2 id="my-sharing-notes-heading" className="text-[12px] font-sans mb-2" style={{ color: 'var(--color-stone-grey)' }}>
                        Notes
                      </h2>
                      <ul className="flex flex-col gap-2 list-none p-0 m-0">
                        {notes.map((note) => (
                          <li key={note.id}>
                            <div
                              className="relative rounded-xl w-full overflow-hidden flex items-center gap-3 px-3 py-3 min-h-[56px]"
                              style={{ backgroundColor: 'white' }}
                            >
                              <div className="flex-1 min-w-0">
                                <span className="font-sans text-[16px] font-medium block truncate" style={{ color: 'var(--color-deep-grey)' }}>
                                  {note.title}
                                </span>
                                <span className="text-[12px] font-sans" style={{ color: 'var(--color-stone-grey)' }}>Note</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDisableNote(note)}
                                disabled={disablingId === note.id}
                                className="shrink-0 rounded-xl px-3 py-2 text-sm font-sans font-medium transition-opacity"
                                style={{
                                  color: 'var(--color-deep-grey)',
                                  backgroundColor: 'var(--color-gradient-gray)',
                                  opacity: disablingId === note.id ? 0.6 : 1
                                }}
                                aria-label={`Turn off sharing for ${note.title}`}
                              >
                                {disablingId === note.id ? 'Turning off...' : 'Turn off sharing'}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
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
