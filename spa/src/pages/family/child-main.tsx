// Separate entry with an in-memory child session and a same-origin API.
import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Icon from '@/components/react/Icon';
import { adjacentChapter } from '@/utils/bible-book-chapters';
import type { ChildBibleChapter, ChildBibleTranslation, ChildFamilyChapter, ChildFamilyReading, ChildFamilyThought, ChildNotebookPreferences } from '../../../../shared/child-notebook';
import type { ChildVerseSticker } from '../../../../shared/child-verse-stickers';
import type { ChildMaterial, ChildNote, ChildSearchResult, ChildSearchScope } from './types';
import ChildNotebookView, { notebookDays, type Note } from '../prototype/ChildNotebookView';
import ChildNoteAttachmentPicker from '../prototype/ChildNoteAttachmentPicker';
import type { ChildNotebookCatalog } from '../prototype/ChildNotebookTools';
import ChildNotebookShell from '../prototype/ChildNotebookShell';
import { ChildNotebookAppearanceProvider, useChildNotebookAppearance } from '../prototype/ChildNotebookAppearance';
import ChildNotebookBibleReader from '../prototype/ChildNotebookBibleReader';
import ProtoSpaceLoading from '../prototype/ProtoSpaceLoading';
import ChildNotebookSearchPanel from './ChildNotebookSearchPanel';
import { ChildPrivacyFootnote } from './ChildPrivacyNotice';
import '../../styles/prototype-components.css';
import '../../styles/prototype-tokens.css';
import '../../styles/prototype-shell.css';
import '@/styles/loading-dots.css';
import '@/styles/scripture-pill-chrome.css';
import '@/styles/study-highlight-accent-colors.css';
import '../../styles/family.css';
import '../../styles/child-notebook-preview.css';

export type Notebook = {
  parentSignInUrl?: string; displayName: string; notes: ChildNote[]; materials: ChildMaterial[];
  privacyUrl?: string;
  catalog?: ChildNotebookCatalog;
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

function dateLabel(value: string | null) {
  if (!value) return 'Today';
  if (isDesignPreview && ['Today', 'Yesterday', 'Sunday'].includes(value)) return value;
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  today.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) }).format(date);
}
function viewNote(note: ChildNote): Note {
  return { ...note, primaryCollection: note.primaryCollection ?? undefined, title: note.title ?? '', date: dateLabel(note.updatedAt) };
}
function materialKey(spaceId: string, id: string) { return JSON.stringify([spaceId, id]); }

type RequestChild = typeof request;

