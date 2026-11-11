import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import Icon from '@/components/react/Icon';
import { getTranslation } from '@/data/translations';
import { canonGroupForBook } from '@/utils/admin-pulse-canon-groups';
import { bookChapterCount, orderedCanonBooks } from '@/utils/bible-book-chapters';
import { bookAbbreviation } from '@/utils/scripture-osis';
import { useChildNotebookAppearance } from './ChildNotebookAppearance';
import FamilyVerseDiscussion from '../family/FamilyVerseDiscussion';
import ProtoSelectMenu from './ProtoSelectMenu';
import type { ReactNode } from 'react';
import { legacyChildBibleTranslations, type ChildBibleTranslation, type ChildFamilyReading, type ChildFamilyThought } from '../../../../shared/child-notebook';

export type ChildBiblePassage = { book: string; chapter: number };
export type ChildBibleMode = 'personal' | 'family';

export const familyBibleBookmark = { book: 'Psalms', chapter: 23 };
const familyTranslation = 'BSB';
// Sample preferences for the preview. Real approvals belong to the parent account.
function translationOptions(translations: readonly ChildBibleTranslation[]) {
  return translations.map(id => ({ value: id, label: getTranslation(id)?.name ?? id, triggerLabel: id }));
}

export const approvedTranslations = translationOptions(legacyChildBibleTranslations);

type FamilyThought = {
  id: string;
  chapterKey: string;
  verse: number;
  role: ChildFamilyThought['role'];
  text: string;
};

const familyChapterKey = `${familyBibleBookmark.book}:${familyBibleBookmark.chapter}`;
const initialFamilyThoughts: FamilyThought[] = [{
  id: 'parent-question',
  chapterKey: familyChapterKey,
  verse: 1,
  role: 'parent',
  text: 'Which words would you like to remember?'
}];

const bookOptions = orderedCanonBooks().map(book => ({
  value: book,
  label: bookAbbreviation(book),
  triggerLabel: book,
  group: canonGroupForBook(book)?.testament === 'nt' ? 'New Testament' : 'Old Testament'
}));

export type ChildReaderProps = {
  active: boolean;
  mode: ChildBibleMode;
  passage: ChildBiblePassage;
  onModeChange: (mode: ChildBibleMode) => void;
  onNavigate: (book: string, chapter: number) => void;
  onStartNote: (reference: string, translation: string) => void;
};
type ChapterQuery = {
  data?: { verses: { number: number; text: string }[]; thoughts?: ChildFamilyThought[] };
  isLoading: boolean; isError: boolean; refetch: () => unknown;
};
type Props = ChildReaderProps & {
  privacyUrl?: string;
  useChapter: (book: string | undefined, chapter: number | undefined, translation: ChildBibleTranslation, readingId?: string) => ChapterQuery;
  renderEdge: (book: string, chapter: number, translation: ChildBibleTranslation, direction: 'behind' | 'ahead', onSelect: ChildReaderProps['onNavigate']) => ReactNode;
  live?: {
    translations: ChildBibleTranslation[];
    readings: ChildFamilyReading[];
    activeReading?: ChildFamilyReading;
    onReading: (id: string) => void;
    saveThought: (readingId: string, verse: number, text: string) => Promise<ChildFamilyThought>;
  };
};

