import React, { useState, useEffect, useRef } from 'react';
import CardThread from './CardThread';
import CardNote from './CardNote';
import AddToSection from './AddToSection';
import SquareButton from './SquareButton';
import ActionButton from './ActionButton';
import ButtonSmall from './ButtonSmall';
import Icon from './Icon';
import NewTagPanel from './NewTagPanel';
import NewThreadPanel from './NewThreadPanel';
import { toast } from '@/utils/toast';
import { idToUrl } from '@/utils/url-helpers';
import { formatBadgeCount } from '@/utils/badge-count';
import { usePersistedUserId } from '@/utils/user-id';
import { getCachedNoteDetails, setCachedNoteDetails } from '@/utils/note-details-cache';
import { invalidatePanelDataCache, PANEL_CACHE_KEYS } from '@/utils/panel-data-cache';

interface Thread {
  id: string;
  title: string;
  color: string;
  type: string;
  createdAt: string;
  count?: number;
  accentColor?: string;
  lastUpdated?: string;
  isPrivate?: boolean;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
}

interface Tag {
  id: string;
  name: string;
}

interface ReferencingNote {
  id: string;
  title: string | null;
  content: string;
  simpleNoteId: number | null;
  noteType: string;
  createdAt: string;
  updatedAt: string | null;
  resourceTitle?: string | null;
  resourceDescription?: string | null;
  resourceImage?: string | null;
}

interface NoteDetailsPanelProps {
  noteId: string;
  noteTitle?: string;
  threads?: Thread[];
  allUserThreads?: Thread[];
  comments?: Comment[];
  tags?: Tag[];
  onClose?: () => void;
  inBottomSheet?: boolean;
  initialTab?: string;
}

