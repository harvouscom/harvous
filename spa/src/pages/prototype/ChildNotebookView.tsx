import { AppearancePreviewTile } from './settings/AppearancePreviewTile';
import { ChildNotebookAvatar, ChildNotebookCover, childImageChoices, childImageUrl, useChildNotebookAppearance } from './ChildNotebookAppearance';
import { useEffect, useRef, useState, type CSSProperties, type ComponentProps, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import ProtoLoadingDots from './ProtoLoadingDots';
import Icon from '@/components/react/Icon';
import { SOUND_PREFERENCES } from '@/utils/sound-prefs';
import { playSound, warmSounds } from '@/utils/sounds';
import { SettingsGroup, SettingsRow } from './settings/SettingsShell';
import type { ChildBibleMode, ChildBiblePassage, ChildReaderProps } from './ChildNotebookBibleReader';
import type ChildNoteAttachmentPicker from './ChildNoteAttachmentPicker';
import type { ChildNoteAttachment, ChildFamilyResource } from './ChildNoteAttachmentPicker';
import { ChildNoteInfo, type ChildNoteOrganization, type ChildNotebookCatalog, type OrganizationKind } from './ChildNotebookTools';
import ChildNotebookSearch, { type ChildSearchItem } from './ChildNotebookSearch';
import ChildFamilySpacePreview from './ChildFamilySpacePreview';
import ChildNotebookTextFields from '../family/ChildNotebookTextFields';
import { ChildPrivacyFootnote } from '../family/ChildPrivacyNotice';
import PrototypeMainPaneShell from './PrototypeMainPaneShell';
import PrototypeHomeSection from './PrototypeHomeSection';
import PrototypeHomeRow from './PrototypeHomeRow';
import { TypedLine } from './PrototypeFeedComposePrompt';
import ChildNotebookCoverStudio from './ChildNotebookCoverStudio';
import type { ChildNotebookPreferences } from '../../../../shared/child-notebook';

const familyBibleBookmark = { book: 'Psalms', chapter: 23 };

type Props = {
  preview?: boolean;
  privacyUrl?: string;
  initial?: { notes: Note[]; resources: ChildFamilyResource[]; readingLabel?: string; catalog?: ChildNotebookCatalog; days?: string[] };
  renderBible: (props: ChildReaderProps) => ReactNode;
  renderAttachment?: (props: Omit<ComponentProps<typeof ChildNoteAttachmentPicker>, 'useChapter'>) => ReactNode;
  renderSearch?: (props: { onClose: () => void; onOpenNote: (note: Note) => Promise<boolean>; onOpenBible: (id: string) => Promise<boolean>; onOpenResource: (id: string) => Promise<boolean> }) => ReactNode;
  onSaveNote?: (note: Note, catalog: ChildNotebookCatalog) => Promise<{ note: Note; catalog?: ChildNotebookCatalog }>;
  onReadResource?: (resource: ChildFamilyResource) => Promise<ChildFamilyResource>;
  onSavePreferences?: (preferences: ChildNotebookPreferences) => Promise<void>;
  onFamilyReading?: (id: string) => Promise<void>;
  onParentSignIn: () => Promise<void>;
  onEndSession?: () => Promise<void>;
};

// Local design fixture only. All edits remain in React state, never account data.
export type Note = ChildNoteOrganization & {
  id: string;
  title: string;
  content: string;
  date: string;
  reference?: string;
  translation?: string;
  attachments?: ChildNoteAttachment[];
};

export const initialNotes: Note[] = [
  { id: 'sample-1', title: 'What I want to remember', content: 'I want to talk with my family about what we read together today.', date: 'Today', primaryCollection: 'Bible reading', tagIds: ['family-reading'], threadIds: ['read-together'] },
  { id: 'sample-3', title: 'A little kindness', content: 'I helped someone today. I want to remember how small things can make a difference.', date: 'Yesterday', tagIds: ['kindness'] },
  { id: 'sample-2', title: 'A question for Sunday', content: 'What did you notice in this week’s reading?', date: 'Sunday', primaryCollection: 'Sunday notes', threadIds: ['read-together'] }
];

export const notebookDays = ['Today', 'Yesterday', 'Sunday'];

// Sample adults with notebook access. Family Space membership is a separate permission.
const notebookGuardians: readonly { id: string; name: string }[] = [
  { id: 'mom', name: 'Mom' },
  { id: 'jo', name: 'Aunt Jo' }
];
const circleNames = new Intl.ListFormat('en', { type: 'conjunction' }).format([
  'You', ...notebookGuardians.map(guardian => guardian.name)
]);
const picturedGuardians = notebookGuardians.slice(0, 2);
const additionalGuardians = notebookGuardians.length - picturedGuardians.length;

export const initialCatalog: ChildNotebookCatalog = {
  folders: ['Bible reading', 'Sunday notes'],
  tags: [{ id: 'family-reading', name: 'Family reading' }, { id: 'kindness', name: 'Kindness' }],
  threads: [{ id: 'read-together', title: 'Read together' }]
};

const familyResource = {
  id: 'weekly-ministry-reading',
  title: 'This week’s reading',
  source: 'Kids ministry',
  question: 'What’s one kind thing you could do for someone this week?'
};

function attachmentKey(attachment: ChildNoteAttachment) {
  return attachment.kind === 'scripture'
    ? `scripture:${attachment.reference}:${attachment.translation}`
    : `resource:${attachment.resourceId}`;
}



export default function ChildNotebookView({ preview = false, privacyUrl, initial, renderBible, renderAttachment, renderSearch, onSaveNote, onReadResource, onSavePreferences, onFamilyReading, onParentSignIn, onEndSession }: Props) {
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedResource, setSelectedResource] = useState<ChildFamilyResource | null>(null);
  const resources = initial?.resources ?? [familyResource];
  const readingLabel = initial ? initial.readingLabel : 'Psalm 23';
  function attachmentLabel(attachment: ChildNoteAttachment) {
    return attachment.kind === 'scripture' ? `${attachment.reference} · ${attachment.translation}`
      : resources.find(resource => resource.id === attachment.resourceId)?.title ?? 'Reading no longer shared';
  }
  const [parentGate, setParentGate] = useState<'return' | 'export' | false>(false);
  const [parentBusy, setParentBusy] = useState(false);
  const [parentError, setParentError] = useState('');
  const parentDialogRef = useRef<HTMLDialogElement>(null);
  const { name, preferences, coverColor, coverPattern, appearance, setAppearance, resolvedScheme, themeStyle, soundPreference, setSoundPreference, playCue } = useChildNotebookAppearance();
  const settingsPaneRef = useRef<HTMLElement>(null);
  const privacyDialogRef = useRef<HTMLDialogElement>(null);
  const previousCustomizing = useRef(false);
  const settingsDialogRef = useRef<HTMLDialogElement>(null);
  const [customizing, setCustomizing] = useState(false);
  const [studioPage, setStudioPage] = useState<'settings' | 'appearance' | 'feedback'>('settings');
  // Below the adult shell's breakpoint, Settings is a bottom sheet like the adult one: it opens on
  // the list of categories, and picking one slides into it with a back caret in the header.
  const [narrowSettings, setNarrowSettings] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches);
  const [sheetPaneOpen, setSheetPaneOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)');
    const update = () => setNarrowSettings(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const settingsPanes = [
    { id: 'settings', title: 'My notebook', icon: 'book-open' },
    { id: 'appearance', title: 'Appearance', icon: 'sun' },
    { id: 'feedback', title: 'Sounds & motion', icon: 'volume-low' }
  ] as const;
  const activeCanvas = resolvedScheme === 'dark' ? appearance.darkCanvas : appearance.canvas;
  function pickCanvas(id: string) { setAppearance(current => ({ ...current, [resolvedScheme === 'dark' ? 'darkCanvas' : 'canvas']: id })); }
  const [notes, setNotes] = useState<Note[]>(initial?.notes ?? initialNotes);
  const sourceNotes = initial?.notes;
  useEffect(() => { if (sourceNotes) setNotes(sourceNotes); }, [sourceNotes]);
  const [catalog, setCatalog] = useState(initial?.catalog ?? (initial ? { folders: [], tags: [], threads: [] } : initialCatalog));
  const [infoOpen, setInfoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const infoButtonRef = useRef<HTMLButtonElement>(null);
  const [notebookDay, setNotebookDay] = useState(0);
  const days = initial?.days ?? (initial ? ['Today', ...new Set(notes.map(note => note.date).filter(date => date !== 'Today'))].slice(0, 8) : notebookDays);
  const dayLabel = days[notebookDay] ?? 'Today';
  const dayNotes = notes.filter(note => note.date === dayLabel);
  const olderDays = days.slice(notebookDay + 1);
  const newerDay = days[notebookDay - 1];
  const [view, setView] = useState<'home' | 'family' | 'family-thread' | 'note' | 'reading' | 'remember' | 'bible'>('home');
  const inFamilySpace = view === 'family' || view === 'family-thread';
  const showComposePrompt = view === 'home' && notebookDay === 0;
  const [bibleMode, setBibleMode] = useState<ChildBibleMode>('personal');
  const [biblePassages, setBiblePassages] = useState<Record<ChildBibleMode, ChildBiblePassage>>({
    personal: { book: 'John', chapter: 1 },
    family: familyBibleBookmark
  });
  const [draft, setDraft] = useState<Note | null>(null);
  const [attachmentPicker, setAttachmentPicker] = useState<{ kind: ChildNoteAttachment['kind']; existing?: ChildNoteAttachment } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const [homeFilter, setHomeFilter] = useState<'all' | 'continue' | 'remember' | 'ideas'>('all');
  const [revealed, setRevealed] = useState(false);
  const reviewNote = notes[notes.length - 1];
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [systemReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reducedMotion = systemReducedMotion || appearance.reduceMotion;
  const [writingIdea, setWritingIdea] = useState('');
  // Authored templates only. Context comes from this notebook's existing material.
  const ideas: { text: string; context: string; note?: Note }[] = [
    { text: 'What’s something you noticed today?', context: 'A little encouragement' },
    { text: 'What’s one thing you’d like to remember from today?', context: 'Something to write about' },
    { text: 'What caught your attention in this week’s reading?', context: 'From your ministry reading' },
    ...(notes.length ? [{ text: `Anything you’d like to add to “${notes[0].title}”?`, context: 'From your notebook', note: notes[0] }] : []),
    { text: 'What’s a big question on your mind?', context: 'A little encouragement' },
    { text: 'What would you like to talk about with your family?', context: 'Something to write about' }
  ];
  const idea = ideas[ideaIndex % ideas.length];
  const titleRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousPage = useRef({ view, notebookDay });

  useEffect(() => {
    if (previousPage.current.view === view && previousPage.current.notebookDay === notebookDay) return;
    previousPage.current = { view, notebookDay };
    if (view === 'note') titleRef.current?.focus();
    else headingRef.current?.focus();
  }, [view, notebookDay]);

  useEffect(() => {
    const dialog = privacyDialogRef.current;
    if (privacy && dialog && !dialog.open) dialog.showModal();
    if (!privacy && dialog?.open) dialog.close();
  }, [privacy]);
  useEffect(() => {
    if (customizing) { if (!settingsDialogRef.current?.open) { setSheetPaneOpen(false); settingsDialogRef.current?.showModal(); } settingsPaneRef.current?.focus({ preventScroll: true }); }
    else if (settingsDialogRef.current?.open) settingsDialogRef.current.close();
    if (!customizing && previousCustomizing.current) document.getElementById('child-notebook-mode-trigger')?.focus({ preventScroll: true });
    previousCustomizing.current = customizing;
  }, [customizing]);

  useEffect(() => {
    const dialog = parentDialogRef.current;
    if (parentGate && dialog && !dialog.open) dialog.showModal();
    if (!parentGate && dialog?.open) dialog.close();
  }, [parentGate]);
  useEffect(() => { if (customizing) settingsPaneRef.current?.focus({ preventScroll: true }); }, [studioPage]);
  async function goToParentSignIn() {
    if (parentBusy) return;
    setParentBusy(true); setParentError('');
    try {
      await onParentSignIn();
    } catch {
      setParentError('We couldn’t prepare parent sign-in. Please try again.');
      setParentBusy(false);
    }
  }

  function openNote(note?: Note, prompt = '') {
    playCue('nav.open');
    setSaveError('');
    setWritingIdea(prompt);
    setInfoOpen(false);
    setDraft(note || { id: crypto.randomUUID(), title: '', content: '', date: 'Today' });
    setAnnouncement('');
    setView('note');
  }
  async function finish() {
    if (saving) return false;
    const unchanged = draft && notes.some(note => note.id === draft.id && JSON.stringify(note) === JSON.stringify(draft));
    if (draft && !unchanged && (draft.title.trim() || draft.content.trim() || draft.attachments?.length)) {
      const firstAttachment = draft.attachments?.[0];
      const note = { ...draft, title: draft.title.trim() || draft.reference || (firstAttachment ? attachmentLabel(firstAttachment) : 'My note'), date: 'Today' };
      setSaving(true); setSaveError('');
      try {
        const { note: saved, catalog: updatedCatalog } = onSaveNote ? await onSaveNote(note, catalog) : { note, catalog: undefined };
        if (updatedCatalog) setCatalog(updatedCatalog);
        setNotes(current => [saved, ...current.filter(item => item.id !== saved.id)]);
        setNotebookDay(0);
        setAnnouncement('Your note is saved.');
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Could not save your note.');
        return false;
      } finally { setSaving(false); }
      playCue('organize.filed');
    }
    setView('home');
    setDraft(null);
    return true;
  }

  async function openResource(resource: ChildFamilyResource) {
    setSaveError('');
    try {
      setSelectedResource(onReadResource ? await onReadResource(resource) : resource);
      setView('reading');
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not open this reading.');
      return false;
    }
  }

  async function closeSettings() {
    if (saving) return;
    setSaving(true); setSaveError('');
    try { await onSavePreferences?.(preferences); setCustomizing(false); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Could not save your settings.'); }
    finally { setSaving(false); }
  }

  function openFamilyReading() {
    playCue('nav.forward');
    setBiblePassages(current => ({ ...current, family: familyBibleBookmark }));
    setBibleMode('family');
    setView('bible');
  }

  function openNotebookDay(index: number) {
    playCue(index > notebookDay ? 'nav.back' : 'nav.forward');
    setNotebookDay(index);
    setHomeFilter('all');
  }

  function updateOrganization(changes: ChildNoteOrganization) {
    setDraft(current => current ? { ...current, ...changes } : current);
  }

  function createOrganization(kind: OrganizationKind, name: string) {
    const matches = (existing: string) => existing.toLocaleLowerCase() === name.toLocaleLowerCase();
    if (kind === 'folder') {
      const folder = catalog.folders.find(matches) ?? name;
      if (!catalog.folders.includes(folder)) setCatalog(current => ({ ...current, folders: [...current.folders, folder] }));
      updateOrganization({ primaryCollection: folder });
    } else if (kind === 'tag') {
      const existing = catalog.tags.find(tag => matches(tag.name));
      const tag = existing ?? { id: crypto.randomUUID(), name };
      if (!existing) setCatalog(current => ({ ...current, tags: [...current.tags, tag] }));
      updateOrganization({ tagIds: [...new Set([...(draft?.tagIds ?? []), tag.id])] });
    } else {
      const existing = catalog.threads.find(thread => matches(thread.title));
      const thread = existing ?? { id: crypto.randomUUID(), title: name };
      if (!existing) setCatalog(current => ({ ...current, threads: [...current.threads, thread] }));
      updateOrganization({ threadIds: [...new Set([...(draft?.threadIds ?? []), thread.id])] });
    }
  }

  function noteLabels(note: Note) {
    return [
      note.reference && note.reference !== note.title ? note.reference : undefined,
      note.primaryCollection,
      ...catalog.tags.filter(tag => note.tagIds?.includes(tag.id)).map(tag => tag.name),
      ...catalog.threads.filter(thread => note.threadIds?.includes(thread.id)).map(thread => thread.title)
    ].filter(Boolean).join(' · ');
  }

  useEffect(() => {
    if (!onSaveNote || !draft) return;
    const saved = notes.find(note => note.id === draft.id);
    if (saved && JSON.stringify(saved) === JSON.stringify(draft)) return;
    if (!saved && !draft.title && !draft.content && !draft.attachments?.length) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft, notes, onSaveNote]);

  useEffect(() => {
    if (initial && selectedResource && !initial.resources.some(resource => resource.id === selectedResource.id)) {
      setSelectedResource(null); setView('family');
    }
  }, [initial, selectedResource]);

  const savedNotes = draft && (draft.title.trim() || draft.content.trim() || draft.attachments?.length)
    ? [draft, ...notes.filter(note => note.id !== draft.id)]
    : notes;
  const searchItems: ChildSearchItem[] = [
    ...savedNotes.map((note): ChildSearchItem => ({
      id: note.id,
      source: 'My notebook',
      title: note.title.trim() || note.reference || 'My note',
      subtitle: noteLabels(note) || note.date,
      preview: note.content,
      keywords: [note.reference, note.translation, ...(note.attachments ?? []).map(attachmentLabel)].filter(Boolean).join(' '),
      icon: 'note-sticky',
      open: () => {
        if (draft?.id === note.id) return;
        if (draft) finish();
        openNote(note);
      }
    })),
    { id: 'family-bible-bookmark', source: 'Family Space', title: 'Psalm 23', subtitle: 'Family Bible · Read together', keywords: 'Psalms 23 bookmark family reading', icon: 'bookmark', open: () => { if (draft) finish(); openFamilyReading(); } },
    { id: familyResource.id, source: 'Family Space', title: familyResource.title, subtitle: `${familyResource.source} · Shared by your parent`, preview: familyResource.question, icon: 'book-open', open: () => { if (draft) void finish(); void openResource(familyResource); } }
  ];

  useEffect(() => {
    const onShellAction = async (event: Event) => {
      const action = (event as CustomEvent<string>).detail;
      if (action === 'search') { playCue('nav.open'); setSearchOpen(true); return; }
      if (action === 'privacy') { playCue('nav.open'); setPrivacy(true); return; }
      if (action === 'finish') {
        if (draft && !await finish()) return;
        try { await onEndSession?.(); } catch { setSaveError('Could not end this session. Try again.'); }
        return;
      }
      if (action === 'parent') { if (draft && !await finish()) return; playCue('nav.open'); setParentGate('return'); return; }
      if (action === 'settings') { if (draft && !await finish()) return; playCue('nav.open'); setView('home'); setStudioPage('settings'); setCustomizing(true); return; }
      if (action === 'bible') { if (draft && !await finish()) return; playCue('nav.forward'); setCustomizing(false); setView('bible'); return; }
      if (action !== 'home' && action !== 'family' && action !== 'compose') return;
      if (draft && !await finish()) return;
      setCustomizing(false);
      if (action === 'compose') openNote();
      else if (action === 'family') { playCue('nav.forward'); setView('family'); }
      else { playCue('nav.back'); setNotebookDay(0); setView('home'); }
    };
    window.addEventListener('harvousChildNotebookPreviewAction', onShellAction);
    return () => window.removeEventListener('harvousChildNotebookPreviewAction', onShellAction);
  }, [draft, playCue, saving, onSaveNote]);

  return <PrototypeMainPaneShell>
    {renderBible({
      active: view === 'bible', mode: bibleMode, passage: biblePassages[bibleMode],
      onModeChange: setBibleMode,
      onNavigate: (book, chapter) => setBiblePassages(current => ({ ...current, [bibleMode]: { book, chapter } })),
      onStartNote: (reference, translation) => {
        const match = reference.match(/^(.+) (\d+):(\d+)$/);
        const attachments: ChildNoteAttachment[] = match ? [{ kind: 'scripture', reference, translation, book: match[1], chapter: Number(match[2]), verse: Number(match[3]) }] : [];
        openNote({ id: crypto.randomUUID(), title: '', content: '', date: 'Today', reference, translation, attachments });
      }
    })}
    {saveError && !customizing && <p className="pds-caption pds-kids-status" role="alert">{saveError}</p>}
    {inFamilySpace && <ChildFamilySpacePreview
      threadOpen={view === 'family-thread'}
      headingRef={headingRef}
      resources={resources}
      readingLabel={readingLabel}
      onOpenThread={() => { playCue('nav.forward'); setView('family-thread'); }}
      onBackToSpace={() => { playCue('nav.back'); setView('family'); }}
      onOpenReading={resource => { playCue('nav.forward'); void openResource(resource); }}
      onOpenBible={openFamilyReading}
    />}
    {view !== 'bible' && !inFamilySpace && <div className="proto-feed pds-kids-preview" data-fill="true" data-prompt-docked={view === 'home' ? 'true' : undefined} data-note-info={view === 'note' && infoOpen ? 'true' : undefined}><div className="proto-feed-stack">
      {view === 'home' && olderDays.length > 0 && <div className="proto-feed-stack__edges" role="group" aria-label="Earlier notebook days">
        {[...olderDays].reverse().map((label, index) => {
          const depth = olderDays.length - index;
          return (
            <button key={label} type="button" className="proto-feed-stack__edge" style={{ '--edge-depth': depth } as CSSProperties} aria-label={`Show ${label}’s notebook activity`} onClick={() => openNotebookDay(notebookDay + depth)}>
              <span className="pds-caption proto-feed-stack__edge-label">{label}</span>
            </button>
          );
        })}
      </div>}
      <div className="pds-kids-flip-stage">
      <article className="proto-feed-sheet pds-kids-preview__paper pds-kids-flip" data-compose-prompt={showComposePrompt || undefined} data-pattern={coverPattern} style={{ '--kids-cover-color': coverColor.color } as CSSProperties}>
        <div className="pds-kids-flip__front">
        <header className="pds-kids-preview__topline" data-cover={view === 'home' ? 'true' : undefined}>
          {view === 'home' ? <div className="pds-kids-preview__identity">
              <ChildNotebookCover name={name} preferences={preferences} />
              <span className="pds-kids-preview__cover-title"><strong>{name}’s notebook</strong></span>
            </div>
            : <button className="proto-settings-btn proto-settings-btn--secondary pds-kids-back-button" disabled={saving} onClick={view === 'note' ? finish : () => setView(view === 'reading' ? 'family-thread' : 'home')}><Icon name="arrow-left" size={13} /> {view === 'reading' ? 'Read together' : 'My notebook'}</button>}

          {view === 'note' && renderAttachment && <button type="button" ref={infoButtonRef} className="proto-toolbar-icon-btn" aria-label="Note info" title="Note info" aria-expanded={infoOpen} aria-controls={infoOpen ? 'child-note-info' : undefined} onClick={() => setInfoOpen(current => !current)}><Icon name="circle-info" size={17} /></button>}
          {view === 'home' && <div className="proto-feed-sheet__controls">
            <span className="pds-caption">{dayLabel}</span>
            {newerDay && <button type="button" className="proto-sidebar-back-tile proto-feed-sheet__forward" aria-label={`Forward to ${newerDay}`} title={`Forward to ${newerDay}`} onClick={() => openNotebookDay(notebookDay - 1)}>
              <Icon name="caret-right" size={16} aria-hidden />
            </button>}
          </div>}
        </header>

        {view === 'home' && notebookDay === 0 && <div className="pds-kids-preview__body">
          <section className="pds-kids-preview__welcome">
            <h1 ref={headingRef} tabIndex={-1} className="pds-title-xl pds-kids-welcome-title">{notes.length ? `Welcome back, ${name}.` : `Welcome, ${name}.`}</h1>
            <p className="pds-kids-welcome-copy">
              Your questions and discoveries belong here.<br />{' '}
              Where would you like to start?
            </p>
            <div className="pds-kids-welcome-actions">
              <button className="pds-kids-welcome-action" onClick={openFamilyReading}>
                <span className="pds-kids-welcome-action__icon" aria-hidden="true"><Icon name="book-open" size={14} /></span>
                <span className="pds-kids-welcome-action__copy"><strong>Read together</strong><span>{readingLabel ? `Family Bible · ${readingLabel}` : 'Family Bible'}</span></span>
              </button>
              {notes.length > 0 && <button className="pds-kids-welcome-action" onClick={() => openNote(notes[0])}>
                <span className="pds-kids-welcome-action__icon" aria-hidden="true"><Icon name="pen-to-square" size={14} /></span>
                <span className="pds-kids-welcome-action__copy"><strong>Keep writing</strong><span>{notes[0].title}</span></span>
              </button>}
            </div>
          </section>
          <div className="proto-appearance-segmented pds-kids-home-filters" role="group" aria-label="Show notebook activities">
            {([
              { id: 'all', label: 'All', icon: 'rectangle-list' },
              { id: 'continue', label: 'Keep going', icon: 'arrow-right' },
              { id: 'remember', label: 'Look back', icon: 'rotate-left' },
              { id: 'ideas', label: 'Ideas', icon: 'wand-magic-sparkles' }
            ] as const).map(filter => <button key={filter.id} className="proto-appearance-segmented__btn" data-active={homeFilter === filter.id ? 'true' : undefined} aria-pressed={homeFilter === filter.id} aria-controls="kids-home-activities" onClick={() => setHomeFilter(filter.id)}><Icon name={filter.icon} size={15} />{filter.label}</button>)}
          </div>
          <div id="kids-home-activities" className="pds-kids-home-activities">
            {(homeFilter === 'all' || homeFilter === 'continue') && <PrototypeHomeSection title="Keep going">
              {notes.map(note => <PrototypeHomeRow key={note.id} icon="note-sticky" title={note.title} meta={[noteLabels(note) || 'Your notebook', note.date]} onClick={() => openNote(note)} />)}
              {!notes.length && <PrototypeHomeRow icon="pen-to-square" title="Your first note starts here" meta={['A thought, a question, anything you noticed']} onClick={() => openNote()} />}
            </PrototypeHomeSection>}
            {(homeFilter === 'all' || homeFilter === 'remember') && <PrototypeHomeSection title="Look back">
              {reviewNote ? <PrototypeHomeRow icon="rotate-left" title={reviewNote.title} meta={['What do you remember?', 'Take your time']} onClick={() => { setRevealed(false); setView('remember'); }} />
                : <PrototypeHomeRow icon="pen-to-square" title="Keep something to come back to" meta={['Write a note first, then revisit it here']} onClick={() => openNote()} />}
            </PrototypeHomeSection>}
            {(homeFilter === 'all' || homeFilter === 'ideas') && <>
              <PrototypeHomeSection title="Shared with you">
                <PrototypeHomeRow icon="user-group" title="Family Space" meta={['Family Bible and readings']} onClick={() => setView('family')} />
              </PrototypeHomeSection>
              <PrototypeHomeSection title="A little idea">
                <PrototypeHomeRow icon="wand-magic-sparkles" title="Bring a question on Sunday" meta={['Keep a question you’d like to ask your family or leader']} onClick={() => openNote(undefined, 'What would you like to ask about this week’s reading?')} />
              </PrototypeHomeSection>
            </>}
          </div>
          <ChildPrivacyFootnote url={privacyUrl}>Your notebook is just for you and your parent.</ChildPrivacyFootnote>
        </div>}

        {view === 'home' && notebookDay > 0 && <div className="pds-kids-preview__body">
          <div className="pds-kids-day-heading"><span className="pds-caption">A page from your notebook</span><h1 ref={headingRef} tabIndex={-1} className="pds-title-xl">{dayLabel}</h1><p className="pds-caption">Little thoughts worth coming back to.</p></div>
          <PrototypeHomeSection title="Your notes">
            {dayNotes.map(note => <PrototypeHomeRow key={note.id} icon="note-sticky" title={note.title} meta={[note.content]} onClick={() => openNote(note)} />)}
            {!dayNotes.length && <p className="pds-caption">No notes on this page yet.</p>}
          </PrototypeHomeSection>
        </div>}

        {view === 'note' && draft && <div className="pds-kids-note-layout">
        <div className="pds-kids-preview__body pds-kids-preview__editor">
          {draft.reference && <span className="pds-caption">{[draft.reference, draft.translation, 'My Bible'].filter(Boolean).join(' · ')}</span>}
          <ChildNotebookTextFields title={draft.title} content={draft.content} titleRef={titleRef} disabled={saving} onTitleChange={title => setDraft({ ...draft, title })} onContentChange={content => setDraft({ ...draft, content })}>
          {renderAttachment && <div className="pds-kids-note-attachments" role="group" aria-label="Add to note">
            <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => setAttachmentPicker({ kind: 'scripture' })}><Icon name="book-open" size={14} /> Add Scripture</button>
            <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => setAttachmentPicker({ kind: 'resource' })}><Icon name="bookmark" size={14} /> Add a resource</button>
          </div>}
          {!!draft.attachments?.length && <ul className="pds-kids-note-attachments pds-kids-note-attachments__list" aria-label="Note attachments">
            {draft.attachments.map(attachment => (
              <li key={attachmentKey(attachment)}>
                <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => setAttachmentPicker({ kind: attachment.kind, existing: attachment })}>
                  <Icon name={attachment.kind === 'scripture' ? 'book-open' : 'bookmark'} size={13} /> {attachmentLabel(attachment)}
                </button>
                <button type="button" className="proto-toolbar-icon-btn" aria-label={`Remove ${attachmentLabel(attachment)}`} onClick={() => setDraft(current => current ? {
                  ...current, attachments: current.attachments?.filter(item => attachmentKey(item) !== attachmentKey(attachment))
                } : current)}><Icon name="xmark" size={12} /></button>
              </li>
            ))}
          </ul>}
          {writingIdea && !draft.content && <p className="pds-caption pds-kids-note-idea">{writingIdea}</p>}
          </ChildNotebookTextFields>
          <div className="pds-kids-preview__editor-footer"><ChildPrivacyFootnote url={privacyUrl}>Your parent can read this note.</ChildPrivacyFootnote><button className="proto-settings-btn pds-kids-preview__done" disabled={saving} onClick={finish}>{saving ? <ProtoLoadingDots /> : <Icon name="check" size={12} />} Done</button></div>
        </div>
        {infoOpen && <ChildNoteInfo note={draft} catalog={catalog} onChange={updateOrganization} onCreate={createOrganization} onClose={() => {
          setInfoOpen(false);
          infoButtonRef.current?.focus();
        }} />}
        </div>}

        {view === 'remember' && reviewNote && <div className="pds-kids-preview__body pds-kids-review">
          <div className="pds-kids-review__hero"><span className="pds-kids-review__art" aria-hidden="true"><Icon name="rotate-left" size={28} /><span><Icon name="star" size={12} /></span></span>
            <span className="pds-kids-preview__label">A little look back</span>
            <h1 ref={headingRef} tabIndex={-1} className="pds-title-xl">What stayed with you?</h1>
            <p>There’s no test here. Just a chance to revisit a thought.</p>
          </div>
          <div className="proto-menu-tabs pds-kids-review-tabs" role="tablist" aria-label="Revisit your note" onKeyDown={event => {
            const next = event.key === 'ArrowRight' || event.key === 'End' ? true : event.key === 'ArrowLeft' || event.key === 'Home' ? false : null;
            if (next === null) return;
            event.preventDefault(); setRevealed(next);
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next ? 1 : 0]?.focus();
          }}>
            <button id="kids-think-tab" className="proto-menu-tab" role="tab" aria-selected={!revealed} aria-controls="kids-review-panel" tabIndex={!revealed ? 0 : -1} onClick={() => setRevealed(false)}><Icon name="rotate-left" size={12} /> Think back</button>
            <button id="kids-look-tab" className="proto-menu-tab" role="tab" aria-selected={revealed} aria-controls="kids-review-panel" tabIndex={revealed ? 0 : -1} onClick={() => setRevealed(true)}><Icon name="book-open" size={12} /> Take a look</button>
          </div>
          <section id="kids-review-panel" className="pds-kids-review__card" role="tabpanel" aria-labelledby={revealed ? 'kids-look-tab' : 'kids-think-tab'}><span className="pds-kids-preview__label">From your notebook · {reviewNote.date}</span><h2 className="pds-title">{reviewNote.title}</h2>
            {revealed ? <blockquote className="pds-kids-review__note">{reviewNote.content}</blockquote> : <p>Close your eyes for a moment if you like. What do you remember about this note?</p>}
          </section>
          <div className="pds-kids-review__actions">
            {!revealed ? <button className="proto-settings-btn" onClick={() => setRevealed(true)}><Icon name="book-open" size={14} /> Show my note</button>
              : <button className="proto-settings-btn" onClick={() => openNote(reviewNote)}><Icon name="pen" size={13} /> Add a thought</button>}
            <button className="proto-settings-btn proto-settings-btn--secondary" onClick={() => setView('home')}><Icon name="arrow-left" size={12} /> Back to my notebook</button>
          </div>
          <p className="pds-caption">A little is enough. Come back whenever you like.</p>
        </div>}

        {view === 'reading' && selectedResource && <div className="pds-kids-preview__body pds-kids-preview__reading-page">
          <span className="pds-kids-preview__label">{selectedResource.source} · Shared in Family Space</span>
          <h1 ref={headingRef} tabIndex={-1} className="pds-title-xl">{selectedResource.title}</h1>
          <p className="pds-family-note">{selectedResource.question}</p>
          <button className="pds-kids-preview__compose" onClick={() => openNote()}><Icon name="pen-to-square" size={17} /><span className="pds-kids-preview__compose-copy"><strong>Keep a thought</strong><span>Write in your own notebook</span></span><Icon name="arrow-right" size={12} /></button>
        </div>}
        </div>

        {showComposePrompt && <div className="pds-feed-prompt-dock pds-feed-prompt-dock--sheet" role="region" aria-label="Writing ideas">
            <div className="pds-feed-prompt-field">
              <button className="proto-feed-compose" aria-label={idea.note ? `Continue note: ${idea.note.title}` : 'Write a note with this idea'} onClick={() => openNote(idea.note, idea.text)}>
                <Icon name="pen-to-square" size={17} />
                <span key={ideaIndex} className="proto-feed-compose__label" aria-hidden="true"><TypedLine text={idea.text} animate={!reducedMotion && ideaIndex > 0} caret={false} /></span>
              </button>
              <button className="proto-glass-surface proto-glass-surface--control proto-glass-action pds-feed-prompt-shuffle pds-kids-prompt__shuffle" aria-label="Try another writing idea" title="Try another writing idea" onClick={() => { playCue('nav.select'); setIdeaIndex(current => current + 1); }}>
                <span key={ideaIndex} className="pds-kids-prompt__shuffle-icon"><Icon name="shuffle" size={16} /></span>
              </button>
            </div>
            <span className="pds-kids-preview__sr" role="status">{idea.text}</span>
        </div>}
      </article>
      </div>
      {preview && <p className="pds-kids-preview__demo">Design preview · Sample content · Edits reset on refresh</p>}
      <span className="pds-kids-preview__sr" role="status">{announcement}</span>
    </div></div>}

    {searchOpen && (renderSearch ? renderSearch({
      onClose: () => setSearchOpen(false),
      onOpenNote: async note => { if (draft && !await finish()) return false; openNote(note); return true; },
      onOpenBible: async id => {
        if (draft && !await finish()) return false;
        await onFamilyReading?.(id); openFamilyReading(); return true;
      },
      onOpenResource: async id => {
        if (draft && !await finish()) return false;
        const resource = resources.find(item => item.id === id);
        return resource ? openResource(resource) : false;
      }
    }) : <ChildNotebookSearch items={searchItems} onClose={() => setSearchOpen(false)} />)}
    {view === 'note' && attachmentPicker && renderAttachment?.({
      ...attachmentPicker,
      resource: resources[0], resources,
      onClose: () => setAttachmentPicker(null),
      onAdd: attachment => {
        setDraft(current => {
          if (!current || current.attachments?.some(item => attachmentKey(item) === attachmentKey(attachment))) return current;
          return { ...current, attachments: [...(current.attachments ?? []), attachment] };
        });
        setAttachmentPicker(null);
      }
    })}

    {createPortal(<dialog ref={settingsDialogRef} className="proto-settings-modal pds-kids-settings-modal proto-theme" data-sheet={narrowSettings ? (sheetPaneOpen ? 'pane' : 'list') : undefined} data-reduce-motion={reducedMotion ? 'true' : undefined} aria-labelledby="kids-settings-title" style={themeStyle} onCancel={event => { event.preventDefault(); void closeSettings(); }} onClose={() => setCustomizing(false)}>
      <header className="proto-settings-modal__header">
        {narrowSettings && <span className="pds-kids-sheet__header-left">{sheetPaneOpen && <button type="button" className="proto-toolbar-icon-btn" aria-label="Back to settings" onClick={() => { playCue('nav.back'); setSheetPaneOpen(false); }}><Icon name="caret-left" size={20} /></button>}</span>}
        <h2 id="kids-settings-title" className="proto-settings-modal__title">{narrowSettings && sheetPaneOpen ? settingsPanes.find(pane => pane.id === studioPage)?.title : 'Settings'}</h2>
        <button className="proto-toolbar-icon-btn proto-settings-modal__close" aria-label="Close settings" disabled={saving} onClick={() => void closeSettings()}>{saving ? <ProtoLoadingDots /> : <Icon name="xmark" size={18} />}</button>
      </header>
      {customizing && saveError && <p className="pds-caption pds-kids-status" role="alert">{saveError}</p>}
      <div className="proto-settings-modal__body"><div className="proto-settings">
        <nav className="proto-settings__nav" aria-label="Settings categories"><div className="proto-settings__nav-list">
          {settingsPanes.map(pane => <button key={pane.id} className="proto-settings__nav-item" data-active={studioPage === pane.id ? 'true' : 'false'} aria-current={studioPage === pane.id ? 'page' : undefined} onClick={() => { if (studioPage !== pane.id || narrowSettings) playCue('nav.select'); setStudioPage(pane.id); if (narrowSettings) setSheetPaneOpen(true); }}><span className="proto-settings__nav-icon" aria-hidden="true"><Icon name={pane.icon} size={15} /></span><span className="proto-settings__nav-title">{pane.title}</span>{narrowSettings && <Icon name="caret-right" size={12} className="pds-kids-sheet__chevron" aria-hidden />}</button>)}
        </div>
        <ChildPrivacyFootnote url={privacyUrl}>Your choices are saved to your notebook.</ChildPrivacyFootnote></nav>
        <div className="proto-settings__detail"><section id="notebook-customize" ref={settingsPaneRef} tabIndex={-1} aria-label={settingsPanes.find(pane => pane.id === studioPage)?.title} className="pds-kids-settings-pane" data-studio-page={studioPage}>
          {studioPage === 'settings' ? <div className="pds-kids-inside-settings pds-kids-notebook-settings" data-pattern={coverPattern}>
            <ChildNotebookCoverStudio />
            <div className="proto-settings__content"><SettingsGroup>
              <SettingsRow label="Who can see my notebook?" leadingIcon="user-shield" onClick={() => setPrivacy(true)} />
              <SettingsRow label="Export my notebook" sublabel="Ask a parent to download a copy" leadingIcon="download" onClick={() => { setParentError(''); playCue('nav.open'); setParentGate('export'); }} />
            </SettingsGroup></div>
          </div> : studioPage === 'appearance' ? <div className="pds-kids-inside-settings">
            <section className="pds-kids-appearance-settings" aria-label="Notebook appearance">
              <fieldset><legend>Appearance</legend><div className="proto-appearance-segmented" role="group" aria-label="Color scheme">{(['system', 'light', 'dark'] as const).map(mode => <button key={mode} className="proto-appearance-segmented__btn" data-active={appearance.scheme === mode ? 'true' : undefined} aria-pressed={appearance.scheme === mode} onClick={() => setAppearance(current => ({ ...current, scheme: mode }))}>{mode === 'system' ? 'Auto' : mode === 'light' ? 'Light' : 'Dark'}</button>)}</div></fieldset>
              <fieldset><legend>Background imagery</legend>
                <div className="proto-appearance-carousel" role="listbox" aria-label={`${resolvedScheme} notebook background`}>
                  <AppearancePreviewTile label="App background" selected={!activeCanvas.startsWith('image:')} canvasColor="var(--pds-canvas-default)" onClick={() => pickCanvas('device')} />
                  {childImageChoices.filter(choice => choice.mode === resolvedScheme).map(choice => <AppearancePreviewTile key={choice.id} label={choice.label} selected={activeCanvas === `image:${choice.id}`} canvasImageUrl={childImageUrl(choice)} glassMode="image" onClick={() => pickCanvas(`image:${choice.id}`)} />)}
                </div>
              </fieldset>
              <fieldset><legend>Reading & writing text</legend><div className="proto-menu-tabs pds-kids-text-choices" role="group" aria-label="Reading text size">{(['standard', 'bigger'] as const).map(size => <button key={size} className="proto-menu-tab" aria-pressed={appearance.textSize === size} data-active={appearance.textSize === size ? 'true' : undefined} onClick={() => setAppearance(current => ({ ...current, textSize: size }))}><span aria-hidden="true" className="pds-kids-type-sample" data-size={size}>Aa</span>{size === 'standard' ? 'Just right' : 'A little bigger'}</button>)}</div></fieldset>
              <p className="pds-caption">These settings are just for your notebook.</p>
            </section>
            <div className="pds-kids-studio__finish"><button className="proto-settings-btn" disabled={saving} onClick={() => void closeSettings()}>{saving ? <ProtoLoadingDots /> : <Icon name="check" size={12} />} Done</button></div>
          </div> : <div className="pds-kids-inside-settings pds-kids-feedback-settings">
            <section className="proto-inspector-section">
              <h3 className="pds-list-title">Sound effects</h3>
              <div className="proto-appearance-segmented" role="group" aria-label="Sound effects">
                {SOUND_PREFERENCES.map(option => (
                  <button key={option.id} type="button" className="proto-appearance-segmented__btn" aria-pressed={soundPreference === option.id} data-active={soundPreference === option.id ? 'true' : undefined} onClick={() => {
                    setSoundPreference(option.id);
                    if (option.id !== 'off') warmSounds({ force: true });
                    if (option.id === 'everywhere') playSound('nav.select', { preference: option.id });
                  }}>{option.label}</button>
                ))}
              </div>
              <p className="pds-caption">{SOUND_PREFERENCES.find(option => option.id === soundPreference)?.description}</p>
              <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => playSound('organize.filed', { force: true, preference: soundPreference })}><Icon name="volume-low" size={14} /> Hear a sound</button>
            </section>
            <section className="proto-inspector-section">
              <label className="pds-kids-motion-choice"><span><strong>Reduce motion</strong><span>Less wiggle when you move around.</span></span><input type="checkbox" checked={appearance.reduceMotion} onChange={event => {
                playCue('nav.toggle');
                setAppearance(current => ({ ...current, reduceMotion: event.target.checked }));
              }} /></label>
            </section>
          </div>}
        </section></div>
      </div></div>
    </dialog>, document.body)}

    {createPortal(<dialog ref={parentDialogRef} className="pds-kids-privacy-modal proto-theme pds-kids-parent-gate" aria-labelledby="parent-gate-title" aria-describedby="parent-gate-description" style={themeStyle} onCancel={event => { if (parentBusy) event.preventDefault(); else setParentGate(false); }} onClose={() => { if (!parentBusy) { setParentGate(false); document.getElementById('child-notebook-mode-trigger')?.focus(); } }}>
      <span className="pds-kids-review__art" aria-hidden="true"><Icon name="lock" size={22} /></span>
      <h2 id="parent-gate-title" className="pds-title-xl">{parentGate === 'export' ? 'Export my notebook' : 'A parent’s turn.'}</h2>
      <p id="parent-gate-description">{parentGate === 'export' ? 'Ask your parent to sign in and download a copy from My Family.' : 'Ask your parent to sign in to leave child mode.'}</p>
      {preview && <p className="pds-caption pds-kids-parent-gate__notice">Preview changes reset when you leave.</p>}
      {parentError && <p role="alert">{parentError}</p>}
      <div className="pds-kids-review__actions"><button className="proto-settings-btn" disabled={parentBusy} onClick={() => void goToParentSignIn()}>{parentBusy ? <ProtoLoadingDots /> : <Icon name="lock" size={12} />} Parent sign-in</button><button className="proto-settings-btn proto-settings-btn--secondary" disabled={parentBusy} onClick={() => setParentGate(false)}><Icon name="arrow-left" size={12} /> Stay here</button></div>
    </dialog>, document.body)}
    {createPortal(<dialog ref={privacyDialogRef} className="pds-kids-privacy-modal proto-theme" aria-labelledby="kids-privacy-title" aria-describedby="kids-privacy-description" style={themeStyle} onCancel={() => setPrivacy(false)} onClose={() => { setPrivacy(false); document.getElementById('child-notebook-mode-trigger')?.focus(); }}>
      <div className="pds-kids-privacy-modal__heading"><span className="pds-kids-review__art" aria-hidden="true"><Icon name="user-shield" size={25} /></span><button className="pds-kids-preview__quiet" aria-label="Close privacy guide" onClick={() => setPrivacy(false)}><Icon name="xmark" size={17} /></button></div>
      <h2 id="kids-privacy-title" className="pds-title-xl">Your notebook circle</h2><p id="kids-privacy-description" className="pds-caption">See who can read what you write.</p>
      <div id="notebook-circle" className="pds-kids-circle">
              <div className="pds-kids-circle__people">
                <div className="pds-kids-circle__group" data-access="yes">
                  <div className="pds-kids-circle__portraits" aria-hidden="true">
                    <span><ChildNotebookAvatar /></span>
                    {initial && <span><Icon name="user-shield" size={17} /></span>}
                    {!initial && picturedGuardians.map(guardian => <span key={guardian.id}>{guardian.name.charAt(0)}</span>)}
                    {!initial && additionalGuardians > 0 && <span className="pds-kids-circle__more">+{additionalGuardians}</span>}
                  </div>
                  <strong>{initial ? `${name} and your parent` : circleNames}</strong>
                  <span className="pds-kids-circle__access"><Icon name="check" size={12} /> Can read your notes</span>
                </div>
                <div className="pds-kids-circle__group" data-access="no">
                  <div className="pds-kids-circle__portraits" aria-hidden="true"><span><Icon name="person" size={21} /></span><span><Icon name="church" size={20} /></span><i><Icon name="lock" size={11} /></i></div>
                  <strong>Everyone else</strong>
                  <span className="pds-kids-circle__access"><Icon name="lock" size={11} /> Can’t read your notes</span>
                </div>
              </div>
              <div className="pds-kids-circle__tip"><span aria-hidden="true"><Icon name="book-open" size={18} /></span><div><strong>Reading, chosen together</strong><span>A parent or guardian picks the ministry reading you see.</span></div></div>
              <div className="pds-kids-circle__tip"><span aria-hidden="true"><Icon name="lock" size={17} /></span><div><strong>Keep personal details off the page</strong><span>No addresses, phone numbers, or other people’s private details.</span></div></div>
            </div>
      <ChildPrivacyFootnote url={privacyUrl}>For grown-ups, the full details are in our</ChildPrivacyFootnote>
      <button className="proto-settings-btn" onClick={() => setPrivacy(false)}><Icon name="check" size={12} /> Got it</button>
    </dialog>, document.body)}
  </PrototypeMainPaneShell>;
}
