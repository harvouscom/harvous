import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import { useChildNotebookAppearance } from './ChildNotebookAppearance';
import PrototypeSearchInput from './components/PrototypeSearchInput';
import PrototypeSectionHeader from './design-system/PrototypeSectionHeader';
import PrototypeHomeRow from './PrototypeHomeRow';

const sources = ['My notebook', 'Family Space'] as const;
type Source = typeof sources[number];

export type ChildSearchItem = {
  id: string;
  source: Source;
  title: string;
  subtitle: string;
  preview?: string;
  keywords?: string;
  icon: 'note-sticky' | 'book-open' | 'bookmark';
  open: () => void;
};

const resultBatch = 8;
const startingCount = 4;
const scopes = ['All', ...sources] as const;
type Scope = typeof scopes[number];

function normalize(text: string) {
  return text.toLocaleLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ');
}

function excerpt(text: string, terms: string[]) {
  const line = text.replace(/\s+/g, ' ').trim();
  const searchable = normalize(line);
  const match = Math.min(...terms.map(term => searchable.indexOf(term)).filter(index => index >= 0));
  const start = match > 24 ? Math.max(match - 24, line.lastIndexOf(' ', match - 8) + 1) : 0;
  const end = Math.min(line.length, start + 96);
  return `${start ? '…' : ''}${line.slice(start, end).trimEnd()}${end < line.length ? '…' : ''}`;
}

function resultDetail(item: ChildSearchItem, terms: string[]) {
  const heading = normalize(`${item.title} ${item.subtitle}`);
  const bodyTerms = terms.filter(term => !heading.includes(term));
  const body = normalize(item.preview ?? '');
  if (item.preview && bodyTerms.some(term => body.includes(term))) {
    return excerpt(item.preview, bodyTerms);
  }
  return item.subtitle;
}

function markMatches(text: string, terms: string[]) {
  if (!terms.length || !text) return text;
  // Apostrophe folding preserves the original text and character positions.
  const pattern = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const matches = [...text.replace(/[‘’]/g, "'").matchAll(new RegExp(pattern, 'giu'))];
  if (!matches.length) return text;
  let cursor = 0;
  return <>
    {matches.map(match => {
      const start = match.index;
      const before = text.slice(cursor, start);
      cursor = start + match[0].length;
      return <span key={start}>{before}<mark>{text.slice(start, cursor)}</mark></span>;
    })}
    {text.slice(cursor)}
  </>;
}

export default function ChildNotebookSearch({ items, onClose }: { items: ChildSearchItem[]; onClose: () => void }) {
  const { themeStyle, playCue } = useChildNotebookAppearance();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('All');
  const [expanded, setExpanded] = useState<Partial<Record<Source, number>>>({});
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = normalize(query).trim();
  const terms = normalizedQuery.split(' ').filter(Boolean);
  const index = useMemo(() => items.map(item => ({
    item,
    title: normalize(item.title),
    metadata: normalize(item.subtitle),
    searchable: normalize([item.title, item.subtitle, item.keywords, item.preview].filter(Boolean).join(' '))
  })), [items]);
  const matches = index.flatMap(({ item, title, metadata, searchable }) => {
    if (!terms.every(term => searchable.includes(term))) return [];
    let rank = 0;
    if (normalizedQuery) {
      if (title === normalizedQuery) rank = 0;
      else if (title.startsWith(normalizedQuery)) rank = 1;
      else if (terms.every(term => title.includes(term))) rank = 2;
      else if (terms.every(term => `${title} ${metadata}`.includes(term))) rank = 3;
      else rank = 4;
    }
    return [{ item, rank }];
  }).sort((a, b) => a.rank - b.rank);
  const groups = sources
    .filter(source => scope === 'All' || scope === source)
    .map(source => ({ source, items: matches.filter(match => match.item.source === source) }))
    .filter(group => group.items.length > 0)
    .sort((a, b) => a.items[0].rank - b.items[0].rank);
  const resultCount = groups.reduce((total, group) => total + group.items.length, 0);
  const firstResult = groups[0]?.items[0].item;

  useEffect(() => {
    dialogRef.current?.showModal();
    inputRef.current?.focus();
  }, []);

  function resetList() {
    setExpanded({});
    if (resultsRef.current) resultsRef.current.scrollTop = 0;
  }

  function openItem(item: ChildSearchItem) {
    dialogRef.current?.close();
    item.open();
  }

  return createPortal(
    <dialog className="pds-kids-privacy-modal pds-kids-search proto-theme" ref={dialogRef} style={themeStyle} aria-labelledby="child-search-title" onClose={onClose}>
      <header className="pds-kids-info__header">
        <h2 id="child-search-title" className="pds-title">Search</h2>
        <button type="button" className="proto-toolbar-icon-btn" aria-label="Close search" onClick={() => dialogRef.current?.close()}><Icon name="xmark" size={15} /></button>
      </header>
      <PrototypeSearchInput
        inputRef={inputRef}
        value={query}
        onChange={value => { setQuery(value); resetList(); }}
        placeholder="Search notes and family readings…"
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && firstResult) {
            event.preventDefault();
            openItem(firstResult);
          }
        }}
      />
      <div className="proto-appearance-segmented pds-kids-search__scopes" role="group" aria-label="Search in">
        {scopes.map(option => (
          <button key={option} type="button" className="proto-appearance-segmented__btn" aria-pressed={scope === option} data-active={scope === option ? 'true' : undefined} onClick={() => {
            if (scope !== option) playCue('nav.select');
            setScope(option);
            resetList();
          }}>{option}</button>
        ))}
      </div>
      <div className="pds-kids-search__scroll" ref={resultsRef}>
        {resultCount === 0 ? (
          <p className="pds-kids-search__empty pds-caption" role="status">
            {normalizedQuery ? 'No matches here. Try another word.' : 'There’s nothing to search here yet.'}
          </p>
        ) : (
          <>
            {normalizedQuery && <p className="pds-kids-search__count pds-caption" role="status">{resultCount} {resultCount === 1 ? 'match' : 'matches'}</p>}
            {groups.map(group => {
              const limit = (normalizedQuery ? resultBatch : startingCount) + (expanded[group.source] ?? 0);
              const remaining = group.items.length - limit;
              return (
                <section key={group.source} aria-label={group.source} className="pds-kids-search__results">
                  <PrototypeSectionHeader as="h3" variant="search">{!normalizedQuery && group.source === 'My notebook' ? 'Recent notes' : group.source}</PrototypeSectionHeader>
                  <div className="proto-list-panel">
                    {group.items.slice(0, limit).map(({ item }) => (
                      <PrototypeHomeRow
                        key={item.id}
                        icon={item.icon}
                        title={markMatches(item.title, terms)}
                        meta={[markMatches(resultDetail(item, terms), terms)]}
                        onClick={() => openItem(item)}
                      />
                    ))}
                  </div>
                  {remaining > 0 && (
                    <button type="button" className="proto-settings-btn proto-settings-btn--secondary pds-kids-search__more" onClick={() => {
                      setExpanded(current => ({ ...current, [group.source]: (current[group.source] ?? 0) + resultBatch }));
                    }}>
                      <Icon name="caret-down" size={12} /> Show {Math.min(remaining, resultBatch)} more
                    </button>
                  )}
                </section>
              );
            })}
          </>
        )}
      </div>
    </dialog>,
    document.body
  );
}
