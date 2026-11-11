import { useState } from 'react';
import ProtoSpaceLoading from '../prototype/ProtoSpaceLoading';
import Icon from '@/components/react/Icon';
import { getTranslation } from '@/data/translations';
import ProtoConfirmDialog from '../prototype/ProtoConfirmDialog';
import ProtoSelectMenu from '../prototype/ProtoSelectMenu';
import { SettingsGroup, SettingsIntro, SettingsRow, SettingsToggleRow } from '../prototype/settings/SettingsShell';
import { api } from '../../lib/api';
import { childBibleTranslations, type ChildFamilyChapter, type ChildFamilyReading, type ChildFamilyThought, type ChildPassage } from '../../../../shared/child-notebook';
import type { ChildDetail } from './types';
import ChildBiblePassagePicker from './ChildBiblePassagePicker';
import { ChildFamilyThoughtForm, ChildFamilyThoughts } from './ChildFamilyThoughts';

type Props = {
  detail: ChildDetail;
  busy: boolean;
  perform: (work: () => Promise<unknown>, message: string) => Promise<void>;
};

export default function ManageChildFamilyBible({ detail, busy, perform }: Props) {
  const { child, readings } = detail;
  const base = `/api/child-accounts/children/${encodeURIComponent(child.id)}/bible`;
  const translations = child.bibleTranslations;
  const [passage, setPassage] = useState<ChildPassage>({ book: 'Psalms', chapter: 23, translation: translations[0] });
  const [opened, setOpened] = useState<ChildFamilyChapter | null>(null);
  const [verse, setVerse] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [translationsOpen, setTranslationsOpen] = useState(false);
  const [removeAnchor, setRemoveAnchor] = useState<DOMRect | null>(null);
  const active = child.status === 'active';
  const selectedPassage = translations.includes(passage.translation) ? passage : { ...passage, translation: translations[0] };
  const disabled = busy || loading;
  async function openReading(reading: ChildFamilyReading) {
    setLoading(true); setError('');
    try {
      const data = await api.get<ChildFamilyChapter>(`${base}/readings/${reading.id}`);
      setOpened(data);
      setVerse(data.verses[0].verse);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open the reading.'); }
    finally { setLoading(false); }
  }
  return <section aria-label="Family Bible settings">
    <SettingsIntro>Share chapters and verse thoughts with {child.displayName}.</SettingsIntro>
    {loading && <ProtoSpaceLoading label="Opening the shared chapter" />}
    {error && <p className="pds-caption pds-family-management__error" role="alert">{error}</p>}
    <SettingsGroup>
      <SettingsRow label="Approved translations" leadingIcon="book-open" expanded={translationsOpen}
        sublabel={translations.map(translation => getTranslation(translation)?.name ?? translation).join(', ')}
        onClick={() => setTranslationsOpen(!translationsOpen)} />
      {translationsOpen && childBibleTranslations.map(translation => (
        <SettingsToggleRow key={translation} label={getTranslation(translation)?.name ?? translation}
          checked={translations.includes(translation)}
          disabled={disabled || !active || (translations.length === 1 && translations.includes(translation))}
          onChange={enabled => {
            const approved = enabled ? [...translations, translation] : translations.filter(item => item !== translation);
            void perform(() => api.put(`${base}/translations`, { translations: approved }), '');
          }} />
      ))}
    </SettingsGroup>
    {active && <SettingsGroup>
      <form className="pds-family-bible-share pds-family-stack" onSubmit={e => {
        e.preventDefault();
        void perform(() => api.post(`${base}/readings`, selectedPassage), 'Chapter shared in Family Bible.');
      }}>
        <h3 className="pds-list-title">Share a chapter</h3>
        <ChildBiblePassagePicker value={selectedPassage} translations={translations} onChange={setPassage} disabled={disabled} />
        <button type="submit" className="proto-settings-btn" disabled={disabled}><Icon name="book-open" size={14} aria-hidden /> Share chapter</button>
      </form>
    </SettingsGroup>}
    <div>
      <h3 className="pds-caption pds-family-enrollment-label">Shared chapters</h3>
      <SettingsGroup>
        {readings.length === 0 ? <SettingsRow label="No shared chapters yet" leadingIcon="book-open" trailing="none" /> : readings.map(reading => (
          <SettingsRow key={reading.id} label={`${reading.book} ${reading.chapter}`} sublabel={reading.translation}
            leadingIcon="book-open" disabled={disabled} onClick={() => void openReading(reading)} />
        ))}
      </SettingsGroup>
    </div>
    {opened && readings.some(reading => reading.id === opened.id) && <div className="pds-family-notice pds-family-stack">
      <div className="pds-family-bible-picker__single">
        <span className="pds-caption">Verse in {opened.book} {opened.chapter}</span>
        <ProtoSelectMenu label="Verse" value={verse} onChange={setVerse} disabled={disabled} filterPlaceholder="Find a verse"
          options={opened.verses.map(item => ({ value: item.verse, label: String(item.verse) }))} />
      </div>
      <p>{opened.verses.find(item => item.verse === verse)?.text}</p>
      <ChildFamilyThoughts thoughts={opened.thoughts.filter(thought => thought.verse === verse)} childName={child.displayName} />
      {active && translations.includes(opened.translation) && <ChildFamilyThoughtForm key={`${opened.id}:${verse}`} disabled={disabled} onSave={async text => {
        let saved = false;
        await perform(async () => {
          const { thought } = await api.post<{ thought: ChildFamilyThought }>(`${base}/readings/${opened.id}/thoughts`, { verse, text });
          setOpened({ ...opened, thoughts: [...opened.thoughts, thought] });
          saved = true;
        }, 'Family thought saved.');
        return saved;
      }} />}
      <button type="button" className="proto-settings-btn proto-settings-btn--secondary" disabled={disabled}
        onClick={e => setRemoveAnchor(e.currentTarget.getBoundingClientRect())}>Remove shared reading</button>
      {removeAnchor && <ProtoConfirmDialog anchorRect={removeAnchor} title="Remove shared reading?"
        description="This removes the chapter from Family Bible and deletes the thoughts on it."
        confirmLabel="Remove reading" onCancel={() => setRemoveAnchor(null)} onConfirm={() => {
          setRemoveAnchor(null);
          void perform(async () => { await api.delete(`${base}/readings/${opened.id}`); setOpened(null); }, 'Reading removed.');
        }} />}
    </div>}
  </section>;
}
