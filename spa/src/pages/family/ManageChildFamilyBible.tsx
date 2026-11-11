import { useState } from 'react';
import { getTranslation } from '@/data/translations';
import ProtoConfirmDialog from '../prototype/ProtoConfirmDialog';
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
  return <section className="pds-family-stack" aria-label="Family Bible">
    <h3 className="pds-list-title">Family Bible</h3>
    <p className="pds-caption">Pick translations and share chapters with {child.displayName}. Family thoughts here are visible to the two of you.</p>
    {error && <p role="alert">{error}</p>}
    <fieldset className="pds-family-bible-choices" disabled={disabled || !active}>
      <legend>Approved translations</legend>
      {childBibleTranslations.map(translation => <label className="pds-family-choice" key={translation}>
        <input type="checkbox" checked={translations.includes(translation)}
          disabled={translations.length === 1 && translations.includes(translation)}
          onChange={e => {
            const approved = e.target.checked ? [...translations, translation] : translations.filter(item => item !== translation);
            void perform(() => api.put(`${base}/translations`, { translations: approved }), 'Approved translations updated.');
          }} />{getTranslation(translation)?.name ?? translation}
      </label>)}
    </fieldset>
    {active && <form className="pds-family-stack" onSubmit={e => {
      e.preventDefault();
      void perform(() => api.post(`${base}/readings`, selectedPassage), 'Chapter shared in Family Bible.');
    }}>
      <ChildBiblePassagePicker value={selectedPassage} translations={translations} onChange={setPassage} />
      <button type="submit" className="proto-settings-btn" disabled={disabled}>Share chapter</button>
    </form>}
    {readings.map(reading => <button type="button" key={reading.id} className="proto-settings-btn proto-settings-btn--secondary"
      disabled={disabled} aria-pressed={opened?.id === reading.id} onClick={() => void openReading(reading)}>
      {reading.book} {reading.chapter} · {reading.translation}
    </button>)}
    {opened && readings.some(reading => reading.id === opened.id) && <div className="pds-family-notice pds-family-stack">
      <label className="pds-family-bible-picker__single">Verse in {opened.book} {opened.chapter}
        <select value={verse} onChange={e => setVerse(Number(e.target.value))}>
          {opened.verses.map(item => <option key={item.verse}>{item.verse}</option>)}
        </select>
      </label>
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
