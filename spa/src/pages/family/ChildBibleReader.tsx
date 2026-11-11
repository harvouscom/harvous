import { useEffect, useState } from 'react';
import { getTranslation } from '@/data/translations';
import Icon from '@/components/react/Icon';
import type { ChildBibleChapter, ChildBibleTranslation, ChildFamilyChapter, ChildFamilyReading, ChildFamilyThought, ChildPassage } from '../../../../shared/child-notebook';
import ChildBiblePassagePicker from './ChildBiblePassagePicker';
import { ChildFamilyThoughtForm, ChildFamilyThoughts } from './ChildFamilyThoughts';

export type ChildRequest = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
export type ReaderLocation = { mode: 'personal' } | { mode: 'family'; readingId?: string };

export default function ChildBibleReader({ location, onNavigate, translations, readings, name, request, revision }: {
  location: ReaderLocation; onNavigate: (location: ReaderLocation) => void;
  translations: ChildBibleTranslation[]; readings: ChildFamilyReading[]; name: string; request: ChildRequest; revision: number;
}) {
  const [passage, setPassage] = useState<ChildPassage>({ book: 'Psalms', chapter: 23, translation: translations[0] });
  const [loaded, setLoaded] = useState<{ key: string; chapter: ChildBibleChapter & { thoughts?: ChildFamilyThought[] } } | null>(null);
  const [pending, setPending] = useState(true);
  const [verse, setVerse] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const family = location.mode === 'family';
  const reading = family ? readings.find(item => item.id === location.readingId) ?? readings[0] : null;
  const translation = translations.includes(passage.translation) ? passage.translation : translations[0];
  const selectedPassage = { ...passage, translation };
  const book = reading?.book ?? passage.book;
  const chapterNumber = reading?.chapter ?? passage.chapter;
  const readingId = reading?.id;
  const chapterKey = family ? `family:${readingId ?? ''}:${revision}` : `${passage.book}:${passage.chapter}:${translation}:${revision}`;
  const chapter = loaded?.key === chapterKey ? loaded.chapter : null;
  useEffect(() => {
    let current = true;
    setVerse(null); setError('');
    if (family && !readingId) { setPending(false); return; }
    setPending(true);
    const result = family
      ? request<ChildFamilyChapter>(`bible/readings/${encodeURIComponent(readingId!)}`)
      : request<ChildBibleChapter>('bible/chapter', 'POST', { book: passage.book, chapter: passage.chapter, translation });
    void result.then(data => { if (current) setLoaded({ key: chapterKey, chapter: data }); })
      .catch(e => { if (current) setError(e instanceof Error ? e.message : 'Could not open the Bible.'); })
      .finally(() => { if (current) setPending(false); });
    return () => { current = false; };
  }, [family, readingId, passage.book, passage.chapter, translation, request, chapterKey]);
  return <section className="pds-family-stack pds-child-bible" aria-label="Bible reader">
    <div className="pds-child-segmented" role="group" aria-label="Bible">
      <button type="button" className="pds-child-button" disabled={posting} aria-pressed={!family} onClick={() => onNavigate({ mode: 'personal' })}>
        <Icon name="book-open" size={15} /> My Bible
      </button>
      <button type="button" className="pds-child-button" disabled={posting} aria-pressed={family} onClick={() => onNavigate({ mode: 'family' })}>
        <Icon name="user-group" size={15} /> Family Bible
      </button>
    </div>
    {family ? reading && <label className="pds-family-bible-picker__single">Read together
      <select value={reading.id} disabled={posting} onChange={e => onNavigate({ mode: 'family', readingId: e.target.value })}>
        {readings.map(item => <option value={item.id} key={item.id}>{item.book} {item.chapter} · {item.translation}</option>)}
      </select>
    </label> : <ChildBiblePassagePicker value={selectedPassage} translations={translations} onChange={setPassage} />}
    {error && <p role="alert">{error}</p>}
    {pending && <p role="status">Opening the Bible…</p>}
    {family && !reading && !pending && <p>Chapters your parent shares will show up here.</p>}
    {chapter && <article className="pds-family-stack pds-child-bible__page">
      <header><h2 className="pds-title-xl">{book} {chapterNumber}</h2><span className="pds-caption">{reading?.translation ?? translation}</span></header>
      {chapter.verses.map(item => <div key={item.verse} className="pds-child-bible__verse">
        <p className="pds-reader-text"><sup className="pds-reader-verse-num">{item.verse}</sup> {item.text}</p>
        {reading && <>
          <ChildFamilyThoughts thoughts={(chapter.thoughts ?? []).filter(thought => thought.verse === item.verse)} childName={name} />
          <button className="pds-child-button pds-child-bible__reply" type="button" aria-label={`Add a thought on verse ${item.verse}`}
            disabled={posting} aria-expanded={verse === item.verse} onClick={() => setVerse(verse === item.verse ? null : item.verse)}>
            <Icon name="pen-to-square" size={14} /> {verse === item.verse ? 'Close' : 'Add a thought'}
          </button>
          {verse === item.verse && <ChildFamilyThoughtForm key={`${reading.id}:${verse}`} disabled={posting} onSave={async text => {
            setPosting(true); setError('');
            try {
              const { thought } = await request<{ thought: ChildFamilyThought }>(`bible/readings/${reading.id}/thoughts`, 'POST', { verse, text });
              setLoaded({ key: chapterKey, chapter: { ...chapter, thoughts: [...(chapter.thoughts ?? []), thought] } }); setVerse(null);
              return true;
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not save your thought.'); return false;
            } finally { setPosting(false); }
          }} />}
        </>}
      </div>)}
      <p className="pds-caption">{getTranslation(reading?.translation ?? translation)?.copyright}</p>
    </article>}
  </section>;
}
