import { getTranslation } from '@/data/translations';
import { bookChapterCount, orderedCanonBooks } from '@/utils/bible-book-chapters';
import type { ChildBibleTranslation, ChildPassage } from '../../../../shared/child-notebook';

export default function ChildBiblePassagePicker({ value, translations, onChange }: {
  value: ChildPassage;
  translations: ChildBibleTranslation[];
  onChange: (value: ChildPassage) => void;
}) {
  const chapters = bookChapterCount(value.book, value.translation) ?? 1;
  return <div className="pds-family-bible-picker">
    <label>Book<select value={value.book} onChange={e => onChange({ ...value, book: e.target.value, chapter: 1 })}>
      {orderedCanonBooks(value.translation).map(book => <option key={book}>{book}</option>)}
    </select></label>
    <label>Chapter<select value={value.chapter} onChange={e => onChange({ ...value, chapter: Number(e.target.value) })}>
      {Array.from({ length: chapters }, (_, index) => <option key={index + 1}>{index + 1}</option>)}
    </select></label>
    <label>Translation<select value={value.translation} onChange={e => onChange({ ...value, translation: e.target.value as ChildBibleTranslation })}>
      {translations.map(translation => <option key={translation} value={translation}>{getTranslation(translation)?.name ?? translation}</option>)}
    </select></label>
  </div>;
}
