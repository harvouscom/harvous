// Deliberately separate entry: no Clerk, analytics, diagnostic uploads, service worker,
// offline persistence, router, remote embeds, or adult account controls.
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import type { ChildNote } from './types';
import '../../styles/prototype-tokens.css';
import '../../styles/family.css';

type Notebook = { parentSignInUrl?: string; displayName: string; notes: ChildNote[]; materials: (ChildNote & { spaceTitle: string })[] };
// Dev-only fixture mode: never contacts the API and is compiled out of production.
const isDesignPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === '1';
const previewNotebook: Notebook = {
  displayName: 'Sam',
  notes: [
    { id: 'preview-1', title: 'What I want to remember', content: 'I want to talk with my family about what we read together today.', updatedAt: null },
    { id: 'preview-2', title: 'A question for Sunday', content: 'What did you notice in this week’s reading?', updatedAt: null }
  ],
  materials: [{ id: 'preview-reading', title: 'This week’s reading', content: 'This is a preview of a reading shared by a ministry leader.\n\nYour parent chooses which ministry channels appear here. Your personal notes stay in your notebook.', spaceTitle: 'Kids ministry', updatedAt: null }]
};

// Remove the one-time credential before rendering or making any requests.
const handoff = window.location.hash.slice(1);
window.history.replaceState(null, '', window.location.pathname + (isDesignPreview ? '?preview=1' : ''));
let sessionToken: string | null = null;
let bootstrap: Promise<void> | null = null;
class ChildRequestError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (isDesignPreview) {
    if (path === 'notebook') return structuredClone(previewNotebook) as T;
    if (path === 'session') return { success: true } as T;
    if ((path === 'notes' || path.startsWith('notes/')) && body) {
      const note = { ...(body as { title: string; content: string }), id: path === 'notes' ? `preview-${crypto.randomUUID()}` : path.slice(6), updatedAt: new Date().toISOString() };
      previewNotebook.notes = [note, ...previewNotebook.notes.filter((n) => n.id !== note.id)];
      return { note } as T;
    }
    throw new Error('This action is not available in the design preview.');
  }

  const response = await fetch(`/api/family/child/${path}`, {
    method, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    headers: { ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new ChildRequestError(data.error || 'Please try again.', response.status);
  return data;
}
function ChildNotebook() {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Opening your notebook…');
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const editorRef = useRef<HTMLInputElement>(null);
  function clear() { setNotebook(null); setTitle(''); setContent(''); setId(null); setDirty(false); sessionToken = null; }
  function failed(e: unknown) {
    if (e instanceof ChildRequestError && [401, 403].includes(e.status)) clear();
    setError(e instanceof Error ? e.message : 'Please ask your parent for help.'); setStatus('');
  }
  async function returnToParent() {
    const parentUrl = notebook?.parentSignInUrl;
    if (!parentUrl || busy || dirty) return;
    setBusy(true);
    try { await request('session', 'DELETE'); clear(); window.location.assign(parentUrl); }
    catch (e) { failed(e); } finally { setBusy(false); }
  }
  useEffect(() => {
    let cancelled = false;
    if (!bootstrap) bootstrap = (async () => {
      if (isDesignPreview) { sessionToken = 'preview'; return; }
      if (!/^hvkid_[\w-]{43}$/.test(handoff)) throw new Error('Ask your parent for a new sign-in link.');
      const result = await request<{ token: string }>('redeem', 'POST', { token: handoff }); sessionToken = result.token;
    })();
    void bootstrap.then(() => request<Notebook>('notebook')).then((data) => {
      if (!cancelled) { setNotebook(data); setStatus(''); }
    }).catch((e) => { if (!cancelled) failed(e); });
    return () => { cancelled = true; };
  }, []);
  // Recheck access when returning from another tab; never retain displayed notes after a rejected session.
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible' && sessionToken) {
      void request<Notebook>('notebook').then(setNotebook).catch(failed);
    } };
    const unload = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    document.addEventListener('visibilitychange', check); window.addEventListener('beforeunload', unload);
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener('beforeunload', unload); };
  }, [dirty]);
  return <main className="pds-child-app pds-family-stack">
    {isDesignPreview && <p className="pds-caption" role="status">Design preview · Fictional content. Changes are temporary and reset when you reload.</p>}
    <header><p className="pds-caption">Harvous</p><h1 className="pds-title-xl">{notebook ? `${notebook.displayName}’s notebook` : 'My notebook'}</h1></header>
    <p className="pds-body">Your parent can read your notes. Your ministry leaders and other children cannot.
      Keep your address, phone number, and other people’s private information out of your notes.</p>
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
    {notebook && <>
      <form className="pds-family-stack" onSubmit={async (e) => {
        e.preventDefault(); if (busy) return; setBusy(true); setError('');
        try {
          const result = await request<{ note: ChildNote }>(id ? `notes/${id}` : 'notes', id ? 'PUT' : 'POST', { title, content });
          setId(result.note.id); setDirty(false); setStatus('Saved.');
          setNotebook(await request<Notebook>('notebook'));
        } catch (e) { failed(e); } finally { setBusy(false); }
      }}>
        <label className="pds-caption">Title<input ref={editorRef} className="pds-child-input" maxLength={100} value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} /></label>
        <label className="pds-caption">My note<textarea className="pds-child-input" rows={10} maxLength={10000} value={content} onChange={(e) => { setContent(e.target.value); setDirty(true); }} /></label>
        <button type="submit" className="pds-child-button" data-primary disabled={busy}>{busy ? 'Saving…' : 'Save note'}</button>
        <button className="pds-child-button" type="button" disabled={busy || dirty} onClick={() => { setId(null); setTitle(''); setContent(''); setStatus(''); editorRef.current?.focus(); }}>New note</button>
        {dirty && <p className="pds-caption">Save your note before opening another one.</p>}
      </form>
      <section className="pds-family-stack" aria-label="My saved notes"><h2 className="pds-title">My notes</h2>
        {!notebook.notes.length && <p>Your first note will appear here.</p>}
        {notebook.notes.map((note) => <button className="pds-child-button" key={note.id} disabled={dirty || busy} onClick={() => {
          setId(note.id); setTitle(note.title || ''); setContent(note.content); setStatus(''); editorRef.current?.focus();
        }}>{note.title || 'Untitled note'}</button>)}
      </section>
      <section className="pds-family-stack" aria-label="Approved ministry reading"><h2 className="pds-title">From my ministry</h2>
        {!notebook.materials.length && <p>Your parent can add ministry reading here.</p>}
        {notebook.materials.map((note, i) => <details key={`${note.id}-${i}`}><summary>{note.title || 'Reading'} · {note.spaceTitle}</summary><p className="pds-family-note">{note.content}</p></details>)}
      </section>
      <button className="pds-child-button" disabled={busy || dirty} onClick={async () => {
        setBusy(true); try { await request('session', 'DELETE'); clear(); setStatus('All done. Ask your parent for a link next time.'); }
        catch (e) { failed(e); } finally { setBusy(false); }
      }}>Finish studying</button>
      {(notebook.parentSignInUrl || isDesignPreview) && <>
        <button type="button" className="pds-child-button" disabled={busy || dirty} aria-expanded={exportOpen} aria-controls={exportOpen ? 'child-export' : undefined} onClick={() => setExportOpen(open => !open)}>Export my notebook</button>
        {exportOpen && <section id="child-export" className="pds-family-notice pds-family-stack" aria-label="Export my notebook">
          <p>Ask your parent to sign in and download a copy from My Family.</p>
          {notebook.parentSignInUrl && <button type="button" className="pds-child-button" data-primary disabled={busy || dirty} onClick={() => void returnToParent()}>Parent sign-in</button>}
        </section>}
      </>}
      {notebook.parentSignInUrl && <button type="button" className="pds-child-button" disabled={busy || dirty} onClick={() => void returnToParent()}>Return to parent sign-in</button>}
    </>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<ChildNotebook />);
