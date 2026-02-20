import React, { lazy, Suspense } from 'react';
import Icon from '../Icon';

const TiptapEditor = lazy(() => import('../TiptapEditor'));

export interface ScriptureNoteFormProps {
  scriptureReference: string;
  onReferenceChange: (ref: string) => void;
  content: string;
  onContentChange: (content: string) => void;
  nextNoteId: string;
  onEditorReady?: (editor: any) => void;
  onEditorInstanceReady?: (editor: any) => void;
  parentThreadId?: string;
  toolbarAtBottom?: boolean;
}

/**
 * Scripture note type form with scripture reference input and content editor
 */
export default function ScriptureNoteForm({
  scriptureReference,
  onReferenceChange,
  content,
  onContentChange,
  nextNoteId,
  onEditorReady,
  parentThreadId,
  onEditorInstanceReady,
  toolbarAtBottom = false,
}: ScriptureNoteFormProps) {
  return (
    <div className="box-border flex flex-col flex-1 min-h-0 items-start pt-3 px-3 relative" style={{ maxHeight: '100%', width: '100%' }}>
      {/* Scripture Reference Input Row */}
      <div className="flex gap-3 items-center justify-center relative shrink-0 w-full">
        <div className="basis-0 font-sans font-semibold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]">
          <input 
            type="text"
            value={scriptureReference}
            onChange={(e) => onReferenceChange(e.target.value)}
            placeholder="Scripture reference (e.g., John 3:16)"
            tabIndex={1}
            className="w-full bg-transparent border-none text-[24px] font-bold text-[var(--color-deep-grey)] focus:outline-none placeholder-[var(--color-pebble-grey)]"
          />
        </div>
        <div className="relative shrink-0 size-5" title="Note type switching disabled until designs are ready">
          <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.5 }} />
        </div>
      </div>
      
      {/* Editor */}
      <div className="flex-1 flex flex-col min-h-0 w-full" style={{ marginTop: '20px', maxHeight: '100%' }}>
        <div className="flex-1 flex flex-col min-h-0" style={{ maxHeight: '100%' }}>
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-[var(--color-pebble-grey)] text-sm">Loading editor…</div>}>
            <TiptapEditor
              content={content}
              id="new-note-content"
              name="content"
              placeholder="Share your thoughts about this scripture..."
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

      {/* Footer with date and note ID */}
      <div className="flex font-sans font-normal items-center justify-between leading-[0] not-italic relative shrink-0 text-[var(--color-stone-grey)] text-[12px] text-nowrap w-full" style={{ marginTop: '8px' }}>
        <div className="relative shrink-0">
          <p className="leading-[normal] text-nowrap whitespace-pre">Today</p>
        </div>
        <div className="relative shrink-0">
          <p className="leading-[normal] text-nowrap whitespace-pre">{nextNoteId}</p>
        </div>
      </div>
    </div>
  );
}

