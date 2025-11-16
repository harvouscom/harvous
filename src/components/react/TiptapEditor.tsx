import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { NoteLink } from './TiptapNoteLink.ts';
import { ScripturePill } from './TiptapScripturePill.ts';
import ButtonSmall from './ButtonSmall';
import { normalizeScriptureReference } from '@/utils/scripture-detector';

// Define a global toast function
declare global {
  interface Window {
    toast: {
      success: (message: string) => void;
      info: (message: string) => void;
      error: (message: string) => void;
    };
  }
}

interface TiptapEditorProps {
  content: string;
  id?: string;
  name?: string;
  placeholder?: string;
  minimalToolbar?: boolean;
  tabindex?: number;
  onContentChange?: (content: string) => void;
  scrollPosition?: number;
  enableCreateNoteFromSelection?: boolean;
  parentThreadId?: string;
  sourceNoteId?: string; // ID of the note this editor is editing (for hyperlink creation)
  onEditorReady?: (editor: any) => void;
}

// Helper function to find text positions in ProseMirror document
// Returns the first occurrence that doesn't already have a scripture pill mark
function findTextPositions(doc: any, searchText: string, skipMarked: boolean = true): { from: number; to: number } | null {
  const fullText = doc.textContent;
  const normalizedSearch = normalizeScriptureReference(searchText);
  
  // Try to find the text in the document
  let searchIndex = fullText.indexOf(searchText);
  if (searchIndex === -1) {
    // Try normalized version
    searchIndex = fullText.indexOf(normalizedSearch);
    if (searchIndex === -1) {
      return null;
    }
    // Use normalized text for position finding
    searchText = normalizedSearch;
  }

  let from = 0;
  let to = 0;
  let currentPos = 0;
  let found = false;
  
  doc.nodesBetween(0, doc.content.size, (node: any, pos: number) => {
    if (found) return; // Stop after finding first valid match
    
    if (node.isText) {
      const text = node.text || '';
      const nodeStart = currentPos;
      const nodeEnd = currentPos + text.length;
      
      // Check if this text node contains our search text
      if (searchIndex >= nodeStart && searchIndex < nodeEnd) {
        const offset = searchIndex - nodeStart;
        const candidateFrom = pos + offset;
        const candidateTo = candidateFrom + searchText.length;
        
        // Check if this position already has a scripture pill mark
        if (skipMarked) {
          try {
            const $from = doc.resolve(candidateFrom);
            const marks = $from.marks();
            const hasPill = marks.some(m => m.type.name === 'scripturePill');
            if (hasPill) {
              // Skip this position, continue searching
              currentPos = nodeEnd;
              return;
            }
          } catch (e) {
            // If we can't resolve, continue anyway
          }
        }
        
        from = candidateFrom;
        to = candidateTo;
        found = true;
      }
      
      currentPos = nodeEnd;
    }
  });

  if (from > 0 && to > from) {
    return { from, to };
  }
  
  return null;
}

// Helper function to check if reference is already wrapped in a pill
function isReferenceWrapped(htmlContent: string, reference: string): boolean {
  // Normalize the reference to match how it's stored in HTML
  const normalizedRef = normalizeScriptureReference(reference);
  const escapedRef = normalizedRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<span[^>]*data-scripture-reference=["']${escapedRef.replace(/"/g, '&quot;')}["'][^>]*>`, 'i');
  return pattern.test(htmlContent);
}

// Helper function to check/create scripture note and get noteId
async function getOrCreateScriptureNote(reference: string): Promise<{ noteId: string | null; isNew: boolean }> {
  const normalizedRef = normalizeScriptureReference(reference);
  
  // Check if note exists
  const checkResponse = await fetch('/api/scripture/check-existing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference: normalizedRef }),
    credentials: 'include'
  });

  if (checkResponse.ok) {
    const checkResult = await checkResponse.json();
    if (checkResult.exists && checkResult.noteId) {
      // Show toast for existing note (optional, can be removed if too noisy)
      // if (window.toast) {
      //   window.toast.info(`Scripture note already exists: ${reference}`);
      // }
      return { noteId: checkResult.noteId, isNew: false };
    }
  }

  // Fetch verse text first
  let verseText = reference; // Fallback to reference if fetch fails
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
    // If verse fetch fails, use reference as fallback
    console.error('Error fetching verse text:', error);
  }

  // Create new note with verse text as content
  const formData = new FormData();
  formData.set('content', verseText);
  formData.set('title', reference);
  formData.set('threadId', 'thread_unorganized');
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
      // Show success toast
      if (window.toast) {
        window.toast.success(`Scripture note created: ${reference}`);
      }
      return { noteId: result.note.id, isNew: true };
    }
  }

  // Show error toast
  if (window.toast) {
    window.toast.error(`Error creating scripture note: ${reference}`);
  }
  
  return { noteId: null, isNew: false };
}

