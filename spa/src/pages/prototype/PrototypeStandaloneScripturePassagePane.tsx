import { useEffect, useState } from 'react';
import { safeRenderHtml } from '@/utils/content-renderer';
import { fetchVerseHtml } from '@/utils/fetch-verse-html';
import type { StandaloneScripturePassageState } from '../../layouts/proto-shell-context';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { usePrototypeSpaceStudyThreadsByScripture } from '../../hooks/queries/usePrototypeSpaceStudyThreadsByScripture';

export default function PrototypeStandaloneScripturePassagePane({
  state,
  onDone,
}: {
  state: StandaloneScripturePassageState;
  onDone: () => void;
}) {
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const [html, setHtml] = useState('');
  const [loadingPassage, setLoadingPassage] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingPassage(true);
      const h = await fetchVerseHtml(state.canonicalReference, state.translationCode);
      if (cancelled) return;
      setHtml(h || '');
      setLoadingPassage(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [state.canonicalReference, state.translationCode]);

  const { data: rows = [], isLoading: rowsLoading } = usePrototypeSpaceStudyThreadsByScripture(
    homeSpaceId ?? undefined,
    state.canonicalReference,
    state.translationCode,
    Boolean(homeSpaceId),
  );

  return (
    <div className="proto-standalone-passage proto-theme" style={{ padding: '20px 24px', maxWidth: 720, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 className="proto-title-md" style={{ margin: 0, lineHeight: 1.25 }}>
            {state.canonicalReference}
          </h1>
          <p className="proto-caption" style={{ margin: '6px 0 0' }}>
            {state.translationCode}
          </p>
        </div>
        <button type="button" className="proto-toolbar-icon-btn" style={{ flexShrink: 0 }} onClick={onDone}>
          Done
        </button>
      </div>

      <div
        className="proto-standalone-passage__body"
        style={{
          borderRadius: 12,
          border: '0.5px solid var(--pds-border)',
          padding: 16,
          marginBottom: 20,
          background: 'rgba(255,255,255,0.45)',
          minHeight: 120,
        }}
      >
        {loadingPassage ? (
          <p className="proto-caption">Loading passage…</p>
        ) : html ? (
          <div
            className="proto-standalone-passage__html scripture-pill-chrome__passage-html"
            dangerouslySetInnerHTML={{ __html: safeRenderHtml(html) }}
          />
        ) : (
          <p className="proto-caption">Could not load this passage.</p>
        )}
      </div>

      <h2 className="pds-list-title" style={{ fontSize: 15, marginBottom: 8 }}>
        Highlights in this space
      </h2>
      {rowsLoading ? (
        <p className="proto-caption">Loading highlights…</p>
      ) : rows.length === 0 ? (
        <p className="proto-caption">No passage highlights for this reference.</p>
      ) : (
        <ul className="proto-note-list">
          {rows.map((r) => (
            <li
              key={r.id}
              className="proto-note-row-item"
              data-active={r.id === state.focusedHighlightThreadId ? 'true' : 'false'}
            >
              <div className="proto-note-row__main" style={{ cursor: 'default', textAlign: 'left' }}>
                <div className="pds-list-title proto-note-row__title-text">
                  {r.scripturePassageExcerpt?.trim() || r.focusTitle?.trim() || 'Passage highlight'}
                </div>
                <div className="pds-list-preview proto-note-row__preview">{r.parentNoteTitle || 'Note'}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
