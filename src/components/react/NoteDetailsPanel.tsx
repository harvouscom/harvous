import React, { useState, useEffect } from 'react';
import CardThread from './CardThread';
import AddToSection from './AddToSection';
import SquareButton from './SquareButton';

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

interface NoteDetailsPanelProps {
  noteId: string;
  noteTitle?: string;
  threads?: Thread[];
  allUserThreads?: Thread[];
  comments?: Comment[];
  tags?: Tag[];
  onClose?: () => void;
}

export default function NoteDetailsPanel({
  noteId,
  noteTitle = "Note Details",
  threads = [],
  allUserThreads = [],
  comments = [],
  tags = [],
  onClose
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

  // Fetch data when component mounts
  useEffect(() => {
    if (noteId) {
      fetchNoteDetails();
    }
  }, [noteId]);

  const fetchNoteDetails = async () => {
    console.log('NoteDetailsPanel: Fetching note details for:', noteId);
    setIsLoading(true);
    try {
      const response = await fetch(`/api/notes/${noteId}/details`);
      console.log('NoteDetailsPanel: Details API response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('NoteDetailsPanel: Details API response data:', data);
        console.log('NoteDetailsPanel: Threads from API:', data.threads?.length || 0);
        // Use the new threads array from the API response
        setLocalThreads(data.threads || []);
        setLocalAllUserThreads(data.allUserThreads || []);
        setLocalComments(data.comments || []);
        setLocalTags(data.tags || []);
        console.log('NoteDetailsPanel: Updated local threads to:', data.threads?.length || 0);
        console.log('NoteDetailsPanel: Thread titles from API:', data.threads?.map(t => t.title) || []);
        console.log('NoteDetailsPanel: Thread objects with counts:', data.threads?.map(t => ({ title: t.title, count: t.count })) || []);
      } else {
        console.error('NoteDetailsPanel: Details API error:', response.status);
      }
    } catch (error) {
      console.error('NoteDetailsPanel: Error fetching note details:', error);
    } finally {
      setIsLoading(false);
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
    console.log('NoteDetailsPanel: Adding note to thread:', noteId, threadId);
    console.log('NoteDetailsPanel: Current threads before add:', localThreads.length);
    setIsMovingThread(true);
    try {
      console.log('NoteDetailsPanel: Making API call to add-thread...');
      const response = await fetch(`/api/notes/${noteId}/add-thread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threadId }),
        credentials: 'include'
      });

      console.log('NoteDetailsPanel: API response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('NoteDetailsPanel: API response data:', result);
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Note added to thread successfully!',
            type: 'success'
          }
        }));

        // Refresh the note details to show updated threads
        console.log('NoteDetailsPanel: Refreshing note details...');
        await fetchNoteDetails();
        
        // Dispatch note added to thread event
        console.log('🟢 NoteDetailsPanel: Dispatching noteAddedToThread event:', { noteId, threadId });
        window.dispatchEvent(new CustomEvent('noteAddedToThread', {
          detail: { noteId, threadId }
        }));
      } else {
        const error = await response.json();
        console.error('NoteDetailsPanel: API error response:', error);
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: error.error || 'Error adding note to thread',
            type: 'error'
          }
        }));
      }
    } catch (error) {
      console.error('Error adding note to thread:', error);
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
    console.log('NoteDetailsPanel: Removing note from thread:', noteId, threadId);
    console.log('NoteDetailsPanel: Current threads before remove:', localThreads.length);
    
    // If this is the last thread, show confirmation dialog
    if (localThreads.length === 1) {
      setThreadToRemove(threadId);
      setShowRemoveConfirm(true);
      return;
    }
    
    setIsMovingThread(true);
    try {
      console.log('NoteDetailsPanel: Making API call to remove-thread...');
      const response = await fetch(`/api/notes/${noteId}/remove-thread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threadId }),
        credentials: 'include'
      });

      console.log('NoteDetailsPanel: Remove API response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('NoteDetailsPanel: Remove API response data:', result);
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Thread removed from note',
            type: 'success'
          }
        }));

        // Refresh the note details to show updated threads
        console.log('NoteDetailsPanel: Refreshing note details after remove...');
        await fetchNoteDetails();
        
        // Dispatch note removed from thread event
        console.log('🟢 NoteDetailsPanel: Dispatching noteRemovedFromThread event:', { noteId, threadId });
        window.dispatchEvent(new CustomEvent('noteRemovedFromThread', {
          detail: { noteId, threadId }
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
      console.error('Error removing note from thread:', error);
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
      console.log('NoteDetailsPanel: Confirmed removal of last thread:', threadToRemove);
      const response = await fetch(`/api/notes/${noteId}/remove-thread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threadId: threadToRemove }),
        credentials: 'include'
      });

      console.log('NoteDetailsPanel: Remove API response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('NoteDetailsPanel: Remove API response data:', result);
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Note moved to Unorganized thread',
            type: 'success'
          }
        }));

        // Refresh the note details to show updated threads
        console.log('NoteDetailsPanel: Refreshing note details after remove...');
        await fetchNoteDetails();
        console.log('NoteDetailsPanel: After refresh, localThreads count:', localThreads.length);
        
        // Dispatch note removed from thread event
        console.log('🟢 NoteDetailsPanel: Dispatching noteRemovedFromThread event:', { noteId, threadId: threadToRemove });
        window.dispatchEvent(new CustomEvent('noteRemovedFromThread', {
          detail: { noteId, threadId: threadToRemove }
        }));
      } else {
        const error = await response.json();
        console.error('NoteDetailsPanel: Remove API error response:', error);
        
        // If the note is not in this thread, just remove it from UI
        if (error.error === 'Note is not in this thread') {
          console.log('NoteDetailsPanel: Note not in junction table, removing from UI only');
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
      console.error('Error removing note from thread:', error);
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

  const addNewTag = () => {
    // TODO: Implement add new tag functionality
    console.log('Add new tag clicked');
  };

  const removeTagFromNote = (tagId: string) => {
    // TODO: Implement remove tag functionality
    console.log('Remove tag:', tagId);
  };

  return (
    <>
      {/* Confirmation Dialog for Removing Last Thread */}
      {showRemoveConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Remove from Last Thread?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              This is the only thread this note belongs to. Removing it will move the note to the "Unorganized" thread. Are you sure you want to continue?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelRemove}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                disabled={isMovingThread}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemove}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                disabled={isMovingThread}
              >
                {isMovingThread ? 'Moving...' : 'Move to Unorganized'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .card-thread-container {
          background-color: var(--color-fog-white);
        }
        
        .lavender-accent {
          background-color: var(--color-lovely-lavender);
        }
      `}</style>
      <div className="note-details-panel h-full flex flex-col justify-between">
      {/* Content area that expands to fill available space */}
      <div className="flex-1 flex flex-col min-h-0 mb-3.5">
        {/* Single unified panel using CardStack structure */}
        <div className="box-border content-stretch flex flex-col items-start justify-start overflow-clip pb-6 pt-0 px-0 relative rounded-3xl shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] size-full">
          {/* Header section with paper background */}
          <div className="box-border content-stretch flex gap-3 items-center justify-center leading-[0] mb-[-24px] not-italic pb-12 pt-6 px-6 relative shrink-0 text-[var(--color-deep-grey)] w-full" style={{ backgroundColor: 'var(--color-paper)' }}>
            <div className="basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px] text-center">
              <p className="leading-[normal]">Details</p>
            </div>
          </div>
          
          {/* Content area */}
          <div className="basis-0 box-border content-stretch flex flex-col grow items-start justify-start mb-[-24px] min-h-px min-w-px overflow-clip relative shrink-0 w-full">
            <div className="basis-0 bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 grow items-start justify-start min-h-px min-w-px overflow-x-clip overflow-y-auto p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] shrink-0 w-full">
              <div className="basis-0 grow min-h-px min-w-px shrink-0 w-full">

                {/* Tab navigation */}
                <div className="w-full">
                  <div className="flex flex-col gap-3">
                    <div className="tab-nav-container">
                      {/* Tab Navigation */}
                      <div className="flex items-center justify-start gap-0 pb-0 pt-1 px-1 relative w-full overflow-x-auto">
                        <button
                          type="button"
                          className={`flex gap-2 h-11 items-center justify-center overflow-clip px-2 py-3 relative shrink-0 transition-all duration-200 ${
                            activeTab === 'threads' ? 'opacity-100' : 'opacity-50 hover:opacity-75'
                          }`}
                          onClick={() => switchTab('threads')}
                          data-tab-id="threads"
                          data-active={activeTab === 'threads' ? 'true' : 'false'}
                        >
                          <span className="font-sans font-semibold text-[14px] leading-[0] relative shrink-0 text-nowrap text-[#4a473d]">
                            Threads
                          </span>
                          <div className="bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-5 h-5">
                            <span className="text-[12px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[0] badge-number">
                              {localThreads.length}
                            </span>
                          </div>
                          {activeTab === 'threads' && (
                            <div className="absolute bottom-0 left-1/2 translate-x-[-50%] w-1 h-1">
                              <div className="w-1 h-1 bg-[#4a473d] rounded-full"></div>
                            </div>
                          )}
                        </button>
                        
                        <button
                          type="button"
                          className={`flex gap-2 h-11 items-center justify-center overflow-clip px-2 py-3 relative shrink-0 transition-all duration-200 ${
                            activeTab === 'tags' ? 'opacity-100' : 'opacity-50 hover:opacity-75'
                          }`}
                          onClick={() => switchTab('tags')}
                          data-tab-id="tags"
                          data-active={activeTab === 'tags' ? 'true' : 'false'}
                        >
                          <span className="font-sans font-semibold text-[14px] leading-[0] relative shrink-0 text-nowrap text-[#4a473d]">
                            Tags
                          </span>
                          <div className="bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-5 h-5">
                            <span className="text-[12px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[0] badge-number">
                              {localTags.length}
                            </span>
                          </div>
                          {activeTab === 'tags' && (
                            <div className="absolute bottom-0 left-1/2 translate-x-[-50%] w-1 h-1">
                              <div className="w-1 h-1 bg-[#4a473d] rounded-full"></div>
                            </div>
                          )}
                        </button>
                        
                        <button
                          type="button"
                          className={`flex gap-2 h-11 items-center justify-center overflow-clip px-2 py-3 relative shrink-0 transition-all duration-200 ${
                            activeTab === 'comments' ? 'opacity-100' : 'opacity-50 hover:opacity-75'
                          }`}
                          onClick={() => switchTab('comments')}
                          data-tab-id="comments"
                          data-active={activeTab === 'comments' ? 'true' : 'false'}
                        >
                          <span className="font-sans font-semibold text-[14px] leading-[0] relative shrink-0 text-nowrap text-[#4a473d]">
                            Comments
                          </span>
                          <div className="bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-5 h-5">
                            <span className="text-[12px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[0] badge-number">
                              {localComments.length}
                            </span>
                          </div>
                          {activeTab === 'comments' && (
                            <div className="absolute bottom-0 left-1/2 translate-x-[-50%] w-1 h-1">
                              <div className="w-1 h-1 bg-[#4a473d] rounded-full"></div>
                            </div>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Tab Content */}
                {isLoading ? (
                  <div className="text-center py-4 text-gray-500">Loading...</div>
                ) : (
                  <div className="tab-content flex-1 overflow-y-auto p-3">
                {activeTab === 'threads' && (
                  <div className="flex flex-col gap-3">
                    {/* Current Threads - directly below tab */}
                    {localThreads.length === 0 ? (
                      <div className="text-center py-4 text-gray-500">No threads found for this note.</div>
                    ) : (
                      <div className="space-y-3">
                        {localThreads.map(thread => (
                          <div key={thread.id} className="relative group">
                            <a 
                              href={`/${thread.id}`}
                              className="block transition-transform duration-200 hover:scale-[1.002]"
                            >
                              <CardThread thread={thread} />
                            </a>
                            {/* Remove from thread button */}
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRemoveFromThread(thread.id);
                              }}
                              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                              style={{
                                color: 'var(--color-stone-grey)'
                              }}
                              disabled={isMovingThread}
                            >
                              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M5 11h14v2H5z"/>
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add to Thread Section - at the bottom */}
                    <div className="mt-auto">
                      <AddToSection
                        allItems={localAllUserThreads.filter(thread => thread.id !== 'thread_unorganized')}
                        currentItems={localThreads}
                        onItemSelect={handleAddToThread}
                        isLoading={isMovingThread}
                        loadingText="Adding to thread..."
                        title="Add to Thread"
                        placeholder="Search threads to add to..."
                        emptyMessage="No threads found"
                      />
                    </div>
                  </div>
                )}
                    {activeTab === 'comments' && (
                      <div className="flex flex-col items-center justify-center py-12">
                        <div className="text-center">
                          {/* Coming Soon Icon */}
                          <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          </div>
                          
                          {/* Coming Soon Text */}
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            Comments Coming Soon
                          </h3>
                          <p className="text-sm text-gray-500 max-w-sm">
                            We're working on adding comment functionality to notes. This feature will allow you to add notes, feedback, and discussions to your notes.
                          </p>
                        </div>
                      </div>
                    )}
                    {activeTab === 'tags' && (
                      <div className="flex flex-col gap-3">
                        {localTags.length === 0 ? (
                          <div className="text-center py-4 text-gray-500">
                            <p>No tags found for this note.</p>
                            <p className="text-sm mt-1">Tags are automatically generated based on your note content when you create or update notes.</p>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3">
                            {localTags.map(tag => (
                              <div key={tag.id} className="content-item tag-item">
                                <div className="relative nav-item-container">
                                  <button
                                    className="space-button relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 group w-full"
                                    style={{ backgroundImage: 'var(--color-gradient-gray)' }}
                                  >
                                    <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125">
                                      <span className="text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap">
                                        {tag.name}
                                      </span>
                                    </div>
                                  </button>
                                  {/* Close icon - always visible for tags */}
                                  <div
                                    onClick={() => removeTagFromNote(tag.id)}
                                    className="close-icon absolute top-1/2 right-5 transform -translate-y-1/2 flex items-center justify-center w-6 h-6 cursor-pointer"
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
                        
                        {/* New Tag button */}
                        <div className="w-full">
                          <button 
                            type="button"
                            className="bg-[#006eff] box-border content-stretch flex h-[60px] items-center justify-center overflow-clip pb-[28px] pt-6 px-6 relative rounded-3xl shrink-0 w-full"
                            onClick={addNewTag}
                          >
                            <div className="font-sans font-semibold leading-[0] relative shrink-0 text-[#f7f7f6] text-[18px] text-nowrap">
                              New Tag
                            </div>
                            <div className="absolute inset-0 pointer-events-none rounded-3xl shadow-[0px_-4px_0px_0px_rgba(0,0,0,0.1)_inset]"></div>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom close button using SquareButton Back variant */}
      <div className="flex items-center justify-start gap-3">
        <SquareButton 
          variant="Back" 
          onClick={closePanel}
        />
      </div>
      </div>
    </>
  );
}