// Helper function to detect and create scripture notes
async function detectAndCreateScriptureNotes(editor: any) {
  if (!editor) return;

  try {
    // Store current cursor position before processing
    const currentSelection = editor.state.selection;
    const currentCursorPos = currentSelection.anchor;
    
    // Extract plain text from editor
    const plainText = editor.state.doc.textContent;
    
    if (!plainText || plainText.trim().length < 5) {
      return;
    }

    // Call detection API
    const detectResponse = await fetch('/api/scripture/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: plainText }),
      credentials: 'include'
    });

    if (!detectResponse.ok) {
      return;
    }

    const detection = await detectResponse.json();
    
    if (!detection.isScripture || !detection.references || detection.references.length === 0) {
      return;
    }

    const htmlContent = editor.getHTML();
    const doc = editor.state.doc;

    // Process each detected reference
    for (const ref of detection.references) {
      const reference = ref.reference || ref;
      if (!reference) continue;

      // Normalize reference for consistent checking
      const normalizedRef = normalizeScriptureReference(reference);

      // Check if already wrapped (using normalized reference)
      if (isReferenceWrapped(htmlContent, normalizedRef)) {
        continue;
      }

      // Find positions in document (will skip positions already marked)
      const positions = findTextPositions(doc, reference, true);
      if (!positions) {
        continue;
      }
      
      // Double-check that this position doesn't already have a pill mark
      try {
        const $from = doc.resolve(positions.from);
        const marks = $from.marks();
        const hasPill = marks.some(m => m.type.name === 'scripturePill');
        if (hasPill) {
          continue; // Skip if already marked
        }
      } catch (e) {
        // If we can't resolve, continue anyway
      }
      
      // Get or create note
      const { noteId } = await getOrCreateScriptureNote(reference);
      
      // Apply scripture pill mark - Tiptap will handle mark boundaries naturally
      editor.chain()
        .setTextSelection(positions)
        .unsetMark('noteLink')
        .setMark('scripturePill', { reference: normalizedRef, noteId })
        .run();
      
      // Restore cursor position to where it was before processing
      // Don't insert any spaces - let Tiptap handle mark boundaries
      try {
        editor.chain()
          .setTextSelection(currentCursorPos)
          .run();
      } catch (e) {
        // If cursor position is invalid, just leave it where it is
      }
    }
  } catch (error) {
    console.error('Error in scripture detection:', error);
    // Don't show error toast for detection errors to avoid spam
  }
}

