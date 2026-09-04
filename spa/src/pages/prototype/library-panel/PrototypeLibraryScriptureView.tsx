/**
 * The scripture index, at whichever of its three levels the view names.
 *
 * Books → passages → notes, mirroring `PrototypeSidebar`'s scripture branch. The one
 * thing it does not mirror is that branch's Notes/Passages chip at book level: the
 * sidebar keeps that toggle in component-local state, and the whole point of moving the
 * panel's drill into `LibraryPanelView` is that every level is addressable from outside
 * — Activity's "3 notes in Romans" chip has to be able to name where it lands.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { prototypeReadRouteTo } from '@/lib/prototype-path';
import { bookSlug } from '@/utils/bible-book-chapters';
import { sortDrillNoteBriefsByLastUpdated } from '@/utils/sorting';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { usePrototypeSpaceScriptureIndex } from '../../../hooks/queries/usePrototypeSpaceScriptureIndex';
import type { ScriptureIndexBook } from '../../../hooks/queries/usePrototypeSpaceScriptureIndex';
import ProtoSpaceLoading from '../ProtoSpaceLoading';
import PrototypeListEmptyState from '../PrototypeListEmptyState';
import PrototypeLibrarySegmented from './PrototypeLibrarySegmented';
import {
  SCRIPTURE_TESTAMENT_OPTIONS,
  scriptureTestamentMatches,
  type ScriptureTestamentFilter,
} from './library-panel-filters';
import type { ScriptureDrillState } from '../sidebar-universal-search';
import { LibraryNoteList } from './library-panel-lists';
import { useLibraryPanelData } from './library-panel-data';

/** One book in the index, as a collection card. */
export function LibraryScriptureBookCard({
  book,
  onOpen,
}: {
  book: ScriptureIndexBook;
  onOpen: () => void;
}) {
  return (
    <li className="proto-collection-grid-item">
      <button type="button" className="proto-collection-card" onClick={onOpen}>
        <span className="proto-collection-card__icon">
          <Icon name="scroll" size={13} aria-hidden />
        </span>
        <div className="proto-collection-card__body">
          <div className="proto-collection-card__title">{book.title}</div>
          <div className="proto-collection-card__count proto-collection-card__count--wrap">
            {book.passages.length} passage{book.passages.length !== 1 ? 's' : ''} · {book.noteCount}{' '}
            note{book.noteCount !== 1 ? 's' : ''}
          </div>
        </div>
      </button>
    </li>
  );
}

export default function PrototypeLibraryScriptureView({ drill }: { drill: ScriptureDrillState }) {
  const data = useLibraryPanelData();
  const { setLibraryPanelView, closeLibraryPanel } = useProtoShell();
  const navigate = useNavigate();
  const scriptureQuery = usePrototypeSpaceScriptureIndex(data.spaceId ?? undefined);
  const allBooks = useMemo(() => scriptureQuery.data ?? [], [scriptureQuery.data]);
  /* Book level only. Inside a book the testament is already decided, so the switch would be
     a control with one possible answer. */
  const [testament, setTestament] = useState<ScriptureTestamentFilter>('all');
  const books = useMemo(
    () => allBooks.filter((b) => scriptureTestamentMatches(testament, b.bookOrder)),
    [allBooks, testament],
  );

  const book =
    drill.level === 'books' ? null : books.find((b) => b.bookOrder === drill.bookOrder) ?? null;

  const passageNotes = useMemo(() => {
    if (drill.level !== 'notes') return [];
    const passage = book?.passages.find((p) => p.passageKey === drill.passageKey);
    return sortDrillNoteBriefsByLastUpdated(passage?.notes ?? [], data.notesById);
  }, [drill, book, data.notesById]);

  if (scriptureQuery.isLoading) return <ProtoSpaceLoading label="Loading scripture" />;
  if (scriptureQuery.isError) {
    return (
      <PrototypeListEmptyState
        iconName="book-open"
        title="Could not load Scripture"
        description="The scripture index did not load. Try again in a moment."
      />
    );
  }

  if (drill.level === 'books') {
    if (allBooks.length === 0) {
      return (
        <PrototypeListEmptyState
          iconName="book-open"
          title="No Scripture References"
          description="Add scripture references in your notes to build your index."
        />
      );
    }
    return (
      <>
        <PrototypeLibrarySegmented
          options={SCRIPTURE_TESTAMENT_OPTIONS}
          value={testament}
          onChange={setTestament}
          label="Testament"
        />
        {books.length === 0 ? (
          /* The switch stays above this, so the way out of an over-narrow filter is on
             screen with the nothing it found. */
          <PrototypeListEmptyState
            iconName="book-open"
            title="No books here"
            description="Nothing from this testament yet."
          />
        ) : (
      <ul className="proto-collection-grid">
        {books.map((b) => (
          <LibraryScriptureBookCard
            key={b.bookOrder}
            book={b}
            onOpen={() =>
              setLibraryPanelView({
                /* Drilling within Scripture stays on the Scripture tab — the drill is
                   pushed onto the tab, never a move to a different one. */
                tab: 'scripture',
                drill: {
                  kind: 'scripture',
                  drill: { level: 'passages', bookOrder: b.bookOrder, bookTitle: b.title },
                },
              })
            }
          />
        ))}
      </ul>
        )}
      </>
    );
  }

  if (drill.level === 'passages') {
    const passages = book?.passages ?? [];
    if (passages.length === 0) {
      return (
        <PrototypeListEmptyState
          iconName="scroll"
          title="No passages yet"
          description="Notes citing this book will list their passages here."
        />
      );
    }
    return (
      <ul className="proto-note-list" role="list">
        {passages.map((p) => (
          <li key={p.passageKey} className="proto-scripture-passage-row">
            <button
              type="button"
              className="proto-note-row"
              onClick={() =>
                setLibraryPanelView({
                  tab: 'scripture',
                  drill: {
                    kind: 'scripture',
                    drill: {
                      level: 'notes',
                      bookOrder: p.bookOrder,
                      passageKey: p.passageKey,
                      passageTitle: p.displayRef,
                    },
                  },
                })
              }
            >
              <div className="pds-list-title">{p.displayRef}</div>
              <div className="pds-list-preview">
                {p.noteCount} note{p.noteCount !== 1 ? 's' : ''}
              </div>
            </button>
            {/* Reading the chapter is a second intent from "show me what I wrote about
                it", so it gets its own target rather than taking the drill away. */}
            <button
              type="button"
              className="proto-scripture-passage-row__read"
              aria-label={`Read ${p.displayRef} in the Bible reader`}
              title="Read chapter"
              onClick={() => {
                const title = book?.title;
                if (!title) return;
                void navigate({
                  to: prototypeReadRouteTo(),
                  params: { book: bookSlug(title), chapter: String(p.chapter) },
                  search: { v: String(p.verseStart), t: undefined, req: String(Date.now()) },
                });
                closeLibraryPanel();
              }}
            >
              <Icon name="book-open" size={14} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    );
  }

  if (passageNotes.length === 0) {
    return (
      <PrototypeListEmptyState
        iconName="note-sticky"
        title="No notes here"
        description="Nothing cites this passage yet."
      />
    );
  }
  return (
    <LibraryNoteList
      rows={passageNotes.map((n) => data.resolveDrillNoteRow(n))}
      data={data}
    />
  );
}
