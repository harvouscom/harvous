/**
 * The Library panel's search rows — glyph tiles — at panel and phone width.
 *
 * Each frame draws the real pieces — `ResultGroup`, `ChordRow`, the shared row presenter with
 * `LibrarySearchRowBody`, `LibraryVerseResults` — over fixtures, under the same
 * `.proto-library-tile-rows` root the panel uses, so a change to the rows' block in
 * prototype-shell.css lands here and in the panel alike.
 *
 * The gallery is not `html.harvous-prototype-route`, so the route overrides' type axes do not
 * apply here. Judge layout here; judge finish in the panel itself.
 */
import { useState, type ReactNode } from 'react';
import PrototypeSidebarSearchResultItem from '../../prototype/PrototypeSidebarSearchResultItem';
import type { SidebarSearchResult } from '../../prototype/sidebar-search-types';
import type { SpaceNoteRow } from '../../../hooks/queries/useSpace';
import type { PrototypeHighlightStudyThreadRow } from '../../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import type { VerseSearchHit } from '../../../hooks/queries/useScriptureVerseSearch';
import LibraryVerseResults from '../../prototype/library-panel/LibraryVerseResults';
import PrototypeLibrarySegmented from '../../prototype/library-panel/PrototypeLibrarySegmented';
import { makeLibrarySearchRowBody } from '../../prototype/library-panel/LibrarySearchRowBody';
import {
  ChordRow,
  ResultGroup,
  resultLeadIcon,
} from '../../prototype/library-panel/library-search-groups';
import { VERSE_MATCH_END as E, VERSE_MATCH_START as S } from '@/utils/verse-search-snippet';

const QUERY = 'abide';
const REF_QUERY = 'John 15';

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const NOTES: SpaceNoteRow[] = [
  {
    id: 'n1',
    title: 'Abide in me',
    content:
      '<p>Jesus doesn’t say “try harder to bear fruit”. He says abide — stay, remain, make your home here. The fruit is his work; the staying is mine.</p>',
    updatedAt: ago(0.1),
    primaryCollection: 'Gospel of John',
    isPinned: true,
  },
  {
    id: 'n2',
    title: 'Sunday notes — the vine and the branches',
    content:
      '<p>Pastor Ruth opened with the vineyards outside Jerusalem and how the old wood is cut back each winter. Pruning is not punishment. Three questions for the week: where am I trying to produce on my own? What would it look like to abide when the week is full? Who in our group needs to hear this?</p>',
    updatedAt: ago(3),
    primaryCollection: 'Sermons',
  },
  {
    id: 'n3',
    title: 'Prayer journal',
    content: '',
    updatedAt: ago(9),
    contentEncrypted: true,
    primaryCollection: 'Personal',
  },
];

const NOTES_BY_ID = new Map(NOTES.map((note) => [note.id, note]));

const HIGHLIGHT: PrototypeHighlightStudyThreadRow = {
  id: 'h1',
  parentNoteId: 'n2',
  parentNoteTitle: 'Sunday notes — the vine and the branches',
  spaceId: null,
  entryKind: 'workspace',
  highlightAccentRaw: null,
  sourceSnippet: null,
  focusTitle: null,
  notesBody: null,
  miniNoteBody: 'This is the whole week in one line. Abide first, then the doing.',
  linkedNoteId: null,
  linkedNoteTitle: null,
  anchorLocation: null,
  anchorLength: null,
  anchorTextSnapshot: 'Pruning is not punishment.',
  scriptureReference: null,
  scripturePassageTranslation: null,
  scripturePassageExcerpt: null,
  isArchived: false,
  highlightListEditedAt: null,
  createdAt: ago(3),
  updatedAt: ago(3),
};

const HIGHLIGHTS_BY_ID = new Map([[HIGHLIGHT.id, HIGHLIGHT]]);

const RESULTS: SidebarSearchResult[] = [
  { id: 'note:n1', kind: 'note', title: 'Abide in me', noteId: 'n1' },
  { id: 'note:n2', kind: 'note', title: 'Sunday notes — the vine and the branches', noteId: 'n2' },
  {
    id: 'highlight:h1',
    kind: 'highlight',
    title: 'Pruning is not punishment.',
    subtitle: 'This is the whole week in one line. Abide first, then the doing. — From Sunday notes',
    highlightEntryKind: 'workspace',
    highlightId: 'h1',
    noteId: 'n2',
  },
  { id: 'threadCluster:t1', kind: 'threadCluster', title: 'Abiding', subtitle: '6 notes', threadClusterId: 't1' },
  { id: 'folder:Gospel of John', kind: 'folder', title: 'Gospel of John', subtitle: '14 notes', folderKey: 'Gospel of John' },
  { id: 'resource:r1', kind: 'resource', title: 'Abide: a guided week in John 15', subtitle: 'bibleproject.com' },
  { id: 'note:n3', kind: 'note', title: 'Prayer journal', noteId: 'n3' },
];

/* The All tab before you type: every kind, newest first, nothing marked. */
const BROWSE_RESULTS: SidebarSearchResult[] = [
  RESULTS[0],
  { id: 'folder:Gospel of John', kind: 'folder', title: 'Gospel of John', subtitle: '14 notes', folderKey: 'Gospel of John' },
  RESULTS[1],
  RESULTS[2],
  { id: 'threadCluster:t1', kind: 'threadCluster', title: 'Abiding', subtitle: '6 notes', threadClusterId: 't1' },
  { id: 'scriptureBook:2', kind: 'scriptureBook', title: 'Exodus', subtitle: '31 passages · 15 notes', scriptureBookOrder: 2 },
  { id: 'resource:r1', kind: 'resource', title: 'Abide: a guided week in John 15', subtitle: 'bibleproject.com' },
  RESULTS[6],
];

