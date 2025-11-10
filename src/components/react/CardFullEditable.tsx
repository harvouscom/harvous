import React, { useState, useEffect, useRef } from 'react';
import TiptapEditor from './TiptapEditor';
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
        }
      });
    }
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
      // Get content from QuillEditor
      let editorContent = editContent;
      const hiddenInput = document.querySelector('#edit-note-content') as HTMLInputElement;
      if (hiddenInput && hiddenInput.value) {
        editorContent = hiddenInput.value;
      }

      if (onSave) {
        await onSave(editTitle, editorContent);
      } else {
        // Fallback to global save callback
        const globalCallback = (window as any).noteSaveCallback;
        if (globalCallback) {
          await globalCallback(editTitle, editorContent);
        }
      }

      // Update display content
      setDisplayTitle(editTitle);
      setDisplayContent(editorContent);
      setIsEditing(false);
      setHasChanges(false);
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
                  onClick={() => startEditing('content')}
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
