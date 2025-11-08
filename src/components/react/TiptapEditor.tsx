import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import ButtonSmall from './ButtonSmall';

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
    bulletList: false
  });
  const [showCreateNoteButton, setShowCreateNoteButton] = useState(false);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<any>(null);

  // Check if we're on the client side
  useEffect(() => {
    console.log('TiptapEditor: Setting client to true');
    setIsClient(true);
  }, []);

  // Restore scroll position when provided
  useEffect(() => {
    if (scrollPosition && scrollPosition > 0) {
      const timer = setTimeout(() => {
        const editorContent = document.querySelector('.tiptap-content');
        if (editorContent) {
          editorContent.scrollTop = scrollPosition;
          console.log('TiptapEditor: Scroll position restored:', scrollPosition);
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [scrollPosition]);

  console.log('TiptapEditor: Placeholder text:', placeholder);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Keep all default extensions including lists
      }),
      Underline,
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
      console.log('TiptapEditor: Editor updated');
      const htmlContent = editor.getHTML();
      
      // Update hidden input
      if (hiddenInputRef.current) {
        hiddenInputRef.current.value = htmlContent;
        console.log('TiptapEditor: Updated hidden input with content:', htmlContent.substring(0, 50) + '...');
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
    
    // Set localStorage first (as backup in case event listener isn't ready yet)
    localStorage.setItem('showNewNotePanel', 'true');
    localStorage.setItem('showNewThreadPanel', 'false');
    
    // Dispatch event to open NewNotePanel
    window.dispatchEvent(new CustomEvent('openNewNotePanel'));
    
    // Clear selection
    editor.commands.blur();
    setShowCreateNoteButton(false);
  };

  // Track editor focus state
  useEffect(() => {
    if (!editor) return;

    const handleFocus = () => {
      setIsEditorFocused(true);
    };

    const handleBlur = () => {
      setIsEditorFocused(false);
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
      console.log('No editor available for active state management');
      return;
    }

    console.log('Setting up active state management for editor');

    const updateActiveStates = () => {
      const newStates = {
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        orderedList: editor.isActive('orderedList'),
        bulletList: editor.isActive('bulletList')
      };
      console.log('Updating active states:', newStates);
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
      onClick={onClick}
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
      onMouseDown={(e) => {
        // Match CardFullEditable click effects - override old QuillEditor styles
        e.currentTarget.style.setProperty('filter', 'brightness(0.97)', 'important');
        e.currentTarget.style.setProperty('transform', 'scale(0.98)', 'important');
      }}
      onMouseUp={(e) => {
        // Reset click effects - override old QuillEditor styles
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
          console.log('TiptapEditor: Clicked, focusing editor');
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
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={activeStates.bold}
            title="bold"
          >
            <i className="fa-solid fa-bold" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={activeStates.italic}
            title="italic"
          >
            <i className="fa-solid fa-italic" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={activeStates.underline}
            title="underline"
          >
            <i className="fa-solid fa-underline" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={activeStates.orderedList}
            title="list: ordered"
          >
            <i className="fa-solid fa-list-ol" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={activeStates.bulletList}
            title="list: bullet"
          >
            <i className="fa-solid fa-list" style={{ width: '20px', height: '20px', fontSize: '20px' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
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
      `}</style>
    </div>
  );
};

export default TiptapEditor;
