/**
 * One tab's list — everything of that kind, with nothing truncated.
 *
 * Seven tabs, one switch. Each is a full list rather than a preview of one, which is the
 * change from the browse home that used to sit above these: there is no "See all" to widen
 * because nothing here was ever narrowed. All and Folders are large enough to live in their
 * own files; the remaining four are small enough to stay here beside the switch that picks
 * them.
 */
import { useMemo, useState } from 'react';
import PrototypeListEmptyState from '../PrototypeListEmptyState';
import PrototypeLibrarySegmented from './PrototypeLibrarySegmented';
import { SIDEBAR_NO_MATCH_COPY } from '../sidebar-no-match-copy';
import { highlightKindMatches } from '../sidebar-universal-search';
import { HIGHLIGHT_KIND_OPTIONS, type HighlightKindFilter } from '../sidebar-search-types';
import PrototypeResourceLibraryList from '../PrototypeResourceLibraryList';
import ProtoSpaceLoading from '../ProtoSpaceLoading';
import { ProtoNotesListLoading } from '../sidebar-rows';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { usePrototypeSpaceStudyThreadHighlights } from '../../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { usePrototypeStudyThreads } from '../../../hooks/queries/usePrototypeStudyThreads';
import { useSpaceGroupThreads } from '../../../hooks/queries/useSpaceGroupThreads';
import type { LibraryTab } from './library-panel-view';
import type { LibrarySelection } from './use-library-selection';
import PrototypeLibraryAllView from './PrototypeLibraryAllView';
import PrototypeLibraryFoldersView from './PrototypeLibraryFoldersView';
import PrototypeLibraryScriptureView from './PrototypeLibraryScriptureView';
import {
  LibraryHighlightList,
  LibraryLoadMore,
  LibraryNoteList,
  LibrarySharedThreadCards,
  LibraryThreadCards,
} from './library-panel-lists';
import { useLibraryPanelData } from './library-panel-data';

export default function PrototypeLibraryTabView({
  tab,
  selection,
}: {
  tab: LibraryTab;
  selection: LibrarySelection;
}) {
  switch (tab) {
    case 'all':
      return <PrototypeLibraryAllView selection={selection} />;
    case 'notes':
      return <NotesSection selection={selection} />;
    case 'folders':
      return <PrototypeLibraryFoldersView selection={selection} />;
    case 'threads':
      return <ThreadsSection selection={selection} />;
    case 'highlights':
      return <HighlightsSection selection={selection} />;
    /* The scripture tab *is* the book level of the scripture drill, so it renders the
       same view rather than a parallel list that would then have to be kept in step
       with it. */
    case 'scripture':
      return <PrototypeLibraryScriptureView drill={{ level: 'books' }} />;
    case 'resources':
      return <ResourcesSection />;
  }
}

function NotesSection({ selection }: { selection: LibrarySelection }) {
  const data = useLibraryPanelData();
  if (data.notesPhase === 'error') {
    return (
      <PrototypeListEmptyState
        iconName="note-sticky"
        title="Could not load notes"
        description="Your notes did not load. Try again in a moment."
      />
    );
  }
  if (data.notesPhase === 'loading') return <ProtoNotesListLoading />;
  if (data.notes.length === 0) {
    return (
      <PrototypeListEmptyState
        iconName="note-sticky"
        title="No Notes"
        description="Create your first note to get started."
      />
    );
  }
  return (
    <>
      <LibraryNoteList rows={data.notes} data={data} selection={selection} />
      <LibraryLoadMore data={data} />
    </>
  );
}

function ThreadsSection({ selection }: { selection: LibrarySelection }) {
  const data = useLibraryPanelData();
  const { setLibraryPanelView } = useProtoShell();
  /* Personal Threads are graph clusters, a shared space's are records — one query
     each, and only the one that applies to the active space is enabled. */
  const clustersQuery = usePrototypeStudyThreads(
    data.isScopedSharedSpace ? undefined : data.spaceId ?? undefined,
  );
  const groupQuery = useSpaceGroupThreads(
    data.isScopedSharedSpace ? data.spaceId ?? undefined : undefined,
  );
  const query = data.isScopedSharedSpace ? groupQuery : clustersQuery;

  /* `isPending`, not `isLoading` — a still-disabled query reports `isLoading: false`
     with undefined data, which the list would read as "loaded, and empty". */
  if (query.isPending) return <ProtoSpaceLoading label="Loading Threads" />;
  if (query.isError) {
    return (
      <PrototypeListEmptyState
        iconName="arrow-right-arrow-left"
        title="Could not load Threads"
        description="Your Threads did not load. Try again in a moment."
      />
    );
  }

  const open = (threadId: string) =>
    setLibraryPanelView({ tab: 'threads', drill: { kind: 'thread', threadId } });

  if (data.isScopedSharedSpace) {
    const threads = groupQuery.data ?? [];
    if (threads.length === 0) return <NoThreads />;
    return <LibrarySharedThreadCards threads={threads} onOpen={open} />;
  }
  const clusters = clustersQuery.data ?? [];
  if (clusters.length === 0) return <NoThreads />;
  return <LibraryThreadCards clusters={clusters} onOpen={open} selection={selection} />;
}

function NoThreads() {
  return (
    <PrototypeListEmptyState
      iconName="arrow-right-arrow-left"
      title="No Threads"
      description="Connect notes to each other and the Threads they form gather here."
    />
  );
}

function HighlightsSection({ selection }: { selection: LibrarySelection }) {
  const data = useLibraryPanelData();
  const highlightsQuery = usePrototypeSpaceStudyThreadHighlights(data.spaceId ?? undefined);
  const [kind, setKind] = useState<HighlightKindFilter>('all');
  const all = highlightsQuery.data ?? [];
  const rows = useMemo(
    () => all.filter((row) => highlightKindMatches(kind, row.entryKind)),
    [all, kind],
  );

  if (highlightsQuery.isLoading) return <ProtoSpaceLoading label="Loading highlights" />;
  if (highlightsQuery.isError) {
    return (
      <PrototypeListEmptyState
        iconName="highlighter"
        title="Could not load highlights"
        description="Your highlights did not load. Try again in a moment."
      />
    );
  }
  if (all.length === 0) {
    return (
      <PrototypeListEmptyState
        iconName="highlighter"
        title="No Highlights"
        description={
          data.isScopedSharedSpace
            ? 'Selections and passage highlights from notes in this space appear here.'
            : 'Selections and passage highlights from your notes appear here.'
        }
      />
    );
  }
  return (
    <>
      <PrototypeLibrarySegmented
        options={HIGHLIGHT_KIND_OPTIONS}
        value={kind}
        onChange={setKind}
        label="Highlight kind"
      />
      {rows.length === 0 ? (
        <PrototypeListEmptyState
          iconName="highlighter"
          title={SIDEBAR_NO_MATCH_COPY.noHighlightsMatch}
          description="Try another kind."
        />
      ) : (
        <LibraryHighlightList rows={rows} data={data} selection={selection} />
      )}
    </>
  );
}

function ResourcesSection() {
  const data = useLibraryPanelData();
  return (
    <PrototypeResourceLibraryList
      /* The panel's search is a separate surface (see PrototypeLibraryBody), so this
         list is never filtered from here — it shows the shelf. */
      query=""
      onOpenResource={data.openResource}
      /* Inside a shared space, "this space" means that room's shelf; on My Home the
         personal and church shelves are what the list already sections for itself. */
      spaceId={data.isScopedSharedSpace ? data.spaceId : null}
      /* The panel has the width for the switch its other tabs wear. */
      shelfFilterAs="switch"
    />
  );
}
