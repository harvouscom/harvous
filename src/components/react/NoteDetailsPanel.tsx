import React, { useState, useEffect } from 'react';
import CardThread from './CardThread';
import CardNote from './CardNote';
import AddToSection from './AddToSection';
import SquareButton from './SquareButton';
import ActionButton from './ActionButton';
import ButtonSmall from './ButtonSmall';
import NewTagPanel from './NewTagPanel';
import NewThreadPanel from './NewThreadPanel';
import { toast } from '@/utils/toast';

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
}

export default function NoteDetailsPanel({
  noteId,
  noteTitle = "Note Details",
  threads = [],
  allUserThreads = [],
  comments = [],
  tags = [],
  onClose,
  inBottomSheet = false
}: NoteDetailsPanelProps) {
  const [activeTab, setActiveTab] = useState('threads');
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
  
  // Check if this is a scripture note (to show the Notes tab)
  const isScriptureNote = noteType === 'scripture';

  // Fetch data when component mounts
  useEffect(() => {
    if (noteId) {
      setIsInitialLoad(true);
      fetchNoteDetails();
    }
  }, [noteId]);

  const fetchNoteDetails = async (preserveTab: boolean = false) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/notes/${noteId}/details`);
      if (response.ok) {
        const data = await response.json();
        // Use the new threads array from the API response
        setLocalThreads(data.threads || []);
        setLocalAllUserThreads(data.allUserThreads || []);
        setLocalComments(data.comments || []);
        setLocalTags(data.tags || []);
        // Store note metadata
        if (data.note) {
          setNoteCreatedAt(data.note.createdAt ? new Date(data.note.createdAt) : null);
          setNoteSimpleId(data.note.simpleNoteId || null);
          setNoteVersion(data.note.version || null);
          setNoteAddedBy(data.note.addedBy || 'user');
          setNoteType(data.note.noteType || 'default');
          
          // Set default tab to 'notes' for scripture notes only on initial load
          // Preserve current tab during refreshes (e.g., after tag operations)
          if (!preserveTab && isInitialLoad && data.note.noteType === 'scripture') {
            setActiveTab('notes');
          }
        }
        // Set referencing notes (only for scripture notes)
        setLocalReferencingNotes(data.referencingNotes || []);
      }
    } catch (error) {
      // Error fetching note details
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  };

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
        await fetchNoteDetails(true);
        
        // Dispatch note added to thread event
        window.dispatchEvent(new CustomEvent('noteAddedToThread', {
          detail: { noteId, threadId }
        }));
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
          remainingThreadIds = (data.threads || []).map((t: any) => t.id);
        } else {
          // Fallback: update state from current localThreads, preserving current tab
          await fetchNoteDetails(true);
          remainingThreadIds = localThreads
            .filter(t => t.id !== threadId)
            .map(t => t.id);
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
          remainingThreadIds = (data.threads || []).map((t: any) => t.id);
        } else {
          // Fallback: update state from current localThreads, preserving current tab
          await fetchNoteDetails(true);
          remainingThreadIds = localThreads
            .filter(t => t.id !== threadToRemove)
            .map(t => t.id);
        }
        
        // Dispatch note removed from thread event with remaining threads
        window.dispatchEvent(new CustomEvent('noteRemovedFromThread', {
          detail: { noteId, threadId: threadToRemove, remainingThreadIds }
        }));
      } else {
        const error = await response.json();
        
        // If the note is not in this thread, just remove it from UI
        if (error.error === 'Note is not in this thread') {
          setLocalThreads(prev => prev.filter(t => t.id !== threadToRemove));
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
    await fetchNoteDetails(true);
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
    await fetchNoteDetails();
  };

  const handleCloseNewThreadPanel = () => {
    setShowNewThreadPanel(false);
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
        await fetchNoteDetails(true);
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
      <NewThreadPanel
        currentSpace={null}
        onClose={handleCloseNewThreadPanel}
        onThreadCreated={handleThreadCreated}
        noteIdToAdd={noteId}
      />
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
                type="button"
                onClick={handleCancelRemove}
                state="Secondary"
                disabled={isMovingThread}
              >
                Cancel
              </ButtonSmall>
              <ButtonSmall
                type="button"
                onClick={handleConfirmRemove}
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
        
        /* Fix close icon hover for tags - scale on hover */
        .note-details-panel .tag-item .tag-close-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
        }
        
        .note-details-panel .tag-item .tag-close-icon:hover {
          transform: translateY(-50%) scale(1.1) !important;
        }
      `}</style>
      <div className={`note-details-panel panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''} w-full`}>
      {/* Content area that expands to fill available space */}
      <div className="form-layout--expand w-full">
        {/* Panel container */}
        <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
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
                          {`#N${noteSimpleId.toString().padStart(3, '0')}`}
                        </button>
                      )}
                    </div>
                    <div className="panel__metadata-row__right">
                      {noteCreatedAt && (
                        <span className="leading-[normal] text-nowrap">
                          {noteCreatedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                              <span className="badge-number">{localReferencingNotes.length}</span>
                            </div>
                            {activeTab === 'notes' && (
                              <div className="tab-btn__indicator">
                                <div className="tab-btn__indicator-dot"></div>
                              </div>
                            )}
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
                            <span className="badge-number">{localThreads.length}</span>
                          </div>
                          {activeTab === 'threads' && (
                            <div className="tab-btn__indicator">
                              <div className="tab-btn__indicator-dot"></div>
                            </div>
                          )}
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
                            <span className="badge-number">{localTags.length}</span>
                          </div>
                          {activeTab === 'tags' && (
                            <div className="tab-btn__indicator">
                              <div className="tab-btn__indicator-dot"></div>
                            </div>
                          )}
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
                      {localThreads.length === 0 ? (
                        <div className="panel__empty-state">No threads found for this note.</div>
                      ) : (
                        <div className="panel__item-list">
                          {localThreads.map(thread => (
                            <div key={thread.id} className="panel__item-list-item">
                              <a 
                                href={`/${thread.id}`}
                                className="panel__item-list-item-link"
                                aria-label={`View thread: ${thread.title || 'Untitled thread'}`}
                              >
                                <CardThread thread={thread} />
                              </a>
                              {/* Remove from thread button */}
                              <ActionButton
                                variant="Remove"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleRemoveFromThread(thread.id);
                                }}
                                className="panel__item-list-item-actions"
                                disabled={isMovingThread}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Add to Thread Section - fills remaining space */}
                    <div className="tab-content__section--expand">
                      <AddToSection
                        allItems={localAllUserThreads.filter(thread => thread.id !== 'thread_unorganized')}
                        currentItems={localThreads}
                        onItemSelect={handleAddToThread}
                        isLoading={isMovingThread}
                        loadingText="Adding to thread..."
                        title="Add to Thread"
                        placeholder="Find threads to add to..."
                        emptyMessage="No threads found"
                      />
                    </div>
                  </div>
                )}
                    {activeTab === 'tags' && (
                      <div className="tab-content__section">
                        {/* Existing tags */}
                        {localTags.length === 0 ? (
                          <div className="panel__empty-state-with-description">
                            <p>No tags found for this note.</p>
                            <p className="panel__empty-state-description">Tags are automatically generated based on your note content when you create or update notes.</p>
                          </div>
                        ) : (
                          <div className="tag-list">
                            {localTags.map(tag => (
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
                                  {/* Close icon - absolutely positioned, matches RecentSearches pattern */}
                                  <div
                                    onClick={(e: React.MouseEvent) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      removeTagFromNote(tag.id);
                                    }}
                                    className="tag-close-icon absolute top-1/2 right-3 transform -translate-y-1/2 flex items-center justify-center w-4 h-4 cursor-pointer"
                                    data-item-id={tag.id}
                                  >
                                    <svg className="w-4 h-4 fill-current" style={{ color: 'var(--color-deep-grey)' }} viewBox="0 0 384 512">
                                      <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
                                    </svg>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* New Tag Form - always visible like AddToSection */}
                        <NewTagPanel
                          noteId={noteId}
                          onClose={() => {}} // No-op since it's always visible
                          onTagCreated={handleTagCreated}
                          inBottomSheet={inBottomSheet}
                          inline={true}
                        />
                      </div>
                    )}
                    {activeTab === 'notes' && isScriptureNote && (
                      <div className="tab-content__section">
                        {localReferencingNotes.length === 0 ? (
                          <div className="panel__empty-state-with-description">
                            <p>No notes reference this scripture yet.</p>
                            <p className="panel__empty-state-description">When you reference this scripture in other notes, they'll appear here.</p>
                          </div>
                        ) : (
                          <div className="panel__item-list">
                            {localReferencingNotes.map(refNote => (
                              <a
                                key={refNote.id}
                                href={`/${refNote.id}`}
                                className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
                                style={{ touchAction: 'manipulation' }}
                              >
                                <CardNote
                                  title={refNote.noteType === 'resource' && refNote.resourceTitle ? refNote.resourceTitle : (refNote.title || `Note #N${refNote.simpleNoteId?.toString().padStart(3, '0') || 'N/A'}`)}
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
        
        {/* Add Thread button - only show on threads tab */}
        {activeTab === 'threads' && (
          <button 
            type="button"
            onClick={addNewThread}
            data-outer-shadow
            className="btn-cta flex-1 group"
          >
            <span className="btn-cta__content">
              Add Thread
            </span>
            <div className="btn-cta__shadow" />
          </button>
        )}
        
      </div>
      </div>
    </>
  );
}
