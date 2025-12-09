import React, { useState, useRef, useEffect } from 'react';

interface NoteEditorProps {
  initialContent?: string;
  placeholder?: string;
  onSave?: (content: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export default function NoteEditor({ 
  initialContent = '', 
  placeholder = 'Start writing your note...',
  onSave,
  onCancel,
  autoFocus = false
}: NoteEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isEditing, setIsEditing] = useState(!initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleSave = () => {
    if (onSave) {
      onSave(content);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setContent(initialContent);
    setIsEditing(false);
    if (onCancel) {
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  };

  if (!isEditing && content) {
    return (
      <div 
        className="p-4 border rounded-lg bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow"
        style={{ borderColor: 'var(--color-gray)' }}
        onClick={() => setIsEditing(true)}
      >
        <div className="whitespace-pre-wrap" style={{ color: 'var(--color-deep-grey)' }}>{content}</div>
        <div className="text-xs mt-2" style={{ color: 'var(--color-pebble-grey)' }}>Click to edit</div>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm" style={{ borderColor: 'var(--color-gray)' }}>
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full h-32 p-2 border rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        style={{ borderColor: 'var(--color-gray)' }}
      />
      <div className="flex justify-between items-center mt-3">
        <div className="text-xs" style={{ color: 'var(--color-pebble-grey)' }}>
          {content.length} characters • Ctrl+Enter to save, Esc to cancel
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            className="px-3 py-1 transition-colors"
            style={{ color: 'var(--color-stone-grey)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-deep-grey)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-stone-grey)';
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!content.trim()}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:cursor-not-allowed transition-colors"
            style={!content.trim() ? { backgroundColor: 'var(--color-gray)' } : {}}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
