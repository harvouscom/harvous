/**
 * Find one of your own notes, inline, in whatever surface asked.
 *
 * This replaces `PrototypeAddNotesPicker` wherever the job is "pick one note".
 * That component is built for a different one: attaching *several* notes to a
 * Thread, with a list-scope toggle, an origin filter and a multi-select bar.
 * Dropped into a 344px rail or an inspector column it read as a foreign panel
 * bolted into the form, carrying controls that mean nothing when exactly one
 * note is being chosen.
 *
 * A search field and rows in the app's own row anatomy, so it reads as part of
 * the surface rather than a window into another feature. Used by the planner's
 * sermon editor and the inspector's Thread section; anything else picking a
 * single note should reach for this rather than the multi-select sheet.
 */
import { useMemo } from 'react';
import Icon from '@/components/react/Icon';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useDebouncedSearchState } from '../../hooks/useDebouncedSearchState';

export type NoteSearchCandidate = {
  id: string;
  title: string | null;
  /** Server-trimmed preview; the row shows it under the title when present. */
  snippet?: string | null;
};

type CandidatesResponse = { notes?: NoteSearchCandidate[] };

/** How many rows the rail shows before asking you to narrow the search. */
const VISIBLE_LIMIT = 6;

export default function ProtoNoteSearch({
  homeSpaceId,
  disabled = false,
  excludeNoteIds,
  placeholder = 'Search your notes',
  onPick,
}: {
  /** The author's own space — the pool every candidate comes from. */
  homeSpaceId: string;
  disabled?: boolean;
  /** Notes already attached here, so the list never offers a duplicate. */
  excludeNoteIds?: readonly string[];
  placeholder?: string;
  onPick: (note: NoteSearchCandidate) => void;
}) {
  const { input, setInput, debounced } = useDebouncedSearchState(280);
  const query = debounced.trim();

  const { data, isFetching, isError } = useQuery({
    queryKey: ['sermonNoteSearch', homeSpaceId, query] as const,
    queryFn: () =>
      api.get<CandidatesResponse>(
        `/api/spaces/${encodeURIComponent(homeSpaceId)}/connect-note-candidates`,
        { q: query, limit: 20, source: 'my-home' },
      ),
    enabled: Boolean(homeSpaceId),
    staleTime: 10_000,
  });

  const notes = useMemo(() => {
    const exclude = new Set(excludeNoteIds ?? []);
    return (data?.notes ?? []).filter((n) => !exclude.has(n.id));
  }, [data?.notes, excludeNoteIds]);
  const total = notes.length;
  const visible = useMemo(() => notes.slice(0, VISIBLE_LIMIT), [notes]);

  return (
    <div className="proto-note-search">
      <input
        type="search"
        className="proto-create-folder-sheet__name-input"
        placeholder={placeholder}
        value={input}
        disabled={disabled}
        aria-label={placeholder}
        onChange={(e) => setInput(e.target.value)}
      />

      {isError ? (
        <p className="proto-caption proto-service-editor__starter-hint">
          Could not reach your notes.
        </p>
      ) : visible.length === 0 ? (
        <p className="proto-caption proto-service-editor__starter-hint">
          {/* Two different silences: nothing written yet, versus nothing matching. */}
          {isFetching
            ? 'Looking…'
            : query
              ? 'No notes match that.'
              : 'Nothing written yet.'}
        </p>
      ) : (
        <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
          {visible.map((note) => (
            <button
              key={note.id}
              type="button"
              className="proto-church-tools__row"
              disabled={disabled}
              onClick={() => onPick(note)}
            >
              <span className="proto-church-tools__row-text">
                <span className="pds-list-title proto-church-tools__row-title proto-marquee">
                  <span>{note.title?.trim() || 'Untitled note'}</span>
                </span>
                {note.snippet ? (
                  <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                    {note.snippet}
                  </span>
                ) : null}
              </span>
              <span className="proto-church-tools__row-chevron" aria-hidden>
                <Icon name="plus" size={11} />
              </span>
            </button>
          ))}
        </div>
      )}

      {total > VISIBLE_LIMIT ? (
        /* Say the list is cut rather than letting the rail scroll on forever —
           the next move is a narrower search, not more scrolling. */
        <p className="proto-caption proto-service-editor__starter-hint">
          Showing {VISIBLE_LIMIT} of {total}. Keep typing to narrow it.
        </p>
      ) : null}
    </div>
  );
}
