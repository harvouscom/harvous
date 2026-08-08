import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon, { type IconName } from './Icon';
import { MENTION_KINDS, type MentionKind, type MentionPickerItem } from './mention-pill-types';

export type MentionKindFilter = 'all' | MentionKind;

const KIND_SECTION_LABELS: Record<MentionKind, string> = {
  note: 'Notes',
  thread: 'Threads',
  folder: 'Folders',
  library: 'Resources',
};

// Same kind → icon mapping the sidebar search results use.
const KIND_ICON_NAMES: Record<MentionKind, IconName> = {
  note: 'note-sticky',
  thread: 'arrow-right-arrow-left',
  folder: 'folder',
  library: 'newspaper',
};

// Matches the sidebar's own list-mode order (notes, folders, threads, resources).
const KIND_TABS: { id: MentionKindFilter; label: string; iconName?: IconName }[] = [
  { id: 'all', label: 'All' },
  { id: 'note', label: 'Notes', iconName: 'note-sticky' },
  { id: 'folder', label: 'Folders', iconName: 'folder' },
  { id: 'thread', label: 'Threads', iconName: 'arrow-right-arrow-left' },
  { id: 'library', label: 'Resources', iconName: 'newspaper' },
];

/**
 * Tabs for a picker offering `kinds`.
 *
 * Kinds are per-context, not global, and a tab that *cannot* be filled in a
 * context is hidden rather than shown empty — an always-empty tab reads as a
 * bug.
 *
 * Resources used to be hidden in a shared space, on the grounds that the
 * author's personal library items could not resolve for other members. That was
 * a real limit and it is gone: a room offers its *own* shelf, which every member
 * may already read, and `/api/library/items/:id` resolves through the shared
 * visibility check rather than through personal ownership. A room with no shelf
 * yet shows an empty Resources tab for the same reason a room with no threads
 * shows an empty Threads tab — that is data, not a structural impossibility.
 */
export function mentionKindTabsFor(kinds: readonly MentionKind[]): typeof KIND_TABS {
  return KIND_TABS.filter((tab) => tab.id === 'all' || kinds.includes(tab.id as MentionKind));
}

export function mentionKindFilterOrderFor(kinds: readonly MentionKind[]): MentionKindFilter[] {
  return mentionKindTabsFor(kinds).map((tab) => tab.id);
}

/** Chip order for Shift+← / Shift+→ cycling (same gesture as sidebar list mode). */
export const MENTION_KIND_FILTER_ORDER: MentionKindFilter[] = KIND_TABS.map((tab) => tab.id);

export function cycleMentionKindFilter(
  current: MentionKindFilter,
  step: number,
  order: MentionKindFilter[] = MENTION_KIND_FILTER_ORDER,
): MentionKindFilter {
  const index = Math.max(0, order.indexOf(current));
  const next = (index + step + order.length) % order.length;
  return order[next]!;
}

/** Highlight the first case-insensitive match of `query` inside `text`. */
export function highlightMentionQuery(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="mention-picker__match">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function measureListScrollFades(list: HTMLElement): { top: boolean; bottom: boolean } {
  const maxScroll = list.scrollHeight - list.clientHeight;
  if (maxScroll <= 1) return { top: false, bottom: false };
  return {
    top: list.scrollTop > 1,
    bottom: list.scrollTop < maxScroll - 1,
  };
}

interface MentionPickerPanelProps {
  /** Already filtered to the active tab and re-indexed — activeIndex is relative to this array. */
  items: MentionPickerItem[];
  activeIndex: number;
  kindFilter: MentionKindFilter;
  /** Active `@` query text (without the leading @) — used for title match highlighting. */
  query?: string;
  onKindFilterChange: (kind: MentionKindFilter) => void;
  onCommit: (item: MentionPickerItem) => void;
  onActiveIndexChange: (index: number) => void;
  /** Kinds this context can offer — see {@link mentionKindTabsFor}. Defaults to all. */
  availableKinds?: readonly MentionKind[];
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
  query = '',
  onKindFilterChange,
  onCommit,
  onActiveIndexChange,
  availableKinds = MENTION_KINDS,
}) => {
  const tabs = mentionKindTabsFor(availableKinds);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);

  const syncScrollFades = useCallback(() => {
    const list = listRef.current;
    if (!list) {
      setFadeTop(false);
      setFadeBottom(false);
      return;
    }
    const next = measureListScrollFades(list);
    setFadeTop(next.top);
    setFadeBottom(next.bottom);
  }, []);

  useLayoutEffect(() => {
    syncScrollFades();
  }, [items, kindFilter, syncScrollFades]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => syncScrollFades());
    ro.observe(list);
    return () => ro.disconnect();
  }, [syncScrollFades]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector('.mention-picker__row--active') as HTMLElement | null;
    active?.scrollIntoView({ block: 'nearest' });
    syncScrollFades();
  }, [activeIndex, items, syncScrollFades]);

  let lastKind: MentionKind | null = null;
  const listWrapClass = [
    'mention-picker__list-wrap',
    fadeTop ? 'mention-picker__list-wrap--fade-top' : '',
    fadeBottom ? 'mention-picker__list-wrap--fade-bottom' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div className="mention-picker__header">
        <div className="proto-chip-bar mention-picker__tabs" role="tablist" aria-label="Mention content type">
          {tabs.map((tab) => {
            const selected = kindFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`proto-chip mention-picker__tab${selected ? ' proto-chip--selected' : ''}`}
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
      </div>
      <div className={listWrapClass}>
        <div
          className="mention-picker__list"
          ref={listRef}
          role="listbox"
          aria-label="Mention content"
          onScroll={syncScrollFades}
        >
          {items.length === 0 ? (
            <div className="mention-picker__empty">
              <span className="mention-picker__empty-title">No matches</span>
              <span className="mention-picker__empty-hint">Try another name or filter</span>
            </div>
          ) : null}
          {items.map((item, index) => {
            const showHeader = kindFilter === 'all' && item.kind !== lastKind;
            lastKind = item.kind;
            const isActive = index === activeIndex;
            return (
              <React.Fragment key={`${item.kind}:${item.entityId}:${item.spaceId}`}>
                {showHeader ? (
                  <div className="mention-picker__section-label" aria-hidden>
                    {KIND_SECTION_LABELS[item.kind]}
                  </div>
                ) : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`mention-picker__row${isActive ? ' mention-picker__row--active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCommit(item);
                  }}
                  onMouseEnter={() => onActiveIndexChange(index)}
                >
                  <span className="mention-picker__row-icon" aria-hidden>
                    <Icon name={KIND_ICON_NAMES[item.kind]} size={12} />
                  </span>
                  <span className="mention-picker__row-text">
                    <span className="mention-picker__row-title">
                      {highlightMentionQuery(item.title, query)}
                    </span>
                    {item.subtitle ? (
                      <span className="mention-picker__row-subtitle">{item.subtitle}</span>
                    ) : null}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
      {items.length > 0 ? (
        <div className="mention-picker__footer" aria-hidden>
          <span>
            <kbd className="mention-picker__kbd">↑</kbd>
            <kbd className="mention-picker__kbd">↓</kbd>
            move
          </span>
          <span>
            <kbd className="mention-picker__kbd">⇧</kbd>
            <kbd className="mention-picker__kbd">←</kbd>
            <kbd className="mention-picker__kbd">→</kbd>
            filter
          </span>
          <span>
            <kbd className="mention-picker__kbd">↵</kbd>
            insert
          </span>
        </div>
      ) : null}
    </>
  );
};

export default MentionPickerPanel;
