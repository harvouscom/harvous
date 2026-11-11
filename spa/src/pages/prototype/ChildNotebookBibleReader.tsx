import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import { getTranslation } from '@/data/translations';
import { canonGroupForBook } from '@/utils/admin-pulse-canon-groups';
import { bookChapterCount, orderedCanonBooks } from '@/utils/bible-book-chapters';
import { bookAbbreviation } from '@/utils/scripture-osis';
import { usePrototypeBibleChapter } from '../../hooks/queries/usePrototypeBibleChapter';
import { ChildNotebookAvatar, useChildNotebookAppearance } from './ChildNotebookAppearance';
import ProtoSelectMenu from './ProtoSelectMenu';
import PrototypeReaderChapterStack from './PrototypeReaderChapterStack';

export type ChildBiblePassage = { book: string; chapter: number };
export type ChildBibleMode = 'personal' | 'family';

export const familyBibleBookmark = { book: 'Psalms', chapter: 23 };
const familyTranslation = 'BSB';
// Sample preferences for the preview. Real approvals belong to the parent account.
export const approvedTranslations = (['BSB', 'NIV', 'NLT'] as const).map(id => ({
  value: id,
  label: getTranslation(id)?.name ?? id,
  triggerLabel: id
}));

type FamilyThought = {
  id: string;
  chapterKey: string;
  verse: number;
  author: 'Sam' | 'Your parent';
  text: string;
};

const familyChapterKey = `${familyBibleBookmark.book}:${familyBibleBookmark.chapter}`;
const initialFamilyThoughts: FamilyThought[] = [{
  id: 'parent-question',
  chapterKey: familyChapterKey,
  verse: 1,
  author: 'Your parent',
  text: 'Which words would you like to remember?'
}];

const bookOptions = orderedCanonBooks().map(book => ({
  value: book,
  label: bookAbbreviation(book),
  triggerLabel: book,
  group: canonGroupForBook(book)?.testament === 'nt' ? 'New Testament' : 'Old Testament'
}));

type Props = {
  active: boolean;
  mode: ChildBibleMode;
  passage: ChildBiblePassage;
  onModeChange: (mode: ChildBibleMode) => void;
  onNavigate: (book: string, chapter: number) => void;
  onStartNote: (reference: string, translation: string) => void;
};

