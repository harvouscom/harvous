import React, { lazy, Suspense } from 'react';

const TiptapEditor = lazy(() => import('../TiptapEditor'));

// Title character limits
const TITLE_SOFT_LIMIT = 30;  // Show counter when >= 30
const TITLE_WARNING_LIMIT = 45;  // Red text when >= 45 (within 5 of limit)
const TITLE_HARD_LIMIT = 50;  // Maximum allowed

export interface DefaultNoteFormProps {
  title: string;
  onTitleChange: (title: string) => void;
  content: string;
  onContentChange: (content: string) => void;
  nextNoteId: string;
  onEditorReady?: (editor: any) => void;
  parentThreadId?: string;
  onEditorInstanceReady?: (editor: any) => void; // Callback when editor instance is ready
  toolbarAtBottom?: boolean;
}

/**
 * Default note type form with title input and content editor
 */
export default function DefaultNoteForm({
  title,
  onTitleChange,
  content,
  onContentChange,
  nextNoteId,
  onEditorReady,
  parentThreadId,
  onEditorInstanceReady,
  toolbarAtBottom = false,
}: DefaultNoteFormProps) {
  // Handle title keydown for auto-capitalize and select all
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle Select All (Cmd+A on Mac, Ctrl+A on Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      e.preventDefault();
      e.currentTarget.select();
      return;
    }
    
    // Auto-capitalize first letter
    const input = e.currentTarget;
    if (input.selectionStart === 0 && input.selectionEnd === 0) {
      // Cursor is at the start
      if (e.key.length === 1 && /^[a-z]$/.test(e.key)) {
        e.preventDefault();
        const capitalized = e.key.toUpperCase();
        if (title.length === 0) {
          onTitleChange(capitalized);
        } else {
          onTitleChange(capitalized + title);
        }
        // Set cursor position after the capitalized letter
        setTimeout(() => {
          input.setSelectionRange(1, 1);
        }, 0);
      }
    }
  };

  return (
    <div className="box-border flex-1 min-h-0 flex flex-col items-start pt-3 px-3 relative w-full overflow-hidden">
      {/* Header - same as CardFullEditable (shrink-0; card does not scroll so no sticky) */}
      <div className="flex gap-3 items-center justify-center shrink-0 w-full">
        <div className="basis-0 font-sans font-semibold grow min-h-px min-w-0 not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]">
          <input 
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value.slice(0, TITLE_HARD_LIMIT))}
            onKeyDown={handleTitleKeyDown}
            maxLength={TITLE_HARD_LIMIT}
            placeholder="Note title"
            tabIndex={1}
            className="w-full bg-transparent border-none text-[24px] font-bold text-[var(--color-deep-grey)] focus:outline-none placeholder-[var(--color-pebble-grey)]"
          />
          {/* Character counter - only show when approaching limit */}
          {title.length >= TITLE_SOFT_LIMIT && (
            <div 
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-sans)',
                textAlign: 'right',
                marginTop: '4px',
                color: title.length >= TITLE_WARNING_LIMIT 
                  ? 'var(--color-red)' 
                  : 'var(--color-deep-grey)',
              }}
            >
              {title.length}/{TITLE_HARD_LIMIT}
            </div>
          )}
        </div>
        <div className="relative shrink-0 size-5" title="Note type switching disabled until designs are ready">
          <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-50" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
          </svg>
        </div>
      </div>
      
      {/* Content - flex-1 + min-h-0 so editor takes all remaining height; overflow hidden so only .tiptap-content scrolls */}
      <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden" style={{ marginTop: '12px' }}>
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-[var(--color-pebble-grey)] text-sm">Loading editor…</div>}>
            <TiptapEditor
              content={content}
              id="new-note-content"
              name="content"
              placeholder="Type your note..."
              tabindex={2}
              minimalToolbar={false}
              toolbarAtBottom={toolbarAtBottom}
              onEditorReady={onEditorReady}
              onContentChange={onContentChange}
              parentThreadId={parentThreadId}
              onEditorInstanceReady={onEditorInstanceReady}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

