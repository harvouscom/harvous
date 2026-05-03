import { Link } from '@tanstack/react-router';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { useSearch } from '../../../../src/hooks/useSearch';
import PrototypeSearchResultRow from './components/PrototypeSearchResultRow';

function noteSlug(id: string) {
  return id.startsWith('note_') ? id.slice('note_'.length) : id;
}

function spaceSlug(spaceId: string) {
  return spaceId.startsWith('space_') ? spaceId.slice('space_'.length) : spaceId;
}

export interface PrototypeSearchResultsListProps {
  query: string;
  /** Full space id (`space_*`). Results open under this space in the prototype shell. */
  spaceId: string;
}

/** Space-scoped, note-only FTS results with prototype routes. */
export default function PrototypeSearchResultsList({ query, spaceId }: PrototypeSearchResultsListProps) {
  const trimmed = query.trim();
  const { data, isLoading, isError, error } = useSearch(trimmed, { spaceId }, 'notes');

  if (!trimmed) return null;

  if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) {
    return (
      <p className="proto-caption" style={{ textAlign: 'center', padding: '28px 16px' }}>
        Type at least {MIN_SEARCH_QUERY_LENGTH} characters to search.
      </p>
    );
  }

  if (isLoading) {
    return (
      <p className="proto-caption" style={{ textAlign: 'center', padding: '28px 16px' }}>
        Searching…
      </p>
    );
  }

  if (isError) {
    return (
      <p className="proto-caption" style={{ textAlign: 'center', padding: '28px 16px' }}>
        {error instanceof Error ? error.message : 'Search failed. Try again.'}
      </p>
    );
  }

  const results = (data?.results ?? []).filter((r) => r.type === 'note');

  if (results.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center' }}>
        <p className="pds-title" style={{ marginBottom: 6, fontSize: '1rem' }}>
          No results
        </p>
        <p className="proto-caption">Try a different search term.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="proto-caption" style={{ marginBottom: 6 }}>
        {results.length} result{results.length !== 1 ? 's' : ''}
      </p>
      {results.map((result) => {
        const resolvedSpace =
          typeof result.spaceId === 'string' && result.spaceId.startsWith('space_') ? result.spaceId : spaceId;
        return (
          <Link
            key={result.id}
            to="/prototype/space/$spaceId/n/$noteId"
            params={{ spaceId: spaceSlug(resolvedSpace), noteId: noteSlug(result.id) }}
            style={{ textDecoration: 'none' }}
          >
            <PrototypeSearchResultRow result={result} />
          </Link>
        );
      })}
    </div>
  );
}