export default function NoteDetailsPanel({
  noteId,
  noteTitle = "Note Details",
  threads = [],
  allUserThreads = [],
  comments = [],
  tags = [],
  onClose,
  inBottomSheet = false,
  initialTab
}: NoteDetailsPanelProps) {
  const [activeTab, setActiveTab] = useState(initialTab || 'threads');
  const [localThreads, setLocalThreads] = useState<Thread[]>(threads);
  const [localAllUserThreads, setLocalAllUserThreads] = useState<Thread[]>(allUserThreads);
  const [localComments, setLocalComments] = useState<Comment[]>(comments);
  const [localTags, setLocalTags] = useState<Tag[]>(tags);
  const [isLoading, setIsLoading] = useState(false);
  const [isMovingThread, setIsMovingThread] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [threadToRemove, setThreadToRemove] = useState<string | null>(null);
  const [noteCreatedAt, setNoteCreatedAt] = useState<Date | null>(null);
  const [noteSimpleId, setNoteSimpleId] = useState<number | null>(null);
  const [noteVersion, setNoteVersion] = useState<string | null>(null);
  const [noteAddedBy, setNoteAddedBy] = useState<string | null>(null);
  const [noteType, setNoteType] = useState<string>('default');
  const [localReferencingNotes, setLocalReferencingNotes] = useState<ReferencingNote[]>([]);
  const [showNewThreadPanel, setShowNewThreadPanel] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [noteUserId, setNoteUserId] = useState<string | null>(null);
  const [isHarvousAdmin, setIsHarvousAdmin] = useState(false);
  const [isRegeneratingTags, setIsRegeneratingTags] = useState(false);
  const [tagsScrollTopFade, setTagsScrollTopFade] = useState(false);
  const tagsScrollRef = useRef<HTMLDivElement | null>(null);

  const currentUserId = usePersistedUserId();

  // Check if this is a scripture note (to show the Notes tab)
  const isScriptureNote = noteType === 'scripture';
  const isUnorganizedThread = (thread: Thread) =>
    thread.id === 'thread_unorganized' || thread.title?.trim().toLowerCase() === 'unorganized';
  const visibleThreads = localThreads.filter((thread) => !isUnorganizedThread(thread));

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/check', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) return { isAdmin: false };
        return res.json().catch(() => ({ isAdmin: true }));
      })
      .then((data: { isAdmin?: boolean }) => {
        if (!cancelled) setIsHarvousAdmin(Boolean(data?.isAdmin));
      })
      .catch(() => {
        if (!cancelled) setIsHarvousAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch data when component mounts; use cache to avoid loading when we have recent data
  useEffect(() => {
    if (!noteId) return;

    setIsInitialLoad(true);
    const cached = getCachedNoteDetails(noteId);

    if (cached) {
      setLocalThreads((cached.threads as Thread[]) || []);
      setLocalAllUserThreads((cached.allUserThreads as Thread[]) || []);
      setLocalComments((cached.comments as Comment[]) || []);
      setLocalTags((cached.tags as Tag[]) || []);
      setLocalReferencingNotes((cached.referencingNotes as ReferencingNote[]) || []);
      if (cached.note) {
        setNoteCreatedAt(cached.note.createdAt ? new Date(cached.note.createdAt) : null);
        setNoteSimpleId(cached.note.simpleNoteId ?? null);
        setNoteVersion(cached.note.version ?? null);
        setNoteAddedBy(cached.note.addedBy || 'user');
        setNoteType(cached.note.noteType || 'default');
        setNoteUserId(cached.note.userId ?? null);
        if (cached.note.noteType === 'scripture' && !initialTab) setActiveTab('notes');
      }
      setIsLoading(false);
      fetchNoteDetails(false, true);
    } else {
      fetchNoteDetails(false, false);
    }
  }, [noteId]);

  /* Tags tab: top fade mask when list overflows and user has scrolled (matches Tiptap / nav column) */
  useEffect(() => {
    if (activeTab !== 'tags') {
      setTagsScrollTopFade(false);
      return;
    }
    const el = tagsScrollRef.current;
    if (!el) return;
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const overflowing = scrollHeight > clientHeight + 1;
      setTagsScrollTopFade(overflowing && scrollTop > 0);
    };
    update();
    let raf = 0;
    raf = requestAnimationFrame(update);
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [activeTab, localTags.length, noteUserId, isLoading]);

  const fetchNoteDetails = async (preserveTab: boolean = false, backgroundRefetch: boolean = false) => {
    if (!backgroundRefetch) setIsLoading(true);
    try {
      const response = await fetch(`/api/notes/${noteId}/details`);
      if (response.ok) {
        const data = await response.json();
        setLocalThreads(data.threads || []);
        setLocalAllUserThreads(data.allUserThreads || []);
        setLocalComments(data.comments || []);
        setLocalTags(data.tags || []);
        if (data.note) {
          setNoteCreatedAt(data.note.createdAt ? new Date(data.note.createdAt) : null);
          setNoteSimpleId(data.note.simpleNoteId || null);
          setNoteVersion(data.note.version || null);
          setNoteAddedBy(data.note.addedBy || 'user');
          setNoteType(data.note.noteType || 'default');
          setNoteUserId(data.note.userId ?? null);
          if (!preserveTab && isInitialLoad && data.note.noteType === 'scripture' && !initialTab) {
            setActiveTab('notes');
          }
        }
        setLocalReferencingNotes(data.referencingNotes || []);
        setCachedNoteDetails(noteId, {
          threads: data.threads || [],
          allUserThreads: data.allUserThreads || [],
          comments: data.comments || [],
          tags: data.tags || [],
          referencingNotes: data.referencingNotes || [],
          note: data.note ? {
            createdAt: data.note.createdAt,
            simpleNoteId: data.note.simpleNoteId,
            version: data.note.version,
            addedBy: data.note.addedBy,
            noteType: data.note.noteType,
            userId: data.note.userId
          } : null
        });
      }
    } catch (error) {
      // Error fetching note details
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  };

  const fetchNoteDetailsRef = useRef(fetchNoteDetails);
  fetchNoteDetailsRef.current = fetchNoteDetails;

  // Refetch threads when add-thread completes from inline navigation (pill / note-link), not from this panel's own flow.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ noteId?: string; source?: string }>).detail;
      if (detail?.noteId !== noteId || detail?.source !== 'inlineAddThread') return;
      void fetchNoteDetailsRef.current(true, true);
    };
    window.addEventListener('noteAddedToThread', handler);
    return () => window.removeEventListener('noteAddedToThread', handler);
  }, [noteId]);

  const switchTab = (tab: string) => {
    setActiveTab(tab);
  };

  const closePanel = () => {
    if (onClose) {
      onClose();
    } else {
      // Dispatch close event if no onClose prop
      window.dispatchEvent(new CustomEvent('closeNoteDetailsPanel'));
    }
  };

  const handleAddToThread = async (threadId: string) => {
    setIsMovingThread(true);
    try {
      const response = await fetch(`/api/notes/${noteId}/add-thread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threadId }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Refresh the note details to show updated threads, preserving current tab
        await fetchNoteDetails(true, true);
        
        // Dispatch note added to thread event
        window.dispatchEvent(new CustomEvent('noteAddedToThread', {
          detail: { noteId, threadId }
        }));
        invalidatePanelDataCache(PANEL_CACHE_KEYS.subscription);
      } else {
        const error = await response.json();
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: error.error || 'Error adding note to thread',
            type: 'error'
          }
        }));
      }
    } catch (error) {
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Error adding note to thread. Please try again.',
          type: 'error'
        }
      }));
    } finally {
      setIsMovingThread(false);
    }
  };

  const handleRemoveFromThread = async (threadId: string) => {
    // If this is the last thread, show confirmation dialog
    if (localThreads.length === 1) {
      setThreadToRemove(threadId);
      setShowRemoveConfirm(true);
      return;
    }
    
    setIsMovingThread(true);
    try {
      const response = await fetch(`/api/notes/${noteId}/remove-thread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threadId }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Thread removed from note',
            type: 'success'
          }
        }));

        // Refresh the note details to show updated threads
        const fetchResponse = await fetch(`/api/notes/${noteId}/details`);
        let remainingThreadIds: string[] = [];
        
        if (fetchResponse.ok) {
          const data = await fetchResponse.json();
          // Update local threads state
          setLocalThreads(data.threads || []);
          setLocalAllUserThreads(data.allUserThreads || []);
          setLocalComments(data.comments || []);
          setLocalTags(data.tags || []);
          
          // Get remaining thread IDs from the updated data
          remainingThreadIds = (data.threads || []).map((t: Thread) => t.id);
        } else {
          // Fallback: update state from current localThreads, preserving current tab
          await fetchNoteDetails(true, true);
          remainingThreadIds = localThreads
            .filter((t: Thread) => t.id !== threadId)
            .map((t: Thread) => t.id);
        }
        
        // Dispatch note removed from thread event with remaining threads
        window.dispatchEvent(new CustomEvent('noteRemovedFromThread', {
          detail: { noteId, threadId, remainingThreadIds }
        }));
      } else {
        const error = await response.json();
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: error.error || 'Error removing note from thread',
            type: 'error'
          }
        }));
      }
    } catch (error) {
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Error removing note from thread. Please try again.',
          type: 'error'
        }
      }));
    } finally {
      setIsMovingThread(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (!threadToRemove) return;
    
    setShowRemoveConfirm(false);
    setIsMovingThread(true);
    
    try {
      const response = await fetch(`/api/notes/${noteId}/remove-thread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threadId: threadToRemove }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Note moved to Unorganized thread',
            type: 'success'
          }
        }));

        // Refresh the note details to show updated threads
        const fetchResponse = await fetch(`/api/notes/${noteId}/details`);
        let remainingThreadIds: string[] = [];
        
        if (fetchResponse.ok) {
          const data = await fetchResponse.json();
          // Update local threads state
          setLocalThreads(data.threads || []);
          setLocalAllUserThreads(data.allUserThreads || []);
          setLocalComments(data.comments || []);
          setLocalTags(data.tags || []);
          
          // Get remaining thread IDs from the updated data
          remainingThreadIds = (data.threads || []).map((t: Thread) => t.id);
        } else {
          // Fallback: update state from current localThreads, preserving current tab
          await fetchNoteDetails(true, true);
          remainingThreadIds = localThreads
            .filter((t: Thread) => t.id !== threadToRemove)
            .map((t: Thread) => t.id);
        }
        
        // Dispatch note removed from thread event with remaining threads
        window.dispatchEvent(new CustomEvent('noteRemovedFromThread', {
          detail: { noteId, threadId: threadToRemove, remainingThreadIds }
        }));
      } else {
        const error = await response.json();
        
        // If the note is not in this thread, just remove it from UI
        if (error.error === 'Note is not in this thread') {
          setLocalThreads((prev: Thread[]) => prev.filter((t: Thread) => t.id !== threadToRemove));
          window.dispatchEvent(new CustomEvent('toast', {
            detail: {
              message: 'Note moved to Unorganized thread',
              type: 'success'
            }
          }));
        } else {
          window.dispatchEvent(new CustomEvent('toast', {
            detail: {
              message: error.error || 'Error removing note from thread',
              type: 'error'
            }
          }));
        }
      }
    } catch (error) {
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Error removing note from thread. Please try again.',
          type: 'error'
        }
      }));
    } finally {
      setIsMovingThread(false);
      setThreadToRemove(null);
    }
  };

  const handleCancelRemove = () => {
    setShowRemoveConfirm(false);
    setThreadToRemove(null);
  };

  const handleTagCreated = async () => {
    // Refresh the note details to show the new tag, preserving current tab
    await fetchNoteDetails(true, true);
  };

  const handleRegenerateTags = async () => {
    if (!noteId || isRegeneratingTags) return;
    setIsRegeneratingTags(true);
    try {
      const response = await fetch('/api/admin/regenerate-note-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ noteId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        applied?: number;
        suggestionCount?: number;
        errors?: string[];
      };
      if (!response.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Could not regenerate tags');
        return;
      }
      const applied = typeof data.applied === 'number' ? data.applied : 0;
      const suggestionCount = typeof data.suggestionCount === 'number' ? data.suggestionCount : 0;
      if (applied > 0) {
        toast.success(`Applied ${applied} tag${applied === 1 ? '' : 's'}`);
      } else if (suggestionCount === 0) {
        toast.info('No Bible study keywords matched this note text');
      } else {
        const firstErr = Array.isArray(data.errors) && typeof data.errors[0] === 'string' ? data.errors[0] : null;
        toast.error(
          firstErr ?? 'Tags were suggested but could not be saved; try again or check the server logs',
        );
      }
      await fetchNoteDetails(true, true);
    } catch {
      toast.error('Could not regenerate tags');
    } finally {
      setIsRegeneratingTags(false);
    }
  };

  const addNewThread = () => {
    setShowNewThreadPanel(true);
  };

  const handleThreadCreated = async () => {
    // Show success toast
    toast.success('Thread created!');
    // Close the NewThreadPanel first
    setShowNewThreadPanel(false);
    // Small delay to ensure state updates
    await new Promise(resolve => setTimeout(resolve, 50));
    // Ensure we're on the threads tab
    setActiveTab('threads');
    // Refresh the note details to show updated threads
    await fetchNoteDetails(false, true);
  };

  const handleCloseNewThreadPanel = () => {
    setShowNewThreadPanel(false);
    // Ensure threads tab is active when returning
    setActiveTab('threads');
  };

  const removeTagFromNote = async (tagId: string) => {
    try {
      const response = await fetch(`/api/note-tags/remove?noteId=${noteId}&tagId=${tagId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        toast.success('Tag removed from note');
        
        // Refresh the note details to show updated tags, preserving current tab
        await fetchNoteDetails(true, true);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error removing tag from note');
      }
    } catch (error) {
      toast.error('Error removing tag from note. Please try again.');
    }
  };

  // If showing new thread panel, render it instead of the details panel
  if (showNewThreadPanel) {
    return (
      <div className={`note-details-panel panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''} w-full`}>
        <div className="form-layout--expand w-full h-full">
          <NewThreadPanel
            currentSpace={null}
            onClose={handleCloseNewThreadPanel}
            onThreadCreated={handleThreadCreated}
            noteIdToAdd={noteId}
            useBackButton={true}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Confirmation Dialog for Removing Last Thread */}
      {showRemoveConfirm && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <h3 className="modal-title">
              Remove from Last Thread?
            </h3>
            <p className="modal-body">
              This is the only thread this note belongs to. Removing it will move the note to the "Unorganized" thread. Are you sure you want to continue?
            </p>
            <div className="modal-footer">
              <ButtonSmall
                {...({ onClick: handleCancelRemove } as any)}
                state="Secondary"
                disabled={isMovingThread}
              >
                Cancel
              </ButtonSmall>
              <ButtonSmall
                {...({ onClick: handleConfirmRemove } as any)}
                state="Delete"
                disabled={isMovingThread}
              >
                {isMovingThread ? 'Moving...' : 'Move to Unorganized'}
              </ButtonSmall>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .card-thread-container {
          background-color: var(--color-snow-white);
        }
        
        .lavender-accent {
          background-color: var(--color-purple);
        }
        
        /* Fix close icon hover for tags - scale on hover (stacking: panels.css z-index 1) */
        .note-details-panel .tag-item .tag-close-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .note-details-panel .tag-item .tag-close-icon:hover {
          transform: translateY(-50%) scale(1.1) !important;
        }
      `}</style>
      <div className={`note-details-panel panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''} w-full`}>
      {/* Content area that expands to fill available space */}
      <div className="form-layout--expand w-full" style={{ position: 'relative' }}>
        {/* Panel container */}
        <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''} ${isLoading ? 'opacity-60 pointer-events-none' : ''}`}>
          {/* Header section */}
          <div className="panel__header">
            <div className="panel__title">
              <p>Details</p>
            </div>
          </div>
          
          {/* Content area */}
          <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
            <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
              <div className="w-full form-layout--expand">

                {/* Note Metadata - ID, Source, and Date */}
                {(noteCreatedAt || noteSimpleId || noteAddedBy) && (
                  <div className="panel__metadata-row">
                    <div className="panel__metadata-row__left">
                      {noteSimpleId && (
                        <button
                          onClick={async () => {
                            const noteIdText = `N${noteSimpleId.toString().padStart(3, '0')}`;
                            try {
                              await navigator.clipboard.writeText(noteIdText);
                              toast.success(`Copied ${noteIdText} to clipboard`);
                            } catch (err) {
                              toast.error('Failed to copy note ID');
                            }
                          }}
                          className="text-metadata cursor-pointer"
                          title="Click to copy note ID"
                        >
                          {`N${noteSimpleId.toString().padStart(3, '0')}`}
                        </button>
                      )}
                    </div>
                    <div className="panel__metadata-row__right">
                      {noteCreatedAt && (
                        <span className="leading-[normal] text-nowrap">
                          {/* Hard-coded month names avoid iOS PWA locale issues */}
                          {(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[noteCreatedAt.getMonth()]} {noteCreatedAt.getDate()}, {noteCreatedAt.getFullYear()}
                        </span>
                      )}
                      {noteCreatedAt && noteAddedBy && (
                        <span className="leading-[normal]" style={{ color: 'rgba(136, 134, 128, 0.3)' }}>|</span>
                      )}
                      {noteAddedBy && (
                        <span className="leading-[normal] text-nowrap">
                          {noteAddedBy === 'harvous' ? 'Added by Harvous' : 'Added by you'}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab navigation */}
                <div className="w-full">
                  <div className="panel__section">
                    <div className="tab-nav-container">
                      {/* Tab Navigation */}
                      <div className="tab-nav">
                        {/* Notes tab - first for scripture notes */}
                        {isScriptureNote && (
                          <button
                            type="button"
                            className={`tab-btn ${activeTab === 'notes' ? 'tab-btn--active' : 'tab-btn--inactive'}`}
                            onClick={() => switchTab('notes')}
                            data-tab-id="notes"
                            data-active={activeTab === 'notes' ? 'true' : 'false'}
                          >
                            <span className="tab-btn__label">Notes</span>
                            <div className="badge-count">
                              <span className="badge-number">{formatBadgeCount(localReferencingNotes.length)}</span>
                            </div>
                          </button>
                        )}
                        
                        <button
                          type="button"
                          className={`tab-btn ${activeTab === 'threads' ? 'tab-btn--active' : 'tab-btn--inactive'}`}
                          onClick={() => switchTab('threads')}
                          data-tab-id="threads"
                          data-active={activeTab === 'threads' ? 'true' : 'false'}
                        >
                          <span className="tab-btn__label">Threads</span>
                          <div className="badge-count">
                            <span className="badge-number">{formatBadgeCount(visibleThreads.length)}</span>
                          </div>
                        </button>

                        <button
                          type="button"
                          className={`tab-btn ${activeTab === 'tags' ? 'tab-btn--active' : 'tab-btn--inactive'}`}
                          onClick={() => switchTab('tags')}
                          data-tab-id="tags"
                          data-active={activeTab === 'tags' ? 'true' : 'false'}
                        >
                          <span className="tab-btn__label">Tags</span>
                          <div className="badge-count">
                            <span className="badge-number">{formatBadgeCount(localTags.length)}</span>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Tab Content */}
                {isLoading ? (
                  <div className="panel__loading-state">Loading...</div>
                ) : (
                  <div className="tab-content flex-1 min-h-0 flex flex-col">
                {activeTab === 'threads' && (
                  <div className="tab-content__section flex-1 min-h-0 flex flex-col">
                    {/* Current Threads - directly below tab */}
                    <div className="tab-content__section--shrink">
                      {visibleThreads.length === 0 ? (
                        <div className="panel__empty-state">No threads found for this note</div>
                      ) : (
                        <div className="panel__item-list">
                          {visibleThreads.map((thread: Thread) => (
                            <div key={thread.id} className="panel__item-list-item">
                              <a 
                                href={idToUrl(thread.id)}
                                className="panel__item-list-item-link"
                                aria-label={`View thread: ${thread.title || 'Untitled thread'}`}
                              >
                                <CardThread thread={thread} />
                              </a>
                              {/* Remove from thread button - only for notes the current user owns */}
                              {noteUserId === currentUserId && (
                                <ActionButton
                                  variant="Remove"
                                  {...({ onClick: (e: any) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleRemoveFromThread(thread.id);
                                  } } as any)}
                                  className="panel__item-list-item-actions"
                                  disabled={isMovingThread}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Add to Thread Section - only for notes the current user owns */}
                    {noteUserId === currentUserId && (
                      <div className="tab-content__section--expand" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <AddToSection
                          allItems={localAllUserThreads.filter((thread: Thread) => {
                            if (thread.id === 'thread_unorganized') return false;
                            return thread.title?.trim().toLowerCase() !== 'unorganized';
                          })}
                          currentItems={localThreads}
                          onItemSelect={handleAddToThread}
                          isLoading={isMovingThread}
                          loadingText="Adding to thread..."
                          title="Add to Thread"
                          placeholder="Find threads to add to..."
                          emptyMessage="No threads found"
                        />
                      </div>
                    )}
                  </div>
                )}
                    {activeTab === 'tags' && (
                      <div className="tab-content__section note-details-panel__tags-tab flex-1 min-h-0 flex flex-col">
                        <div
                          ref={tagsScrollRef}
                          className={`note-details-panel__tags-scroll${tagsScrollTopFade ? ' note-details-panel__tags-scroll--top-fade' : ''}`}
                        >
                          <div className="note-details-panel__tags-body">
                            {localTags.length === 0 ? (
                              <div className="panel__empty-state-with-description">
                                <p>No tags found for this note</p>
                                <p className="panel__empty-state-description">Tags are automatically generated based on your note content when you create or update notes</p>
                              </div>
                            ) : (
                              <div className="tag-list">
                                {localTags.map((tag: Tag) => (
                                  <div key={tag.id} className="content-item tag-item">
                                    <div className="relative nav-item-container">
                                      <div className="btn btn--tag group w-auto">
                                        <div className="btn__content">
                                          <span className="whitespace-nowrap">
                                            {tag.name}
                                          </span>
                                        </div>
                                        <div className="btn__shadow-overlay" />
                                      </div>
                                      {/* Close icon - only for notes the current user owns */}
                                      {noteUserId === currentUserId && (
                                        <div
                                          onClick={(e: any) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            removeTagFromNote(tag.id);
                                          }}
                                          className="tag-close-icon absolute top-1/2 right-3 transform -translate-y-1/2 flex-center w-4 h-4 cursor-pointer"
                                          data-item-id={tag.id}
                                        >
                                          <svg className="w-4 h-4 fill-current" style={{ color: 'var(--color-deep-grey)' }} viewBox="0 0 384 512">
                                            <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
                                          </svg>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {noteUserId === currentUserId && (
                            <div className="note-details-panel__tags-compose-sticky">
                              <NewTagPanel
                                noteId={noteId}
                                onClose={() => {}} // No-op since it's always visible
                                onTagCreated={handleTagCreated}
                                inBottomSheet={inBottomSheet}
                                inline={true}
                              />
                            </div>
                          )}
                        </div>

                        {isHarvousAdmin && noteUserId === currentUserId && (
                          <div className="edit-space-panel__admin-section shrink-0">
                            <div className="edit-space-panel__admin-header">
                              <span className="edit-space-panel__admin-label">Admin</span>
                            </div>
                            <button
                              type="button"
                              onClick={handleRegenerateTags}
                              disabled={isRegeneratingTags || isLoading}
                              className="note-details-panel__admin-regen-btn space-button relative rounded-3xl h-[64px] w-full transition-[scale,shadow] duration-300"
                              style={{ backgroundImage: 'var(--color-gradient-gray)' }}
                            >
                              <div className="relative w-full h-full pl-4 pr-4 transition-transform duration-125 min-w-0 flex flex-row items-center justify-center gap-3">
                                <Icon
                                  name="arrows-rotate"
                                  size={18}
                                  style={{ color: 'var(--color-deep-grey)', flexShrink: 0 }}
                                />
                                <span className="text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap">
                                  {isRegeneratingTags ? 'Regenerating…' : 'Regenerate tags'}
                                </span>
                              </div>
                              <div
                                className="absolute inset-0 pointer-events-none rounded-3xl transition-shadow duration-125 shadow-[0px_-2.622px_0px_0px_inset_rgba(176,176,176,0.25)]"
                                aria-hidden
                              />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {activeTab === 'notes' && isScriptureNote && (
                      <div className="tab-content__section">
                        {localReferencingNotes.length === 0 ? (
                          <div className="panel__empty-state">No notes reference this scripture yet</div>
                        ) : (
                          <div className="panel__item-list">
                            {localReferencingNotes.map((refNote: ReferencingNote) => (
                              <a
                                key={refNote.id}
                                href={idToUrl(refNote.id)}
                                className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
                                style={{ touchAction: 'manipulation' }}
                              >
                                <CardNote
                                  title={refNote.noteType === 'resource' && refNote.resourceTitle ? refNote.resourceTitle : (refNote.title || `Note N${refNote.simpleNoteId?.toString().padStart(3, '0') || 'N/A'}`)}
                                  content={refNote.noteType === 'resource' && refNote.resourceDescription ? refNote.resourceDescription : refNote.content}
                                  noteType={(refNote.noteType === 'scripture' || refNote.noteType === 'resource') ? refNote.noteType : 'default'}
                                  resourceTitle={refNote.noteType === 'resource' ? (refNote.resourceTitle || null) : undefined}
                                  resourceDescription={refNote.noteType === 'resource' ? (refNote.resourceDescription || null) : undefined}
                                  resourceImage={refNote.noteType === 'resource' ? (refNote.resourceImage || null) : undefined}
                                />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="panel__footer--buttons">
        {/* Back button - SquareButton Back variant */}
        <SquareButton 
          variant="Back"
          onClick={closePanel}
          inBottomSheet={inBottomSheet}
        />
        
        {/* Show New Thread button only on Threads tab */}
        {activeTab === 'threads' && (
          <button 
            type="button"
            onClick={addNewThread}
            data-outer-shadow
            className="btn-cta btn--secondary flex-1 group"
          >
            <span className="btn-cta__content">
              New thread
            </span>
            <div className="btn-cta__shadow" />
          </button>
        )}
      </div>
      </div>
    </>
  );
}
