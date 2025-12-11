import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import ButtonSmall from './ButtonSmall';
import { safeNavigate } from '@/utils/safe-navigate';
import '@/styles/card-full-editable.css';
import Icon from './Icon';

// Lazy load TiptapEditor to reduce initial bundle size - only loads when user enters edit mode
const TiptapEditor = lazy(() => import('./TiptapEditor'));

interface CardFullEditableProps {
  title: string;
  content: string;
  date: string;
  noteId?: string;
  noteType?: 'default' | 'scripture' | 'resource';
  version?: string;
  className?: string;
  isEditable?: boolean;
  onSave?: (title: string, content: string) => Promise<any>;
}

export default function CardFullEditable({ 
  title, 
  content, 
  date, 
  noteId,
  noteType = 'default',
  version,
  className = '',
  isEditable = true,
  onSave 
}: CardFullEditableProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [displayTitle, setDisplayTitle] = useState(title);
  const [displayContent, setDisplayContent] = useState(content);
  
  const titleInputRef = useRef<HTMLInputElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const contentDisplayRef = useRef<HTMLDivElement>(null);
  const editorInstanceRef = useRef<any>(null);
  const shouldFocusEditorRef = useRef(false);
  const saveChangesRef = useRef<() => void>(() => {});
  const [scrollPosition, setScrollPosition] = useState(0);
  const [parentThreadId, setParentThreadId] = useState<string | undefined>(undefined);

  // Initialize display content
  useEffect(() => {
    setDisplayTitle(title);
    setDisplayContent(content);
  }, [title, content]);

  // Focus handling is now done directly in startEditing
  // This useEffect is kept for backward compatibility but focusTarget is no longer used

  // Listen for keyboard shortcut to start editing
  useEffect(() => {
    const handleEditNote = () => {
      if (!isEditing && isEditable) {
        // Save current scroll position
        if (contentDisplayRef.current) {
          const currentScroll = contentDisplayRef.current.scrollTop;
          setScrollPosition(currentScroll);
        }
        
        setEditTitle(displayTitle);
        setEditContent(displayContent);
        setIsEditing(true);
        setHasChanges(false);
        
        // Focus editor when it's ready
        shouldFocusEditorRef.current = true;
      }
    };
    
    window.addEventListener('editNote', handleEditNote);
    return () => {
      window.removeEventListener('editNote', handleEditNote);
    };
  }, [isEditing, isEditable, displayTitle, displayContent]);

  // Listen for hyperlink creation event
  useEffect(() => {
    const handleCreateHyperlink = (event: CustomEvent) => {
        const { sourceNoteId, newNoteId, from, to } = event.detail;

        if (sourceNoteId === noteId && editorInstanceRef.current) {
            const editor = editorInstanceRef.current;
            
            // Check if editor is still valid (not destroyed)
            if (!editor || editor.isDestroyed) return;
            if (!editor.view || !editor.view.docView) return;
            
            try {
              // Use Tiptap API to apply the mark
              editor.chain()
                  .focus()
                  .setTextSelection({ from, to })
                  .unsetAllMarks()
                  .setMark('noteLink', { noteId: newNoteId })
                  .setTextSelection(to)  // Move cursor to end of link
                  .unsetAllMarks()        // Clear marks so new text isn't linked
                  .run();

              // After applying the mark, the content has changed. Trigger a save.
              // A small delay ensures the editor update is processed before getting HTML
              setTimeout(() => {
                  // Check again if editor is still valid
                  if (!editor || editor.isDestroyed) return;
                  if (!editor.view || !editor.view.docView) return;
                  
                  try {
                    const updatedContent = editor.getHTML();
                    setEditContent(updatedContent); // Update local state
                    
                    // Trigger save
                    if (onSave) {
                        onSave(editTitle, updatedContent);
                    } else {
                        const globalCallback = (window as any).noteSaveCallback;
                        if (globalCallback) {
                            globalCallback(editTitle, updatedContent);
                        }
                    }

                    // Show a temporary confirmation
                    window.dispatchEvent(new CustomEvent('toast', {
                        detail: {
                            message: 'Link created in source note.',
                            type: 'success'
                        }
                    }));
                  } catch (e) {
                    // Ignore errors during save
                  }
              }, 50);
            } catch (e) {
              // Ignore errors during hyperlink creation
            }
        }
    };

    window.addEventListener('createHyperlink', handleCreateHyperlink as EventListener);

    return () => {
        window.removeEventListener('createHyperlink', handleCreateHyperlink as EventListener);
    };
}, [noteId, onSave, editTitle]); // Dependencies

  // Detect parent thread ID from DOM when editing starts
  useEffect(() => {
    if (isEditing) {
      // Try to find parent thread ID from data attributes
      // First, check if current element or parent has data-parent-thread-id
      const cardElement = document.querySelector('[data-card-full-editable]');
      let detectedThreadId: string | undefined;
      
      // Check parent elements for data-parent-thread-id
      if (cardElement) {
        const parentWithThreadId = cardElement.closest('[data-parent-thread-id]');
        if (parentWithThreadId) {
          detectedThreadId = (parentWithThreadId as HTMLElement).dataset.parentThreadId;
        } else {
          // Fallback: check for data-note-id element
          const noteElement = document.querySelector('[data-note-id]');
          if (noteElement && (noteElement as HTMLElement).dataset.parentThreadId) {
            detectedThreadId = (noteElement as HTMLElement).dataset.parentThreadId;
          }
        }
      }
      
      // Default to unorganized if not found
      setParentThreadId(detectedThreadId || 'thread_unorganized');
    }
  }, [isEditing]);


  const startEditing = (focus: 'title' | 'content' = 'title') => {
    // Save current scroll position
    if (contentDisplayRef.current) {
      const currentScroll = contentDisplayRef.current.scrollTop;
      setScrollPosition(currentScroll);
    }
    
    setEditTitle(displayTitle);
    setEditContent(displayContent);
    setIsEditing(true);
    setHasChanges(false);
    
    // Set flag to focus editor when it's ready
    if (focus === 'content') {
      shouldFocusEditorRef.current = true;
    }
    
    // Focus immediately after state update
    if (focus === 'title') {
      // Use requestAnimationFrame to ensure input is rendered
      requestAnimationFrame(() => {
        if (titleInputRef.current) {
          titleInputRef.current.focus();
        }
      });
    }
  };

  // Handle editor ready callback
  const handleEditorReady = (editor: any) => {
    if (!editor) return;
    
    editorInstanceRef.current = editor;
    // Focus if we should focus the editor
    if (shouldFocusEditorRef.current) {
      shouldFocusEditorRef.current = false;
      requestAnimationFrame(() => {
        // Check if editor is still valid (not destroyed)
        if (!editor || editor.isDestroyed) return;
        
        // Check if view and docView are still valid
        if (!editor.view || !editor.view.docView) return;
        
        try {
          editor.commands.focus();
          // Move cursor to end of content to avoid getting stuck on scripture pills
          try {
            const doc = editor.state.doc;
            const endPos = doc.content.size;
            editor.commands.setTextSelection(endPos);
          } catch (e) {
            // If setting selection fails, just focus
          }
        } catch (e) {
          // Ignore errors during focus
        }
      });
    }
    // Note: Scripture detection is handled by TiptapEditor's useEffect
    // when content is loaded, so we don't need to trigger it here
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditTitle(displayTitle);
    setEditContent(displayContent);
    setHasChanges(false);
  };

  const saveChanges = async () => {
    if (!hasChanges) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);

    try {
      // Get content directly from Tiptap editor to ensure all marks (including scripture pills) are preserved
      let editorContent = editContent;
      
      // First, try to get content from editor instance (most reliable)
      if (editorInstanceRef.current) {
        editorContent = editorInstanceRef.current.getHTML();
      } else {
        // Fallback to hidden input or state
        const hiddenInput = document.querySelector('#edit-note-content') as HTMLInputElement;
        if (hiddenInput && hiddenInput.value) {
          editorContent = hiddenInput.value;
        }
      }

      let saveResult: any = null;
      if (onSave) {
        saveResult = await onSave(editTitle, editorContent);
      } else {
        // Fallback to global save callback
        const globalCallback = (window as any).noteSaveCallback;
        if (globalCallback) {
          saveResult = await globalCallback(editTitle, editorContent);
        }
      }

      // Handle scripture results from the update endpoint
      // Show a single summary toast for created scripture notes
      if (saveResult && saveResult.scriptureResults && saveResult.scriptureResults.length > 0) {
        const createdScriptures = saveResult.scriptureResults.filter(
          (r: any) => r.action === 'created'
        );
        
        if (createdScriptures.length > 0 && window.toast) {
          const message = createdScriptures.length === 1
            ? `Created scripture note: ${createdScriptures[0].reference}`
            : `Created ${createdScriptures.length} scripture notes`;
          window.toast.info(message);
        }
      }

      // After save, update editor with processedContent (which has all pills as HTML spans)
      // Then convert those HTML spans to marks so they display correctly
      if (saveResult.processedContent && editorInstanceRef.current) {
        // Update editor with processed content (has pills as HTML spans)
        editorInstanceRef.current.commands.setContent(saveResult.processedContent, { emitUpdate: false });
        
        // Convert HTML spans to marks after a short delay, then update display
        setTimeout(async () => {
          if (editorInstanceRef.current) {
            const { convertNoteLinksToScripturePills } = await import('./TiptapEditor');
            await convertNoteLinksToScripturePills(editorInstanceRef.current);
            // Get updated HTML with marks
            const finalContent = editorInstanceRef.current.getHTML();
            
            // Update display content with the final content
            setDisplayTitle(editTitle);
            setDisplayContent(finalContent);
            setIsEditing(false);
            setHasChanges(false);
          }
        }, 200);
      } else {
        // No processed content, just use editor's current HTML
        if (editorInstanceRef.current) {
          editorContent = editorInstanceRef.current.getHTML();
        }
        
        // Update display content
        setDisplayTitle(editTitle);
        setDisplayContent(editorContent);
        setIsEditing(false);
        setHasChanges(false);
      }
    } catch (error) {
      // Show error toast
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Error saving note. Please try again.',
          type: 'error'
        }
      }));
    } finally {
      setIsSaving(false);
    }
  };

  // Keep saveChangesRef up to date with the latest saveChanges function
  useEffect(() => {
    saveChangesRef.current = saveChanges;
  });

  // Listen for keyboard shortcut to save when editing (Cmd+S)
  useEffect(() => {
    const handleSaveContent = () => {
      // Only save if we're in edit mode, have changes, and not already saving
      if (isEditing && hasChanges && !isSaving) {
        saveChangesRef.current();
      }
    };
    
    window.addEventListener('saveContent', handleSaveContent);
    return () => {
      window.removeEventListener('saveContent', handleSaveContent);
    };
  }, [isEditing, hasChanges, isSaving]);

  // Listen for Cmd+Enter to save (dispatched from TiptapEditor)
  useEffect(() => {
    const handleSubmitPanelForm = () => {
      // Only save if we're in edit mode and not already saving
      // Use saveChangesRef to always call the latest version with current state
      if (isEditing && !isSaving) {
        saveChangesRef.current();
      }
    };
    
    window.addEventListener('submitPanelForm', handleSubmitPanelForm);
    return () => {
      window.removeEventListener('submitPanelForm', handleSubmitPanelForm);
    };
  }, [isEditing, isSaving]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      cancelEdit();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      saveChanges();
    } else {
      // Handle Select All for title input (Cmd+A on Mac, Ctrl+A on Windows/Linux)
      const target = e.target as HTMLInputElement;
      if (target === titleInputRef.current) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
          e.preventDefault();
          target.select();
          return;
        }
        
        // Auto-capitalize first letter for title input
        // Check if cursor is at the start of the title input
        if (target.selectionStart === 0 && target.selectionEnd === 0) {
          // Cursor is at the start
          if (e.key.length === 1 && /^[a-z]$/.test(e.key)) {
            e.preventDefault();
            const capitalized = e.key.toUpperCase();
            // If title is empty, set it to the capitalized letter
            // Otherwise, insert the capitalized letter at the start
            if (editTitle.length === 0) {
              setEditTitle(capitalized);
            } else {
              setEditTitle(capitalized + editTitle);
            }
            // Set cursor position after the capitalized letter
            setTimeout(() => {
              if (titleInputRef.current) {
                titleInputRef.current.setSelectionRange(1, 1);
              }
            }, 0);
          }
        }
      }
    }
  };

  const handleContentChange = (newContent: string) => {
    setEditContent(newContent);
    setHasChanges(editTitle !== displayTitle || newContent !== displayContent);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditTitle(e.target.value);
    setHasChanges(e.target.value !== displayTitle || editContent !== displayContent);
  };

  const handleContentClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    // Check if click is on a scripture pill
    const target = e.target as HTMLElement;
    const pillElement = target.closest('.scripture-pill');
    
    if (pillElement) {
      const noteId = pillElement.getAttribute('data-note-id');
      const reference = pillElement.getAttribute('data-scripture-reference');
      
      if (noteId) {
        // Navigate to the note (with lazy recreation if needed)
        e.preventDefault();
        e.stopPropagation();
        
        // Check if note exists, and recreate if needed
        let targetNoteId = noteId;
        
        try {
          const checkResponse = await fetch(`/api/notes/${noteId}/details`, {
            method: 'GET',
            credentials: 'include'
          });
          
          // If note doesn't exist and we have a reference, recreate it
          if (!checkResponse.ok && reference) {
            const normalizedRef = reference;
            
            // Get parent thread ID from DOM (the thread this note belongs to)
            const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
            const parentThreadId = noteElement?.dataset.parentThreadId || 'thread_unorganized';
            
            // Fetch verse text first
            let verseText = reference;
            try {
              const verseResponse = await fetch('/api/scripture/fetch-verse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: normalizedRef }),
                credentials: 'include'
              });

              if (verseResponse.ok) {
                const verseData = await verseResponse.json();
                verseText = verseData.text || reference;
              }
            } catch (error) {
              console.error('Error fetching verse text:', error);
            }

            // Create new note with verse text as content
            // Use parent thread ID so the recreated note is in the same thread as the current note
            const formData = new FormData();
            formData.set('content', verseText);
            formData.set('title', reference);
            formData.set('threadId', parentThreadId);
            formData.set('noteType', 'scripture');
            formData.set('scriptureReference', normalizedRef);
            formData.set('scriptureVersion', 'NET');

            const createResponse = await fetch('/api/notes/create', {
              method: 'POST',
              body: formData,
              credentials: 'include'
            });

            if (createResponse.ok) {
              const result = await createResponse.json();
              if (result.note && result.note.id) {
                targetNoteId = result.note.id;
                // Show success toast
                if (window.toast) {
                  window.toast.success(`Scripture note restored: ${reference}`);
                }
              }
            }
          }
        } catch (error) {
          console.error('Error checking/restoring note:', error);
        }
        
        safeNavigate(`/${targetNoteId}`, { history: 'replace' });
        return;
      }
    }
    
    // If not a scripture pill, enter edit mode
    startEditing('content');
  };

  return (
    <>
      <div 
        className={`card-full-editable ${className}`}
        style={{ maxHeight: '100%' }}
        data-card-full-editable
      >
      {/* Header with title, version (scripture only), and bookmark icon */}
      <div className="box-border content-stretch flex gap-3 items-center px-3 py-0 relative shrink-0 w-full">
        <div className="basis-0 font-sans font-bold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]">
          {/* Display mode */}
          {!isEditing ? (
            <p 
              className="cursor-pointer rounded"
              style={{
                lineHeight: '1.2',
                margin: '-4px -8px',
                padding: '4px 8px',
                display: 'block',
                width: '100%',
                fontSize: '24px',
                fontWeight: '700',
                fontFamily: 'var(--font-sans)',
                color: 'var(--color-deep-grey)',
                boxSizing: 'border-box',
                minHeight: '28.8px',
                height: 'auto',
                verticalAlign: 'middle'
              }}
              onClick={() => startEditing('title')}
            >
              {displayTitle}
            </p>
          ) : (
            <input 
              ref={titleInputRef}
              value={editTitle}
              onChange={handleTitleChange}
              type="text"
              className="w-full bg-transparent border-0 rounded focus:outline-none font-bold"
              style={{
                lineHeight: '1.2',
                margin: '-4px -8px',
                padding: '4px 8px',
                fontSize: '24px',
                fontWeight: '700',
                fontFamily: 'var(--font-sans)',
                color: 'var(--color-deep-grey)',
                boxSizing: 'border-box',
                minHeight: '28.8px',
                height: 'auto',
                verticalAlign: 'middle'
              }}
              placeholder="Note title"
              onKeyDown={handleKeyDown}
            />
          )}
        </div>
        {/* Version (scripture notes only) */}
        {noteType === 'scripture' && version && (
          <div className="relative shrink-0">
            <p className="leading-[normal] text-nowrap whitespace-pre font-sans font-normal text-[var(--color-stone-grey)] text-[12px]">{version}</p>
          </div>
        )}
        <div className="relative shrink-0 size-5" title={`${noteType === 'scripture' ? 'Scripture' : noteType === 'resource' ? 'Resource' : 'Note'} type`}>
          {noteType === 'scripture' ? (
            <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)' }} />
          ) : noteType === 'resource' ? (
            <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)' }} />
          ) : (
            <svg className="block max-w-none size-full text-[var(--color-deep-grey)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
            </svg>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 w-full" style={{ maxHeight: '100%', overflow: 'hidden', marginBottom: '-12px' }}>
        <div className="flex-1 flex flex-col font-sans font-medium min-h-0 not-italic text-[var(--color-deep-grey)] text-[16px]">
          {/* Display mode */}
          {!isEditing ? (
            <div className="flex-1 flex flex-col min-h-0" style={{ maxHeight: '100%' }}>
              <div className="flex-1 flex flex-col min-h-0 px-3" style={{ height: 0, maxHeight: '100%', overflow: 'hidden' }}>
                <div 
                  ref={contentDisplayRef}
                  className="flex-1 overflow-auto cursor-pointer rounded"
                  style={{ lineHeight: '1.6', minHeight: 0, paddingBottom: '12px' }}
                  onClick={handleContentClick}
                  dangerouslySetInnerHTML={{ __html: displayContent }}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0" style={{ maxHeight: '100%' }}>
              <div className="flex-1 flex flex-col min-h-0 px-3" style={{ height: 0, maxHeight: '100%', overflow: 'hidden' }}>
                <Suspense fallback={<div className="min-h-[200px]" />}>
                  <TiptapEditor
                    content={editContent}
                    id="edit-note-content"
                    name="editContent"
                    placeholder="Start writing your note..."
                    tabindex={3}
                    minimalToolbar={false}
                    onContentChange={handleContentChange}
                    scrollPosition={scrollPosition}
                    enableCreateNoteFromSelection={isEditing}
                    parentThreadId={parentThreadId}
                    sourceNoteId={noteId}
                    onEditorReady={handleEditorReady}
                  />
                </Suspense>
              </div>
              
              {/* Save/Cancel buttons */}
              <div className="flex justify-end gap-2 mt-4 mb-3 shrink-0">
                <ButtonSmall
                  state="Secondary"
                  onClick={cancelEdit}
                  disabled={isSaving}
                >
                  Cancel
                </ButtonSmall>
                <ButtonSmall
                  state="Default"
                  onClick={saveChanges}
                  disabled={!hasChanges || isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </ButtonSmall>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
