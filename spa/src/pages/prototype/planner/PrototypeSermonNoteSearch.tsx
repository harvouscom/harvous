/**
 * Find one of your own notes to hang on a planned week — inline, in the
 * editor's own chrome.
 *
 * This replaces `PrototypeAddNotesPicker`, which the sermon editor borrowed
 * from the shared-thread sheet. That component is built for a different job:
 * attaching *several* notes to a Thread, with a list-scope toggle, an origin
 * filter and a multi-select bar. Dropped into a 344px planner rail it read as
 * a foreign panel bolted into the form — Derek's word was "a connect-a-thread
 * clone" — and it brought controls that mean nothing here, because a week
 * links exactly one note.
 *
 * Same endpoint, same `source: 'my-home'` reasoning as before (see the call
 * site's note on why My Home covers every note a pastor has written). What
 * changes is only the shape: a search field and rows in the planner's own row
 * anatomy, so the field reads as part of the editor rather than a window into
 * another feature.
 */
import { useMemo } from 'react';
import Icon from '@/components/react/Icon';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useDebouncedSearchState } from '../../../hooks/useDebouncedSearchState';

export type SermonNoteCandidate = {
  id: string;
  title: string | null;
  /** Server-trimmed preview; the row shows it under the title when present. */
  snippet?: string | null;
};

type CandidatesResponse = { notes?: SermonNoteCandidate[] };

/** How many rows the rail shows before asking you to narrow the search. */
const VISIBLE_LIMIT = 6;

export default function PrototypeSermonNoteSearch({
  homeSpaceId,
  disabled = false,
  onPick,
}: {
  /** The author's own space — the pool every candidate comes from. */
  homeSpaceId: string;
  disabled?: boolean;
  onPick: (note: SermonNoteCandidate) => void;
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

  const notes = useMemo(() => (data?.notes ?? []).slice(0, VISIBLE_LIMIT), [data?.notes]);
  const total = data?.notes?.length ?? 0;

  return (
    <div className="proto-sermon-note-search">
      <input
        type="search"
        className="proto-create-folder-sheet__name-input"
        placeholder="Search your notes"
        value={input}
        disabled={disabled}
        aria-label="Search your notes to link one to this week"
        onChange={(e) => setInput(e.target.value)}
      />

      {isError ? (
        <p className="proto-caption proto-service-editor__starter-hint">
          Could not reach your notes.
        </p>
      ) : notes.length === 0 ? (
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
          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              className="proto-church-tools__row"
              disabled={disabled}
              onClick={() => onPick(note)}
            >
              <span className="proto-church-tools__row-icon" aria-hidden>
                <Icon name="note-sticky" size={13} />
              </span>
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
