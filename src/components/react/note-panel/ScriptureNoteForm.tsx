import React, { lazy, Suspense, useState, useRef, useEffect } from 'react';
import Icon from '../Icon';
import { TRANSLATIONS, TRANSLATION_ORDER } from '@/data/translations';

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
  /** When toolbarAtBottom, margin below toolbar in px. Default 12. */
  toolbarBottomMargin?: number;
  inBottomSheet?: boolean;
  scriptureVersion?: string;
  onVersionChange?: (version: string) => void;
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
  toolbarBottomMargin = 12,
  inBottomSheet = false,
  scriptureVersion = 'NET',
  onVersionChange,
}: ScriptureNoteFormProps) {
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showVersionDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowVersionDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showVersionDropdown]);

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
        {/* Translation version pill selector */}
        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setShowVersionDropdown(!showVersionDropdown)}
            className="bg-[rgba(120,118,111,0.1)] rounded-[24px] px-2.5 py-1 h-[28px] flex items-center gap-1 transition-colors hover:bg-[rgba(120,118,111,0.18)]"
          >
            <span className="text-[13px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[normal] whitespace-nowrap">
              {scriptureVersion}
            </span>
            <svg className="w-3 h-3 fill-[var(--color-pebble-grey)]" viewBox="0 0 320 512">
              <path d="M137.4 374.6c12.5 12.5 32.8 12.5 45.3 0l128-128c9.2-9.2 11.9-22.9 6.9-34.9s-16.6-19.8-29.6-19.8L32 192c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l128 128z" />
            </svg>
          </button>
          {showVersionDropdown && (
            <div
              className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-[rgba(0,0,0,0.08)] py-1 z-50 min-w-[180px]"
              style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}
            >
              {TRANSLATION_ORDER.map((id) => {
                const t = TRANSLATIONS[id];
                const isSelected = id === scriptureVersion;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      onVersionChange?.(id);
                      setShowVersionDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                      isSelected
                        ? 'bg-[rgba(120,118,111,0.1)]'
                        : 'hover:bg-[rgba(120,118,111,0.06)]'
                    }`}
                  >
                    <span className="text-[14px] font-sans font-semibold text-[var(--color-deep-grey)] min-w-[40px]">
                      {t.abbreviation}
                    </span>
                    <span className="text-[13px] font-sans text-[var(--color-stone-grey)] truncate">
                      {t.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
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
              toolbarBottomMargin={toolbarBottomMargin}
              onEditorReady={onEditorReady}
              onContentChange={onContentChange}
              parentThreadId={parentThreadId}
              onEditorInstanceReady={onEditorInstanceReady}
              inBottomSheet={inBottomSheet}
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

