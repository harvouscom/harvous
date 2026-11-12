import { getTranslation } from '@/data/translations';
import { bookChapterCount, orderedCanonBooks } from '@/utils/bible-book-chapters';
import type { ChildBibleTranslation, ChildPassage } from '../../../../shared/child-notebook';
import ProtoSelectMenu from '../prototype/ProtoSelectMenu';

export default function ChildBiblePassagePicker({ value, translations, onChange, disabled }: {
  value: ChildPassage;
  translations: ChildBibleTranslation[];
  onChange: (value: ChildPassage) => void;
  disabled?: boolean;
}) {
  const chapterCount = bookChapterCount(value.book, value.translation) ?? 1;

  return (
    <div className="pds-family-bible-picker">
      <div>
        <span className="pds-caption">Book</span>
        <ProtoSelectMenu label="Book" value={value.book} disabled={disabled} filterPlaceholder="Find a book"
          options={orderedCanonBooks(value.translation).map(book => ({ value: book, label: book }))}
          onChange={book => onChange({ ...value, book, chapter: 1 })} />
      </div>
      <div>
        <span className="pds-caption">Chapter</span>
        <ProtoSelectMenu label="Chapter" value={value.chapter} disabled={disabled} filterPlaceholder="Find a chapter"
          options={Array.from({ length: chapterCount }, (_, index) => ({ value: index + 1, label: String(index + 1) }))}
          onChange={chapter => onChange({ ...value, chapter })} />
      </div>
      {translations.length > 1 && <div>
        <span className="pds-caption">Translation</span>
        <ProtoSelectMenu label="Translation" value={value.translation} disabled={disabled}
          options={translations.map(translation => ({ value: translation, label: getTranslation(translation)?.name ?? translation, triggerLabel: translation }))}
          onChange={translation => onChange({ ...value, translation })} />
      </div>}
    </div>
  );
}
