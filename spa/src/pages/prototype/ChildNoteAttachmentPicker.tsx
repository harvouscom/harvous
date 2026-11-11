import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import Icon from '@/components/react/Icon';
import { bookChapterCount, orderedCanonBooks } from '@/utils/bible-book-chapters';
import { useChildNotebookAppearance } from './ChildNotebookAppearance';
import type { ChildBibleTranslation } from '../../../../shared/child-notebook';
import { approvedTranslations, familyBibleBookmark } from './ChildNotebookBibleReader';

export type ChildNoteAttachment =
  | { kind: 'scripture'; reference: string; book: string; chapter: number; verse: number; translation: string }
  | { kind: 'resource'; resourceId: string };

export type ChildFamilyResource = { id: string; title: string; source: string; question: string };

export default function ChildNoteAttachmentPicker({ kind, resource, resources = [], existing, onAdd, onClose, useChapter, translations = approvedTranslations.map(option => option.value) }: {
  kind: ChildNoteAttachment['kind'];
  resource?: ChildFamilyResource;
  resources?: ChildFamilyResource[];
  translations?: ChildBibleTranslation[];
  useChapter: (book: string | undefined, chapter: number | undefined, translation: ChildBibleTranslation) => {
    data?: { verses: { number: number; text: string }[] }; isLoading: boolean; isError: boolean
  };
  existing?: ChildNoteAttachment;
  onAdd: (attachment: ChildNoteAttachment) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { themeStyle } = useChildNotebookAppearance();
  const scripture = existing?.kind === 'scripture' ? existing : undefined;
  const [passage, setPassage] = useState<{ book: string; chapter: number; verse: number; translation: string }>(scripture ?? { ...familyBibleBookmark, verse: 1, translation: translations[0] });
  const [resourceId, setResourceId] = useState(existing?.kind === 'resource' ? existing.resourceId : resource?.id);
  const selectedResource = resources.find(item => item.id === resourceId);
  const { book, chapter, verse, translation } = passage;
  const { data, isLoading, isError } = useChapter(
    kind === 'scripture' && translations.includes(translation as ChildBibleTranslation) ? book : undefined,
    kind === 'scripture' ? chapter : undefined,
    translation as ChildBibleTranslation
  );
  const selectedVerse = data?.verses.find(item => item.number === verse) ?? data?.verses[0];
  const reference = selectedVerse ? `${book} ${chapter}:${selectedVerse.number}` : `${book} ${chapter}`;
  const title = existing
    ? kind === 'scripture' ? reference : selectedResource?.title ?? 'Reading no longer shared'
    : kind === 'scripture' ? 'Add Scripture' : 'Add a resource';

  useEffect(() => { dialog.current?.showModal(); }, []);

  return createPortal(
    <dialog ref={dialog} className="pds-kids-privacy-modal pds-kids-attachment-picker proto-theme" style={themeStyle} aria-labelledby="child-attachment-title" onClose={onClose}>
      <header className="pds-kids-info__header">
        <h2 id="child-attachment-title" className="pds-title">{title}</h2>
        <button type="button" className="proto-toolbar-icon-btn" aria-label="Close picker" onClick={() => dialog.current?.close()}><Icon name="xmark" size={15} /></button>
      </header>
      {kind === 'scripture' ? (
        <>
          {!existing && <div className="pds-kids-attachment-picker__fields">
            <label>Book<select className="proto-settings-field__input" value={book} onChange={event => setPassage(current => ({ ...current, book: event.target.value, chapter: 1, verse: 1 }))}>
              {orderedCanonBooks().map(name => <option key={name}>{name}</option>)}
            </select></label>
            <label>Chapter<select className="proto-settings-field__input" value={chapter} onChange={event => setPassage(current => ({ ...current, chapter: Number(event.target.value), verse: 1 }))}>
              {Array.from({ length: bookChapterCount(book) ?? 1 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
            </select></label>
            <label>Verse<select className="proto-settings-field__input" value={selectedVerse?.number ?? ''} disabled={!data} onChange={event => setPassage(current => ({ ...current, verse: Number(event.target.value) }))}>
              {data?.verses.map(item => <option key={item.number}>{item.number}</option>)}
            </select></label>
            <label>Translation<select className="proto-settings-field__input" value={translation} onChange={event => setPassage(current => ({ ...current, translation: event.target.value }))}>
              {approvedTranslations.filter(option => translations.includes(option.value)).map(option => <option key={option.value} value={option.value}>{option.triggerLabel}</option>)}
            </select></label>
          </div>}
          {isLoading && <ProtoSpaceLoading label="Opening Scripture" />}
          {isError && <p className="pds-caption" role="alert">This passage couldn’t open. Try another chapter or translation.</p>}
          {selectedVerse && <blockquote className="pds-kids-review__note"><span className="pds-caption">{reference} · {translation}</span><p>{selectedVerse.text}</p></blockquote>}
          {!existing && <button type="button" className="proto-settings-btn" disabled={!selectedVerse} onClick={() => {
            if (selectedVerse) onAdd({ kind: 'scripture', reference, book, chapter, verse: selectedVerse.number, translation });
          }}><Icon name="plus" size={13} /> Add to note</button>}
        </>
      ) : (
        <>
          {!existing && resources.length > 1 && <label>Reading
            <select className="proto-settings-field__input" value={resourceId} onChange={event => setResourceId(event.target.value)}>
              {resources.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>}
          {selectedResource ? <div className="pds-kids-review__note">
            <span className="pds-caption">Family Space · {selectedResource.source}</span>
            {!existing && <h3 className="pds-title">{selectedResource.title}</h3>}
            <p>{selectedResource.question}</p>
          </div> : <p className="pds-caption">{existing ? 'This reading is no longer shared.' : 'Readings your parent approves will appear here.'}</p>}
          {!existing && selectedResource && <button type="button" className="proto-settings-btn" onClick={() => onAdd({ kind: 'resource', resourceId: selectedResource.id })}><Icon name="plus" size={13} /> Add to note</button>}
        </>
      )}
    </dialog>,
    document.body
  );
}
