/**
 * The note an import item will become, read before deciding whether to bring it in.
 *
 * Loaded when its row is opened, never during upload — most files are imported
 * without anyone looking inside, and a forty-file drop shouldn't fetch forty bodies.
 * The body is the HTML commit will write, rendered through the same read-only path
 * as note history, so a Scripture pill already in the file shows as a pill here.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Icon from '@/components/react/Icon';
import { safeRenderHtml } from '@/utils/content-renderer';
import { prepareReadOnlyNoteBodyHtml } from '@/utils/note-read-only-html';
import type { ImportItemPreview as ImportItemPreviewData } from './import-session-api';

export interface ImportItemPreviewProps {
  itemId: string;
  loadPreview: (itemId: string) => Promise<ImportItemPreviewData>;
  /** A single-note file already shows the title on its row. */
  showTitle?: boolean;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; preview: ImportItemPreviewData }
  | { status: 'error'; message: string };

/** Highlights listed before the rest fold into a count. */
const VISIBLE_HIGHLIGHTS = 6;

function formatDate(value: string | null): string | null {
  if (!value) return null;
  // A bare "2026-03-01" parses as UTC midnight — the evening before, west of Greenwich.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function PreviewBody({ html }: { html: string }) {
  // A fresh object each render would re-apply innerHTML and drop any text selection.
  const markup = useMemo(() => ({ __html: safeRenderHtml(prepareReadOnlyNoteBodyHtml(html)) }), [html]);
  return <div className="card-full-editable__content-html proto-import-preview__body" dangerouslySetInnerHTML={markup} />;
}

export default function ImportItemPreview({ itemId, loadPreview, showTitle = true }: ImportItemPreviewProps) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: 'loading' });
    loadPreview(itemId).then(
      (preview) => {
        if (!cancelled) setLoad({ status: 'ready', preview });
      },
      (error: unknown) => {
        if (cancelled) return;
        setLoad({
          status: 'error',
          message: error instanceof Error && error.message ? error.message : "Couldn't load this note",
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [itemId, loadPreview, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (load.status === 'loading') {
    return (
      <div className="proto-import-preview proto-import-preview--loading" aria-busy="true">
        <span className="proto-import-preview__status">Opening…</span>
      </div>
    );
  }

  if (load.status === 'error') {
    return (
      <div className="proto-import-preview" role="alert">
        <span className="proto-import-row__error">{load.message}</span>
        <button type="button" className="proto-import-preview__retry" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }

  const { preview } = load;
  const date = formatDate(preview.createdDate);
  const folders = [preview.primaryCollection || 'Unsorted', ...preview.secondaryCollections];
  const hasBody = preview.html.trim().length > 0;
  const hiddenHighlights = Math.max(0, preview.highlightCount - VISIBLE_HIGHLIGHTS);

  return (
    <article className="proto-import-preview">
      {showTitle ? <h4 className="proto-import-preview__title">{preview.title}</h4> : null}

      {hasBody ? (
        <PreviewBody html={preview.html} />
      ) : (
        <p className="proto-import-preview__status">This note has no body text.</p>
      )}
      {preview.truncated ? (
        <p className="proto-import-preview__status">Showing the beginning. The whole note will be imported.</p>
      ) : null}

      {preview.highlights.length > 0 ? (
        <section className="proto-import-preview__highlights" aria-label="Highlights">
          <p className="proto-import-preview__section-label">Highlights</p>
          <ul>
            {preview.highlights.slice(0, VISIBLE_HIGHLIGHTS).map((highlight, index) => (
              <li
                key={index}
                className="proto-import-preview__highlight"
                style={{ '--proto-import-highlight-accent': `var(--study-dock-accent-${highlight.accent})` } as CSSProperties}
              >
                <span className="proto-import-preview__swatch" aria-hidden />
                <span className="proto-import-preview__highlight-text">
                  <span className="proto-import-preview__anchor">
                    {highlight.anchorText || highlight.scriptureReference || 'Highlight'}
                  </span>
                  {highlight.annotation ? (
                    <span className="proto-import-preview__annotation">{highlight.annotation}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {hiddenHighlights > 0 ? (
            <p className="proto-import-preview__status">and {hiddenHighlights} more</p>
          ) : null}
        </section>
      ) : null}

      <footer className="proto-import-preview__footer">
        <span className="proto-import-preview__fact">
          <Icon name="folder" size={11} aria-hidden />
          {folders.join(', ')}
        </span>
        {date ? (
          <span className="proto-import-preview__fact">
            <Icon name="calendar" size={11} aria-hidden />
            {date}
          </span>
        ) : null}
        {preview.tags.length > 0 ? (
          <span className="proto-import-preview__fact">
            <Icon name="tag" size={11} aria-hidden />
            {preview.tags.join(', ')}
          </span>
        ) : null}
        {preview.duplicateHint ? (
          <span className="proto-import-preview__fact proto-import-preview__fact--strong">Already in your library</span>
        ) : null}
      </footer>
    </article>
  );
}
