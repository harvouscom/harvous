import React, { useState, useEffect, useRef } from 'react';
import TiptapEditor, { convertScriptureReferencesToPills } from './TiptapEditor';
import ButtonSmall from './ButtonSmall';

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
  const [scrollPosition, setScrollPosition] = useState(0);
  const [parentThreadId, setParentThreadId] = useState<string | undefined>(undefined);

  // Initialize display content
  useEffect(() => {
    setDisplayTitle(title);
    setDisplayContent(content);
  }, [title, content]);

  // Load Font Awesome for scripture/resource icons if needed
  useEffect(() => {
    if (noteType === 'scripture' || noteType === 'resource') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';
      if (!document.querySelector(`link[href="${link.href}"]`)) {
        document.head.appendChild(link);
      }
    }
  }, [noteType]);

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

  // Add this useEffect to handle virtual keyboard
  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const toolbar = document.querySelector('.tiptap-toolbar') as HTMLElement;
    if (!toolbar) return;

    const handleResize = () => {
      // When the virtual keyboard is shown, the visual viewport height decreases.
      const keyboardHeight = window.innerHeight - visualViewport.height;
      if (keyboardHeight > 150) { // Threshold to detect keyboard
        toolbar.style.position = 'fixed';
        toolbar.style.bottom = `${keyboardHeight}px`;
        toolbar.style.width = 'calc(100% - 2rem)'; // Adjust width to match container padding
        toolbar.style.left = '1rem';
        toolbar.style.right = '1rem';
        toolbar.style.zIndex = '50';
      } else {
        toolbar.style.position = 'relative';
        toolbar.style.bottom = 'auto';
        toolbar.style.width = 'auto';
        toolbar.style.left = 'auto';
        toolbar.style.right = 'auto';
      }
    };

    visualViewport.addEventListener('resize', handleResize);
    return () => visualViewport.removeEventListener('resize', handleResize);
  }, [isEditing]);

  // Listen for hyperlink creation event
  useEffect(() => {
    const handleCreateHyperlink = (event: CustomEvent) => {
        const { sourceNoteId, newNoteId, from, to } = event.detail;

        if (sourceNoteId === noteId && editorInstanceRef.current) {
            const editor = editorInstanceRef.current;
            
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

            }, 50);
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
    editorInstanceRef.current = editor;
    // Focus if we should focus the editor
    if (shouldFocusEditorRef.current) {
      shouldFocusEditorRef.current = false;
      requestAnimationFrame(() => {
        if (editor) {
          editor.commands.focus();
          // Move cursor to end of content to avoid getting stuck on scripture pills
          try {
            const doc = editor.state.doc;
            const endPos = doc.content.size;
            editor.commands.setTextSelection(endPos);
          } catch (e) {
            // If setting selection fails, just focus
            console.log('Could not set cursor to end:', e);
          }
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
      // (The update endpoint already processes scripture and returns results)
      console.log('CardFullEditable: Save result:', saveResult);
      if (saveResult && saveResult.scriptureResults) {
        console.log('CardFullEditable: Scripture results from update:', saveResult.scriptureResults, 'Length:', saveResult.scriptureResults.length);
        
        if (saveResult.scriptureResults.length > 0) {
          // Show toasts for each scripture reference created or added
          for (const scriptureResult of saveResult.scriptureResults) {
            console.log('CardFullEditable: Processing result:', scriptureResult);
            // Show toast for newly created notes
            if (scriptureResult.action === 'created') {
              const message = `Created scripture note: ${scriptureResult.reference}`;
              console.log('CardFullEditable: Dispatching toast for created:', scriptureResult.reference);
              
              // Dispatch event
              const event = new CustomEvent('toast', {
                detail: { message, type: 'success' }
              });
              window.dispatchEvent(event);
              
              // Fallback: directly call toast if available
              if (window.toast && typeof window.toast.success === 'function') {
                setTimeout(() => window.toast.success(message), 100);
              }
            } 
            // Show toast for notes added to thread
            else if (scriptureResult.action === 'added') {
              const message = `Added ${scriptureResult.reference} to this thread`;
              console.log('CardFullEditable: Dispatching toast for added:', scriptureResult.reference);
              
              // Dispatch event
              const event = new CustomEvent('toast', {
                detail: { message, type: 'success' }
              });
              window.dispatchEvent(event);
              
              // Fallback: directly call toast if available
              if (window.toast && typeof window.toast.success === 'function') {
                setTimeout(() => window.toast.success(message), 100);
              }
            }
          }
        } else {
          console.log('CardFullEditable: No scripture results to process');
        }
      } else {
        console.log('CardFullEditable: No scriptureResults in saveResult');
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

  // Listen for keyboard shortcut to save when editing
  useEffect(() => {
    const handleSaveContent = (e: Event) => {
      // Only save if we're in edit mode, have changes, and not already saving
      if (isEditing && hasChanges && !isSaving) {
        saveChanges();
      }
    };
    
    window.addEventListener('saveContent', handleSaveContent);
    return () => {
      window.removeEventListener('saveContent', handleSaveContent);
    };
  }, [isEditing, hasChanges, isSaving]);

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
        
        window.location.href = `/${targetNoteId}`;
        return;
      }
    }
    
    // If not a scripture pill, enter edit mode
    startEditing('content');
  };

  return (
    <>
      <style>
        {`
          .card-full-editable button[data-outer-shadow] {
            will-change: transform, box-shadow;
            transition:
              background-color 0.125s ease-in-out,
              box-shadow 0.125s ease-in-out;
            box-shadow:
              0px -4px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
              0px 2px 2px 0px hsla(0, 0%, 0%, 0.25);
          }

          .card-full-editable button:active {
            transform: scale(0.98);
          }

          .card-full-editable button:active > div {
            translate: 0 0;
            transform: scale(0.98);
          }

          .card-full-editable button:active[style*="var(--color-bold-blue)"] {
            background-color: var(--color-navy) !important;
            box-shadow:
              0px -2px 0px 0px #0000001a inset,
              0px 0px 2px 0px #00000040,
              0px 2px 0px 0px #00000040 inset;
          }

          .card-full-editable button:active[style*="var(--color-stone-grey)"] {
            background-color: var(--color-deep-grey) !important;
            box-shadow:
              0px -2px 0px 0px #0000001a inset,
              0px 0px 2px 0px #00000040,
              0px 2px 0px 0px #00000040 inset;
          }

          /* List styling for display mode */
          .card-full-editable .flex-1.overflow-auto ul {
            list-style-type: disc !important;
            padding-left: 1.5em !important;
            margin-left: 0 !important;
          }

          .card-full-editable .flex-1.overflow-auto ol {
            list-style-type: decimal !important;
            padding-left: 1.5em !important;
            margin-left: 0 !important;
          }

          .card-full-editable .flex-1.overflow-auto li {
            display: list-item !important;
            list-style-position: outside !important;
            list-style-type: inherit !important;
            margin-bottom: 0.5em !important;
            color: var(--color-deep-grey) !important;
          }

          /* Paragraph spacing for display mode - match editor spacing */
          .card-full-editable .flex-1.overflow-auto p {
            margin: 0.75em 0 !important;
          }

          .card-full-editable .flex-1.overflow-auto p:first-child {
            margin-top: 0 !important;
          }

          .card-full-editable .flex-1.overflow-auto p:last-child {
            margin-bottom: 0 !important;
          }

          /* Heading styles for display mode - match editor styles */
          .card-full-editable .flex-1.overflow-auto h2 {
            font-size: 18px !important;
            font-weight: 600 !important;
            line-height: 1.3 !important;
            margin-top: 1.5em !important;
            margin-bottom: 0.75em !important;
            color: var(--color-deep-grey) !important;
            font-family: var(--font-sans) !important;
          }

          .card-full-editable .flex-1.overflow-auto h2:first-child {
            margin-top: 0 !important;
          }

          .card-full-editable .flex-1.overflow-auto h3 {
            font-size: 16px !important;
            font-weight: 600 !important;
            line-height: 1.4 !important;
            margin-top: 1.25em !important;
            margin-bottom: 0.625em !important;
            color: var(--color-deep-grey) !important;
            font-family: var(--font-sans) !important;
          }

          .card-full-editable .flex-1.overflow-auto h3:first-child {
            margin-top: 0 !important;
          }

          /* Horizontal rule styles for display mode - match editor spacing */
          .card-full-editable .flex-1.overflow-auto hr {
            margin: 1.5em 0 !important;
            border: none !important;
            border-top: 1px solid #e5e5e5 !important;
            background: none !important;
            height: 1px !important;
            padding: 0 !important;
          }

          .card-full-editable .flex-1.overflow-auto hr:first-child {
            margin-top: 0 !important;
          }

          .card-full-editable .flex-1.overflow-auto hr:last-child {
            margin-bottom: 0 !important;
          }
        `}
      </style>
      <div 
        className={`bg-white box-border content-stretch flex flex-col gap-6 items-start justify-start overflow-hidden pb-3 pt-6 px-3 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] h-full w-full card-full-editable flex-1 min-h-0 ${className}`}
        style={{ maxHeight: '100%' }}
        data-card-full-editable
      >
      {/* Header with title, version (scripture only), and bookmark icon */}
      <div className="box-border content-stretch flex gap-3 items-center px-3 py-0 relative shrink-0 w-full">
        <div className="basis-0 font-sans font-semibold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]">
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
                fontWeight: '600',
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
              className="w-full bg-transparent border-0 rounded focus:outline-none"
              style={{
                lineHeight: '1.2',
                margin: '-4px -8px',
                padding: '4px 8px',
                fontSize: '24px',
                fontWeight: '600',
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
            <i className="fa-solid fa-scroll text-[var(--color-deep-grey)] text-[20px]" />
          ) : noteType === 'resource' ? (
            <i className="fa-solid fa-file-image text-[var(--color-deep-grey)] text-[20px]" />
          ) : (
            <svg className="block max-w-none size-full text-[var(--color-deep-grey)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
            </svg>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 w-full" style={{ maxHeight: '100%', overflow: 'hidden', marginBottom: '-12px' }}>
        <div className="flex-1 flex flex-col font-sans font-normal min-h-0 not-italic text-[var(--color-deep-grey)] text-[16px]">
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