/** The same chapter paper, pickers and Scripture source as the adult reader, with local sample activity. */
export default function ChildNotebookBibleReader({ active, mode, passage, onModeChange, onNavigate, onStartNote }: Props) {
  const { themeStyle, appearance, soundPreference, playCue } = useChildNotebookAppearance();
  const { book, chapter } = passage;
  const chapterKey = `${book}:${chapter}`;
  const isFamily = mode === 'family';
  const [personalTranslation, setPersonalTranslation] = useState<(typeof approvedTranslations)[number]['value']>('BSB');
  const translation = isFamily ? familyTranslation : personalTranslation;
  const positionKey = `${mode}:${chapterKey}:${translation}`;
  const atBookmark = chapterKey === familyChapterKey;
  const { data, isLoading, isError, refetch } = usePrototypeBibleChapter(
    active ? book : undefined,
    active ? chapter : undefined,
    translation
  );
  const chapterOptions = useMemo(() => Array.from(
    { length: bookChapterCount(book) || 1 },
    (_, index) => ({ value: index + 1, label: String(index + 1) })
  ), [book]);
  const [selection, setSelection] = useState<{ positionKey: string; verse: number } | null>(null);
  const selectedVerse = selection?.positionKey === positionKey ? selection.verse : null;
  const [highlights, setHighlights] = useState<Record<string, boolean>>({});
  const [thoughts, setThoughts] = useState(initialFamilyThoughts);
  const [editing, setEditing] = useState(false);
  const [thoughtDraft, setThoughtDraft] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const reference = selectedVerse === null ? '' : `${book} ${chapter}:${selectedVerse}`;

  useLayoutEffect(() => {
    if (active && data && scrollRef.current) {
      scrollRef.current.scrollTop = positions.current.get(positionKey) ?? 0;
    }
  }, [active, data, positionKey]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (active && editing) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [active, editing]);

  function toggleHighlight(verse: number) {
    const key = `${positionKey}:${verse}`;
    playCue(highlights[key] ? 'nav.toggle' : 'highlight.created');
    setHighlights(current => ({ ...current, [key]: !current[key] }));
  }

  function saveThought() {
    const text = thoughtDraft.trim();
    if (!text || selectedVerse === null || !isFamily) return;
    setThoughts(current => [...current, {
      id: crypto.randomUUID(),
      chapterKey,
      verse: selectedVerse,
      author: 'Sam',
      text
    }]);
    setEditing(false);
    setThoughtDraft('');
    setAnnouncement('Your thought was added to Family Bible.');
    playCue('organize.filed');
  }

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
        <PrototypeReaderChapterStack soundPreference={soundPreference} book={book} chapter={chapter} translation={translation} onSelect={onNavigate} />
        <article className="pds-reader__column" aria-label={`${book} ${chapter}`}>
          <div className="pds-reader__chapter-heading">
            <h1 className="pds-reader-chapter-title pds-reader__chapter-picker">
              <ProtoSelectMenu label="Book" value={book} options={bookOptions} groupsAsTabs className="pds-reader__picker-trigger" menuClassName="pds-reader__book-menu" menuWidth={292} menuStyle={themeStyle} soundPreference={soundPreference} onChange={nextBook => onNavigate(nextBook, 1)} />
              <ProtoSelectMenu label="Chapter" value={chapter} options={chapterOptions} className="pds-reader__picker-trigger" menuClassName="pds-reader__chapter-menu" menuWidth={232} menuStyle={themeStyle} soundPreference={soundPreference} onChange={nextChapter => onNavigate(book, nextChapter)} />
            </h1>
            <div className="pds-reader__chapter-controls">
              {isFamily ? (
                <span className="scripture-pill-chrome__trans-chip" title="Translation chosen by your parent" aria-label={`${getTranslation(translation)?.name ?? translation}, chosen by your parent`}>
                  {translation}
                </span>
              ) : (
                <ProtoSelectMenu
                  label="Translation"
                  value={personalTranslation}
                  options={approvedTranslations}
                  className="pds-reader__trans-trigger pds-reader__trans-trigger--showing scripture-pill-chrome__trans-chip"
                  menuWidth={248}
                  menuStyle={themeStyle} soundPreference={soundPreference}
                  onChange={setPersonalTranslation}
                  footer={() => <p className="pds-caption pds-kids-bible__translation-footer">Approved by your parent</p>}
                />
              )}
            </div>
          </div>
          {isFamily && (
            <div className="pds-kids-bible__bookmark">
              <Icon name="bookmark" size={17} />
              <div>
                <strong className="pds-list-title">Read together</strong>
                <span className="pds-list-preview">Your parent picked Psalm 23 · You and your parent</span>
              </div>
              {!atBookmark && (
                <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => onNavigate(familyBibleBookmark.book, familyBibleBookmark.chapter)}>
                  <Icon name="book-open" size={13} /> Open passage
                </button>
              )}
            </div>
          )}
          {isLoading && <p className="pds-kids-bible__status pds-caption" role="status">Opening your Bible…</p>}
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
                const parentHighlight = isFamily && atBookmark && verse.number === 1;
                const verseThoughts = isFamily ? thoughts.filter(thought => thought.chapterKey === chapterKey && thought.verse === verse.number) : [];
                const showThoughts = selected || parentHighlight;
                return (
                  <div className="pds-reader__block" key={verse.number}>
                    <p className="pds-reader-text">
                      <button type="button" className="pds-reader__verse pds-kids-bible__verse" aria-pressed={selected} data-selected={selected ? 'true' : undefined} data-highlighted={ownHighlight || parentHighlight ? 'true' : undefined} data-highlight-color={ownHighlight ? 'warmAmber' : 'skyBlue'} onClick={() => setSelection(selected ? null : { positionKey, verse: verse.number })}>
                        <sup className="pds-reader-verse-num">{verse.number}</sup>{' '}
                        <span className="pds-reader__verse-text">{verse.text}</span>
                      </button>
                    </p>
                    {isFamily && (ownHighlight || parentHighlight) && (
                      <div className="pds-kids-bible__verse-extra pds-caption">
                        {ownHighlight && parentHighlight ? 'Highlighted by you and your parent' : ownHighlight ? 'Highlighted by you' : 'Highlighted by your parent'}
                      </div>
                    )}
                    {showThoughts && verseThoughts.length > 0 && (
                      <ul className="pds-kids-bible__verse-extra pds-kids-bible__thoughts" aria-label={`Family thoughts on verse ${verse.number}`}>
                        {verseThoughts.map(thought => (
                          <li className="pds-kids-bible__thought" key={thought.id}>
                            {thought.author === 'Sam' ? <ChildNotebookAvatar small /> : (
                              <span className="pds-kids-bible__parent-avatar" aria-hidden="true">
                                <Icon name="user" size={11} />
                              </span>
                            )}
                            <div>
                              <strong className="pds-caption">{thought.author}</strong>
                              <p className="pds-body">{thought.text}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!showThoughts && verseThoughts.length > 0 && (
                      <button type="button" className="pds-kids-bible__verse-extra pds-kids-bible__thought-link pds-caption" onClick={() => setSelection({ positionKey, verse: verse.number })}>
                        {verseThoughts.length} {verseThoughts.length === 1 ? 'family thought' : 'family thoughts'}
                      </button>
                    )}
                    {selected && (
                      <div className="pds-kids-bible__verse-extra pds-kids-review__actions" role="group" aria-label={`Actions for ${reference}`}>
                        <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => toggleHighlight(verse.number)}>
                          <Icon name="highlighter" size={14} /> {ownHighlight ? 'Remove my highlight' : isFamily ? 'Highlight for family' : 'Highlight'}
                        </button>
                        <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => {
                          if (isFamily) { setThoughtDraft(''); setEditing(true); }
                          else onStartNote(reference, translation);
                        }}>
                          <Icon name="pen-to-square" size={14} /> {isFamily ? 'Add to Family Bible' : 'Write a note'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </article>
        <PrototypeReaderChapterStack soundPreference={soundPreference} book={book} chapter={chapter} translation={translation} direction="ahead" onSelect={onNavigate} />
      </div>
      <span className="pds-kids-preview__sr" role="status">{announcement}</span>
      {createPortal(
        <dialog ref={dialogRef} className="pds-kids-privacy-modal pds-kids-bible__dialog proto-theme" style={themeStyle} aria-labelledby="family-bible-thought-title" onClose={() => setEditing(false)}>
          <form onSubmit={event => { event.preventDefault(); saveThought(); }}>
            <h2 id="family-bible-thought-title" className="pds-title">Add to Family Bible</h2>
            <p className="pds-caption">{reference} · You and your parent can see this.</p>
            <label className="pds-caption">Your thought
              <textarea className="proto-settings-field__input" value={thoughtDraft} onChange={event => setThoughtDraft(event.target.value)} maxLength={500} rows={4} autoFocus />
            </label>
            <div className="pds-kids-review__actions">
              <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => setEditing(false)}>Cancel</button>
              <button type="submit" className="proto-settings-btn" disabled={!thoughtDraft.trim()}><Icon name="check" size={14} /> Add thought</button>
            </div>
          </form>
        </dialog>,
        document.body
      )}
    </section>
  );
}
