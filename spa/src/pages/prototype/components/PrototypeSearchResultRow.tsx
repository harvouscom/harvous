/**
 * Standalone search result row for the prototype shell.
 * Renders note title, meta, and excerpt using PDS classes only — no SPA CSS vars.
 */
import { BookOpen, FileText } from '@phosphor-icons/react';
import type { SearchResult } from '@/hooks/useSearch';

interface PrototypeSearchResultRowProps {
  result: SearchResult;
}

export default function PrototypeSearchResultRow({ result }: PrototypeSearchResultRowProps) {
  const isScripture = result.noteType === 'scripture';
  const primaryRef = (result as { primaryRef?: string | null }).primaryRef ?? null;

  const leadingIcon = isScripture ? (
    <BookOpen size={15} />
  ) : (
    <FileText size={15} style={{ opacity: 0.45 }} />
  );

  const excerptText = (result as { excerpt?: string | null }).excerpt ?? null;

  return (
    <div className="proto-search-result-row">
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {leadingIcon}
        <span className="proto-search-result-row__title">{result.title || 'Untitled Note'}</span>
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
