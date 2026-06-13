/**
 * Home space view — the 'space' sidebar layer. A greeting with one consolidated
 * lead theme + liturgical-season line, Today's Passage, then a set of cards:
 * continue, a highlight to revisit, an older note to revisit, a study-thread
 * spotlight, and a loose-notes nudge. Each card renders only when it qualifies.
 * Copy follows docs/BRAND_VOICE.md — friend-over-coffee, no hype, no em dashes.
 */
import { useMemo, useRef } from 'react';
import Icon from '@/components/react/Icon';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { ScriptureIndexBook } from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import { useTagsList } from '../../hooks/queries/useTagsList';
import { usePrototypeStudyThreads } from '../../hooks/queries/usePrototypeStudyThreads';
import {
  usePrototypeSpaceStudyThreadHighlights,
  type PrototypeHighlightStudyThreadRow,
} from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { getCachedUserNames, useProfile } from '../../hooks/queries/useProfile';
import { useVotdToday } from '../../hooks/queries/useVotdToday';
import type { PrototypeNotesListPhase } from '@/utils/prototype-notes-list-phase';
import { isPrototypeHomeContentReady, isQuerySettled } from '@/utils/prototype-home-ready';
import {
  computeActivityRhythm,
  computeActivityStreak,
  countLooseNotes,
  deriveTopBooks,
  deriveTopFolders,
  deriveTopTags,
  deriveTopThread,
  formatHomeActivityLeadSuffix,
  formatHomeNoteCount,
  greetingForHour,
  pickContinueNote,
  pickRevisitNote,
  pickSpotlightThread,
  selectHomeLeadTheme,
  type HomeLeadTheme,
} from '@/utils/prototype-home-trends';
import { currentLiturgicalSeason } from '@/utils/liturgical-season';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { protoRelativeCaption, protoRelativeCaptionAbbrev } from './proto-time';
import {
  highlightEntryKindIconName,
  prototypeHighlightListTitle,
  prototypeHighlightRecencyIso,
  prototypeHighlightSubtitlePreview,
} from './proto-highlight-subtitle';
import { loadPinnedHighlightIds } from './proto-pinned-stores';
import PrototypeDailyPassagePill from './PrototypeDailyPassagePill';
import { useProtoShell } from '../../layouts/proto-shell-context';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Resurface a note only after it's gone quiet for two weeks. */
const REVISIT_MIN_AGE_MS = 14 * DAY_MS;
/** Don't nudge "revisit" until there's a real backlog. */
const REVISIT_MIN_NOTES = 5;
/** Don't nag about loose notes until a few have piled up. */
const LOOSE_MIN = 3;

type Props = {
  homeSpaceId: string;
  notes: SpaceNoteRow[];
  notesListPhase: PrototypeNotesListPhase;
  hasMoreNotes: boolean;
  noteTotal?: number;
  scriptureBooks: ScriptureIndexBook[];
  scriptureSettled: boolean;
  onOpenNote: (row: SpaceNoteRow) => void;
  prefetchNote: (row: SpaceNoteRow) => void;
  onOpenScriptureBook: (bookOrder: number) => void;
  onOpenHighlight: (row: PrototypeHighlightStudyThreadRow) => void;
};

function ProtoHomeLoading() {
  return (
    <div className="proto-home-loading">
      <span className="load-more-indicator" aria-label="Loading home">
        <span className="load-more-indicator__dot" />
        <span className="load-more-indicator__dot" />
        <span className="load-more-indicator__dot" />
      </span>
    </div>
  );
}

/** Pinned first, then most recently edited — the highlight worth resurfacing. */
function pickSpotlightHighlight(
  rows: PrototypeHighlightStudyThreadRow[],
  spaceId: string,
): PrototypeHighlightStudyThreadRow | undefined {
  if (rows.length === 0) return undefined;
  const pinned = new Set(loadPinnedHighlightIds(spaceId));
  return [...rows].sort((a, b) => {
    const ap = pinned.has(a.id) ? 1 : 0;
    const bp = pinned.has(b.id) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const at = Date.parse(prototypeHighlightRecencyIso(a) ?? '') || 0;
    const bt = Date.parse(prototypeHighlightRecencyIso(b) ?? '') || 0;
    return bt - at;
  })[0];
}

