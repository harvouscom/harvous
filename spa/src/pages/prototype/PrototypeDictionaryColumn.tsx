/**
 * Easton's Dictionary list column — sidebar parity with native EastonsDictionaryListColumn.
 * Category chip bar (All / People / Places / Things), alphabetical entries with pinned-on-top,
 * hover/context menu pin toggle. Tapping a row drills into the entry detail inside the sidebar.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import {
  eastonsCategoryIconName,
  useEastonsEntryList,
  type EastonsSlugEntry,
} from '../../hooks/queries/useEastonsEntries';
import type { EastonCategory } from '../../hooks/useEastonsSlugIndex';
import {
  loadPinnedDictionarySlugs,
  togglePinnedDictionarySlug,
} from './proto-pinned-stores';
import { PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';
import ProtoPopoverShell from './ProtoPopoverShell';

type CategoryFilter = 'all' | EastonCategory;

const CATEGORY_OPTIONS: { id: CategoryFilter; label: string; iconName?: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'person', label: 'People', iconName: 'person' },
  { id: 'place', label: 'Places', iconName: 'location-dot' },
  { id: 'thing', label: 'Things', iconName: 'shapes' },
];

type Props = {
  searchQuery: string;
  onOpenSlug: (slug: string) => void;
};

export default function PrototypeDictionaryColumn({ searchQuery, onOpenSlug }: Props) {
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [pinned, setPinned] = useState<string[]>(() => loadPinnedDictionarySlugs());
  const listQuery = useEastonsEntryList();

  const filtered = useMemo(() => {
    const entries = listQuery.data ?? [];
    const byCategory =
      filter === 'all' ? entries : entries.filter((e) => e.category === filter);
    const q = searchQuery.trim().toLowerCase();
    const searched = q
      ? byCategory.filter((e) => e.headword.toLowerCase().includes(q))
      : byCategory;
    if (pinned.length === 0) return searched;
    const pinnedSet = new Set(pinned);
    const bySlug = new Map(searched.map((e) => [e.slug, e]));
    const pinnedRows: EastonsSlugEntry[] = [];
    pinned.forEach((slug) => {
      const row = bySlug.get(slug);
      if (row) pinnedRows.push(row);
    });
    const unpinned = searched.filter((e) => !pinnedSet.has(e.slug));
    return [...pinnedRows, ...unpinned];
  }, [listQuery.data, filter, searchQuery, pinned]);

  const togglePin = (slug: string) => setPinned(togglePinnedDictionarySlug(slug));

  return (
    <>
      <div className="proto-chip-bar" role="tablist" aria-label="Dictionary category">
        {CATEGORY_OPTIONS.map((opt) => {
          const selected = filter === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`proto-chip${selected ? ' proto-chip--selected' : ''}`}
              onClick={() => setFilter(opt.id)}
            >
              {opt.iconName ? <Icon name={opt.iconName} size={11} aria-hidden /> : null}
              {opt.label}
            </button>
          );
        })}
      </div>

      {listQuery.isLoading ? (
        <p className="proto-caption" style={{ padding: '12px 18px' }}>Loading dictionary…</p>
      ) : listQuery.isError ? (
        <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
          Could not load dictionary.
        </p>
      ) : filtered.length === 0 ? (
        <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
          {searchQuery.trim() ? 'No entries match.' : 'No entries.'}
        </p>
      ) : (
        <ul className="proto-note-list">
          {filtered.map((entry) => (
            <DictionaryRow
              key={`${entry.slug}::${entry.headword}`}
              entry={entry}
              isPinned={pinned.includes(entry.slug)}
              onOpen={() => onOpenSlug(entry.slug)}
              onTogglePin={() => togglePin(entry.slug)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function DictionaryRow({
  entry,
  isPinned,
  onOpen,
  onTogglePin,
}: {
  entry: EastonsSlugEntry;
  isPinned: boolean;
  onOpen: () => void;
  onTogglePin: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const iconName = eastonsCategoryIconName(entry.category);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (e: MouseEvent) => {
      const el = menuRootRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  return (
    <li
      className="proto-note-row-item"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
    >
      <button type="button" className="proto-note-row__main" onClick={onOpen}>
        <div className="proto-note-row__title-line">
          {iconName ? (
            <span className="proto-note-row__pin" aria-hidden>
              <Icon name={iconName} size={11} />
            </span>
          ) : null}
          <span className="pds-list-title proto-note-row__title-text">{entry.headword}</span>
          {isPinned ? (
            <span className="proto-note-row__pin" aria-hidden style={{ opacity: 0.6 }}>
              <Icon name="thumbtack" size={11} />
            </span>
          ) : null}
        </div>
      </button>
      <div
        className={`proto-menu proto-note-row__menu${menuOpen ? ' proto-note-row__menu--open' : ''}`}
        ref={menuRootRef}
      >
        <button
          type="button"
          className="proto-note-row__menu-trigger"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Entry actions"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
        >
          <Icon name="ellipsis-vertical" size={14} />
        </button>
        {menuOpen ? (
          <ProtoPopoverShell className="proto-menu__popover proto-menu__popover--right" role="menu" aria-label="Entry actions">
            <div className="proto-menu-section" role="group">
              <button
                type="button"
                role="menuitem"
                className="proto-menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onTogglePin();
                }}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="thumbtack" size={PROTO_TOOLBAR_ICON_SIZE} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>{isPinned ? 'Unpin entry' : 'Pin entry'}</span>
              </button>
            </div>
          </ProtoPopoverShell>
        ) : null}
      </div>
    </li>
  );
}
