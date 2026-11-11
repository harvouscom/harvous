import { useState } from 'react';
import Icon from '@/components/react/Icon';
import { useChildNotebookAppearance } from './ChildNotebookAppearance';
import PrototypeSectionHeader from './design-system/PrototypeSectionHeader';
import ProtoSelectMenu from './ProtoSelectMenu';

export type ChildNoteOrganization = {
  primaryCollection?: string;
  tagIds?: string[];
  threadIds?: string[];
};

export type ChildNotebookCatalog = {
  folders: string[];
  tags: { id: string; name: string }[];
  threads: { id: string; title: string }[];
};

export type OrganizationKind = 'folder' | 'tag' | 'Thread';

export function ChildNoteInfo({ note, catalog, onChange, onCreate, onClose }: {
  note: ChildNoteOrganization & { content: string; reference?: string; translation?: string };
  catalog: ChildNotebookCatalog;
  onChange: (changes: ChildNoteOrganization) => void;
  onCreate: (kind: OrganizationKind, name: string) => void;
  onClose: () => void;
}) {
  const { themeStyle, soundPreference } = useChildNotebookAppearance();
  const [creating, setCreating] = useState<OrganizationKind | null>(null);
  const [name, setName] = useState('');
  const wordCount = note.content.trim().split(/\s+/).filter(Boolean).length;
  const selectedTags = catalog.tags.filter(tag => note.tagIds?.includes(tag.id));
  const selectedThreads = catalog.threads.filter(thread => note.threadIds?.includes(thread.id));

  function createControl(kind: OrganizationKind) {
    if (creating !== kind) {
      return <button type="button" className="proto-settings-btn proto-settings-btn--secondary pds-kids-info__new" onClick={() => { setName(''); setCreating(kind); }}>
        <Icon name="plus" size={11} /> New {kind}
      </button>;
    }
    return (
      <form className="pds-kids-info__create" onSubmit={event => {
        event.preventDefault();
        if (!name.trim()) return;
        onCreate(kind, name.trim());
        setCreating(null);
      }}>
        <input className="proto-settings-field__input" aria-label={`New ${kind} name`} placeholder={`${kind} name`} value={name} maxLength={48} autoFocus onChange={event => setName(event.target.value)} />
        <button type="submit" className="proto-toolbar-icon-btn" aria-label={`Create ${kind}`} disabled={!name.trim()}><Icon name="check" size={14} /></button>
        <button type="button" className="proto-toolbar-icon-btn" aria-label={`Cancel new ${kind}`} onClick={() => setCreating(null)}><Icon name="xmark" size={14} /></button>
      </form>
    );
  }

  return (
    <aside className="proto-inspector pds-kids-info" id="child-note-info" aria-labelledby="child-note-info-title">
      <header className="pds-kids-info__header">
        <h2 id="child-note-info-title" className="pds-title">Note info</h2>
        <button type="button" className="proto-toolbar-icon-btn" aria-label="Close note info" onClick={onClose}><Icon name="xmark" size={15} /></button>
      </header>
      <section className="proto-inspector-section">
        <PrototypeSectionHeader>Info</PrototypeSectionHeader>
        <div className="pds-kids-info__detail pds-caption"><span>Words</span><span>{wordCount}</span></div>
        {note.reference && <div className="pds-kids-info__detail pds-caption"><span>Passage</span><span>{[note.reference, note.translation].filter(Boolean).join(' · ')}</span></div>}
      </section>
      <section className="proto-inspector-section">
        <PrototypeSectionHeader>Folder</PrototypeSectionHeader>
        <ProtoSelectMenu label="Folder" value={note.primaryCollection ?? ''} options={[{ value: '', label: 'No folder' }, ...catalog.folders.map(folder => ({ value: folder, label: folder }))]} menuStyle={themeStyle} soundPreference={soundPreference} onChange={folder => onChange({ primaryCollection: folder || undefined })} />
        {createControl('folder')}
      </section>
      <section className="proto-inspector-section">
        <PrototypeSectionHeader>Tags</PrototypeSectionHeader>
        <ProtoSelectMenu multiple label="Tags" value={note.tagIds ?? []} options={catalog.tags.map(tag => ({ value: tag.id, label: tag.name }))} emptyLabel="No tags" countLabel={count => `${count} tags`} menuStyle={themeStyle} soundPreference={soundPreference} onChange={tagIds => onChange({ tagIds })} />
        {selectedTags.length > 1 && <p className="pds-kids-info__selection pds-caption">{selectedTags.map(tag => tag.name).join(' · ')}</p>}
        {createControl('tag')}
      </section>
      <section className="proto-inspector-section">
        <PrototypeSectionHeader>Threads</PrototypeSectionHeader>
        <ProtoSelectMenu multiple label="Threads" value={note.threadIds ?? []} options={catalog.threads.map(thread => ({ value: thread.id, label: thread.title }))} emptyLabel="No Threads" countLabel={count => `${count} Threads`} menuStyle={themeStyle} soundPreference={soundPreference} onChange={threadIds => onChange({ threadIds })} />
        {selectedThreads.length > 1 && <p className="pds-kids-info__selection pds-caption">{selectedThreads.map(thread => thread.title).join(' · ')}</p>}
        {createControl('Thread')}
      </section>
    </aside>
  );
}