function SessionNotebook({ notebook, privacyUrl, request, onEnd, onRefresh, revision }: {
  privacyUrl?: string;
  notebook: Notebook; request: RequestChild; onEnd: (returnToParent: boolean) => Promise<void>;
  onRefresh: (update: (current: Notebook) => Notebook) => void; revision: number;
}) {
  const [readingId, setReadingId] = useState<string>();
  const { playCue } = useChildNotebookAppearance();
  const search = useCallback((query: string, scope: ChildSearchScope, offset: number) =>
    request<{ results: ChildSearchResult[]; total: number }>('search', 'POST', { query, scope, offset }), [request]);
  const reading = notebook.readings.find(item => item.id === readingId) ?? notebook.readings[0];
  const notes = useMemo(() => notebook.notes.map(viewNote), [notebook.notes]);
  const initial = {
    notes,
    catalog: notebook.catalog,
    days: isDesignPreview ? notebookDays : undefined,
    resources: notebook.materials.map(item => ({ id: materialKey(item.spaceId, item.id), title: item.title || 'Reading', source: item.spaceTitle, question: item.content })),
    readingLabel: reading ? `${reading.book === 'Psalms' ? 'Psalm' : reading.book} ${reading.chapter} · ${reading.translation}` : undefined
  };
  function useChildChapter(book: string | undefined, chapter: number | undefined, translation: ChildBibleTranslation, sharedId?: string) {
    const [refresh, setRefresh] = useState(0);
    const key = JSON.stringify([book, chapter, translation, sharedId, refresh, revision]);
    const [result, setResult] = useState<{ key: string; data?: { verses: { number: number; text: string }[]; thoughts?: ChildFamilyThought[]; stickers?: ChildVerseSticker[] } }>();
    useEffect(() => {
      if (!book || !chapter) return;
      let current = true;
      const load = sharedId ? request<ChildFamilyChapter>(`bible/readings/${encodeURIComponent(sharedId)}`)
        : request<ChildBibleChapter & { stickers?: ChildVerseSticker[] }>('bible/chapter', 'POST', { book, chapter, translation });
      void load.then(data => {
        if (current) setResult({ key, data: { ...data, verses: data.verses.map(verse => ({ number: verse.verse, text: verse.text })) } });
      }).catch(() => { if (current) setResult({ key }); });
      return () => { current = false; };
    }, [book, chapter, translation, sharedId, key]);
    const settled = result?.key === key;
    return { data: settled ? result.data : undefined, isLoading: !!book && !settled, isError: settled && !result.data, refetch: () => setRefresh(value => value + 1) };
  }

  return <ChildNotebookShell onFinish={() => window.dispatchEvent(new CustomEvent('harvousChildNotebookPreviewAction', { detail: 'finish' }))}>
    <ChildNotebookView preview={isDesignPreview} initial={initial} privacyUrl={privacyUrl}
      renderBible={props => <ChildNotebookBibleReader {...props} useChapter={useChildChapter} privacyUrl={privacyUrl}
        live={{ translations: notebook.translations, readings: notebook.readings, activeReading: reading, onReading: setReadingId,
          saveThought: async (id, verse, text) => (await request<{ thought: ChildFamilyThought }>(`bible/readings/${encodeURIComponent(id)}/thoughts`, 'POST', { verse, text })).thought,
          saveSticker: async (book, chapter, verse, sticker) => { await request('bible/stickers', 'PUT', { book, chapter, verse, sticker }); } }}
        renderEdge={(book, chapter, translation, direction, onSelect) => {
          const next = adjacentChapter(book, chapter, direction === 'behind' ? -1 : 1, translation);
          return next && <div className={`pds-reader-stack__edges pds-reader-stack__edges--${direction}`} style={{ '--edge-count': 1 } as CSSProperties}>
            <button className="pds-reader-stack__edge" style={{ '--edge-depth': 1 } as CSSProperties} type="button" onClick={() => {
              playCue(direction === 'behind' ? 'nav.back' : 'nav.forward'); onSelect(next.book, next.chapter);
            }}><span className="pds-caption pds-reader-stack__edge-label">{next.book} {next.chapter}</span></button>
          </div>;
        }} />}
      renderAttachment={props => <ChildNoteAttachmentPicker {...props} translations={notebook.translations} useChapter={useChildChapter} />}
      renderSearch={({ onClose, onOpenNote, onOpenBible, onOpenResource }) => <ChildNotebookSearchPanel search={search} onClose={onClose}
        onOpen={async item => {
          if (item.kind === 'note') return onOpenNote(viewNote((await request<{ note: ChildNote }>(`notes/${encodeURIComponent(item.id)}`)).note));
          if (item.kind === 'reading') return onOpenBible(item.id);
          if (item.kind === 'material') return onOpenResource(materialKey(item.spaceId, item.id));
          return false;
        }} />}
      onFamilyReading={async id => {
        const data = await request<Notebook>('notebook');
        if (!data.readings.some(item => item.id === id)) throw new Error('This reading is no longer shared.');
        setReadingId(id); onRefresh(() => data);
      }}
      onReadResource={async item => {
        const [spaceId, id] = JSON.parse(item.id) as [string, string];
        const { material } = await request<{ material: ChildMaterial }>(`materials/${encodeURIComponent(spaceId)}/${encodeURIComponent(id)}`);
        return { ...item, title: material.title || 'Reading', source: material.spaceTitle, question: material.content };
      }}
      onSaveNote={async (note, catalog) => {
        const exists = notebook.notes.some(item => item.id === note.id);
        const scripture = [];
        const resources = [];
        for (const item of note.attachments ?? []) {
          if (item.kind === 'scripture') {
            const { book, chapter, verse, translation } = item;
            scripture.push({ book, chapter, verse, translation });
          } else {
            const [spaceId, noteId] = JSON.parse(item.resourceId) as [string, string];
            resources.push({ spaceId, noteId });
          }
        }
        const { note: saved, catalog: savedCatalog } = await request<{ note: ChildNote; catalog?: ChildNotebookCatalog }>(exists ? `notes/${encodeURIComponent(note.id)}` : 'notes', exists ? 'PUT' : 'POST', { title: note.title, content: note.content, details: {
          folder: note.primaryCollection ?? null, tags: catalog.tags.filter(tag => note.tagIds?.includes(tag.id)).map(tag => tag.name),
          threads: catalog.threads.filter(thread => note.threadIds?.includes(thread.id)).map(thread => thread.title), scripture, resources
        } });
        onRefresh(current => ({ ...current, catalog: savedCatalog ?? catalog, notes: [saved, ...current.notes.filter(item => item.id !== saved.id)] }));
        return { note: viewNote(saved), catalog: savedCatalog };
      }}
      onSavePreferences={async preferences => {
        const saved = await request<{ preferences: ChildNotebookPreferences }>('preferences', 'PUT', preferences);
        onRefresh(current => ({ ...current, preferences: saved.preferences }));
      }}
      onParentSignIn={() => onEnd(true)}
      onEndSession={() => onEnd(false)}
    />
  </ChildNotebookShell>;
}