const REFERENCE_RESULTS: SidebarSearchResult[] = [
  {
    id: 'scriptureReference:John 15',
    kind: 'scriptureReference',
    title: 'John 15',
    subtitle: 'Read passage',
    scriptureReference: 'John 15:1-27',
  },
  { id: 'scriptureBook:43', kind: 'scriptureBook', title: 'John', subtitle: '9 passages · 14 notes', scriptureBookOrder: 43 },
  {
    id: 'scripturePassage:43:15.1-11',
    kind: 'scripturePassage',
    title: 'John 15:1–11',
    subtitle: '4 notes',
    scriptureBookOrder: 43,
    scripturePassageKey: '15.1-11',
  },
];

const VERSES: VerseSearchHit[] = [
  {
    book: 'John',
    chapter: 15,
    verse: 4,
    reference: 'John 15:4',
    snippet: `Remain in me, and I will remain in you. Just as the branch cannot bear fruit by itself unless it ${S}remains${E} in the vine…`,
    translation: 'NET',
  },
  {
    book: '1 John',
    chapter: 2,
    verse: 28,
    reference: '1 John 2:28',
    snippet: `And now, little children, ${S}remain${E} in him, so that whenever he appears we may have confidence…`,
    translation: 'NET',
  },
];

const noop = () => {};

function ResultRows({
  results,
  query,
  activeNoteId,
}: {
  results: SidebarSearchResult[];
  query: string;
  activeNoteId?: string;
}) {
  const renderBody = makeLibrarySearchRowBody({
    query,
    notesById: NOTES_BY_ID,
    highlightsById: HIGHLIGHTS_BY_ID,
  });
  return (
    <ul className="proto-note-list">
      {results.map((result) => (
        <PrototypeSidebarSearchResultItem
          key={result.id}
          result={result}
          active={result.kind === 'note' && result.noteId === activeNoteId}
          onActivate={noop}
          notesById={NOTES_BY_ID}
          highlightsById={HIGHLIGHTS_BY_ID}
          leadIcon={resultLeadIcon(result)}
          renderBody={renderBody}
        />
      ))}
    </ul>
  );
}

const FRAMES = [
  { id: 'panel', label: 'Panel', note: 'The Library panel at its widest.' },
  { id: 'phone', label: 'Phone', note: 'The same panel as a sheet on a phone.' },
] as const;

function Frame({ label, note, children }: { label: string; note: string; children: ReactNode }) {
  return (
    <section className="pds-gallery-search-rows__frame">
      <header className="pds-gallery-search-rows__frame-head">
        <p className="pds-gallery-search-rows__frame-title">{label}</p>
        <p className="pds-caption">{note}</p>
      </header>
      <div className="pds-gallery-search-rows__panel">
        <div className="proto-sidebar-search-results proto-library-tile-rows">
          <div className="proto-sidebar-search-results__body">{children}</div>
        </div>
      </div>
    </section>
  );
}

type Sample = 'browse' | 'words' | 'reference';

export default function LibrarySearchRowsScene() {
  const [sample, setSample] = useState<Sample>('browse');

  return (
    <div className="pds-gallery-stack">
      <p className="pds-caption">
        Each kind leads with a tile; the open row &mdash; &ldquo;Abide in me&rdquo; &mdash; fills its tile with the
        accent. Matched words carry the highlight&rsquo;s underline, and a note&rsquo;s second line is cut around the
        match.
      </p>
      <div className="pds-gallery-search-rows__controls">
        <PrototypeLibrarySegmented
          options={[
            { id: 'browse', label: 'Browse' },
            { id: 'words', label: `“${QUERY}”` },
            { id: 'reference', label: `“${REF_QUERY}”` },
          ]}
          value={sample}
          onChange={setSample}
          label="Sample query"
        />
      </div>
      <div className="pds-gallery-search-rows">
        {FRAMES.map((frame) => (
          <div key={frame.id} className={`pds-gallery-search-rows__slot pds-gallery-search-rows__slot--${frame.id}`}>
            <Frame label={frame.label} note={frame.note}>
              {sample === 'browse' ? (
                <ResultGroup heading="Everything">
                  <ResultRows results={BROWSE_RESULTS} query="" activeNoteId="n1" />
                </ResultGroup>
              ) : sample === 'words' ? (
                <>
                  <ResultGroup heading="Go to" count={1}>
                    <ul className="proto-note-list">
                      <ChordRow icon="book-open" label="Bible" keys="G B" kind="destination" onActivate={noop} />
                    </ul>
                  </ResultGroup>
                  <ResultGroup heading="Results" count={RESULTS.length}>
                    <ResultRows results={RESULTS} query={QUERY} activeNoteId="n1" />
                  </ResultGroup>
                  <ResultGroup heading="In the Bible" meta="NET" count={VERSES.length} alwaysLabelled>
                    <LibraryVerseResults hits={VERSES} onOpen={noop} />
                  </ResultGroup>
                </>
              ) : (
                <>
                  <ResultGroup heading="Actions" count={1}>
                    <ul className="proto-note-list">
                      <ChordRow icon="folder" label="Move to a folder…" keys="M" onActivate={noop} />
                    </ul>
                  </ResultGroup>
                  <ResultGroup heading="Scripture" count={REFERENCE_RESULTS.length}>
                    <ResultRows results={REFERENCE_RESULTS} query={REF_QUERY} />
                  </ResultGroup>
                </>
              )}
            </Frame>
          </div>
        ))}
      </div>
    </div>
  );
}
