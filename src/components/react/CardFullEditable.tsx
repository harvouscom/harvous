import React, { useState, useEffect, useRef } from 'react';
import TiptapEditor from './TiptapEditor';

interface CardFullEditableProps {
  title: string;
  content: string;
  date: string;
  noteId?: string;
  className?: string;
  onSave?: (title: string, content: string) => Promise<any>;
}

export default function CardFullEditable({ 
  title, 
  content, 
  date, 
  noteId, 
  className = '',
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

  // Initialize display content
  useEffect(() => {
    setDisplayTitle(title);
    setDisplayContent(content);
  }, [title, content]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isEditing]);

  const startEditing = () => {
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

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value);
    setHasChanges(editTitle !== displayTitle || e.target.value !== displayContent);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditTitle(e.target.value);
    setHasChanges(e.target.value !== displayTitle || editContent !== displayContent);
  };

  return (
    <div 
      className={`bg-white box-border content-stretch flex flex-col gap-6 items-start justify-start overflow-clip pb-3 pt-6 px-3 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] size-full ${className}`}
      data-card-full-editable
    >
      {/* Header with title and bookmark icon */}
      <div className="box-border content-stretch flex gap-3 items-center justify-center px-3 py-0 relative shrink-0 w-full">
        <div className="basis-0 font-sans font-semibold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]">
          {/* Display mode */}
          {!isEditing ? (
            <p 
              className="leading-[normal] cursor-pointer rounded px-2 py-1 -mx-2 -my-1 hover:bg-gray-50 transition-colors"
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
        <div className="relative shrink-0 size-5">
          <svg className="block max-w-none size-full text-[var(--color-deep-grey)]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
          </svg>
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
      <div className="basis-0 box-border content-stretch flex grow items-start justify-between min-h-px min-w-px px-3 py-0 relative shrink-0 w-full">
        <div className="basis-0 flex flex-col font-sans font-normal grow justify-center leading-[1.6] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[16px]">
          {/* Display mode */}
          {!isEditing ? (
            <div 
              className="min-h-[200px] max-w-none cursor-pointer rounded px-2 py-1 hover:bg-gray-50 transition-colors"
              onClick={startEditing}
              dangerouslySetInnerHTML={{ __html: displayContent }}
            />
          ) : (
            <div className="min-h-[200px] flex flex-col">
              <div className="flex-1 flex flex-col" style={{ height: '100%', maxHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <TiptapEditor
                  content={editContent}
                  id="edit-note-content"
                  name="editContent"
                  placeholder="Start writing your note..."
                  tabindex={3}
                  minimalToolbar={false}
                />
              </div>
              
              {/* Save/Cancel buttons */}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={cancelEdit}
                  className="px-3 py-1 text-gray-600 hover:text-gray-800 transition-colors"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  onClick={saveChanges}
                  disabled={!hasChanges || isSaving}
                  className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