const TiptapEditor: React.FC<TiptapEditorProps> = ({
  content,
  id = "content",
  name = "content",
  placeholder = "Write something...",
  minimalToolbar = false,
  tabindex,
  onContentChange,
  scrollPosition,
  enableCreateNoteFromSelection = false,
  parentThreadId,
  sourceNoteId,
  onEditorReady
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [activeStates, setActiveStates] = useState({
    bold: false,
    italic: false,
    underline: false,
    orderedList: false,
    bulletList: false,
    headingLevel: 0 // 0 = normal/paragraph, 2 = H2, 3 = H3
  });
  const [showCreateNoteButton, setShowCreateNoteButton] = useState(false);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<any>(null);
  const scriptureDetectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousTextContentRef = useRef<string>('');

  // Check if we're on the client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Cleanup scripture detection timeout on unmount
  useEffect(() => {
    return () => {
      if (scriptureDetectionTimeoutRef.current) {
        clearTimeout(scriptureDetectionTimeoutRef.current);
      }
    };
  }, []);

  // Restore scroll position when provided
  useEffect(() => {
    if (scrollPosition && scrollPosition > 0) {
      const timer = setTimeout(() => {
        const editorContent = document.querySelector('.tiptap-content');
        if (editorContent) {
          editorContent.scrollTop = scrollPosition;
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [scrollPosition]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Exclude default Heading extension so we can add custom one with restricted levels
        heading: false,
        // Exclude underline from StarterKit to avoid duplicate extension warning
        underline: false,
      }),
      Heading.configure({
        levels: [2, 3], // Only allow H2, H3 (H1 is reserved for note titles)
      }),
      Underline,
      NoteLink,
      ScripturePill,
      Placeholder.configure({
        placeholder: placeholder,
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
      }),
    ],
    content: content || '',
    onCreate: ({ editor }) => {
      // Notify parent when editor is ready
      if (onEditorReady) {
        onEditorReady(editor);
      }
    },
    onUpdate: ({ editor }) => {
      const htmlContent = editor.getHTML();
      
      // Update hidden input
      if (hiddenInputRef.current) {
        hiddenInputRef.current.value = htmlContent;
      }
      
      // Notify parent component
      if (onContentChange) {
        onContentChange(htmlContent);
      }

      // Only run detection if text content has meaningfully changed
      // This prevents re-detection when only formatting changes or cursor moves
      const currentTextContent = editor.state.doc.textContent.trim();
      const previousTextContent = previousTextContentRef.current.trim();
      
      // Check if text content actually changed (not just whitespace or formatting)
      const textContentChanged = currentTextContent !== previousTextContent;
      
      if (textContentChanged) {
        // Update the previous text content reference
        previousTextContentRef.current = currentTextContent;
        
        // Debounced scripture detection (2 seconds after typing stops)
        if (scriptureDetectionTimeoutRef.current) {
          clearTimeout(scriptureDetectionTimeoutRef.current);
        }

        scriptureDetectionTimeoutRef.current = setTimeout(async () => {
          await detectAndCreateScriptureNotes(editor);
        }, 2000);
      }
    },
    editable: true,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none [&_ol]:list-decimal [&_ul]:list-disc',
        style: 'font-family: var(--font-sans); font-size: 16px; line-height: 1.6; color: var(--color-deep-grey); min-height: 200px;',
        tabindex: (tabindex || 0).toString(),
      },
      transformPastedHTML: (html: string) => {
        // Transform heading levels when pasting:
        // H1 → H2, H2 → H3, H3 → H3, H4+ → H3
        if (!html || typeof html !== 'string') {
          return html;
        }
        
        try {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = html;
          
          // Process all heading tags
          const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
          headings.forEach((heading) => {
            const level = parseInt(heading.tagName.charAt(1));
            if (isNaN(level) || level < 1 || level > 6) {
              return; // Skip invalid headings
            }
            
            let newLevel: number;
            
            if (level === 1) {
              newLevel = 2; // H1 → H2
            } else if (level === 2) {
              newLevel = 3; // H2 → H3
            } else {
              newLevel = 3; // H3, H4, H5, H6 → H3 (clamp to max)
            }
            
            // Only transform if newLevel is in allowed range [2, 3]
            if (newLevel >= 2 && newLevel <= 3) {
              const newHeading = document.createElement(`h${newLevel}`);
              newHeading.innerHTML = heading.innerHTML;
              // Copy attributes
              Array.from(heading.attributes).forEach(attr => {
                newHeading.setAttribute(attr.name, attr.value);
              });
              if (heading.parentNode) {
                heading.parentNode.replaceChild(newHeading, heading);
              }
            } else {
              // If somehow we get an invalid level, convert to paragraph
              const p = document.createElement('p');
              p.innerHTML = heading.innerHTML;
              Array.from(heading.attributes).forEach(attr => {
                if (attr.name !== 'class' || !attr.value.includes('heading')) {
                  p.setAttribute(attr.name, attr.value);
                }
              });
              if (heading.parentNode) {
                heading.parentNode.replaceChild(p, heading);
              }
            }
          });
          
          return tempDiv.innerHTML;
        } catch (error) {
          return html; // Return original HTML on error
        }
      },
      handleKeyDown: (view, event) => {
        const editor = editorRef.current;
        if (!editor) return false;
        
        // Handle Select All (Cmd+A on Mac, Ctrl+A on Windows/Linux)
        if ((event.metaKey || event.ctrlKey) && event.key === 'a') {
          event.preventDefault();
          editor.commands.selectAll();
          return true;
        }
        
        // Handle Tab and Space to exit scripture pills
        const { from, to } = view.state.selection;
        const $from = view.state.selection.$from;
        const scripturePillMark = $from.marks().find(mark => mark.type.name === 'scripturePill');
        
        if (scripturePillMark && from === to) {
          // Cursor is inside a scripture pill
          // Find the end of the mark by checking positions forward
          const doc = view.state.doc;
          let pillEnd = from;
          
          // Find where the mark ends by checking marks at each position
          for (let pos = from; pos <= doc.content.size; pos++) {
            try {
              const $pos = doc.resolve(pos);
              const marks = $pos.marks();
              const hasPill = marks.some(m => m.type.name === 'scripturePill');
              if (!hasPill) {
                pillEnd = pos;
                break;
              }
            } catch (e) {
              // If we can't resolve the position, we've reached the end
              pillEnd = pos;
              break;
            }
          }
          
          if (event.key === 'Tab') {
            event.preventDefault();
            // Move cursor to end of pill and unset marks
            editor.chain()
              .setTextSelection(pillEnd)
              .unsetAllMarks()
              .run();
            return true;
          } else if (event.key === ' ') {
            event.preventDefault();
            // Insert a space after the pill and move cursor after it
            editor.chain()
              .setTextSelection(pillEnd)
              .insertContent(' ')
              .setTextSelection(pillEnd + 1)
              .unsetAllMarks()
              .run();
            return true;
          }
        }
        
        // Handle Auto-Capitalize First Line
        // Check if cursor is at the very start of the document
        const isAtDocumentStart = from === to && (
          from === 1 || // Empty document or at very start
          ($from.depth === 1 && $from.parentOffset === 0 && $from.parent.type.name === 'paragraph') // Start of first paragraph
        );
        
        if (isAtDocumentStart) {
          // Check if a single lowercase letter is being typed (but not during paste or other shortcuts)
          if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1 && /^[a-z]$/.test(event.key)) {
            event.preventDefault();
            // Insert the uppercase version instead
            editor.commands.insertContent(event.key.toUpperCase());
            return true;
          }
        }
        
        return false;
      },
    },
    // Fix SSR issues
    immediatelyRender: false,
  });

  // Store editor in ref for handleKeyDown access
  useEffect(() => {
    if (editor) {
      editorRef.current = editor;
      // Initialize previous text content reference
      previousTextContentRef.current = editor.state.doc.textContent;
    }
  }, [editor]);

  // Update content from props, but only if it's different and editor is not focused
  // This preserves marks that are already in the editor
  useEffect(() => {
    if (!editor || !content) return;
    
    // Only update if editor is not focused (to avoid interrupting user typing)
    if (!editor.isFocused) {
      const currentContent = editor.getHTML();
      // Only update if content actually changed (prevents unnecessary updates that clear marks)
      if (currentContent !== content) {
        // Use setContent with emitUpdate: false to prevent triggering detection
        // This preserves marks that are in the HTML content
        editor.commands.setContent(content, false);
        // Update previous text content reference to prevent unnecessary detection
        previousTextContentRef.current = editor.state.doc.textContent;
      }
    }
  }, [editor, content]);

  // Ensure editor is focused and editable
  useEffect(() => {
    if (editor) {
      // Focus the editor when it receives focus via tab
      const handleFocus = () => {
        editor.commands.focus();
      };
      
      const editorElement = document.querySelector(`#${id} .ProseMirror`);
      if (editorElement) {
        editorElement.addEventListener('focus', handleFocus);
        
        return () => {
          editorElement.removeEventListener('focus', handleFocus);
        };
      }
    }
  }, [editor, id]);

  // Helper function to detect if selection has formatting
  const hasFormatting = (editor: any): boolean => {
    if (!editor) return false;
    
    const { from, to } = editor.state.selection;
    if (from === to) return false;
    
    let hasMarks = false;
    let hasComplexNodes = false;
    
    editor.state.doc.nodesBetween(from, to, (node: any) => {
      // Check for marks (bold, italic, underline, etc.)
      if (node.marks && node.marks.length > 0) {
        hasMarks = true;
      }
      // Check for non-paragraph nodes (lists, headings, etc.)
      if (node.type.name !== 'paragraph' && node.type.name !== 'text') {
        hasComplexNodes = true;
      }
    });
    
    return hasMarks || hasComplexNodes;
  };

  // Helper function to validate selection
  const isValidSelection = (editor: any): boolean => {
    if (!editor) return false;
    
    const { from, to } = editor.state.selection;
    // Return true for any non-empty selection (no minimum length required)
    return from !== to;
  };

  // Selection detection for create note button
  useEffect(() => {
    if (!editor || !enableCreateNoteFromSelection) {
      setShowCreateNoteButton(false);
      return;
    }

    const updateSelection = () => {
      if (isValidSelection(editor)) {
        setShowCreateNoteButton(true);
      } else {
        setShowCreateNoteButton(false);
      }
    };

    editor.on('selectionUpdate', updateSelection);

    return () => {
      editor.off('selectionUpdate', updateSelection);
    };
  }, [editor, enableCreateNoteFromSelection]);

  // Handle create note from selection
  const handleCreateNoteFromSelection = async () => {
    if (!editor) return;
    
    const { from, to } = editor.state.selection;
    if (from === to) return;
    
    // Determine if we should preserve formatting
    const preserveFormatting = hasFormatting(editor);
    
    // Extract content
    let extractedContent: string;
    
    if (preserveFormatting) {
      // For formatted content, extract HTML from DOM selection
      const view = editor.view;
      const startPos = view.domAtPos(from);
      const endPos = view.domAtPos(to);
      
      // Get the DOM nodes in the selection
      if (startPos.node && endPos.node) {
        try {
          const range = document.createRange();
          range.setStart(startPos.node, startPos.offset);
          range.setEnd(endPos.node, endPos.offset);
          const htmlFragment = range.cloneContents();
          const tempDiv = document.createElement('div');
          tempDiv.appendChild(htmlFragment);
          extractedContent = tempDiv.innerHTML;
        } catch (e) {
          // Fallback to plain text if DOM extraction fails
          extractedContent = editor.state.doc.textBetween(from, to);
        }
      } else {
        // Fallback to plain text
        extractedContent = editor.state.doc.textBetween(from, to);
      }
    } else {
      // Plain text - use textBetween
      extractedContent = editor.state.doc.textBetween(from, to);
    }
    
    // Detect if this is scripture
    try {
      const plainText = extractedContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      
      if (plainText.length >= 5) {
        const detectResponse = await fetch('/api/scripture/detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: plainText }),
          credentials: 'include'
        });

        if (detectResponse.ok) {
          const detection = await detectResponse.json();
          
          if (detection.isScripture && detection.confidence >= 0.7 && detection.primaryReference) {
            try {
              // Normalize the reference before checking to ensure consistent format matching
              const normalizedReference = normalizeScriptureReference(detection.primaryReference);
              
              const checkExistingResponse = await fetch('/api/scripture/check-existing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: normalizedReference }),
                credentials: 'include'
              });

              if (checkExistingResponse.ok) {
                const existingCheck = await checkExistingResponse.json();
                
                if (existingCheck.exists && existingCheck.noteId) {
                  // Existing note found - automatically add to thread
                  const targetThreadId = parentThreadId || localStorage.getItem('newNoteThread') || 'thread_unorganized';
                  
                  try {
                    const addThreadResponse = await fetch(`/api/notes/${existingCheck.noteId}/add-thread`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ threadId: targetThreadId }),
                      credentials: 'include'
                    });

                    let result;
                    try {
                      result = await addThreadResponse.json();
                    } catch (jsonError) {
                      // If JSON parsing fails, log and continue - will fall through to new note creation
                      console.error('[TiptapEditor] Failed to parse add-thread response:', jsonError);
                      result = { error: 'Failed to parse response' };
                    }

                    if (addThreadResponse.ok) {
                      // Success case - note was added to thread
                      if (result.success) {
                        const toastMessage = `Added ${normalizedReference} to this thread.`;
                        if (window.toast) {
                          window.toast.success(toastMessage);
                        }
                        // Also dispatch event for layout handling
                        window.dispatchEvent(new CustomEvent('showToast', {
                          detail: {
                            message: toastMessage,
                            type: 'success'
                          }
                        }));
                      }
                      
                      // After adding to thread, fire event to create hyperlink in the source note
                      const { from, to } = editor.state.selection;
                      window.dispatchEvent(new CustomEvent('createHyperlink', {
                          detail: {
                              sourceNoteId,
                              newNoteId: existingCheck.noteId, // Use the ID of the existing note
                              from,
                              to,
                          }
                      }));
                    } else if (addThreadResponse.status === 400) {
                      // Handle 400 status - could be "already in thread" or other validation errors
                      const errorMessage = result.error || 'Unknown error';
                      
                      // Check if it's the "already in thread" case (flexible matching)
                      const isAlreadyInThread = errorMessage.includes('already in this thread') || 
                                                errorMessage.includes('already in thread') ||
                                                errorMessage === 'Note is already in this thread';
                      
                      if (isAlreadyInThread) {
                        // Note is already in thread - show toast using multiple methods
                        const toastMessage = `${normalizedReference} is already in this thread.`;
                        console.log('[TiptapEditor] Note already in thread, dispatching showToast event:', toastMessage);
                        
                        // Dispatch a custom event for the layout to handle.
                        // This is more robust than calling window.toast directly.
                        window.dispatchEvent(new CustomEvent('showToast', {
                          detail: {
                            message: toastMessage,
                            type: 'info'
                          }
                        }));
                        
                        // After confirming note is in thread, fire event to create hyperlink in the source note
                        const { from, to } = editor.state.selection;
                        window.dispatchEvent(new CustomEvent('createHyperlink', {
                            detail: {
                                sourceNoteId,
                                newNoteId: existingCheck.noteId, // Use the ID of the existing note
                                from,
                                to,
                            }
                        }));
                      } else {
                        // Other 400 error - log but don't show toast (will fall through to new note creation)
                        console.warn('[TiptapEditor] Error adding note to thread (not "already in thread"):', errorMessage);
                      }
                    } else {
                      console.error('[TiptapEditor] Unexpected response status when adding note to thread:', addThreadResponse.status, result);
                    }
                  } catch (addError) {
                    // Error adding existing note to thread, falling back to new note creation
                    console.error('[TiptapEditor] Error in addThreadResponse:', addError);
                  }
                  
                  // Clear selection and close
                  editor.commands.blur();
                  setShowCreateNoteButton(false);
                  return; // Exit early - don't create new note
                } else {
                  // Note doesn't exist - will fall through to create new note
                  console.log('[TiptapEditor] Scripture note does not exist, will create new note:', normalizedReference);
                }
              } else {
                // Non-OK response from check-existing API
                const errorText = await checkExistingResponse.text().catch(() => 'Unknown error');
                console.error('[TiptapEditor] Error checking for existing scripture note:', checkExistingResponse.status, errorText);
                // Continue to create new note since check failed
              }
            } catch (checkError) {
              // Error checking for existing scripture note
              console.error('[TiptapEditor] Exception while checking for existing scripture note:', checkError);
              // Continue to create new note since check failed
            }

            // No existing note found - proceed with creating new note
            // Fetch verse text
            try {
              const verseResponse = await fetch('/api/scripture/fetch-verse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: detection.primaryReference }),
                credentials: 'include'
              });

              if (verseResponse.ok) {
                const verseData = await verseResponse.json();
                
                // Store scripture detection metadata (keep original format, no divider)
                localStorage.setItem('newNoteType', 'scripture');
                localStorage.setItem('newNoteScriptureReference', detection.primaryReference);
                localStorage.setItem('newNoteScriptureVersion', 'NET');
                localStorage.setItem('newNoteScriptureText', verseData.text);
                localStorage.setItem('newNoteTitle', detection.primaryReference); // Reference becomes title
                localStorage.setItem('newNoteContent', verseData.text); // Verse text becomes content
              } else {
                // Detection succeeded but verse fetch failed - still mark as scripture
                localStorage.setItem('newNoteType', 'scripture');
                localStorage.setItem('newNoteScriptureReference', detection.primaryReference);
                localStorage.setItem('newNoteScriptureVersion', 'NET');
                localStorage.setItem('newNoteTitle', detection.primaryReference);
                localStorage.setItem('newNoteContent', extractedContent); // Fallback to original content
              }
            } catch (verseError) {
              // Still mark as scripture even if verse fetch fails
              localStorage.setItem('newNoteType', 'scripture');
              localStorage.setItem('newNoteScriptureReference', detection.primaryReference);
              localStorage.setItem('newNoteScriptureVersion', 'NET');
              localStorage.setItem('newNoteTitle', detection.primaryReference);
              localStorage.setItem('newNoteContent', extractedContent);
            }
          } else {
            // Not scripture - clear any previous scripture metadata
            localStorage.removeItem('newNoteType');
            localStorage.removeItem('newNoteScriptureReference');
            localStorage.removeItem('newNoteScriptureVersion');
            localStorage.removeItem('newNoteScriptureText');
            localStorage.setItem('newNoteContent', extractedContent);
          }
        }
      } else {
        // Too short to check - just store content
        localStorage.setItem('newNoteContent', extractedContent);
      }
    } catch (error) {
      // Continue anyway - don't block note creation
      localStorage.setItem('newNoteContent', extractedContent);
    }
    
    // Store parent thread ID if provided
    if (parentThreadId) {
      localStorage.setItem('newNoteThread', parentThreadId);
    }
    
    // Store source note context for hyperlink creation
    if (sourceNoteId) {
      localStorage.setItem('newNoteSourceNoteId', sourceNoteId);
      localStorage.setItem('newNoteSourceSelectionFrom', from.toString());
      localStorage.setItem('newNoteSourceSelectionTo', to.toString());
      // Also store plain text version for matching in HTML
      const plainTextForMatching = editor.state.doc.textBetween(from, to, ' ');
      localStorage.setItem('newNoteSourceSelectionPlainText', plainTextForMatching);
    }
    
    // Set localStorage first (as backup in case event listener isn't ready yet)
    localStorage.setItem('showNewNotePanel', 'true');
    localStorage.setItem('showNewThreadPanel', 'false');
    
    // Dispatch event to open NewNotePanel
    window.dispatchEvent(new CustomEvent('openNewNotePanel'));
    
    // Clear selection
    editor.commands.blur();
    setShowCreateNoteButton(false);
  };

  // Handle note link clicks
  useEffect(() => {
    if (!editor) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.classList.contains('note-link')) {
        const noteId = target.getAttribute('data-note-id');
        if (noteId) {
          event.preventDefault();
          event.stopPropagation();
          window.location.href = `/${noteId}`;
        }
      }
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener('click', handleClick);

    return () => {
      editorElement.removeEventListener('click', handleClick);
    };
  }, [editor]);

  // Track editor focus state
  useEffect(() => {
    if (!editor) return;

    const handleFocus = () => {
      setIsEditorFocused(true);
    };

    const handleBlur = (event: any) => {
      // Don't hide toolbar if blur is caused by clicking toolbar button
      // Check if the related target (what's being focused) is within the toolbar
      const relatedTarget = event.event?.relatedTarget;
      if (relatedTarget) {
        const toolbar = document.querySelector('.tiptap-toolbar');
        if (toolbar && toolbar.contains(relatedTarget)) {
          // Blur is from clicking toolbar button, keep toolbar visible
          return;
        }
      }
      // Small delay to allow focus to return to editor if needed
      setTimeout(() => {
        if (editor && !editor.isFocused) {
          setIsEditorFocused(false);
        }
      }, 100);
    };

    editor.on('focus', handleFocus);
    editor.on('blur', handleBlur);

    // Set initial focus state
    setIsEditorFocused(editor.isFocused);

    return () => {
      editor.off('focus', handleFocus);
      editor.off('blur', handleBlur);
    };
  }, [editor]);

  // Update active states when editor changes
  useEffect(() => {
    if (!editor) {
      return;
    }

    const updateActiveStates = () => {
      // Detect current heading level (0 = paragraph, 2 = H2, 3 = H3)
      let headingLevel = 0;
      if (editor.isActive('heading', { level: 2 })) {
        headingLevel = 2;
      } else if (editor.isActive('heading', { level: 3 })) {
        headingLevel = 3;
      }
      
      const newStates = {
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        orderedList: editor.isActive('orderedList'),
        bulletList: editor.isActive('bulletList'),
        headingLevel: headingLevel
      };
      setActiveStates(newStates);
    };

    // Update on selection change
    editor.on('selectionUpdate', updateActiveStates);
    editor.on('update', updateActiveStates);

    // Initial update
    updateActiveStates();

    return () => {
      editor.off('selectionUpdate', updateActiveStates);
      editor.off('update', updateActiveStates);
    };
  }, [editor]);

  useEffect(() => {
    // Load Font Awesome
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';
    document.head.appendChild(link);
    
    setIsLoaded(true);
    
    return () => {
      if (link && link.parentNode === document.head) {
        document.head.removeChild(link);
      }
    };
  }, []);

  if (!isClient || !editor) {
    return (
      <div className="tiptap-editor-container">
        <input
          ref={hiddenInputRef}
          type="hidden"
          id={id}
          name={name}
          value={content}
        />
        <div className="min-h-[200px] p-4 text-gray-500">
          Loading editor...
        </div>
      </div>
    );
  }

  // Handle heading cycle: H2 → H3 → Normal → H2
  const handleHeadingCycle = () => {
    if (!editor) return;
    
    const currentLevel = activeStates.headingLevel;
    
    if (currentLevel === 0) {
      // Currently paragraph, set to H2
      editor.chain().focus().setHeading({ level: 2 }).run();
    } else if (currentLevel === 2) {
      // Currently H2, set to H3
      editor.chain().focus().setHeading({ level: 3 }).run();
    } else if (currentLevel === 3) {
      // Currently H3, set to paragraph (normal)
      editor.chain().focus().setParagraph().run();
    }
  };

  const ToolbarButton = ({ 
    onClick, 
    isActive, 
    children, 
    title,
    ariaLabel 
  }: { 
    onClick: () => void; 
    isActive: boolean; 
    children: React.ReactNode; 
    title: string;
    ariaLabel?: string;
  }) => (
    <button
      type="button"
      onMouseDown={(e) => {
        // Use onMouseDown to prevent editor from losing focus
        e.preventDefault();
        e.stopPropagation();
        
        // Visual feedback for click
        e.currentTarget.style.setProperty('filter', 'brightness(0.97)', 'important');
        e.currentTarget.style.setProperty('transform', 'scale(0.98)', 'important');
        
        // Execute the command
        onClick();
        
        // Ensure editor stays focused after command
        setTimeout(() => {
          if (editor && !editor.isFocused) {
            editor.commands.focus();
          }
        }, 0);
      }}
      onClick={(e) => {
        // Prevent default click behavior
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`flex items-center justify-center min-w-[2.5rem] min-h-[2.5rem] px-3 py-2 rounded-lg transition-all duration-200 relative ${isActive ? 'ql-active' : ''}`}
      title={title}
      aria-label={ariaLabel || title}
      style={{
        fontFamily: 'var(--font-sans) !important',
        fontSize: '14px !important',
        fontWeight: '500 !important',
        color: 'var(--color-deep-grey) !important',
        background: 'transparent !important',
        border: 'none !important',
        borderRadius: '8px !important',
        padding: '8px 12px !important',
        margin: '0 !important',
        minWidth: '40px !important',
        minHeight: '40px !important',
        display: 'flex !important',
        alignItems: 'center !important',
        justifyContent: 'center !important',
        boxShadow: 'none !important',
        cursor: 'pointer !important',
        transition: '0.2s ease-in-out !important'
      }}
      onMouseEnter={(e) => {
        // NO background change on hover - keep transparent
        e.currentTarget.style.setProperty('background', 'transparent', 'important');
        e.currentTarget.style.setProperty('box-shadow', 'none', 'important');
        e.currentTarget.style.setProperty('boxShadow', 'none', 'important');
        
        // Change icon color on hover
        const iconDiv = e.currentTarget.querySelector('div');
        if (iconDiv) {
          iconDiv.style.setProperty('color', '#4A4A4A', 'important');
        }
      }}
      onMouseLeave={(e) => {
        // Keep transparent background
        e.currentTarget.style.setProperty('background', 'transparent', 'important');
        e.currentTarget.style.setProperty('box-shadow', 'none', 'important');
        e.currentTarget.style.setProperty('boxShadow', 'none', 'important');
        
        // Reset icon color on leave (unless active)
        const iconDiv = e.currentTarget.querySelector('div');
        if (iconDiv) {
          iconDiv.style.setProperty('color', isActive ? '#4A4A4A' : 'rgb(139, 139, 139)', 'important');
        }
      }}
      onMouseUp={(e) => {
        // Visual feedback for click
        e.currentTarget.style.setProperty('filter', 'none', 'important');
        e.currentTarget.style.setProperty('transform', 'none', 'important');
      }}
    >
      <div style={{ 
        color: isActive ? '#4A4A4A' : 'rgb(139, 139, 139)',
        transition: 'color 0.2s ease-in-out',
        width: '20px',
        height: '20px',
        fontSize: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {children}
      </div>
      {isActive && (
        <div 
          className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-[var(--color-deep-grey)] rounded-full"
          style={{
            position: 'absolute',
            bottom: '0px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '4px',
            height: '4px',
            background: 'var(--color-deep-grey)',
            borderRadius: '50%',
            zIndex: 1
          }}
        />
      )}
    </button>
  );

  return (
    <div className="tiptap-editor-container flex flex-col" style={{ height: '100%', minHeight: 0 }}>
      {/* Hidden input for form submission */}
      <input
        ref={hiddenInputRef}
        type="hidden"
        id={id}
        name={name}
        value={editor.getHTML()}
      />
      
      {/* Editor content area */}
      <div 
        className="tiptap-content flex-1 min-h-0 overflow-auto"
        style={{ height: 0 }}
        onClick={() => {
          if (editor) {
            editor.commands.focus();
          }
        }}
      >
        <EditorContent editor={editor} />
        {enableCreateNoteFromSelection && (
          <BubbleMenu
            editor={editor}
            shouldShow={({ editor }) => isValidSelection(editor)}
          >
            <div style={{ zIndex: 99999, pointerEvents: 'auto', display: 'inline-block' }}>
              <ButtonSmall
                state="Default"
                onMouseDown={(e: React.MouseEvent) => {
                  // Use onMouseDown for better reliability in Floating UI portals
                  e.preventDefault();
                  e.stopPropagation();
                  handleCreateNoteFromSelection();
                }}
                type="button"
              >
                <i className="fa-solid fa-plus" style={{ width: '14px', height: '14px', fontSize: '14px', display: 'inline-block', marginRight: '8px' }} />
                <span>Create Note</span>
              </ButtonSmall>
            </div>
          </BubbleMenu>
        )}
      </div>
      
      {/* Custom SpaceButton-styled toolbar - positioned at bottom */}
        {!minimalToolbar && isEditorFocused && (
          <div 
            className="tiptap-toolbar flex gap-1 items-center p-1 border border-[var(--color-fog-white)] rounded-xl bg-[var(--color-snow-white)] mt-2 shrink-0"
          >
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().toggleBold().run();
            }}
            isActive={activeStates.bold}
            title="bold"
            ariaLabel="Toggle bold"
          >
            <i className="fa-solid fa-bold" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().toggleItalic().run();
            }}
            isActive={activeStates.italic}
            title="italic"
            ariaLabel="Toggle italic"
          >
            <i className="fa-solid fa-italic" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().toggleUnderline().run();
            }}
            isActive={activeStates.underline}
            title="underline"
            ariaLabel="Toggle underline"
          >
            <i className="fa-solid fa-underline" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              handleHeadingCycle();
            }}
            isActive={activeStates.headingLevel > 0}
            title={`heading (${activeStates.headingLevel > 0 ? `H${activeStates.headingLevel}` : 'Normal'})`}
            ariaLabel={`Toggle heading (${activeStates.headingLevel > 0 ? `H${activeStates.headingLevel}` : 'Normal'})`}
          >
            <i className="fa-solid fa-heading" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().toggleOrderedList().run();
            }}
            isActive={activeStates.orderedList}
            title="list: ordered"
            ariaLabel="Toggle ordered list"
          >
            <i className="fa-solid fa-list-ol" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().toggleBulletList().run();
            }}
            isActive={activeStates.bulletList}
            title="list: bullet"
            ariaLabel="Toggle bullet list"
          >
            <i className="fa-solid fa-list" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().clearNodes().unsetAllMarks().run();
            }}
            isActive={false}
            title="clean"
            ariaLabel="Clear formatting"
          >
            <i className="fa-solid fa-eraser" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
        </div>
      )}
      
      <style>{`
        .tiptap-editor-container {
          height: 100% !important;
          min-height: 0 !important;
          max-height: 100% !important;
          overflow: hidden !important;
          display: flex !important;
          flex-direction: column !important;
        }
        
        /* Placeholder styling */
        .tiptap-editor-container .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
        
        .tiptap-content {
          flex: 1 1 0% !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          min-height: 0 !important;
          max-height: 100% !important;
          height: 0 !important;
          width: 100% !important;
          display: block !important;
          position: relative !important;
          contain: layout size style !important;
        }
        
        .tiptap-content :global(.ProseMirror) {
          font-family: var(--font-sans) !important;
          font-size: 16px !important;
          line-height: 1.6 !important;
          color: var(--color-deep-grey) !important;
          padding: 16px !important;
          border: 1px solid #e5e5e5 !important;
          background: white !important;
          outline: none !important;
          min-height: 100px !important;
          height: auto !important;
          max-width: 100% !important;
          width: 100% !important;
          overflow: visible !important;
          border-radius: 8px !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          display: block !important;
          word-wrap: break-word !important;
        }
        
        .tiptap-content :global(.ProseMirror:focus) {
          outline: none !important;
        }
        
        .tiptap-content :global(.ProseMirror p.is-editor-empty:first-child::before) {
          color: var(--color-pebble-grey) !important;
          content: attr(data-placeholder) !important;
          float: left !important;
          height: 0 !important;
          pointer-events: none !important;
        }
        
        .tiptap-content :global(.ProseMirror p) {
          margin: 0.75em 0 !important;
        }
        
        .tiptap-content :global(.ProseMirror p:first-child) {
          margin-top: 0 !important;
        }
        
        .tiptap-content :global(.ProseMirror p:last-child) {
          margin-bottom: 0 !important;
        }
        
        .tiptap-content :global(.ProseMirror ul) {
          list-style-type: disc !important;
          padding-left: 1.5em !important;
          margin-left: 0 !important;
        }
        
        .tiptap-content :global(.ProseMirror ol) {
          list-style-type: decimal !important;
          padding-left: 1.5em !important;
          margin-left: 0 !important;
        }
        
        .tiptap-content :global(.ProseMirror li) {
          margin-bottom: 0.5em !important;
          color: var(--color-deep-grey) !important;
          display: list-item !important;
          list-style-position: outside !important;
          list-style-type: inherit !important;
        }
        
        /* Heading styles */
        .tiptap-content :global(.ProseMirror h2) {
          font-size: 18px !important;
          font-weight: 600 !important;
          line-height: 1.3 !important;
          margin-top: 1.5em !important;
          margin-bottom: 0.75em !important;
          color: var(--color-deep-grey) !important;
          font-family: var(--font-sans) !important;
        }
        
        .tiptap-content :global(.ProseMirror h2:first-child) {
          margin-top: 0 !important;
        }
        
        .tiptap-content :global(.ProseMirror h3) {
          font-size: 16px !important;
          font-weight: 600 !important;
          line-height: 1.4 !important;
          margin-top: 1.25em !important;
          margin-bottom: 0.625em !important;
          color: var(--color-deep-grey) !important;
          font-family: var(--font-sans) !important;
        }
        
        .tiptap-content :global(.ProseMirror h3:first-child) {
          margin-top: 0 !important;
        }
        
        /* Horizontal rule styles */
        .tiptap-content :global(.ProseMirror hr) {
          margin: 1.5em 0 !important;
          border: none !important;
          border-top: 1px solid #e5e5e5 !important;
          background: none !important;
          height: 1px !important;
          padding: 0 !important;
        }
        
        .tiptap-content :global(.ProseMirror hr:first-child) {
          margin-top: 0 !important;
        }
        
        .tiptap-content :global(.ProseMirror hr:last-child) {
          margin-bottom: 0 !important;
        }
        
        /* Override all conflicting CSS for toolbar buttons */
        .tiptap-toolbar button {
          box-shadow: none !important;
          background: transparent !important;
        }
        
        .tiptap-toolbar button:hover {
          box-shadow: none !important;
          background: transparent !important;
        }
        
        .tiptap-toolbar button:hover div {
          color: #4A4A4A !important;
        }
        
        .tiptap-toolbar button.ql-active {
          box-shadow: none !important;
          background: transparent !important;
        }
        
        .tiptap-toolbar button.ql-active div {
          color: #4A4A4A !important;
        }
        
        .tiptap-toolbar button:active {
          box-shadow: none !important;
          filter: brightness(0.97) !important;
          transform: scale(0.98) !important;
        }
        
        /* Force override any conflicting styles from other components */
        .tiptap-toolbar button,
        .tiptap-toolbar button:hover,
        .tiptap-toolbar button:focus,
        .tiptap-toolbar button:active,
        .tiptap-toolbar button.ql-active {
          background: transparent !important;
          box-shadow: none !important;
        }
        
        /* Note link styling - highlighted text that looks like selection */
        .tiptap-content :global(.ProseMirror .note-link) {
          background-color: rgba(255, 235, 59, 0.4) !important;
          cursor: pointer !important;
          text-decoration: none !important;
          border-radius: 2px !important;
          padding: 1px 2px !important;
          margin: 0 -2px !important;
        }
        
        .tiptap-content :global(.ProseMirror .note-link:hover) {
          background-color: rgba(255, 235, 59, 0.5) !important;
        }
      `}</style>
    </div>
  );
};

export default TiptapEditor;
