import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import Placeholder from '@tiptap/extension-placeholder';

interface TiptapEditorProps {
  content: string;
  id?: string;
  name?: string;
  placeholder?: string;
  minimalToolbar?: boolean;
  tabindex?: number;
  onContentChange?: (content: string) => void;
  scrollPosition?: number;
}

const TiptapEditor: React.FC<TiptapEditorProps> = ({
  content,
  id = "content",
  name = "content",
  placeholder = "Write something...",
  minimalToolbar = false,
  tabindex,
  onContentChange,
  scrollPosition
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [activeStates, setActiveStates] = useState({
    bold: false,
    italic: false,
    underline: false,
    orderedList: false,
    bulletList: false
  });
  const hiddenInputRef = useRef<HTMLInputElement>(null);

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
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      BulletList,
      OrderedList,
      ListItem,
      Placeholder.configure({
        placeholder: placeholder,
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
      }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      console.log('TiptapEditor: Editor updated');
      if (hiddenInputRef.current) {
        hiddenInputRef.current.value = editor.getHTML();
      }
      if (onContentChange) {
        onContentChange(editor.getHTML());
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none',
        style: 'font-family: var(--font-sans); font-size: 16px; line-height: 1.6; color: var(--color-deep-grey); min-height: 200px;',
      },
    },
    // Fix SSR issues
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor && content) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

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
      document.head.removeChild(link);
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
    <div className="tiptap-editor-container flex flex-col h-full" style={{ height: '100%' }}>
      {/* Hidden input for form submission */}
      <input
        ref={hiddenInputRef}
        type="hidden"
        id={id}
        name={name}
        value={editor.getHTML()}
      />
      
      {/* Editor content area */}
      <div className="tiptap-content flex-1 min-h-0 overflow-auto">
        <EditorContent editor={editor} />
      </div>
      
      {/* Custom SpaceButton-styled toolbar - positioned at bottom */}
        {!minimalToolbar && (
          <div 
            className="tiptap-toolbar flex gap-1 items-center p-1 border border-[var(--color-fog-white)] rounded-xl bg-[var(--color-snow-white)] mt-2"
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
          max-height: 100%;
          overflow: hidden;
          display: flex;
          flex-direction: column;
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
          flex: 1;
          overflow: auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        
        .tiptap-content :global(.ProseMirror) {
          font-family: var(--font-sans) !important;
          font-size: 16px !important;
          line-height: 1.6 !important;
          color: var(--color-deep-grey) !important;
          padding: 0 !important;
          border: none !important;
          background: transparent !important;
          outline: none !important;
          min-height: 200px !important;
          max-height: none !important;
          height: auto !important;
          overflow: visible !important;
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
