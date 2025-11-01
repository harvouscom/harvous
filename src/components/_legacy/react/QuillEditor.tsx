import React, { useEffect, useRef, useState } from 'react';

interface QuillEditorProps {
  content?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  minimalToolbar?: boolean;
  tabindex?: number;
}

export default function QuillEditor({ 
  content = '', 
  id = 'content', 
  name = 'content', 
  placeholder = 'Write something...',
  minimalToolbar = false,
  tabindex
}: QuillEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillInstanceRef = useRef<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initializeQuill = async () => {
      if (!editorRef.current || isInitialized) return;

      // Load Quill dynamically
      if (typeof window !== 'undefined' && !window.Quill) {
        // Load Quill CSS
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css';
        document.head.appendChild(link);

        // Load Quill JS
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js';
        script.onload = () => {
          createQuillInstance();
        };
        document.head.appendChild(script);
      } else if (window.Quill) {
        createQuillInstance();
      }
    };

    const createQuillInstance = () => {
      if (!editorRef.current || !window.Quill) return;

      const toolbarConfig = minimalToolbar ? false : [
        ['bold', 'italic', 'underline'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['clean']
      ];

      const quill = new window.Quill(editorRef.current, {
        theme: 'snow',
        placeholder: placeholder,
        modules: {
          toolbar: toolbarConfig
        }
      });

      // Set initial content
      if (content) {
        quill.root.innerHTML = content;
      }

      // Update hidden input when content changes
      quill.on('text-change', () => {
        const hiddenInput = document.querySelector(`#${id}`) as HTMLInputElement;
        if (hiddenInput) {
          hiddenInput.value = quill.root.innerHTML;
        }
      });

      quillInstanceRef.current = quill;
      setIsInitialized(true);

      // Apply custom styling
      applyCustomStyling();
    };

    const applyCustomStyling = () => {
      if (!editorRef.current) return;

      // Apply SpaceButton styling to toolbar
      const toolbar = editorRef.current.querySelector('.ql-toolbar');
      if (toolbar) {
        toolbar.style.cssText = `
          border: 1px solid var(--color-fog-white) !important;
          border-radius: 12px !important;
          background: var(--color-snow-white) !important;
          display: flex !important;
          gap: 0.5rem !important;
          align-items: center !important;
          padding: 0.5rem !important;
          margin: 0 !important;
        `;

        // Style toolbar buttons
        const buttons = toolbar.querySelectorAll('button');
        buttons.forEach(button => {
          button.style.cssText = `
            color: var(--color-deep-grey) !important;
            background: transparent !important;
            border: none !important;
            border-radius: 0.75rem !important;
            padding: 0.5rem 0.75rem !important;
            margin: 0 !important;
            font-family: var(--font-sans) !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.125s ease-in-out !important;
            min-height: 2rem !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-shadow: none !important;
          `;

          // Add hover effects
          button.addEventListener('mouseenter', () => {
            button.style.background = 'var(--color-fog-white)';
            button.style.boxShadow = '0px -3px 0px 0px rgba(120, 118, 111, 0.2) inset';
          });

          button.addEventListener('mouseleave', () => {
            if (!button.classList.contains('ql-active')) {
              button.style.background = 'transparent';
              button.style.boxShadow = 'none';
            }
          });
        });
      }

      // Style editor
      const editor = editorRef.current.querySelector('.ql-editor');
      if (editor) {
        editor.style.cssText = `
          font-family: var(--font-sans) !important;
          font-size: 16px !important;
          line-height: 1.6 !important;
          color: var(--color-deep-grey) !important;
          border: none !important;
          background: transparent !important;
          padding: 0 !important;
          min-height: 200px !important;
        `;
      }

      // Style container
      const container = editorRef.current.querySelector('.ql-container');
      if (container) {
        container.style.cssText = `
          border: none !important;
          background: transparent !important;
          height: 100% !important;
          max-height: 100% !important;
          overflow: hidden !important;
          display: flex !important;
          flex-direction: column !important;
        `;
      }
    };

    initializeQuill();
  }, [content, id, placeholder, minimalToolbar]);

  return (
    <div className="quill-editor-container h-full flex flex-col">
      <input 
        id={id} 
        name={name} 
        value={content} 
        type="hidden" 
      />
      <div 
        ref={editorRef}
        className="quill-content h-full"
        style={{ height: '100%', border: 'none', background: 'transparent' }}
        tabIndex={tabindex}
      />
    </div>
  );
}
