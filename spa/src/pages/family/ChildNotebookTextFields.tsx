import type { ReactNode, Ref } from 'react';
import '../../styles/family.css';

export default function ChildNotebookTextFields({
  title,
  content,
  titleRef,
  disabled,
  onTitleChange,
  onContentChange,
  children
}: {
  title: string;
  content: string;
  titleRef?: Ref<HTMLInputElement>;
  disabled?: boolean;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  children?: ReactNode;
}) {
  return (
    <>
      <input ref={titleRef} className="pds-child-note__title pds-title-xl" aria-label="Note title" placeholder="Title" maxLength={100} value={title} disabled={disabled} onChange={event => onTitleChange(event.target.value)} />
      {children}
      <textarea className="pds-child-note__writing" aria-label="My note" placeholder="Start writing..." maxLength={10000} value={content} disabled={disabled} onChange={event => onContentChange(event.target.value)} />
    </>
  );
}
