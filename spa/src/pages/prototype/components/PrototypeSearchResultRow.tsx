/**
 * Standalone search result row for the prototype shell.
 * Renders note title, meta, and excerpt using PDS classes only — no SPA CSS vars.
 */
import Icon from '@/components/react/Icon';
import type { SearchResult } from '@/hooks/useSearch';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';

interface PrototypeSearchResultRowProps {
  result: SearchResult;
}

export default function PrototypeSearchResultRow({ result }: PrototypeSearchResultRowProps) {
  const isScripture = result.noteType === 'scripture';
  const primaryRef = (result as { primaryRef?: string | null }).primaryRef ?? null;

  const leadingIcon = isScripture ? (
    <Icon name="book" size={15} />
  ) : (
    <Icon name="note-sticky" size={15} style={{ opacity: 0.45 }} />
  );

  const excerptText = (result as { excerpt?: string | null }).excerpt ?? null;

  return (
    <div className="proto-search-result-row">
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {leadingIcon}
        <span className="proto-search-result-row__title">
          {stripServerAutoUntitledNoteTitleForDisplay(result.title ?? '') || 'New Note'}
        </span>
      </div>
      {primaryRef ? (
        <span className="proto-chip-scripture" style={{ marginTop: 3, alignSelf: 'flex-start' }}>
          {primaryRef}
        </span>
      ) : null}
      {excerptText ? (
        <p className="proto-search-result-row__excerpt" style={{ margin: '3px 0 0' }}>
          {excerptText}
        </p>
      ) : null}
    </div>
  );
}
