// Separate entry with an in-memory child session and a same-origin API.
import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Icon from '@/components/react/Icon';
import { playSound, warmSounds } from '@/utils/sounds';
import { coverColors, defaultChildPreferences, type ChildBibleTranslation, type ChildFamilyReading, type ChildNotebookPreferences } from '../../../../shared/child-notebook';
import type { ChildMaterial, ChildNote, ChildSearchResult, ChildSearchScope } from './types';
import ChildNotebookTextFields from './ChildNotebookTextFields';
import ChildNotebookSettings, { ChildCover } from './ChildNotebookSettings';
import ChildNotebookSearchPanel from './ChildNotebookSearchPanel';
import ChildBibleReader, { type ReaderLocation } from './ChildBibleReader';
import '../../styles/prototype-tokens.css';
import '../../styles/family.css';

export type Notebook = {
  parentSignInUrl?: string; displayName: string; notes: ChildNote[]; materials: ChildMaterial[];
  preferences: ChildNotebookPreferences; translations: ChildBibleTranslation[]; readings: ChildFamilyReading[];
};
const isDesignPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === '1';
// Remove the one-time credential before rendering or making any requests.
const handoff = window.location.hash.slice(1);
window.history.replaceState(null, '', window.location.pathname + (isDesignPreview ? '?preview=1' : ''));
let sessionToken: string | null = null;
class ChildRequestError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (isDesignPreview) {
    const { previewRequest } = await import('./child-notebook-fixture');
    return previewRequest(path, method, body) as T;
  }
  const response = await fetch(`/api/child-accounts/child/${path}`, {
    method, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    headers: { ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new ChildRequestError(data?.error || 'Your notebook is temporarily unavailable. Please try again.', response.status);
  return data;
}
let bootstrap: Promise<Notebook> | null = null;
function openNotebook() {
  return bootstrap ??= (async () => {
    if (!isDesignPreview && !/^hvkid_[\w-]{43}$/.test(handoff)) throw new Error('Ask your parent for a new sign-in link.');
    const result = await request<{ token: string }>('redeem', 'POST', { token: handoff });
    sessionToken = result.token;
    return request<Notebook>('notebook');
  })();
}

type View = { kind: 'home' | 'family' } | { kind: 'bible'; location: ReaderLocation } | { kind: 'note'; note?: ChildNote } | { kind: 'material'; material: ChildMaterial };
const prompts = ['What’s something you noticed today?', 'What’s one question you want to ask?', 'What words would you like to remember?', 'What’s one kind thing you could do this week?'];

function ChildNotebook() {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Opening your notebook…');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>({ kind: 'home' });
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [overlay, setOverlay] = useState<'settings' | 'search' | 'privacy' | 'parent' | 'export' | null>(null);
  const [revision, setRevision] = useState(0);
  const [prompt, setPrompt] = useState(0);
  const editorRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const profileRef = useRef<HTMLDetailsElement>(null);
  const actionDialog = useRef<HTMLDialogElement>(null);
  const refreshVersion = useRef(0);
  const preferences = notebook?.preferences ?? defaultChildPreferences;
  const coverColor = coverColors.find(item => item.id === preferences.coverColor)?.color ?? coverColors[0].color;
  const dirty = view.kind === 'note' && (title !== (view.note?.title ?? '') || content !== (view.note?.content ?? ''));
  const clear = useCallback(() => {
    refreshVersion.current++;
    sessionToken = null; bootstrap = null;
    setNotebook(null); setTitle(''); setContent(''); setView({ kind: 'home' }); setOverlay(null);
  }, []);
  const childRequest = useCallback(async <T,>(path: string, method?: string, body?: unknown) => {
    try { return await request<T>(path, method, body); }
    catch (e) {
      if (e instanceof ChildRequestError && [401, 403].includes(e.status)) {
        clear(); setStatus(''); setError(e.message);
      }
      throw e;
    }
  }, [clear]);
  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : 'Please ask your parent for help.'); setStatus('');
  }
  function navigate(next: View) {
    if (busy || (dirty && !window.confirm('Leave this note without saving?'))) return;
    setError(''); setStatus(''); setView(next);
    playSound('nav.forward', { preference: preferences.sounds ? 'everywhere' : 'off' });
  }
  function openNote(note?: ChildNote) {
    setTitle(note?.title ?? ''); setContent(note?.content ?? ''); setView({ kind: 'note', note });
    setError(''); setStatus('');
  }
  const search = useCallback((query: string, scope: ChildSearchScope, offset: number) =>
    childRequest<{ results: ChildSearchResult[]; total: number }>('search', 'POST', { query, scope, offset }), [childRequest]);
  async function openResult(item: ChildSearchResult) {
    if (dirty && !window.confirm('Leave this note without saving?')) return false;
    if (item.kind === 'note') {
      const { note } = await childRequest<{ note: ChildNote }>(`notes/${encodeURIComponent(item.id)}`);
      openNote(note);
    } else if (item.kind === 'material') {
      const { material } = await childRequest<{ material: ChildMaterial }>(`materials/${encodeURIComponent(item.spaceId)}/${encodeURIComponent(item.id)}`);
      setView({ kind: 'material', material });
    } else {
      // Refresh shared readings first so a removed result cannot open a stale passage.
      const data = await childRequest<Notebook>('notebook');
      if (!data.readings.some(reading => reading.id === item.id)) throw new Error('This reading is no longer shared.');
      setNotebook(data); setView({ kind: 'bible', location: { mode: 'family', readingId: item.id } });
    }
    return true;
  }
  async function openItem(item: ChildSearchResult) {
    setBusy(true); setError(''); setStatus('');
    try { await openResult(item); } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function endSession(returnToParent: boolean) {
    if (busy || (dirty && !window.confirm('Leave this note without saving?'))) return;
    const parentUrl = notebook?.parentSignInUrl;
    setBusy(true); setError('');
    try {
      await childRequest('session', 'DELETE'); clear();
      if (returnToParent && parentUrl) window.location.assign(parentUrl);
      else setStatus('All done. Ask your parent for a link next time.');
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  function show(next: typeof overlay) {
    if (profileRef.current) profileRef.current.open = false;
    setOverlay(next);
  }
  useEffect(() => {
    let current = true;
    void openNotebook().then(data => { if (current) { setNotebook(data); setStatus(''); } })
      .catch(e => { if (current) fail(e); });
    return () => { current = false; };
  }, []);
  useEffect(() => {
    if (overlay) return;
    if (view.kind === 'note') editorRef.current?.focus();
    else headingRef.current?.focus();
  }, [view.kind, overlay]);
  useEffect(() => {
    if (overlay === 'privacy' || overlay === 'parent' || overlay === 'export') actionDialog.current?.showModal();
  }, [overlay]);
  useEffect(() => {
    const root = document.documentElement;
    if (preferences.scheme === 'system') delete root.dataset.colorScheme;
    else root.dataset.colorScheme = preferences.scheme;
    if (preferences.sounds) warmSounds({ force: true });
  }, [preferences.scheme, preferences.sounds]);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (document.visibilityState !== 'visible' || !sessionToken || busy) return;
      const version = ++refreshVersion.current;
      void childRequest<Notebook>('notebook').then(data => {
        if (cancelled || !sessionToken || version !== refreshVersion.current) return;
        setNotebook(data); setRevision(value => value + 1);
        setView(current => current.kind === 'material' && !data.materials.some(item =>
          item.spaceId === current.material.spaceId && item.id === current.material.id) ? { kind: 'family' } : current);
      }).catch(e => { if (!cancelled && version === refreshVersion.current) fail(e); });
    };
    const unload = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('beforeunload', unload);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', refresh); window.removeEventListener('beforeunload', unload); };
  }, [dirty, busy, childRequest]);

  return <main className="pds-child-app pds-family-stack" data-text-size={preferences.textSize} data-reduce-motion={preferences.reduceMotion} style={{ '--child-cover-color': coverColor } as CSSProperties}>
    {notebook && <nav className="pds-child-toolbar" aria-label="Notebook navigation">
      <div className="pds-child-toolbar__group">
        <button type="button" className="pds-child-button pds-child-icon" disabled={busy} aria-label="My notebook" onClick={() => navigate({ kind: 'home' })}><Icon name="house" size={16} /></button>
        <button type="button" className="pds-child-button pds-child-icon" disabled={busy} aria-label="Bible reader" onClick={() => navigate({ kind: 'bible', location: { mode: 'personal' } })}><Icon name="book-open" size={16} /></button>
        <button type="button" className="pds-child-button pds-child-icon" disabled={busy || view.kind === 'note'} aria-label="Write a note" onClick={() => openNote()}><Icon name="pen-to-square" size={16} /></button>
      </div>
      <button type="button" className="pds-child-button" disabled={busy} aria-label="Search" onClick={() => show('search')}><Icon name="magnifying-glass" size={15} /><span>Search</span></button>
      <details ref={profileRef} className="pds-child-profile" onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.open = false;
      }} onKeyDown={e => {
        if (e.key === 'Escape' && e.currentTarget.open) {
          e.preventDefault(); e.currentTarget.open = false; e.currentTarget.querySelector('summary')?.focus();
        }
      }}>
        <summary className="pds-child-button"><ChildCover preferences={preferences} name={notebook.displayName} avatar /><span>{notebook.displayName}</span><Icon name="caret-down" size={12} /></summary>
        <div className="pds-child-profile__menu">
          <button type="button" className="pds-child-button" onClick={() => show('settings')}><Icon name="gear" size={15} />Settings</button>
          <button type="button" className="pds-child-button" onClick={() => show('privacy')}><Icon name="lock" size={15} />Who can see my notebook?</button>
          <button type="button" className="pds-child-button" onClick={() => show('export')}><Icon name="download" size={15} />Export my notebook</button>
          {notebook.parentSignInUrl && <button type="button" className="pds-child-button" onClick={() => show('parent')}><Icon name="arrow-right-arrow-left" size={15} />Return to parent mode</button>}
          <button type="button" className="pds-child-button" disabled={busy} onClick={() => void endSession(false)}><Icon name="right-from-bracket" size={15} />Finish studying</button>
        </div>
      </details>
    </nav>}
    <header className="pds-child-app__header">
      {notebook && <><ChildCover preferences={preferences} name={notebook.displayName} /><span className="pds-child-app__bookmark" aria-hidden="true" /></>}
      <h1 ref={headingRef} tabIndex={-1} className="pds-title">{notebook ? `${notebook.displayName}’s notebook` : 'My notebook'}</h1>
    </header>
    {isDesignPreview && <p className="pds-caption">Design preview · Sample content resets on reload.</p>}
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
    {notebook && <>
      {view.kind === 'home' && <>
        <section className="pds-family-stack pds-child-welcome" aria-labelledby="child-welcome">
          <h2 id="child-welcome" className="pds-title-xl">Welcome back, {notebook.displayName}.</h2>
          <p>Your questions and discoveries belong here.<br className="pds-child-desktop-break" /> Where would you like to start?</p>
          <div className="pds-child-welcome__actions">
            <button className="pds-child-button pds-child-row" type="button" onClick={() => navigate({ kind: 'family' })}><Icon name="user-group" size={17} /><span><strong>Family Space</strong><small>Read together</small></span></button>
            <button className="pds-child-button pds-child-row" type="button" disabled={busy} onClick={() => openNote()}><Icon name="pen-to-square" size={17} /><span><strong>Write a note</strong><small>My notebook</small></span></button>
          </div>
        </section>
        <section className="pds-family-stack" aria-label="My saved notes">
          <h2 className="pds-list-title">My notes</h2>
          {!notebook.notes.length && <p>Your first note will appear here.</p>}
          <div className="pds-child-list">{notebook.notes.slice(0, 12).map(note => <button type="button" className="pds-child-button pds-child-row" key={note.id} disabled={busy}
            onClick={() => void openItem({ kind: 'note', id: note.id, title: note.title ?? '', source: 'My notebook' })}>
            <Icon name="note-sticky" size={15} /><strong>{note.title || 'Untitled note'}</strong><Icon name="caret-right" size={12} />
          </button>)}</div>
        </section>
        <div className="pds-child-prompt" aria-label="Writing ideas" role="region">
          <button className="pds-child-button" type="button" disabled={busy} onClick={() => openNote()}><Icon name="pen-to-square" size={15} /><span aria-live="polite">{prompts[prompt]}</span></button>
          <button className="pds-child-button pds-child-icon" type="button" aria-label="Try another writing idea" onClick={() => {
            setPrompt(value => (value + 1) % prompts.length); playSound('nav.select', { preference: preferences.sounds ? 'everywhere' : 'off' });
          }}><Icon name="shuffle" size={17} /></button>
        </div>
      </>}
      {view.kind === 'note' && <form className="pds-child-note pds-family-stack" onSubmit={async e => {
        e.preventDefault(); if (busy || (!title.trim() && !content.trim())) return;
        setBusy(true); setError('');
        const id = view.note?.id;
        try {
          const { note } = await childRequest<{ note: ChildNote }>(id ? `notes/${encodeURIComponent(id)}` : 'notes', id ? 'PUT' : 'POST', { title, content });
          refreshVersion.current++;
          setNotebook(current => current && { ...current, notes: [note, ...current.notes.filter(item => item.id !== note.id)] });
          setView({ kind: 'home' }); setStatus('Saved.');
          playSound('study.finished', { preference: preferences.sounds ? 'everywhere' : 'off' });
        } catch (e) { fail(e); } finally { setBusy(false); }
      }}>
        <button type="button" className="pds-child-button pds-child-note__back" disabled={busy} onClick={() => navigate({ kind: 'home' })}><Icon name="arrow-left" size={15} />My notebook</button>
        <ChildNotebookTextFields title={title} content={content} titleRef={editorRef} disabled={busy} onTitleChange={setTitle} onContentChange={setContent} />
        <div className="pds-child-note__footer">
          <span className="pds-caption">Your parent can read this note.</span>
          <button type="submit" className="pds-child-button" data-primary disabled={busy || (!title.trim() && !content.trim())}><Icon name="check" size={15} />{busy ? 'Saving…' : 'Save note'}</button>
        </div>
      </form>}
      {view.kind === 'family' && <section className="pds-family-stack" aria-labelledby="child-family-space">
        <h2 className="pds-title-xl" id="child-family-space">Family Space</h2>
        <button type="button" className="pds-child-button pds-child-row" onClick={() => navigate({ kind: 'bible', location: { mode: 'family' } })}>
          <Icon name="book-open" size={16} /><span><strong>Family Bible</strong><small>{notebook.readings.length ? `${notebook.readings.length} shared ${notebook.readings.length === 1 ? 'chapter' : 'chapters'}` : 'Read together'}</small></span><Icon name="caret-right" size={12} />
        </button>
        <h3 className="pds-list-title">From my ministry</h3>
        {!notebook.materials.length && <p>Your parent can add ministry reading here.</p>}
        <div className="pds-child-list">{notebook.materials.map(material => <button type="button" className="pds-child-button pds-child-row" key={`${material.spaceId}:${material.id}`}
          disabled={busy} onClick={() => void openItem({ ...material, title: material.title ?? 'Reading', source: material.spaceTitle, kind: 'material' })}>
          <Icon name="file-lines" size={16} /><span><strong>{material.title || 'Reading'}</strong><small>{material.spaceTitle}</small></span><Icon name="caret-right" size={12} />
        </button>)}</div>
      </section>}
      {view.kind === 'material' && <section className="pds-family-stack">
        <button type="button" className="pds-child-button pds-child-note__back" onClick={() => navigate({ kind: 'family' })}><Icon name="arrow-left" size={15} />Family Space</button>
        <p className="pds-caption">{view.material.spaceTitle}</p><h2 className="pds-title-xl">{view.material.title || 'Reading'}</h2>
        <p className="pds-family-note">{view.material.content}</p>
      </section>}
      {view.kind === 'bible' && <ChildBibleReader location={view.location} name={notebook.displayName} request={childRequest} revision={revision}
        translations={notebook.translations} readings={notebook.readings} onNavigate={location => setView({ kind: 'bible', location })} />}
      {overlay === 'search' && <ChildNotebookSearchPanel search={search} onOpen={openResult} onClose={() => setOverlay(null)} />}
      {overlay === 'settings' && <ChildNotebookSettings name={notebook.displayName} preferences={preferences} onClose={() => setOverlay(null)} onSave={async draft => {
        const result = await childRequest<{ preferences: ChildNotebookPreferences }>('preferences', 'PUT', draft);
        refreshVersion.current++;
        setNotebook(current => current && { ...current, preferences: result.preferences });
        return true;
      }} />}
      {(overlay === 'privacy' || overlay === 'parent' || overlay === 'export') && <dialog ref={actionDialog} className="pds-child-settings pds-child-action-dialog"
        onClose={() => setOverlay(null)} aria-labelledby="child-action-title">
        <header className="pds-child-settings__header"><h2 id="child-action-title" className="pds-title">{overlay === 'privacy' ? 'Your notebook circle' : overlay === 'parent' ? 'Parent sign-in' : 'Export my notebook'}</h2>
          <button type="button" className="pds-child-button pds-child-icon" aria-label="Close dialog" onClick={() => actionDialog.current?.close()}><Icon name="xmark" size={16} /></button></header>
        <div className="pds-child-search__body pds-family-stack">
          {overlay === 'privacy' ? <>
            <p><Icon name="lock" size={14} /> Only you and your parent can read your notes.</p>
            <p><Icon name="book-open" size={14} /> Your parent picks what shows up in Family Space.</p>
            <p className="pds-caption">Keep things like addresses and phone numbers off the page.</p>
          </> : <>
            <p>{overlay === 'export' ? 'Ask your parent to sign in and download a copy from My Family.' : 'Ask your parent to sign in to switch accounts.'}</p>
            {error && <p role="alert">{error}</p>}
            {notebook.parentSignInUrl && <button type="button" className="pds-child-button" data-primary disabled={busy} onClick={() => void endSession(true)}><Icon name="lock" size={15} />Parent sign-in</button>}
          </>}
        </div>
      </dialog>}
    </>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<ChildNotebook />);