function ChildNotebook() {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [status, setStatus] = useState<'opening' | 'ended' | null>('opening');
  const [error, setError] = useState('');
  const [privacyUrl, setPrivacyUrl] = useState<string>();
  const [revision, setRevision] = useState(0);
  const refreshVersion = useRef(0);
  const applyLocalChange = useCallback((update: (current: Notebook) => Notebook) => {
    refreshVersion.current++;
    if (sessionToken) setNotebook(current => current && update(current));
  }, []);
  const childRequest = useCallback(async <T,>(path: string, method?: string, body?: unknown) => {
    try { return await request<T>(path, method, body); }
    catch (cause) {
      if (cause instanceof ChildRequestError && [401, 403].includes(cause.status)) {
        sessionToken = null; refreshVersion.current++;
        setNotebook(null); setStatus(null); setError(cause.message);
      }
      throw cause;
    }
  }, []);
  useEffect(() => {
    let current = true;
    if (!isDesignPreview) void request<{ privacyUrl: string }>('privacy').then(data => {
      if (current) setPrivacyUrl(data.privacyUrl);
    }).catch(() => {});
    void openNotebook().then(data => {
      if (current) { setNotebook(data); setStatus(null); }
    }).catch(cause => { if (current) { setError(cause.message); setStatus(null); } });
    return () => { current = false; };
  }, []);
  useEffect(() => {
    let current = true;
    function check() {
      if (document.visibilityState !== 'visible' || !sessionToken) return;
      const version = ++refreshVersion.current;
      void childRequest<Notebook>('notebook').then(data => {
        if (current && sessionToken && version === refreshVersion.current) { setNotebook(data); setRevision(value => value + 1); }
      }).catch(() => {});
    }
    document.addEventListener('visibilitychange', check);
    return () => { current = false; document.removeEventListener('visibilitychange', check); };
  }, [childRequest]);

  if (!notebook) return <main className="pds-child-app pds-family-stack">
    <h1 className="pds-title">My notebook</h1>
    {status === 'opening' && <ProtoSpaceLoading label="Opening your notebook" />}
    {status === 'ended' && <p role="status">All done. Ask your parent for a link next time.</p>}
    {error && <p role="alert">{error}</p>}
    <ChildPrivacyFootnote url={privacyUrl}>A notebook is just for a child and their parent.</ChildPrivacyFootnote>
  </main>;
  return <ChildNotebookAppearanceProvider name={notebook.displayName} initial={notebook.preferences}>
    <SessionNotebook notebook={notebook} privacyUrl={notebook.privacyUrl ?? privacyUrl} request={childRequest} revision={revision} onRefresh={applyLocalChange}
      onEnd={async returnToParent => {
        if (returnToParent && !notebook.parentSignInUrl) throw new Error('Parent sign-in is unavailable in the design preview.');
        await childRequest('session', 'DELETE');
        sessionToken = null; setNotebook(null);
        if (returnToParent && notebook.parentSignInUrl) window.location.assign(notebook.parentSignInUrl);
        else setStatus('ended');
      }} />
  </ChildNotebookAppearanceProvider>;
}
document.documentElement.classList.add('harvous-prototype-route');
createRoot(document.getElementById('root')!).render(<ChildNotebook />);