function HomeGreeting({
  notes,
  countForLogic,
  hasMoreForLogic,
  lead,
  onOpenScriptureBook,
}: {
  notes: SpaceNoteRow[];
  countForLogic: number;
  hasMoreForLogic: boolean;
  lead: HomeLeadTheme;
  onOpenScriptureBook: (bookOrder: number) => void;
}) {
  const { data: profile } = useProfile();
  const {
    setSidebarListMode,
    setSidebarFolderDrilldown,
    setSidebarThreadDrilldownId,
    ensureSidebarExpanded,
    openSidebarTagSearch,
  } = useProtoShell();

  const firstName = useMemo(() => {
    const fromProfile = profile?.firstName?.trim() || profile?.displayName?.split(' ')[0]?.trim();
    if (fromProfile && fromProfile !== 'User') return fromProfile;
    const cached = getCachedUserNames()?.firstName?.trim();
    return cached || '';
  }, [profile]);

  const streak = useMemo(() => computeActivityStreak(notes, new Date()), [notes]);
  const rhythm = useMemo(() => computeActivityRhythm(notes), [notes]);
  const season = useMemo(() => currentLiturgicalSeason(new Date()), []);

  const hello = `${greetingForHour(new Date().getHours())}${firstName ? `, ${firstName}` : ''}.`;
  const activityTail = useMemo(
    () => formatHomeActivityLeadSuffix(rhythm, streak),
    [rhythm, streak],
  );
  const savedSoFarEnd = activityTail ? <>, {activityTail}.</> : <>.</>;

  const singleNoteAddedRel = useMemo(() => {
    if (countForLogic !== 1 || hasMoreForLogic || notes.length === 0) return '';
    const note = notes[0];
    return protoRelativeCaption(note.lastVisited ?? note.updatedAt ?? note.createdAt ?? null);
  }, [notes, countForLogic, hasMoreForLogic]);

  const countChip = (
    <button
      type="button"
      className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--count"
      aria-label="View notes list"
      onClick={() => {
        setSidebarListMode('notes');
        ensureSidebarExpanded();
      }}
    >
      <span>{formatHomeNoteCount(countForLogic, hasMoreForLogic)}</span>
    </button>
  );

  const seasonLine = season ? (
    <button
      type="button"
      className="proto-glass-surface proto-home-greeting__season"
      title={season.label}
      // Stub: a future recall/review pass will resurface notes from this season.
      onClick={() => {}}
    >
      <Icon name="calendar" size={11} aria-hidden />
      <span>{season.label}</span>
    </button>
  ) : null;

  // Brand new space — keep it warm, the empty-state card below carries the CTA.
  if (countForLogic === 0) {
    return (
      <>
        <p className="proto-home-greeting">
          <span className="proto-home-greeting__hello">{hello}</span>{' '}
          Welcome in. Save a thought whenever it comes, and Home fills in from there.
        </p>
        {seasonLine}
      </>
    );
  }

  const threadChip =
    lead.kind === 'thread' ? (
      <button
        type="button"
        className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--thread"
        aria-label={`Open study thread ${lead.thread.title}`}
        onClick={() => {
          const slug = lead.thread.id.startsWith('note_') ? lead.thread.id.slice('note_'.length) : lead.thread.id;
          setSidebarListMode('threads');
          setSidebarThreadDrilldownId(slug);
          ensureSidebarExpanded();
        }}
      >
        <Icon name="arrow-right-arrow-left" size={10} aria-hidden />
        <span>{lead.thread.title}</span>
      </button>
    ) : null;

  const bookChip =
    lead.kind === 'book' ? (
      <button
        type="button"
        className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--passage"
        aria-label={`Open ${lead.book.title} in Scripture`}
        onClick={() => onOpenScriptureBook(lead.book.bookOrder)}
      >
        <Icon name="book" size={11} aria-hidden />
        <span>{lead.book.title}</span>
      </button>
    ) : null;

  const folderChip =
    lead.kind === 'folder' ? (
      <button
        type="button"
        className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--folder"
        aria-label={`Browse folder ${lead.folder.name}`}
        onClick={() => {
          setSidebarListMode('folders');
          setSidebarFolderDrilldown(lead.folder.name);
          ensureSidebarExpanded();
        }}
      >
        <Icon name="folder" size={10} aria-hidden />
        <span>{lead.folder.name}</span>
      </button>
    ) : null;

  const tagChip =
    lead.kind === 'tag' ? (
      <button
        type="button"
        className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--tag"
        aria-label={`Search notes tagged ${lead.tag.name}`}
        onClick={() => openSidebarTagSearch({ tagId: lead.tag.id, tagName: lead.tag.name })}
      >
        <Icon name="tag" size={10} aria-hidden />
        <span>{lead.tag.name}</span>
      </button>
    ) : null;

  const leadSentence = (() => {
    switch (lead.kind) {
      case 'thread':
        return <>You&apos;ve been working through {threadChip}, with {countChip} saved so far{savedSoFarEnd}</>;
      case 'book':
        if (lead.tone === 'single-note') {
          return (
            <>
              You added {bookChip}
              {singleNoteAddedRel ? <> {singleNoteAddedRel}</> : null}. {countChip} saved so far{savedSoFarEnd}
            </>
          );
        }
        if (lead.tone === 'mentioned-once') {
          return <>{bookChip} shows up in your notes, with {countChip} saved so far{savedSoFarEnd}</>;
        }
        return <>You keep coming back to {bookChip}, with {countChip} saved so far{savedSoFarEnd}</>;
      case 'folder':
        return <>{folderChip} keeps filling up, with {countChip} saved so far{savedSoFarEnd}</>;
      case 'tag':
        return <>{tagChip} keeps showing up in your notes, with {countChip} saved so far{savedSoFarEnd}</>;
      default:
        return <>You have {countChip} saved so far{savedSoFarEnd}</>;
    }
  })();

  return (
    <>
      <p className="proto-home-greeting">
        <span className="proto-home-greeting__hello">{hello}</span>{' '}
        {leadSentence}
      </p>
      {seasonLine}
    </>
  );
}

