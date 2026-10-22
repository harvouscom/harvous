import { useMemo } from 'react';
import { safeRenderHtml } from '@/utils/content-renderer';
import { prepareReadOnlyNoteBodyHtml, type DisplayScripturePillsOptions } from '@/utils/note-read-only-html';
import '../../styles/prototype-note-readonly.css';

export type ProtoReadOnlyNotePaperProps = {
  html: string;
  title?: string | null;
  /**
   * `paper` is the note's own sheet, for a view that stands in for the note (history).
   * `inset` keeps the note's type and pills without the sheet, for a body shown inside a row.
   */
  variant?: 'paper' | 'inset';
  /** Wrap references the stored HTML holds as plain text as pills, for display only. */
  displayPills?: DisplayScripturePillsOptions;
  className?: string;
};

/**
 * A note body read, not edited — on the same surface the editor draws on.
 *
 * Every pill, quote and highlight style is scoped to `.proto-editor-surface`, so a body
 * portaled outside the note pane (a popover, a drawer) fell back to the pre-2.0 pill look.
 * Carrying the surface class is what makes a past version look like the note it was, and it
 * is the one place a diff view would hook in. `data-readonly` turns off what only an editor
 * does: hover fills and pointer cursors on pills that open nothing here.
 */
export default function ProtoReadOnlyNotePaper({
  html,
  title,
  variant = 'paper',
  displayPills,
  className,
}: ProtoReadOnlyNotePaperProps) {
  const noteId = displayPills?.noteId;
  const fallbackTranslation = displayPills?.fallbackTranslation;
  // A fresh object each render would re-apply innerHTML and drop any text selection.
  const markup = useMemo(
    () => ({
      __html: safeRenderHtml(
        prepareReadOnlyNoteBodyHtml(html, noteId ? { displayPills: { noteId, fallbackTranslation } } : {}),
      ),
    }),
    [html, noteId, fallbackTranslation],
  );
  const heading = title?.trim();
  const body = (
    <>
      {heading ? <h2 className="proto-note-readonly__title">{heading}</h2> : null}
      <div className="card-full-editable__content-html proto-note-readonly__body" dangerouslySetInnerHTML={markup} />
    </>
  );
  return (
    <article
      className={['proto-editor-surface', 'proto-note-readonly', className].filter(Boolean).join(' ')}
      data-readonly="true"
      data-variant={variant}
    >
      {variant === 'paper' ? <div className="proto-editor-paper proto-note-readonly__paper">{body}</div> : body}
    </article>
  );
}
