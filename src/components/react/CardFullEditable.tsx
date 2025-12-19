import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import ButtonSmall from './ButtonSmall';
import ActionButton from './ActionButton';
import { safeNavigate } from '@/utils/safe-navigate';
import { findFirstUnmarkedTextPosition, wrapTextWithNoteLink } from '@/utils/tiptap-helpers';
import '@/styles/card-full-editable.css';
import Icon from './Icon';

// Lazy load TiptapEditor to reduce initial bundle size - only loads when user enters edit mode
const TiptapEditor = lazy(() => import('./TiptapEditor'));

// Title character limits
const TITLE_SOFT_LIMIT = 30;  // Show counter when >= 30
const TITLE_WARNING_LIMIT = 45;  // Red text when >= 45 (within 5 of limit)
const TITLE_HARD_LIMIT = 50;  // Maximum allowed

interface CardFullEditableProps {
  title: string;
  content: string;
  date: string;
  noteId?: string;
  noteType?: 'default' | 'scripture' | 'resource';
  version?: string;
  resourceTitle?: string;
  resourceDescription?: string;
  resourceImage?: string;
  resourceUrl?: string;
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
  resourceTitle,
  resourceDescription,
  resourceImage,
  resourceUrl,
  className = '',
  isEditable = true,
  onSave 
}: CardFullEditableProps) {
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [isContentEditing, setIsContentEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [displayTitle, setDisplayTitle] = useState(title);
  const [displayContent, setDisplayContent] = useState(content);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const contentDisplayRef = useRef<HTMLDivElement>(null);
  const editorInstanceRef = useRef<any>(null);
  const shouldFocusEditorRef = useRef(false);
  const saveChangesRef = useRef<() => void>(() => {});
  const [scrollPosition, setScrollPosition] = useState(0);
  const [parentThreadId, setParentThreadId] = useState<string | undefined>(undefined);

  // Track if we've updated content locally (e.g., with a highlight)
  const hasLocalContentUpdate = useRef(false);

  // Initialize display content
  useEffect(() => {
    setDisplayTitle(title);
    // Only reset displayContent if we haven't updated it locally
    // This prevents the highlight from disappearing when content prop updates
    if (!hasLocalContentUpdate.current) {
      setDisplayContent(content);
    }
  }, [title, content]);

  // Focus handling is now done directly in startEditing
  // This useEffect is kept for backward compatibility but focusTarget is no longer used

  // Listen for keyboard shortcut to start editing
  useEffect(() => {
    const handleEditNote = () => {
      if (!isContentEditing && !isTitleEditing && isEditable) {
        // Save current scroll position
        if (contentDisplayRef.current) {
          const currentScroll = contentDisplayRef.current.scrollTop;
          setScrollPosition(currentScroll);
        }
        
        setEditTitle(displayTitle);
        setEditContent(displayContent);
        setIsContentEditing(true);
        setHasChanges(false);
        
        // Focus editor when it's ready
        shouldFocusEditorRef.current = true;
      }
    };
    
    window.addEventListener('editNote', handleEditNote);
    return () => {
      window.removeEventListener('editNote', handleEditNote);
    };
  }, [isContentEditing, isTitleEditing, isEditable, displayTitle, displayContent]);

  // Listen for hyperlink creation event
  useEffect(() => {
    const handleCreateHyperlink = async (event: CustomEvent) => {
        const { sourceNoteId, newNoteId, from, to, plainText } = event.detail;

        // Only process if this is the source note
        if (sourceNoteId !== noteId) return;

        // Try editor-based approach first (if editor is available)
        if (editorInstanceRef.current) {
            const editor = editorInstanceRef.current;
            
            // Check if editor is still valid (not destroyed)
            if (editor && !editor.isDestroyed && editor.view && editor.view.docView) {
              // Helper function to apply noteLink mark at a specific position
              const applyNoteLink = (positionFrom: number, positionTo: number): boolean => {
              try {
                // Validate positions are within document bounds
                const docSize = editor.state.doc.content.size;
                if (positionFrom < 0 || positionTo < 0 || positionFrom >= docSize || positionTo > docSize || positionFrom >= positionTo) {
                  console.warn('[CardFullEditable] Invalid position range:', { positionFrom, positionTo, docSize });
                  return false;
                }

                // Use Tiptap API to apply the mark
                editor.chain()
                    .focus()
                    .setTextSelection({ from: positionFrom, to: positionTo })
                    .unsetAllMarks()
                    .setMark('noteLink', { noteId: newNoteId })
                    .setTextSelection(positionTo)  // Move cursor to end of link
                    .unsetAllMarks()        // Clear marks so new text isn't linked
                    .run();

                return true;
              } catch (e) {
                console.error('[CardFullEditable] Error applying noteLink mark:', e);
                return false;
              }
              };

            // Helper function to save the updated content
            const saveUpdatedContent = () => {
              setTimeout(async () => {
                  // Check again if editor is still valid
                  if (!editor || editor.isDestroyed) return;
                  if (!editor.view || !editor.view.docView) return;
                  
                  try {
                    const updatedContent = editor.getHTML();
                    // Mark that we've updated content locally to prevent useEffect from resetting it
                    hasLocalContentUpdate.current = true;
                    // Update both editContent and displayContent so highlight is visible in both edit and view modes
                    setEditContent(updatedContent);
                    setDisplayContent(updatedContent);
                    
                    // Trigger save
                    if (onSave) {
                        await onSave(editTitle, updatedContent);
                    } else {
                        const globalCallback = (window as any).noteSaveCallback;
                        if (globalCallback) {
                            await globalCallback(editTitle, updatedContent);
                        }
                    }

                    // Notify that highlight has been saved (so navigation can proceed)
                    window.dispatchEvent(new CustomEvent('highlightSaved'));

                    // Show a temporary confirmation
                    window.dispatchEvent(new CustomEvent('toast', {
                        detail: {
                            message: 'Link created in source note.',
                            type: 'success'
                        }
                    }));
                  } catch (e) {
                    console.error('[CardFullEditable] Error saving updated content:', e);
                    // Still notify even on error so navigation doesn't hang
                    window.dispatchEvent(new CustomEvent('highlightSaved'));
                  }
              }, 50);
              };

              // Try to apply mark using stored positions first
              let success = false;
              if (from !== undefined && to !== undefined) {
                success = applyNoteLink(from, to);
              }

              // If direct position application failed, try text matching fallback
              if (!success) {
                // Try to get plainText from event detail first, fallback to localStorage
                const sourceSelectionPlainText = plainText || localStorage.getItem('newNoteSourceSelectionPlainText');
                
                if (sourceSelectionPlainText && sourceSelectionPlainText.trim().length > 0) {
                  console.log('[CardFullEditable] Position-based mark application failed, trying text matching fallback');
                  
                  try {
                    const textPosition = findFirstUnmarkedTextPosition(editor, sourceSelectionPlainText);
                    
                    if (textPosition) {
                      success = applyNoteLink(textPosition.from, textPosition.to);
                      if (success) {
                        console.log('[CardFullEditable] Successfully applied noteLink using text matching fallback');
                      } else {
                        console.warn('[CardFullEditable] Found text position but failed to apply mark:', textPosition);
                      }
                    } else {
                      console.warn('[CardFullEditable] Could not find matching text in editor:', sourceSelectionPlainText);
                    }
                  } catch (e) {
                    console.error('[CardFullEditable] Error during text matching fallback:', e);
                  }
                } else {
                  console.warn('[CardFullEditable] No sourceSelectionPlainText available for fallback');
                }
              }

              // If we successfully applied the mark, save the updated content
              if (success) {
                saveUpdatedContent();
                return; // Successfully handled with editor
              }
              // Editor-based approach failed, fall through to HTML manipulation
            }
        }

        // HTML manipulation approach (for when editor is not available or editor approach failed)
        // This handles the case when the note is in view mode (not editing)
        console.log('[CardFullEditable] Using HTML manipulation approach (editor not available or editor approach failed)');
        
        const sourceSelectionPlainText = plainText || localStorage.getItem('newNoteSourceSelectionPlainText');
        
        if (sourceSelectionPlainText && sourceSelectionPlainText.trim().length > 0 && noteId) {
          try {
            // Get current content (use displayContent which is the displayed content)
            const currentContent = displayContent || content;
            
            // Try to wrap the text with noteLink in HTML
            const updatedContent = wrapTextWithNoteLink(currentContent, sourceSelectionPlainText, newNoteId);
            
            if (updatedContent) {
              // Save via API directly
              const response = await fetch(`/api/notes/${noteId}/update-content`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                  content: updatedContent
                })
              });

              if (response.ok) {
                console.log('[CardFullEditable] Highlight saved successfully via API');
                // Mark that we've updated content locally to prevent useEffect from resetting it
                hasLocalContentUpdate.current = true;
                // Update local state to reflect the change immediately
                // This makes the highlight visible without page reload
                // Use functional updates to ensure we're working with latest state
                setDisplayContent(updatedContent);
                setEditContent(updatedContent);
                
                // Notify that highlight has been saved (so navigation can proceed)
                console.log('[CardFullEditable] Dispatching highlightSaved event');
                window.dispatchEvent(new CustomEvent('highlightSaved'));
                
                // Show success message
                window.dispatchEvent(new CustomEvent('toast', {
                  detail: {
                    message: 'Link created in source note.',
                    type: 'success'
                  }
                }));
              } else {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                console.error('[CardFullEditable] Failed to save updated content:', errorData);
                window.dispatchEvent(new CustomEvent('toast', {
                  detail: {
                    message: 'Could not create link in source note.',
                    type: 'warning'
                  }
                }));
              }
            } else {
              console.warn('[CardFullEditable] Could not find text to wrap in HTML:', sourceSelectionPlainText);
              window.dispatchEvent(new CustomEvent('toast', {
                detail: {
                  message: 'Could not find selected text to create link.',
                  type: 'warning'
                }
              }));
            }
          } catch (e) {
            console.error('[CardFullEditable] Error during HTML manipulation fallback:', e);
            window.dispatchEvent(new CustomEvent('toast', {
              detail: {
                message: 'Could not create link in source note.',
                type: 'warning'
              }
            }));
          }
        } else {
          console.error('[CardFullEditable] Failed to create hyperlink - no plainText available');
          window.dispatchEvent(new CustomEvent('toast', {
            detail: {
              message: 'Could not create link in source note.',
              type: 'warning'
            }
          }));
        }
    };

    window.addEventListener('createHyperlink', handleCreateHyperlink as EventListener);

    return () => {
        window.removeEventListener('createHyperlink', handleCreateHyperlink as EventListener);
    };
}, [noteId, onSave, editTitle]); // Dependencies

  // Detect parent thread ID from DOM when editing starts
  useEffect(() => {
    if (isContentEditing || isTitleEditing) {
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
  }, [isContentEditing, isTitleEditing]);


  const startEditing = (focus: 'title' | 'content' = 'title') => {
    // Save current scroll position
    if (contentDisplayRef.current) {
      const currentScroll = contentDisplayRef.current.scrollTop;
      setScrollPosition(currentScroll);
    }
    
    // For resource notes, use resourceTitle as fallback for initial title
    const initialTitle = (noteType === 'resource') 
      ? (displayTitle || resourceTitle || '') 
      : displayTitle;
    setEditTitle(initialTitle);
    // For resource notes, use resourceDescription as initial content if displayContent is empty
    const initialContent = (noteType === 'resource' && !displayContent && resourceDescription) 
      ? resourceDescription 
      : displayContent;
    setEditContent(initialContent);
    
    // Set the appropriate editing state based on focus
    if (focus === 'title') {
      setIsTitleEditing(true);
      // Focus immediately after state update
      requestAnimationFrame(() => {
        if (titleInputRef.current) {
          titleInputRef.current.focus();
        }
      });
    } else {
      setIsContentEditing(true);
      // Set flag to focus editor when it's ready
      shouldFocusEditorRef.current = true;
    }
    
    setHasChanges(false);
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
    setIsTitleEditing(false);
    setIsContentEditing(false);
    setEditTitle(displayTitle);
    setEditContent(displayContent);
    setHasChanges(false);
  };

  const saveChanges = async () => {
    if (!hasChanges) {
      setIsTitleEditing(false);
      setIsContentEditing(false);
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
            setIsTitleEditing(false);
            setIsContentEditing(false);
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
        setIsTitleEditing(false);
        setIsContentEditing(false);
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
      if ((isTitleEditing || isContentEditing) && hasChanges && !isSaving) {
        saveChangesRef.current();
      }
    };
    
    window.addEventListener('saveContent', handleSaveContent);
    return () => {
      window.removeEventListener('saveContent', handleSaveContent);
    };
  }, [isTitleEditing, isContentEditing, hasChanges, isSaving]);

  // Listen for Cmd+Enter to save (dispatched from TiptapEditor)
  useEffect(() => {
    const handleSubmitPanelForm = () => {
      // Only save if we're in edit mode and not already saving
      // Use saveChangesRef to always call the latest version with current state
      if ((isTitleEditing || isContentEditing) && !isSaving) {
        saveChangesRef.current();
      }
    };
    
    window.addEventListener('submitPanelForm', handleSubmitPanelForm);
    return () => {
      window.removeEventListener('submitPanelForm', handleSubmitPanelForm);
    };
  }, [isTitleEditing, isContentEditing, isSaving]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      cancelEdit();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      saveChanges();
    } else {
      // Handle Select All for title textarea (Cmd+A on Mac, Ctrl+A on Windows/Linux)
      const target = e.target as HTMLTextAreaElement;
      if (target === titleInputRef.current) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
          e.preventDefault();
          target.select();
          return;
        }
        
        // Auto-capitalize first letter for title textarea
        // Check if cursor is at the start of the title textarea
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

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value.slice(0, TITLE_HARD_LIMIT); // Enforce hard limit
    setEditTitle(newValue);
    setHasChanges(newValue !== displayTitle || editContent !== displayContent);
  };

  const handleContentClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    // Check if click is on a note-link (highlighted text linking to another note)
    const target = e.target as HTMLElement;
    const noteLinkElement = target.closest('.note-link');
    
    if (noteLinkElement) {
      const noteId = noteLinkElement.getAttribute('data-note-id');
      
      if (noteId) {
        // Navigate to the linked note
        e.preventDefault();
        e.stopPropagation();
        safeNavigate(`/${noteId}`, { history: 'push' });
        return;
      }
    }
    
    // Check if click is on a scripture pill
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
        
        safeNavigate(`/${targetNoteId}`, { history: 'push' });
        return;
      }
    }
    
    // If not a note-link or scripture pill, enter edit mode
    startEditing('content');
  };

  // Resource note - special display with card-image-link design + editable content
  if (noteType === 'resource') {
    const effectiveTitle = resourceTitle || displayTitle || 'Untitled Resource';
    
    // Detect if URL is a PDF
    const isPDF = resourceUrl ? (
      resourceUrl.toLowerCase().endsWith('.pdf') ||
      resourceUrl.toLowerCase().includes('.pdf?') ||
      resourceUrl.toLowerCase().includes('.pdf#')
    ) : false;
    
    const hostname = resourceUrl ? (() => {
      try {
        const url = new URL(resourceUrl);
        return url.hostname.replace('www.', '');
      } catch {
        return resourceUrl;
      }
    })() : '';

    // For resource notes, use resourceDescription as initial content if content is empty
    const effectiveContent = displayContent || resourceDescription || '';

    return (
      <div 
        className={`card-full-editable ${className}`}
        style={{ maxHeight: '100%' }}
        data-card-full-editable
      >
        <div className="card-image-link" style={{ gap: '1rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Full-width image at top */}
          {resourceImage && !imageRemoved && (
            <div 
              className="card-image-link__image"
              style={{ 
                backgroundImage: `url('${resourceImage}')`,
                minHeight: '180px',
                flexShrink: 0,
                position: 'relative'
              }}
            >
              {/* Remove image button - only show on hover - TEMPORARILY DISABLED */}
              {/* <div className="card-image-link__remove-button">
                <ActionButton
                  variant="Close"
                  onClick={async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    
                    // Update resource metadata to remove image (don't hide immediately to avoid flicker)
                    if (noteId) {
                      try {
                        // Use the notes update endpoint which supports resourceImage updates
                        const response = await fetch(`/api/notes/update`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            noteId: noteId,
                            title: displayTitle,
                            content: displayContent,
                            resourceImage: ''
                          }),
                          credentials: 'include'
                        });
                        
                        if (response.ok) {
                          const result = await response.json();
                          if (result.success) {
                            // Only hide and reload after successful update
                            setImageRemoved(true);
                            // Reload the page to reflect the change
                            window.location.reload();
                          } else {
                            // If update fails, show error
                            const errorMessage = result.error || 'Error removing image. Please try again.';
                            window.dispatchEvent(new CustomEvent('toast', {
                              detail: {
                                message: errorMessage,
                                type: 'error'
                              }
                            }));
                          }
                        } else {
                          // If response not ok, try to parse error
                          try {
                            const errorResult = await response.json();
                            window.dispatchEvent(new CustomEvent('toast', {
                              detail: {
                                message: errorResult.error || 'Error removing image. Please try again.',
                                type: 'error'
                              }
                            }));
                          } catch {
                            window.dispatchEvent(new CustomEvent('toast', {
                              detail: {
                                message: 'Error removing image. Please try again.',
                                type: 'error'
                              }
                            }));
                          }
                        }
                      } catch (error: any) {
                        console.error('Error removing image:', error);
                        window.dispatchEvent(new CustomEvent('toast', {
                          detail: {
                            message: 'Error removing image. Please try again.',
                            type: 'error'
                          }
                        }));
                      }
                    } else {
                      // No noteId, just hide it locally
                      setImageRemoved(true);
                    }
                  }}
                  aria-label="Remove image"
                  className=""
                  style={{
                    width: '32px',
                    height: '32px'
                  }}
                />
              </div> */}
            </div>
          )}
          
          {/* Header with title and newspaper icon */}
          <div className="card-image-link__header" style={{ flexShrink: 0 }}>
            <div className="card-image-link__title" style={{ flex: 1, minWidth: 0 }}>
              {!isTitleEditing ? (
                <p
                  className="cursor-pointer rounded"
                  style={{
                    margin: 0,
                    padding: '4px 8px',
                    marginLeft: '-8px',
                    marginRight: '-8px',
                  }}
                  onClick={() => startEditing('title')}
                >
                  {effectiveTitle}
                </p>
              ) : (
                <div>
                  <textarea 
                    ref={titleInputRef}
                    value={editTitle}
                    onChange={handleTitleChange}
                    maxLength={TITLE_HARD_LIMIT}
                    rows={2}
                    className="w-full bg-transparent border-0 rounded focus:outline-none font-bold"
                    style={{
                      lineHeight: '1.2',
                      margin: 0,
                      padding: '4px 8px',
                      marginLeft: '-8px',
                      marginRight: '-8px',
                      fontSize: 'inherit',
                      fontWeight: 'inherit',
                      fontFamily: 'inherit',
                      color: 'inherit',
                      boxSizing: 'border-box',
                      width: 'calc(100% + 16px)',
                      resize: 'none',
                    }}
                    placeholder="Resource title"
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsTitleFocused(true)}
                    onBlur={() => setIsTitleFocused(false)}
                  />
                </div>
              )}
            </div>
            <div className="card-image-link__bookmark" style={{ marginTop: '4px' }}>
              <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)' }} />
            </div>
          </div>
          
          {/* Editable content area with TiptapEditor */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, width: '100%', marginTop: '12px' }}>
            {!isContentEditing ? (
              <div 
                ref={contentDisplayRef}
                className="flex-1 overflow-auto cursor-pointer rounded px-3"
                style={{ lineHeight: '1.6', minHeight: 0, width: '100%' }}
                onClick={handleContentClick}
              >
                {effectiveContent ? (
                  <div 
                    className="card-image-link__content-text"
                    dangerouslySetInnerHTML={{ __html: effectiveContent }}
                  />
                ) : (
                  <p style={{ color: 'var(--color-pebble-grey)', fontStyle: 'italic' }}>Click to add notes...</p>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0" style={{ overflow: 'hidden', width: '100%' }}>
                <div className="flex-1 min-h-0 px-3" style={{ overflow: 'hidden', width: '100%' }}>
                  <Suspense fallback={<div className="min-h-[100px]" />}>
                    <TiptapEditor
                      content={editContent}
                      id="edit-note-content"
                      name="editContent"
                      placeholder="Add your notes about this resource..."
                      tabindex={3}
                      minimalToolbar={false}
                      onContentChange={handleContentChange}
                      scrollPosition={scrollPosition}
                      enableCreateNoteFromSelection={isContentEditing}
                      parentThreadId={parentThreadId}
                      sourceNoteId={noteId}
                      onEditorReady={handleEditorReady}
                    />
                  </Suspense>
                </div>
                
                {/* Save/Cancel buttons */}
                <div className="flex items-center gap-2 mt-4 mb-3 shrink-0 px-3">
                  {/* Character counter - only show when title is focused */}
                  {isTitleFocused && editTitle.length >= TITLE_SOFT_LIMIT && (
                    <div 
                      style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-sans)',
                        color: editTitle.length >= TITLE_WARNING_LIMIT 
                          ? 'var(--color-red)' 
                          : 'var(--color-deep-grey)',
                      }}
                    >
                      {editTitle.length}/{TITLE_HARD_LIMIT}
                    </div>
                  )}
                  <div className="flex gap-2 ml-auto">
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
              </div>
            )}
          </div>
          
          {/* Source bar with hostname and external link icon */}
          {resourceUrl && (
            <button 
              type="button"
              className="card-image-link__source"
              style={{ textDecoration: 'none', border: 'none', textAlign: 'left', flexShrink: 0 }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(resourceUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              <div className="card-image-link__source-content" style={{ justifyContent: 'space-between' }}>
                <div className="card-image-link__source-text">
                  <p>{isPDF ? 'View PDF' : hostname}</p>
                </div>
                <div className="card-image-link__source-icon">
                  <Icon name={isPDF ? 'file-pdf' : 'arrow-up-right-from-square'} size={20} />
                </div>
              </div>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Default and Scripture notes - original editable layout
  return (
    <>
      <div 
        className={`card-full-editable ${className}`}
        style={{ maxHeight: '100%', gap: 0 }}
        data-card-full-editable
      >
      {/* Header with title, version (scripture only), and bookmark icon */}
      <div className="box-border content-stretch flex gap-3 items-start px-3 py-0 relative shrink-0 w-full">
        <div className="basis-0 font-sans font-bold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]">
          {/* Display mode */}
          {!isTitleEditing ? (
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <textarea 
                ref={titleInputRef}
                value={editTitle}
                onChange={handleTitleChange}
                maxLength={TITLE_HARD_LIMIT}
                rows={2}
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
                  resize: 'none',
                }}
                placeholder="Note title"
                onKeyDown={handleKeyDown}
                onFocus={() => setIsTitleFocused(true)}
                onBlur={() => setIsTitleFocused(false)}
              />
            </div>
          )}
        </div>
        {noteType === 'scripture' ? (
          /* Version and icon wrapper for scripture notes */
          <div className="relative shrink-0 flex items-center gap-2" style={{ marginTop: '4px' }}>
            {version && (
              <p className="leading-[normal] text-nowrap whitespace-pre font-sans font-normal text-[var(--color-stone-grey)] text-[12px] m-0">{version}</p>
            )}
            <div className="relative shrink-0 size-5" title="Scripture type">
              <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)' }} />
            </div>
          </div>
        ) : (
          /* Icon only for non-scripture notes */
          (() => {
            const noteTypeConfig: Record<'resource' | 'default', { label: string; icon: React.ReactElement }> = {
              resource: {
                label: 'Resource',
                icon: <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)' }} />
              },
              default: {
                label: 'Note',
                icon: (
                  <svg className="block max-w-none size-full text-[var(--color-deep-grey)]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                  </svg>
                )
              }
            };
            const config = noteTypeConfig[noteType];
            return (
              <div className="relative shrink-0 size-5" title={`${config.label} type`} style={{ marginTop: '4px' }}>
                {config.icon}
              </div>
            );
          })()
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 w-full" style={{ maxHeight: '100%', overflow: 'hidden', marginBottom: '-12px', marginTop: '12px' }}>
        <div className="flex-1 flex flex-col font-sans font-medium min-h-0 not-italic text-[var(--color-deep-grey)] text-[16px]">
          {/* Display mode */}
          {!isContentEditing ? (
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
                    enableCreateNoteFromSelection={isContentEditing}
                    parentThreadId={parentThreadId}
                    sourceNoteId={noteId}
                    onEditorReady={handleEditorReady}
                  />
                </Suspense>
              </div>
              
              {/* Save/Cancel buttons */}
              <div className="flex items-center gap-2 mt-4 mb-3 shrink-0" style={{ paddingLeft: '12px', paddingRight: '12px' }}>
                {/* Character counter - only show when title is focused */}
                {isTitleFocused && editTitle.length >= TITLE_SOFT_LIMIT && (
                  <div 
                    style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-sans)',
                      color: editTitle.length >= TITLE_WARNING_LIMIT 
                        ? 'var(--color-red)' 
                        : 'var(--color-deep-grey)',
                    }}
                  >
                    {editTitle.length}/{TITLE_HARD_LIMIT}
                  </div>
                )}
                <div className="flex gap-2 ml-auto">
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
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
