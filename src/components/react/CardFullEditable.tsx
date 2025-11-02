import React, { useState, useEffect, useRef } from 'react';
import TiptapEditor from './TiptapEditor';
import ButtonSmall from './ButtonSmall';

interface CardFullEditableProps {
  title: string;
  content: string;
  date: string;
  noteId?: string;
  noteType?: 'default' | 'scripture' | 'resource';
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

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isEditing]);

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


  const startEditing = () => {
    // Save current scroll position
    if (contentDisplayRef.current) {
      const currentScroll = contentDisplayRef.current.scrollTop;
      console.log('Saving scroll position:', currentScroll);
      setScrollPosition(currentScroll);
    }
    
    setEditTitle(displayTitle);
    setEditContent(displayContent);
    setIsEditing(true);
    setHasChanges(false);
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
      console.error('Error saving note:', error);
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
        `}
      </style>
      <div 
        className={`bg-white box-border content-stretch flex flex-col gap-6 items-start justify-start overflow-clip pb-3 pt-6 px-3 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] h-full w-full card-full-editable max-h-[calc(100vh-10.75rem)] min-[1160px]:max-h-[calc(100vh-3rem)] ${className}`}
        data-card-full-editable
      >
      {/* Header with title and bookmark icon */}
      <div className="box-border content-stretch flex gap-3 items-center justify-center px-3 py-0 relative shrink-0 w-full">
        <div className="basis-0 font-sans font-semibold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]">
          {/* Display mode */}
          {!isEditing ? (
            <p 
              className="leading-[normal] cursor-pointer rounded px-2 py-1 -mx-2 -my-1"
              onClick={startEditing}
            >
              {displayTitle}
            </p>
          ) : (
            <input 
              ref={titleInputRef}
              value={editTitle}
              onChange={handleTitleChange}
              type="text"
              className="w-full bg-transparent border-0 rounded px-2 py-1 -mx-2 -my-1 text-[24px] font-semibold text-[var(--color-deep-grey)] focus:outline-none"
              placeholder="Note title"
              onKeyDown={handleKeyDown}
            />
          )}
        </div>
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
      
      {/* Date and Note ID */}
      <div className={`box-border content-stretch flex font-sans font-normal items-center leading-[0] not-italic px-3 py-0 relative shrink-0 text-[var(--color-stone-grey)] text-[12px] text-nowrap w-full ${noteId ? 'justify-between' : 'justify-start'}`}>
        <div className="relative shrink-0">
          <p className="leading-[normal] text-nowrap whitespace-pre">{date}</p>
        </div>
        {noteId && (
          <div className="relative shrink-0">
            <p className="leading-[normal] text-nowrap whitespace-pre">#{noteId}</p>
          </div>
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 w-full">
        <div className="flex-1 flex flex-col font-sans font-normal min-h-0 not-italic text-[var(--color-deep-grey)] text-[16px]">
          {/* Display mode */}
          {!isEditing ? (
            <div 
              ref={contentDisplayRef}
              className="flex-1 overflow-auto cursor-pointer rounded px-2 py-1 px-3"
              style={{ lineHeight: '1.6' }}
              onClick={startEditing}
              dangerouslySetInnerHTML={{ __html: displayContent }}
            />
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 flex flex-col min-h-0 px-3">
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
                />
              </div>
              
              {/* Save/Cancel buttons */}
              <div className="flex justify-end gap-2 mt-4 shrink-0">
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
