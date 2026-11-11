import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import type { ChildSearchResult, ChildSearchScope } from './types';

type Search = (query: string, scope: ChildSearchScope, offset: number) => Promise<{ results: ChildSearchResult[]; total: number }>;
const scopes = [['all', 'All'], ['notebook', 'My notebook'], ['family', 'Family Space']] as const;
const icons = { note: 'note-sticky', reading: 'book-open', material: 'file-lines' } as const;

export default function ChildNotebookSearchPanel({ search, onOpen, onClose }: {
  search: Search; onOpen: (item: ChildSearchResult) => Promise<boolean>; onClose: () => void;
}) {
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
  return <dialog className="pds-child-settings pds-child-search" ref={dialog} onClose={onClose} aria-labelledby="child-search-title">
    <header className="pds-child-settings__header">
      <h2 className="pds-title" id="child-search-title">Search</h2>
      <button type="button" className="pds-child-button pds-child-icon" aria-label="Close search" onClick={() => dialog.current?.close()}><Icon name="xmark" size={16} /></button>
    </header>
    <div className="pds-child-search__body pds-family-stack">
      <label className="pds-child-search__field"><Icon name="magnifying-glass" size={16} /><input type="search" ref={input} aria-label="Search notes and family readings"
        placeholder="Search notes and family readings…" value={query} maxLength={120} onChange={e => { reset(); setQuery(e.target.value); }} /></label>
      <div className="pds-child-segmented" role="group" aria-label="Where to search">
        {scopes.map(([id, label]) => <button key={id} type="button" className="pds-child-button" aria-pressed={scope === id}
          onClick={() => { if (scope !== id) { reset(); setScope(id); } }}>{label}</button>)}
      </div>
      {error && <p role="alert">{error}</p>}
      <p className="pds-caption" role="status">{pending ? 'Searching…' : `${total} ${total === 1 ? 'result' : 'results'}`}</p>
      <div className="pds-child-search__results" aria-busy={pending}>
        {items.map(item => <button type="button" className="pds-child-button pds-child-row" key={`${item.kind}:${item.kind === 'material' ? item.spaceId : ''}:${item.id}`}
          disabled={opening} onClick={async () => {
            setOpening(true); setError('');
            try { if (await onOpen(item)) dialog.current?.close(); }
            catch (e) { setError(e instanceof Error ? e.message : 'Could not open the result.'); }
            finally { setOpening(false); }
          }}><Icon name={icons[item.kind]} size={16} /><span><strong>{item.title}</strong><small>{item.source}</small></span><Icon name="caret-right" size={12} /></button>)}
      </div>
      {!pending && !error && items.length === 0 && <p>{query ? 'Try a different word or look in All.' : 'Your notes and family readings will appear here.'}</p>}
      {items.length < total && <button type="button" className="pds-child-button" disabled={pending} onClick={() => setOffset(items.length)}>More results</button>}
    </div>
  </dialog>;
}
