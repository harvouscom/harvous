import React, { useEffect, useRef } from 'react';
import Icon, { type IconName } from './Icon';
import type { MentionKind, MentionPickerItem } from './mention-pill-types';

export type MentionKindFilter = 'all' | MentionKind;

const KIND_SECTION_LABELS: Record<MentionKind, string> = {
  note: 'Notes',
  thread: 'Threads',
  folder: 'Folders',
};

// Same kind → icon mapping the sidebar search results use.
const KIND_ICON_NAMES: Record<MentionKind, IconName> = {
  note: 'note-sticky',
  thread: 'arrow-right-arrow-left',
  folder: 'folder',
};

// Matches the sidebar's own list-mode order (notes, folders, threads).
const KIND_TABS: { id: MentionKindFilter; label: string; iconName?: IconName }[] = [
  { id: 'all', label: 'All' },
  { id: 'note', label: 'Notes', iconName: 'note-sticky' },
  { id: 'folder', label: 'Folders', iconName: 'folder' },
  { id: 'thread', label: 'Threads', iconName: 'arrow-right-arrow-left' },
];

interface MentionPickerPanelProps {
  /** Already filtered to the active tab and re-indexed — activeIndex is relative to this array. */
  items: MentionPickerItem[];
  activeIndex: number;
  kindFilter: MentionKindFilter;
  onKindFilterChange: (kind: MentionKindFilter) => void;
  onCommit: (item: MentionPickerItem) => void;
  onActiveIndexChange: (index: number) => void;
}

/**
 * Contents of the floating @ mention typeahead: a kind tab bar (reuses the
 * `.proto-chip-bar` pattern from the sidebar's highlight-kind filter) so a long
 * notes list never buries threads/folders, plus the row list for the active tab.
 * On "All", rows stay grouped under kind section headers.
 */
const MentionPickerPanel: React.FC<MentionPickerPanelProps> = ({
  items,
  activeIndex,
  kindFilter,
  onKindFilterChange,
  onCommit,
  onActiveIndexChange,
}) => {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector('.mention-picker__row--active') as HTMLElement | null;
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, items]);

  let lastKind: MentionKind | null = null;

  return (
    <>
      <div className="proto-chip-bar mention-picker__tabs" role="tablist" aria-label="Mention content type">
        {KIND_TABS.map((tab) => {
          const selected = kindFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`proto-chip${selected ? ' proto-chip--selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onKindFilterChange(tab.id);
              }}
            >
              {tab.iconName ? <Icon name={tab.iconName} size={11} aria-hidden /> : null}
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="mention-picker__list" ref={listRef} role="listbox" aria-label="Mention content">
        {items.length === 0 && (
          <div className="mention-picker__empty">No matches</div>
        )}
        {items.map((item, index) => {
          const showHeader = kindFilter === 'all' && item.kind !== lastKind;
          lastKind = item.kind;
          return (
            <React.Fragment key={`${item.kind}:${item.entityId}:${item.spaceId}`}>
              {showHeader && (
                <div className="mention-picker__section-label" aria-hidden>
                  {KIND_SECTION_LABELS[item.kind]}
                </div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`mention-picker__row${index === activeIndex ? ' mention-picker__row--active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCommit(item);
                }}
                onMouseEnter={() => onActiveIndexChange(index)}
              >
                <span className="mention-picker__row-icon" aria-hidden>
                  <Icon name={KIND_ICON_NAMES[item.kind]} size={11} />
                </span>
                <span className="mention-picker__row-text">
                  <span className="mention-picker__row-title">{item.title}</span>
                  {item.subtitle ? (
                    <span className="mention-picker__row-subtitle">{item.subtitle}</span>
                  ) : null}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
};

export default MentionPickerPanel;