/** The same chapter paper, pickers and Scripture source as the adult reader, with local sample activity. */
export default function ChildNotebookBibleReader({ active, mode, passage, onModeChange, onNavigate, onStartNote, useChapter, renderEdge, live, privacyUrl }: Props) {
  const { name, preferences, themeStyle, appearance, soundPreference, playCue } = useChildNotebookAppearance();
  const familyReading = mode === 'family' ? live?.activeReading : undefined;
  const { book, chapter } = familyReading ?? passage;
  const chapterKey = `${book}:${chapter}`;
  const chapterTitle = `${book === 'Psalms' ? 'Psalm' : book} ${chapter}`;
  const isFamily = mode === 'family';
  const [personalTranslation, setPersonalTranslation] = useState<ChildBibleTranslation>(() => live?.translations[0] ?? familyTranslation);
  const available = live?.translations ?? approvedTranslations.map(option => option.value);
  const currentPersonal = available.includes(personalTranslation) ? personalTranslation : available[0];
  const translation = familyReading?.translation ?? (isFamily ? familyTranslation : currentPersonal);
  const liveEmpty = Boolean(live && isFamily && !familyReading);
  const positionKey = `${mode}:${chapterKey}:${translation}:${familyReading?.id ?? ''}`;
  const atBookmark = chapterKey === familyChapterKey;
  const { data, isLoading, isError, refetch } = useChapter(
    active && !liveEmpty ? book : undefined, active && !liveEmpty ? chapter : undefined, translation, familyReading?.id
  );
  const chapterOptions = useMemo(() => Array.from(
    { length: bookChapterCount(book) || 1 },
    (_, index) => ({ value: index + 1, label: String(index + 1) })
  ), [book]);
  const [selection, setSelection] = useState<{ positionKey: string; verse: number } | null>(null);
  const selectedVerse = selection?.positionKey === positionKey ? selection.verse : null;
  const [highlights, setHighlights] = useState<Record<string, boolean>>({});
  const [thoughts, setThoughts] = useState(initialFamilyThoughts);
  const [savedThoughts, setSavedThoughts] = useState<(ChildFamilyThought & { positionKey: string })[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const reference = selectedVerse === null ? '' : `${book} ${chapter}:${selectedVerse}`;

  useLayoutEffect(() => {
    if (active && data && scrollRef.current) {
      scrollRef.current.scrollTop = positions.current.get(positionKey) ?? 0;
    }
  }, [active, data, positionKey]);

  function toggleHighlight(verse: number) {
    const key = `${positionKey}:${verse}`;
    playCue(highlights[key] ? 'nav.toggle' : 'highlight.created');
    setHighlights(current => ({ ...current, [key]: !current[key] }));
  }

  async function saveThought(verse: number, text: string) {
    if (live && familyReading) {
      const thought = await live.saveThought(familyReading.id, verse, text);
      setSavedThoughts(current => [...current, { ...thought, positionKey }]);
    } else {
      setThoughts(current => [...current, { id: crypto.randomUUID(), chapterKey, verse, role: 'child', text }]);
    }
    setAnnouncement('Your comment was posted.');
    playCue('organize.filed');
  }

  const serverThoughts = data?.thoughts ?? [];
  const sharedThoughts = [
    ...serverThoughts,
    ...savedThoughts.filter(thought => thought.positionKey === positionKey && !serverThoughts.some(item => item.id === thought.id)),
  ];
  if (!active) return null;

  return (
    <section className="pds-reader pds-kids-bible" aria-label="Bible reader" data-text-size={appearance.textSize}>
      <div className="pds-kids-bible__toolbar">
        <div className="proto-appearance-segmented pds-kids-bible__modes" role="group" aria-label="Reading space">
          <button type="button" className="proto-appearance-segmented__btn" aria-pressed={!isFamily} data-active={!isFamily ? 'true' : undefined} onClick={() => { if (isFamily) playCue('nav.select'); onModeChange('personal'); }}>
            <Icon name="book-open" size={14} /> My Bible
          </button>
          <button type="button" className="proto-appearance-segmented__btn" aria-pressed={isFamily} data-active={isFamily ? 'true' : undefined} onClick={() => { if (!isFamily) playCue('nav.select'); onModeChange('family'); }}>
            <Icon name="user-group" size={14} /> Family Bible
          </button>
        </div>
      </div>
      <div className="pds-reader__scroll pds-reader-stack" ref={scrollRef} onScroll={event => {
        positions.current.set(positionKey, event.currentTarget.scrollTop);
      }}>
        {!liveEmpty && (!live || !isFamily) && renderEdge(book, chapter, translation, 'behind', onNavigate)}
        <article className="pds-reader__column" aria-label={chapterTitle}>
          {liveEmpty ? <p className="pds-caption">Chapters your parent shares will show up here.</p> : <>
          {familyReading && <p className="pds-family-reader__shared-label pds-caption">Shared by your parent</p>}
          <div className={`pds-reader__chapter-heading${isFamily ? ' pds-family-reader__heading' : ''}`}>
            <h1 className="pds-reader-chapter-title pds-reader__chapter-picker">
              {familyReading && live ? live.readings.length === 1 ? chapterTitle : <ProtoSelectMenu label="Shared reading" value={familyReading.id}
                options={live.readings.map(reading => ({
                  value: reading.id, label: `${reading.book} ${reading.chapter} · ${reading.translation}`,
                  triggerLabel: `${reading.book === 'Psalms' ? 'Psalm' : reading.book} ${reading.chapter}`
                }))}
                className="pds-reader__picker-trigger" menuStyle={themeStyle} soundPreference={soundPreference} onChange={live.onReading} /> : <>
              <ProtoSelectMenu label="Book" value={book} options={bookOptions} groupsAsTabs className="pds-reader__picker-trigger" menuClassName="pds-reader__book-menu" menuWidth={292} menuStyle={themeStyle} soundPreference={soundPreference} onChange={nextBook => onNavigate(nextBook, 1)} />
              <ProtoSelectMenu label="Chapter" value={chapter} options={chapterOptions} className="pds-reader__picker-trigger" menuClassName="pds-reader__chapter-menu" menuWidth={232} menuStyle={themeStyle} soundPreference={soundPreference} onChange={nextChapter => onNavigate(book, nextChapter)} />
              </>}
            </h1>
            <div className="pds-reader__chapter-controls">
              {isFamily ? (
                <span className="scripture-pill-chrome__trans-chip" title="Translation chosen by your parent" aria-label={`${getTranslation(translation)?.name ?? translation}, chosen by your parent`}>
                  {translation}
                </span>
              ) : (
                <ProtoSelectMenu
                  label="Translation"
                  value={currentPersonal}
                  options={translationOptions(available)}
                  className="pds-reader__trans-trigger pds-reader__trans-trigger--showing scripture-pill-chrome__trans-chip"
                  menuWidth={248}
                  menuStyle={themeStyle} soundPreference={soundPreference}
                  onChange={setPersonalTranslation}
                  footer={() => <p className="pds-caption pds-kids-bible__translation-footer">Approved by your parent</p>}
                />
              )}
            </div>
          </div>
          {isFamily && !live && (
            <div className="pds-kids-bible__bookmark">
              <Icon name="bookmark" size={17} />
              <div>
                <strong className="pds-list-title">Read together</strong>
                <span className="pds-list-preview">Your parent picked Psalm 23</span>
              </div>
              {!atBookmark && (
                <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => onNavigate(familyBibleBookmark.book, familyBibleBookmark.chapter)}>
                  <Icon name="book-open" size={13} /> Open passage
                </button>
              )}
            </div>
          )}
          {isLoading && <ProtoSpaceLoading label="Opening your Bible" />}
          {isError && (
            <div className="pds-kids-bible__status" role="alert">
              <p>We couldn’t open this chapter.</p>
              <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => void refetch()}>
                <Icon name="rotate-left" size={14} /> Try again
              </button>
            </div>
          )}
          {data && (
            <div className="pds-reader__verses">
              {data.verses.map(verse => {
                const selected = verse.number === selectedVerse;
                const ownHighlight = Boolean(highlights[`${positionKey}:${verse.number}`]);
                const parentHighlight = !live && isFamily && atBookmark && verse.number === 1;
                const verseThoughts = isFamily ? live
                  ? sharedThoughts.filter(thought => thought.verse === verse.number)
                  : thoughts.filter(thought => thought.chapterKey === chapterKey && thought.verse === verse.number) : [];
                const toggle = () => setSelection(selected ? null : { positionKey, verse: verse.number });
                return (
                  <div className="pds-reader__block" key={verse.number}>
                    <p className="pds-reader-text">
                      <button type="button" className="pds-reader__verse pds-kids-bible__verse" aria-pressed={isFamily ? undefined : selected} aria-expanded={isFamily ? selected : undefined} data-selected={selected && !isFamily ? 'true' : undefined} data-highlighted={ownHighlight || parentHighlight ? 'true' : undefined} data-highlight-color={ownHighlight ? 'warmAmber' : 'skyBlue'} onClick={toggle}>
                        <sup className="pds-reader-verse-num">{verse.number}</sup>{' '}
                        <span className="pds-reader__verse-text">{verse.text}</span>
                      </button>
                    </p>
                    {isFamily && (ownHighlight || parentHighlight) && (
                      <div className="pds-kids-bible__verse-extra pds-caption">
                        {ownHighlight && parentHighlight ? 'Highlighted by you and your parent' : ownHighlight ? 'Highlighted by you' : 'Highlighted by your parent'}
                      </div>
                    )}
                    {isFamily && <FamilyVerseDiscussion key={positionKey} verse={verse.number} comments={verseThoughts}
                      viewer="child" childName={name} preferences={preferences} expanded={selected} onToggle={toggle}
                      privacyUrl={privacyUrl} onSave={text => saveThought(verse.number, text)}>
                      {!live && <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => toggleHighlight(verse.number)}>
                        <Icon name="highlighter" size={14} aria-hidden /> {ownHighlight ? 'Remove my highlight' : 'Highlight for family'}
                      </button>}
                    </FamilyVerseDiscussion>}
                    {!isFamily && selected && (
                      <div className="pds-kids-bible__verse-extra pds-kids-review__actions" role="group" aria-label={`Actions for ${reference}`}>
                        <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => toggleHighlight(verse.number)}>
                          <Icon name="highlighter" size={14} /> {ownHighlight ? 'Remove my highlight' : 'Highlight'}
                        </button>
                        <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => onStartNote(reference, translation)}>
                          <Icon name="pen-to-square" size={14} /> Write a note
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {live && data && <p className="pds-caption">{getTranslation(translation)?.copyright}</p>}
          </>}
        </article>
        {!liveEmpty && (!live || !isFamily) && renderEdge(book, chapter, translation, 'ahead', onNavigate)}
      </div>
      <span className="pds-kids-preview__sr" role="status">{announcement}</span>
    </section>
  );
}
