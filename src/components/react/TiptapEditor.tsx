import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { NoteLink } from './TiptapNoteLink.ts';
import ButtonSmall from './ButtonSmall';

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

  // Check if we're on the client side
  useEffect(() => {
    setIsClient(true);
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
      }),
      Heading.configure({
        levels: [2, 3], // Only allow H2, H3 (H1 is reserved for note titles)
      }),
      Underline,
      NoteLink,
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
    },
    editable: true,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none [&_ol]:list-decimal [&_ul]:list-disc',
        style: 'font-family: var(--font-sans); font-size: 16px; line-height: 1.6; color: var(--color-deep-grey); min-height: 200px;',
        tabindex: tabindex || 0,
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
          console.error('Error transforming pasted HTML:', error);
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
        
        // Handle Auto-Capitalize First Line
        // Check if cursor is at the very start of the document
        const { from, to } = view.state.selection;
        
        // Check if cursor is at the start of the first paragraph
        // In ProseMirror, position 1 is the start of content for empty documents
        // For documents with content, we check if we're at the start of the first block
        const $from = view.state.selection.$from;
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
    }
  }, [editor]);

  useEffect(() => {
    if (editor && content && !editor.isFocused) {
      editor.commands.setContent(content);
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
              const checkExistingResponse = await fetch('/api/scripture/check-existing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: detection.primaryReference }),
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

                    if (addThreadResponse.ok) {
                      // Both success and "already in thread" are considered success for the user action.
                      // Trigger the toast and hyperlink creation in both cases.
                      const result = await addThreadResponse.json();

                      if (result.success) {
                          if (window.toast) {
                              window.toast.success(`Note added to thread.`);
                          }
                      } else {
                          if (window.toast) {
                              window.toast.info('Note is already in this thread.');
                          }
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
                      
                    } else {
                      console.error('Error adding existing note to thread, falling back to new note creation.');
                    }
                  } catch (addError) {
                    console.error('Exception when adding existing note to thread:', addError);
                  }
                  
                  // Clear selection and close
                  editor.commands.blur();
                  setShowCreateNoteButton(false);
                  return; // Exit early - don't create new note
                }
              }
            } catch (checkError) {
              console.error('Exception when checking for existing scripture note:', checkError);
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
              console.error('Error fetching verse in selection:', verseError);
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
      console.error('Error detecting scripture in selection:', error);
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
    title 
  }: { 
    onClick: () => void; 
    isActive: boolean; 
    children: React.ReactNode; 
    title: string;
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
            tippyOptions={{ duration: 100, zIndex: 99999 }}
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
                console.error('Editor not available');
                return;
              }
              editor.chain().focus().toggleBold().run();
            }}
            isActive={activeStates.bold}
            title="bold"
          >
            <i className="fa-solid fa-bold" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                console.error('Editor not available');
                return;
              }
              editor.chain().focus().toggleItalic().run();
            }}
            isActive={activeStates.italic}
            title="italic"
          >
            <i className="fa-solid fa-italic" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                console.error('Editor not available');
                return;
              }
              editor.chain().focus().toggleUnderline().run();
            }}
            isActive={activeStates.underline}
            title="underline"
          >
            <i className="fa-solid fa-underline" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                console.error('Editor not available');
                return;
              }
              handleHeadingCycle();
            }}
            isActive={activeStates.headingLevel > 0}
            title={`heading (${activeStates.headingLevel > 0 ? `H${activeStates.headingLevel}` : 'Normal'})`}
          >
            <i className="fa-solid fa-heading" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                console.error('Editor not available');
                return;
              }
              editor.chain().focus().toggleOrderedList().run();
            }}
            isActive={activeStates.orderedList}
            title="list: ordered"
          >
            <i className="fa-solid fa-list-ol" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                console.error('Editor not available');
                return;
              }
              editor.chain().focus().toggleBulletList().run();
            }}
            isActive={activeStates.bulletList}
            title="list: bullet"
          >
            <i className="fa-solid fa-list" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                console.error('Editor not available');
                return;
              }
              editor.chain().focus().clearNodes().unsetAllMarks().run();
            }}
            isActive={false}
            title="clean"
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
