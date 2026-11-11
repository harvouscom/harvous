import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChildNotebookAppearance } from '../prototype/ChildNotebookAppearance';
import PrototypeSearchInput from '../prototype/components/PrototypeSearchInput';
import PrototypeSectionHeader from '../prototype/design-system/PrototypeSectionHeader';
import PrototypeHomeRow from '../prototype/PrototypeHomeRow';
import Icon from '@/components/react/Icon';
import type { ChildSearchResult, ChildSearchScope } from './types';
import { ChildPrivacyPolicyLink } from './ChildPrivacyNotice';

type Search = (query: string, scope: ChildSearchScope, offset: number) => Promise<{ results: ChildSearchResult[]; total: number }>;
const scopes = [['all', 'All'], ['notebook', 'My notebook'], ['family', 'Family Space']] as const;
const icons = { note: 'note-sticky', reading: 'book-open', material: 'file-lines' } as const;

export default function ChildNotebookSearchPanel({ search, onOpen, onClose, privacyUrl }: {
  search: Search; onOpen: (item: ChildSearchResult) => Promise<boolean>; onClose: () => void;
  privacyUrl?: string;
}) {
  const { themeStyle } = useChildNotebookAppearance();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<ChildSearchScope>('all');
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<ChildSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { dialog.current?.showModal(); input.current?.focus(); }, []);
  useEffect(() => {
    let current = true;
    setPending(true); setError('');
    const timeout = window.setTimeout(() => {
      void search(query, scope, offset).then(result => {
        if (!current) return;
        setItems(previous => offset ? [...previous, ...result.results] : result.results);
        setTotal(result.total);
      }).catch(e => { if (current) setError(e instanceof Error ? e.message : 'Could not search the notebook.'); })
        .finally(() => { if (current) setPending(false); });
    }, query ? 180 : 0);
    return () => { current = false; window.clearTimeout(timeout); };
  }, [query, scope, offset, search]);
  function reset() { setOffset(0); setItems([]); setTotal(0); }
  async function open(item: ChildSearchResult) {
    if (opening) return;
    setOpening(true); setError('');
    try { if (await onOpen(item)) dialog.current?.close(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open the result.'); }
    finally { setOpening(false); }
  }
  return createPortal(<dialog className="pds-kids-privacy-modal pds-kids-search proto-theme" style={themeStyle} ref={dialog} onClose={onClose} aria-labelledby="child-search-title">
    <header className="pds-kids-info__header">
      <h2 className="pds-title" id="child-search-title">Search</h2>
      <button type="button" className="proto-toolbar-icon-btn" aria-label="Close search" onClick={() => dialog.current?.close()}><Icon name="xmark" size={15} /></button>
    </header>
    <PrototypeSearchInput inputRef={input} value={query} onChange={value => { reset(); setQuery(value.slice(0, 120)); }}
      placeholder="Search notes and family readings…" onKeyDown={event => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing && items[0]) { event.preventDefault(); void open(items[0]); }
      }} />
    <ChildPrivacyPolicyLink url={privacyUrl} />
    <div className="proto-appearance-segmented pds-kids-search__scopes" role="group" aria-label="Search in">
      {scopes.map(([id, label]) => <button key={id} type="button" className="proto-appearance-segmented__btn" aria-pressed={scope === id}
        data-active={scope === id ? 'true' : undefined} onClick={() => { if (scope !== id) { reset(); setScope(id); } }}>{label}</button>)}
    </div>
    <div className="pds-kids-search__scroll" aria-busy={pending}>
      {error && <p role="alert">{error}</p>}
      {pending && <p className="pds-caption" role="status">Searching…</p>}
      {!pending && !error && !items.length && <p className="pds-kids-search__empty pds-caption" role="status">
        {query ? 'No matches here. Try another word.' : 'There’s nothing to search here yet.'}</p>}
      {!!query && !!total && <p className="pds-kids-search__count pds-caption" role="status">{total} {total === 1 ? 'match' : 'matches'}</p>}
      {(['notebook', 'family'] as const).map(group => {
        const results = items.filter(item => (item.kind === 'note') === (group === 'notebook'));
        if (!results.length) return null;
        return <section key={group} className="pds-kids-search__results">
          <PrototypeSectionHeader as="h3" variant="search">{group === 'family' ? 'Family Space' : query ? 'My notebook' : 'Recent notes'}</PrototypeSectionHeader>
          <div className="proto-list-panel">{results.map(item => <PrototypeHomeRow icon={icons[item.kind]} title={item.title}
            key={`${item.kind}:${item.kind === 'material' ? item.spaceId : ''}:${item.id}`} meta={[item.source]} onClick={() => void open(item)} />)}</div>
        </section>;
      })}
      {items.length < total && <button type="button" className="proto-settings-btn proto-settings-btn--secondary pds-kids-search__more" disabled={pending}
        onClick={() => setOffset(items.length)}>More results</button>}
    </div>
  </dialog>, document.body);
}
