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
        className="p-4 border border-gray-300 rounded-lg bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => setIsEditing(true)}
      >
        <div className="whitespace-pre-wrap text-gray-800">{content}</div>
        <div className="text-xs text-gray-500 mt-2">Click to edit</div>
      </div>
    );
  }

  return (
    <div className="p-4 border border-gray-300 rounded-lg bg-white shadow-sm">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full h-32 p-2 border border-gray-200 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <div className="flex justify-between items-center mt-3">
        <div className="text-xs text-gray-500">
          {content.length} characters • Ctrl+Enter to save, Esc to cancel
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            className="px-3 py-1 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!content.trim()}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
