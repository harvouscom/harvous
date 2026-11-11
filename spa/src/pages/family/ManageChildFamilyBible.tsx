import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import ProtoSpaceLoading from '../prototype/ProtoSpaceLoading';
import Icon from '@/components/react/Icon';
import { getTranslation } from '@/data/translations';
import ProtoConfirmDialog from '../prototype/ProtoConfirmDialog';
import ProtoSelectMenu from '../prototype/ProtoSelectMenu';
import { SettingsGroup, SettingsIntro, SettingsRow, SettingsSubScreen, SettingsToggleRow } from '../prototype/settings/SettingsShell';
import { api } from '../../lib/api';
import { childBibleTranslationChoices, type ChildFamilyChapter, type ChildFamilyReading, type ChildFamilyThought, type ChildPassage } from '../../../../shared/child-notebook';
import type { ChildDetail } from './types';
import ChildBiblePassagePicker from './ChildBiblePassagePicker';
import { ChildFamilyThoughtForm, ChildFamilyThoughts } from './ChildFamilyThoughts';

type Props = {
  detail: ChildDetail;
  backLabel: string;
  onBack: () => void;
  feedback: ReactNode;
  busy: boolean;
  perform: (work: () => Promise<unknown>, message: string) => Promise<void>;
};

export default function ManageChildFamilyBible({ detail, backLabel, onBack, feedback, busy, perform }: Props) {
  const { child, readings } = detail;
  const base = `/api/child-accounts/children/${encodeURIComponent(child.id)}/bible`;
  const translations = child.bibleTranslations;
  const translationChoices = childBibleTranslationChoices(translations, readings);
  const [passage, setPassage] = useState<ChildPassage>({ book: 'Psalms', chapter: 23, translation: translations[0] });
  const [opened, setOpened] = useState<ChildFamilyChapter | null>(null);
  const [verse, setVerse] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [translationsOpen, setTranslationsOpen] = useState(false);
  const [removeAnchor, setRemoveAnchor] = useState<DOMRect | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const openChapter = opened && readings.some(reading => reading.id === opened.id) ? opened : null;
  const openChapterId = openChapter?.id;
  useLayoutEffect(() => {
    screenRef.current?.closest('.proto-settings__detail, .proto-settings-sheet__body')?.scrollTo({ top: 0 });
  }, [openChapterId]);

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
  if (openChapter) {
    const { id, book, chapter, translation, verses, thoughts } = openChapter;
    const verseThoughts = thoughts.filter(thought => thought.verse === verse);
    const reference = `${book === 'Psalms' ? 'Psalm' : book} ${chapter}`;
    return <SettingsSubScreen title={reference} backLabel="Back to Family Bible" onBack={() => setOpened(null)}>
      <div className="proto-settings__content" ref={screenRef}>
        {feedback}
        <section className="pds-family-reading" aria-label="Shared chapter">
          <div className="pds-family-reading__passage">
            <div className="pds-family-reading__toolbar">
              <ProtoSelectMenu label="Verse" value={verse} onChange={setVerse} disabled={busy} filterPlaceholder="Find a verse"
                options={verses.map(item => ({ value: item.verse, label: `Verse ${item.verse}` }))} />
              <span className="scripture-pill-chrome__trans-chip" title={getTranslation(translation)?.name}>{translation}</span>
            </div>
            <blockquote className="pds-body">{verses.find(item => item.verse === verse)?.text}</blockquote>
          </div>
          <section className="pds-family-reading__discussion" aria-labelledby="family-reading-thoughts">
            <h2 id="family-reading-thoughts" className="pds-list-title">Family thoughts</h2>
            {verseThoughts.length > 0
              ? <ChildFamilyThoughts thoughts={verseThoughts} childName={child.displayName} preferences={child.notebookPreferences} />
              : <p className="pds-caption pds-family-reading__empty">No thoughts on this verse yet.</p>}
            {active && translations.includes(translation) && <ChildFamilyThoughtForm key={`${id}:${verse}`} disabled={busy} onSave={async text => {
              let saved = false;
              await perform(async () => {
                const { thought } = await api.post<{ thought: ChildFamilyThought }>(`${base}/readings/${id}/thoughts`, { verse, text });
                setOpened(current => current?.id === id ? { ...current, thoughts: [...current.thoughts, thought] } : current);
                saved = true;
              }, '');
              return saved;
            }} />}
          </section>
          <footer className="pds-family-reading__footer">
            <button type="button" className="proto-settings-btn proto-settings-btn--secondary" disabled={busy}
              onClick={e => setRemoveAnchor(e.currentTarget.getBoundingClientRect())}>
              <Icon name="trash-can" size={13} aria-hidden /> Remove shared reading
            </button>
          </footer>
          {removeAnchor && <ProtoConfirmDialog anchorRect={removeAnchor} title="Remove shared reading?"
            description="This removes the chapter from Family Bible and deletes the thoughts on it."
            confirmLabel="Remove reading" onCancel={() => setRemoveAnchor(null)} onConfirm={() => {
              setRemoveAnchor(null);
              void perform(async () => { await api.delete(`${base}/readings/${id}`); setOpened(null); }, 'Reading removed.');
            }} />}
        </section>
      </div>
    </SettingsSubScreen>;
  }

  return <SettingsSubScreen title="Family Bible" backLabel={backLabel} onBack={onBack}>
    <div className="proto-settings__content" role="region" aria-label="Family Bible settings" ref={screenRef}>
      {feedback}
      <SettingsIntro>Share chapters and verse thoughts with {child.displayName}.</SettingsIntro>
      {loading && <ProtoSpaceLoading label="Opening the shared chapter" />}
      {error && <p className="pds-caption pds-family-management__error" role="alert">{error}</p>}
      <SettingsGroup>
        <SettingsRow label="Approved translations" leadingIcon="book-open" expanded={translationsOpen}
          sublabel={translations.map(translation => getTranslation(translation)?.name ?? translation).join(', ')}
          onClick={() => setTranslationsOpen(!translationsOpen)} />
        {translationsOpen && translationChoices.map(translation => (
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
    </div>
  </SettingsSubScreen>;
}