/** Compact note card (continue / revisit) — shared markup. */
function HomeNoteCard({
  eyebrow,
  iconName,
  note,
  onOpenNote,
  prefetchNote,
}: {
  eyebrow: string;
  iconName: string;
  note: SpaceNoteRow;
  onOpenNote: (row: SpaceNoteRow) => void;
  prefetchNote: (row: SpaceNoteRow) => void;
}) {
  const title = stripServerAutoUntitledNoteTitleForDisplay(note.title?.trim() ?? '') || 'New Note';
  const preview = note.content ? stripHtmlForListPreview(note.content, 90) : '';
  const rel = protoRelativeCaptionAbbrev(note.updatedAt ?? note.createdAt ?? null);
  return (
    <button
      type="button"
      className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
      onClick={() => onOpenNote(note)}
      onMouseEnter={() => prefetchNote(note)}
      onFocus={() => prefetchNote(note)}
    >
      <p className="proto-caption proto-home-card__eyebrow">{eyebrow}</p>
      <div className="proto-home-card__body">
        <div className="proto-home-card__title-row">
          <span className="proto-home-card__icon-orb" aria-hidden>
            <Icon name={iconName} size={13} />
          </span>
          <p className="pds-list-title proto-home-card__title">{title}</p>
          <span className="proto-home-card__chevron" aria-hidden>
            <Icon name="chevron-right" size={11} />
          </span>
        </div>
        {preview ? <p className="pds-list-preview proto-home-card__preview">{preview}</p> : null}
        <div className="proto-home-card__meta">
          {rel ? <span className="proto-home-card__meta-item">{rel}</span> : null}
          {rel && note.primaryCollection ? <span className="proto-home-card__meta-sep">in</span> : null}
          {note.primaryCollection ? (
            <span className="proto-home-card__meta-item">
              <Icon name="folder" size={10} aria-hidden />
              {note.primaryCollection}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

export default function PrototypeSidebarHomeView({
  homeSpaceId,
  notes,
  notesListPhase,
  hasMoreNotes,
  noteTotal,
  scriptureBooks,
  scriptureSettled,
  onOpenNote,
  prefetchNote,
  onOpenScriptureBook,
  onOpenHighlight,
}: Props) {
  const tagsQuery = useTagsList();
  const threadsQuery = usePrototypeStudyThreads(homeSpaceId);
  const highlightsQuery = usePrototypeSpaceStudyThreadHighlights(homeSpaceId);
  const votdQuery = useVotdToday({ enabled: Boolean(homeSpaceId) });

  const {
    setSidebarListMode,
    setSidebarFolderDrilldown,
    setSidebarThreadDrilldownId,
    ensureSidebarExpanded,
  } = useProtoShell();

  const tagsSettled = isQuerySettled(tagsQuery.isPending, tagsQuery.data != null);
  const threadsSettled = isQuerySettled(threadsQuery.isPending, threadsQuery.data != null);
  const highlightsSettled = isQuerySettled(highlightsQuery.isPending, highlightsQuery.data != null);
  const votdSettled =
    isQuerySettled(votdQuery.isPending, votdQuery.data != null) || Boolean(votdQuery.isError);
  const contentReady = isPrototypeHomeContentReady({
    notesListPhase,
    scriptureSettled,
    tagsSettled,
    threadsSettled,
    highlightsSettled,
    votdSettled,
  });

  const shouldAnimateRef = useRef(false);
  if (contentReady && !shouldAnimateRef.current) {
    shouldAnimateRef.current = true;
  }

  const tags = tagsQuery.data?.tags ?? [];
  const threads = threadsQuery.data ?? [];
  const highlights = highlightsQuery.data ?? [];
  const votd = votdQuery.data;

  // Exact server total wins over the loaded-page count when present.
  const exactTotal = noteTotal ?? null;
  const countForLogic = exactTotal ?? notes.length;
  const hasMoreForLogic = exactTotal != null ? false : hasMoreNotes;

  const topThread = useMemo(() => deriveTopThread(threads, 1)[0], [threads]);
  const topBook = useMemo(() => deriveTopBooks(scriptureBooks, 1)[0], [scriptureBooks]);
  const topFolder = useMemo(() => deriveTopFolders(notes, 1)[0], [notes]);
  const topTag = useMemo(() => deriveTopTags(tags, 1)[0], [tags]);
  const lead = useMemo(
    () =>
      selectHomeLeadTheme({
        thread: topThread,
        book: topBook,
        folder: topFolder,
        tag: topTag,
        noteCount: countForLogic,
        hasMoreNotes: hasMoreForLogic,
        today: new Date(),
      }),
    [topThread, topBook, topFolder, topTag, countForLogic, hasMoreForLogic],
  );

  const continueNote = useMemo(() => pickContinueNote(notes), [notes]);
  const revisitNote = useMemo(
    () =>
      countForLogic >= REVISIT_MIN_NOTES
        ? pickRevisitNote(notes, { nowMs: Date.now(), excludeId: continueNote?.id, minAgeMs: REVISIT_MIN_AGE_MS })
        : undefined,
    [notes, continueNote, countForLogic],
  );
  const spotlightThread = useMemo(
    () => pickSpotlightThread(threads, { excludeId: lead.kind === 'thread' ? lead.thread.id : undefined }),
    [threads, lead],
  );
  const spotlightHighlight = useMemo(() => pickSpotlightHighlight(highlights, homeSpaceId), [highlights, homeSpaceId]);
  const looseCount = useMemo(() => countLooseNotes(notes), [notes]);

  if (!contentReady) {
    return <ProtoHomeLoading />;
  }

  const openThread = (threadId: string) => {
    const slug = threadId.startsWith('note_') ? threadId.slice('note_'.length) : threadId;
    setSidebarListMode('threads');
    setSidebarThreadDrilldownId(slug);
    ensureSidebarExpanded();
  };

  return (
    <div className={`proto-home-view${shouldAnimateRef.current ? ' proto-home-view--enter' : ''}`}>
      <div className="proto-home-section">
        <HomeGreeting
          notes={notes}
          countForLogic={countForLogic}
          hasMoreForLogic={hasMoreForLogic}
          lead={lead}
          onOpenScriptureBook={onOpenScriptureBook}
        />
      </div>

      {votd ? (
        <div className="proto-home-section">
          <PrototypeDailyPassagePill homeSpaceId={homeSpaceId} notes={notes} votd={votd} />
        </div>
      ) : null}

      {notesListPhase === 'empty' ? (
        <div className="proto-home-section">
          <div className="proto-glass-surface proto-glass-surface--panel proto-home-card">
            <div className="proto-home-card__body">
              <div className="proto-home-card__title-row">
                <span className="proto-home-card__icon-orb" aria-hidden>
                  <Icon name="note-sticky" size={13} />
                </span>
                <p className="pds-list-title proto-home-card__title">No notes yet</p>
              </div>
              <p className="pds-list-preview proto-home-card__preview">Create your first note and your Home will fill in.</p>
            </div>
          </div>
        </div>
      ) : continueNote ? (
        <div className="proto-home-section">
          <HomeNoteCard
            eyebrow="Pick up where you left off"
            iconName="pen-to-square"
            note={continueNote}
            onOpenNote={onOpenNote}
            prefetchNote={prefetchNote}
          />
        </div>
      ) : null}

      {spotlightHighlight ? (
        <div className="proto-home-section">
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
            onClick={() => onOpenHighlight(spotlightHighlight)}
          >
            <p className="proto-caption proto-home-card__eyebrow">A highlight to revisit</p>
            <div className="proto-home-card__body">
              <div className="proto-home-card__title-row">
                <span className="proto-home-card__icon-orb" aria-hidden>
                  <Icon name={highlightEntryKindIconName(spotlightHighlight.entryKind)} size={13} />
                </span>
                <p className="pds-list-title proto-home-card__title">
                  {prototypeHighlightListTitle(spotlightHighlight)}
                </p>
                <span className="proto-home-card__chevron" aria-hidden>
                  <Icon name="chevron-right" size={11} />
                </span>
              </div>
              <p className="pds-list-preview proto-home-card__excerpt">
                {prototypeHighlightSubtitlePreview(spotlightHighlight, spotlightHighlight.parentNoteTitle)}
              </p>
            </div>
          </button>
        </div>
      ) : null}

      {revisitNote ? (
        <div className="proto-home-section">
          <HomeNoteCard
            eyebrow="Worth another look"
            iconName="arrow-rotate-left"
            note={revisitNote}
            onOpenNote={onOpenNote}
            prefetchNote={prefetchNote}
          />
        </div>
      ) : null}

      {spotlightThread ? (
        <div className="proto-home-section">
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
            onClick={() => openThread(spotlightThread.id)}
          >
            <p className="proto-caption proto-home-card__eyebrow">Pick a study back up</p>
            <div className="proto-home-card__body">
              <div className="proto-home-card__title-row">
                <span className="proto-home-card__icon-orb" aria-hidden>
                  <Icon name="arrow-right-arrow-left" size={13} />
                </span>
                <p className="pds-list-title proto-home-card__title">{spotlightThread.title}</p>
                <span className="proto-home-card__chevron" aria-hidden>
                  <Icon name="chevron-right" size={11} />
                </span>
              </div>
              <div className="proto-home-card__meta">
                <span className="proto-home-card__meta-item">
                  {spotlightThread.noteCount} {spotlightThread.noteCount === 1 ? 'note' : 'notes'}
                </span>
              </div>
            </div>
          </button>
        </div>
      ) : null}

      {looseCount >= LOOSE_MIN ? (
        <div className="proto-home-section">
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
            onClick={() => {
              setSidebarListMode('folders');
              setSidebarFolderDrilldown(null);
              ensureSidebarExpanded();
            }}
          >
            <p className="proto-caption proto-home-card__eyebrow">Tidy up</p>
            <div className="proto-home-card__body">
              <div className="proto-home-card__title-row">
                <span className="proto-home-card__icon-orb" aria-hidden>
                  <Icon name="folder" size={13} />
                </span>
                <p className="pds-list-title proto-home-card__title">
                  {looseCount} notes haven&apos;t found a home yet
                </p>
                <span className="proto-home-card__chevron" aria-hidden>
                  <Icon name="chevron-right" size={11} />
                </span>
              </div>
            </div>
          </button>
        </div>
      ) : null}
    </div>
  );
}
