import React, { useState, useRef, useEffect } from 'react';
import Icon from '../Icon';
import TiptapEditor from '../TiptapEditor';
import { TRANSLATIONS, TRANSLATION_ORDER } from '@/data/translations';

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
            className="translation-dropdown-trigger"
          >
            <span>{scriptureVersion}</span>
            <Icon
              name="caret-down"
              size={10}
              className={`translation-dropdown-chevron${showVersionDropdown ? ' translation-dropdown-chevron--open' : ''}`}
            />
          </button>
          {showVersionDropdown && (
            <div className="translation-dropdown-menu">
              {[scriptureVersion, ...TRANSLATION_ORDER.filter((id) => id !== scriptureVersion)].map((id) => {
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
                    className={`translation-dropdown-item${isSelected ? ' translation-dropdown-item--selected' : ''}`}
                  >
                    <span className="translation-dropdown-abbr">
                      {t.abbreviation}
                    </span>
                    <span className="translation-dropdown-name">
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

