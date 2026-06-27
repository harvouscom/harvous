/**
 * Home space view — the 'space' sidebar layer. A greeting with one consolidated
 * lead theme + liturgical-season line, Today's Passage, then a set of cards:
 * continue, a highlight to revisit, an older note to revisit, a study-thread
 * spotlight, a theme connecting your passages, and a loose-notes nudge. Each
 * card renders only when it qualifies.
 * Copy follows docs/BRAND_VOICE.md — friend-over-coffee, no hype, no em dashes.
 */
import { useUser } from '@clerk/clerk-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { resolveProfileFirstName } from '@/utils/nav-avatar-initials';
import Icon, { type IconName } from '@/components/react/Icon';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { ScriptureIndexBook } from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import { useTagsList } from '../../hooks/queries/useTagsList';
import { usePrototypeStudyThreads } from '../../hooks/queries/usePrototypeStudyThreads';
import {
  usePrototypeSpaceStudyThreadHighlights,
  type PrototypeHighlightStudyThreadRow,
} from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { usePrototypeSpaceScriptureConnections } from '../../hooks/queries/usePrototypeSpaceScriptureConnections';
import { useProfile } from '../../hooks/queries/useProfile';
import { useVotdToday } from '../../hooks/queries/useVotdToday';
import type { PrototypeNotesListPhase } from '@/utils/prototype-notes-list-phase';
import { isPrototypeHomeContentReady, isQuerySettled } from '@/utils/prototype-home-ready';
import {
  computeActivityRhythm,
  computeLastActivityTime,
  countWeeklyActivityDays,
  countLooseNotes,
  deriveSubjectConnections,
  derivePassageConnections,
  deriveStudyArcs,
  deriveTopBooks,
  deriveTopFolders,
  deriveTopTags,
  deriveTopThread,
  formatHomeActivityLeadSuffix,
  formatHomeNoteCount,
  greetingForHour,
  homeContinueCardEyebrow,
  homeLeadCopyLayout,
  homeSpotlightThreadEyebrow,
  localDayIndex,
  pickContinueNote,
  pickRevisitNote,
  pickSpotlightThread,
  selectHomeLeadTheme,
  selectRecallOpportunities,
  pickRecallTrend,
  recallTrendLine,
  studyArcSinceLabel,
  studyArcToneLabel,
  type HomeLeadTheme,
  type HomeSubjectPassageInput,
  type HomePassageConnectionInput,
  type StudyArcNoteInput,
} from '@/utils/prototype-home-trends';
import chapterSubjectsData from '@/data/chapter-subjects.json';
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
import { stabilityById, recordRecallEngaged } from './proto-recall-stability';
import { activeCooldownIds, recordRecallSnoozed, recordRecallOpened } from './proto-recall-cooldown';
import PrototypeRecallCarousel, { type RecallOpportunity } from './PrototypeRecallCarousel';
import { useNoteFingerprints } from '../../hooks/queries/useNoteFingerprints';
import PrototypeDailyPassagePill from './PrototypeDailyPassagePill';
import PrototypeFounderLetterPill from './PrototypeFounderLetterPill';
import { PROTOTYPE_DRAFT_NOTE_SLUG } from './proto-route-slugs';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { HOME_INTRO_LIST_MODES, type SidebarListModeEntry } from './proto-sidebar-list-modes';
import type { SidebarListMode } from '../../layouts/proto-shell-context';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Resurface a note only after it's gone quiet for two weeks. */
const REVISIT_MIN_AGE_MS = 14 * DAY_MS;
/** Don't nudge "revisit" until there's a real backlog. */
const REVISIT_MIN_NOTES = 5;
/** Don't nag about loose notes until a few have piled up. */
const LOOSE_MIN = 3;

const chapterSubjects = chapterSubjectsData as Record<string, Record<string, string[]>>;
// A subject must connect at least this many distinct notes to earn the Home "theme" card.
const SUBJECT_CONNECTION_MIN = 3;
// A TSK cross-reference pair must touch at least this many distinct notes.
const CROSSREF_CONNECTION_MIN = 2;
// A passage must be cited by at least this many distinct notes to resurface on Home.
const PASSAGE_CONNECTION_MIN = 2;

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
  onOpenScripturePassage: (bookOrder: number, passageKey: string) => void;
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
  trendLine,
  onOpenScriptureBook,
}: {
  notes: SpaceNoteRow[];
  countForLogic: number;
  hasMoreForLogic: boolean;
  lead: HomeLeadTheme;
  trendLine?: string;
  onOpenScriptureBook: (bookOrder: number) => void;
}) {
  const { user } = useUser();
  const { data: profile } = useProfile();
  const {
    setSidebarListMode,
    setSidebarFolderDrilldown,
    setSidebarThreadDrilldownId,
    ensureSidebarExpanded,
    openSidebarTagSearch,
  } = useProtoShell();

  const firstName = useMemo(
    () => resolveProfileFirstName(user, profile),
    [user, profile],
  );

  const rhythm = useMemo(() => computeActivityRhythm(notes), [notes]);
  const weeklyDays = useMemo(() => countWeeklyActivityDays(notes, new Date()), [notes]);
  const lastActivityMs = useMemo(() => computeLastActivityTime(notes), [notes]);
  const season = useMemo(() => currentLiturgicalSeason(new Date()), []);

  const hello = `${greetingForHour(new Date().getHours())}${firstName ? `, ${firstName}` : ''}.`;
  const activityTail = useMemo(
    () =>
      formatHomeActivityLeadSuffix({
        rhythm,
        weeklyDays,
        lastActivityMs,
        now: new Date(),
        totalNoteCount: countForLogic,
      }),
    [rhythm, weeklyDays, lastActivityMs, countForLogic],
  );
  const savedSoFarEnd = activityTail ? <>, {activityTail}.</> : <>.</>;

  const singleNoteAddedRel = useMemo(() => {
    if (countForLogic !== 1 || hasMoreForLogic || notes.length === 0) return '';
    const note = notes[0];
    return protoRelativeCaption(note.updatedAt ?? note.createdAt ?? null);
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
    const introModeByKey = Object.fromEntries(
      HOME_INTRO_LIST_MODES.map((entry) => [entry.mode, entry]),
    ) as Record<SidebarListMode, SidebarListModeEntry | undefined>;

    const introListChip = (mode: SidebarListMode) => {
      const entry = introModeByKey[mode];
      if (!entry) return null;
      const chipClass =
        mode === 'scripture'
          ? 'proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--passage'
          : 'proto-glass-surface proto-home-greeting__chip';
      return (
        <button
          type="button"
          className={chipClass}
          aria-label={`Open ${entry.label} list`}
          onClick={() => {
            setSidebarListMode(mode);
            ensureSidebarExpanded();
          }}
        >
          <Icon name={entry.icon} size={10} aria-hidden />
          <span>{entry.label}</span>
        </button>
      );
    };

    return (
      <>
        <p className="proto-home-greeting">
          <span className="proto-home-greeting__hello">{hello}</span>{' '}
          Welcome to Harvous. Write {introListChip('notes')} as you add{' '}
          {introListChip('scripture')}, open Today&apos;s Passage, and create{' '}
          {introListChip('highlights')} and {introListChip('threads')}.
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

  const layout = homeLeadCopyLayout(lead);
  const subjectChip = threadChip || bookChip || folderChip || tagChip;

  const leadSentence = (() => {
    if (lead.kind === 'book' && lead.tone === 'single-note') {
      return (
        <>
          {layout.beforeChip}
          {bookChip}
          {singleNoteAddedRel ? <> {singleNoteAddedRel}</> : null}.
          {layout.showCount ? (
            <>
              {' '}
              {countChip} saved so far{savedSoFarEnd}
            </>
          ) : (
            savedSoFarEnd
          )}
        </>
      );
    }
    if (lead.kind === 'none') {
      return (
        <>
          {layout.beforeChip}
          {countChip}
          {layout.afterChip}
          {savedSoFarEnd}
        </>
      );
    }
    return (
      <>
        {layout.beforeChip}
        {subjectChip}
        {layout.afterChip}
        {layout.showCount ? (
          <>
            {countChip} saved so far{savedSoFarEnd}
          </>
        ) : (
          savedSoFarEnd
        )}
      </>
    );
  })();

  return (
    <>
      <p className="proto-home-greeting">
        <span className="proto-home-greeting__hello">{hello}</span>{' '}
        {leadSentence}
      </p>
      {trendLine ? <p className="proto-home-greeting__trend">{trendLine}</p> : null}
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
  iconName: IconName;
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
  onOpenScripturePassage,
  onOpenHighlight,
}: Props) {
  const tagsQuery = useTagsList();
  const threadsQuery = usePrototypeStudyThreads(homeSpaceId);
  const highlightsQuery = usePrototypeSpaceStudyThreadHighlights(homeSpaceId);
  const crossRefConnectionsQuery = usePrototypeSpaceScriptureConnections(homeSpaceId);
  const votdQuery = useVotdToday({ enabled: Boolean(homeSpaceId) });

  const navigate = useNavigate();
  const {
    setSidebarListMode,
    setSidebarLayer,
    setSidebarFolderDrilldown,
    setSidebarThreadDrilldownId,
    setSidebarThreadProposal,
    ensureSidebarExpanded,
    beginPrototypeComposeSession,
    isMobileSidebar,
    closeDrawer,
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

  // When all pages are loaded, the flat list is authoritative; otherwise prefer server total.
  const exactTotal = noteTotal ?? null;
  const countForLogic = !hasMoreNotes ? notes.length : (exactTotal ?? notes.length);
  const hasMoreForLogic = !hasMoreNotes ? false : exactTotal != null ? false : hasMoreNotes;

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

  // Memory layer Workstream B: forgetting-aware resurfacing. meaningWeight (server fingerprints) +
  // per-note stability (lengthened each time the user re-engages a recall) rank the "Worth another
  // look" pick toward meaningful, fading notes. Degrades to recency logic before fingerprints exist.
  const { meaningWeightById, fingerprintsById } = useNoteFingerprints();
  const recallStability = useMemo(() => stabilityById(homeSpaceId), [homeSpaceId]);

  const continueNote = useMemo(() => pickContinueNote(notes), [notes]);
  const spotlightHighlight = useMemo(() => pickSpotlightHighlight(highlights, homeSpaceId), [highlights, homeSpaceId]);
  const revisitNote = useMemo(
    () =>
      countForLogic >= REVISIT_MIN_NOTES && !hasMoreNotes
        ? pickRevisitNote(notes, {
            nowMs: Date.now(),
            excludeIds: [continueNote?.id, spotlightHighlight?.parentNoteId].filter((id): id is string => Boolean(id)),
            minAgeMs: REVISIT_MIN_AGE_MS,
            rotationDayIndex: localDayIndex(new Date()),
            meaningWeightById,
            stabilityById: recallStability,
          })
        : undefined,
    [notes, continueNote, countForLogic, hasMoreNotes, spotlightHighlight, meaningWeightById, recallStability],
  );

  // Opening the resurfaced note re-engages it: lengthen its forgetting interval before routing.
  const handleOpenRevisitNote = useCallback(
    (row: SpaceNoteRow) => {
      recordRecallEngaged(homeSpaceId, row.id);
      onOpenNote(row);
    },
    [homeSpaceId, onOpenNote],
  );
  const spotlightThread = useMemo(
    () => pickSpotlightThread(threads, { excludeId: lead.kind === 'thread' ? lead.thread.id : undefined }),
    [threads, lead],
  );
  const looseCount = useMemo(() => countLooseNotes(notes), [notes]);
  const loadedNoteIds = useMemo(() => new Set(notes.map((n) => n.id)), [notes]);

  // Phase 3 (knowledge layer): the latent theme connecting the most of your passages. Map each
  // cited passage to its curated subjects (static chapter index), group the citing notes by
  // subject, and surface the widest-reaching one. Needs the full note set to be an honest count.
  const subjectConnection = useMemo(() => {
    if (hasMoreNotes) return undefined;
    const passages: HomeSubjectPassageInput[] = [];
    for (const book of scriptureBooks) {
      const byChapter = chapterSubjects[book.title];
      if (!byChapter) continue;
      for (const passage of book.passages) {
        const subjects = byChapter[String(passage.chapter)];
        const loadedNotes = passage.notes.filter((n) => loadedNoteIds.has(n.id));
        if (subjects?.length && loadedNotes.length) passages.push({ subjects, notes: loadedNotes });
      }
    }
    const top = deriveSubjectConnections(passages, { limit: 1 })[0];
    return top && top.noteCount >= SUBJECT_CONNECTION_MIN ? top : undefined;
  }, [scriptureBooks, hasMoreNotes, loadedNoteIds]);

  const crossRefConnection = useMemo(() => {
    if (hasMoreNotes) return undefined;
    const top = crossRefConnectionsQuery.data?.[0];
    return top && top.noteCount >= CROSSREF_CONNECTION_MIN ? top : undefined;
  }, [crossRefConnectionsQuery.data, hasMoreNotes]);

  const passageConnection = useMemo(() => {
    if (hasMoreNotes) return undefined;
    const passages: HomePassageConnectionInput[] = [];
    for (const book of scriptureBooks) {
      for (const passage of book.passages) {
        if (!passage.notes.length) continue;
        passages.push({
          passageKey: passage.passageKey,
          displayRef: passage.displayRef,
          bookOrder: passage.bookOrder,
          chapter: passage.chapter,
          verseStart: passage.verseStart,
          notes: passage.notes,
        });
      }
    }
    const top = derivePassageConnections(passages, { limit: 1 })[0];
    return top && top.noteCount >= PASSAGE_CONNECTION_MIN ? top : undefined;
  }, [scriptureBooks, hasMoreNotes]);

  const openSubjectConnection = useCallback(() => {
    if (!subjectConnection) return;
    const proposalNotes = subjectConnection.notes.filter((n) => loadedNoteIds.has(n.id));
    if (proposalNotes.length < SUBJECT_CONNECTION_MIN) return;
    setSidebarThreadProposal({
      subject: subjectConnection.subject,
      notes: proposalNotes,
    });
    setSidebarLayer('list');
    ensureSidebarExpanded();
  }, [
    subjectConnection,
    loadedNoteIds,
    setSidebarLayer,
    setSidebarThreadProposal,
    ensureSidebarExpanded,
  ]);

  const openCrossRefConnection = useCallback(() => {
    const leadId = crossRefConnection?.notes[0]?.id;
    const leadNote = leadId ? notes.find((note) => note.id === leadId) : undefined;
    if (leadNote) onOpenNote(leadNote);
  }, [crossRefConnection, notes, onOpenNote]);

  const openPassageConnection = useCallback(() => {
    if (!passageConnection) return;
    onOpenScripturePassage(passageConnection.bookOrder, passageConnection.passageKey);
  }, [passageConnection, onOpenScripturePassage]);

  // Memory layer Workstream C: a study arc — a theme that keeps returning across your notes over
  // weeks or months ("living commentary on your life"). Joins each note's fingerprint themes/tone
  // (Workstream A) with its timestamp; needs the full note set to count honestly. Tapping opens the
  // note where the thread began.
  const studyArc = useMemo(() => {
    if (hasMoreNotes) return undefined;
    const arcNotes: StudyArcNoteInput[] = notes.map((n) => {
      const fp = fingerprintsById.get(n.id);
      return {
        id: n.id,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        themes: fp?.themes ?? [],
        emotionalTone: fp?.emotionalTone ?? null,
      };
    });
    return deriveStudyArcs(arcNotes, { nowMs: Date.now(), limit: 1 })[0];
  }, [notes, fingerprintsById, hasMoreNotes]);

  const studyArcCopy = useMemo(() => {
    if (!studyArc) return null;
    const since = studyArcSinceLabel(studyArc.firstMs, Date.now());
    const tone = studyArcToneLabel(studyArc.dominantTone);
    const base = `Across ${studyArc.noteCount} notes since ${since}`;
    return tone ? `${base} · ${tone}` : base;
  }, [studyArc]);

  const openStudyArc = useCallback(() => {
    const originId = studyArc?.noteIds[0];
    const originNote = originId ? notes.find((n) => n.id === originId) : undefined;
    if (originNote) onOpenNote(originNote);
  }, [studyArc, notes, onOpenNote]);

  // ── Recall carousel (Home resurfacing) ──
  // Fold the per-kind recall/trend memos above into one varied, ranked, snoozable carousel. Each
  // opportunity is enriched with its fingerprint theme/tone where we have it; opening or snoozing
  // ("not now") rests it via the recall-cooldown store; the set rotates daily.
  const [recallTick, setRecallTick] = useState(0);
  const recallDayIndex = useMemo(() => localDayIndex(new Date()), []);
  const recallSnoozedIds = useMemo(
    () => activeCooldownIds(homeSpaceId, recallDayIndex),
    // recallTick forces a re-read of the snooze store after the user snoozes an item.
    [homeSpaceId, recallDayIndex, recallTick],
  );

  const recallCandidates = useMemo<RecallOpportunity[]>(() => {
    const out: RecallOpportunity[] = [];
    const wrapOpen = (id: string, action: () => void) => () => {
      recordRecallOpened(homeSpaceId, id, recallDayIndex);
      action();
    };

    if (revisitNote) {
      const fp = fingerprintsById.get(revisitNote.id);
      const rel = protoRelativeCaptionAbbrev(revisitNote.updatedAt ?? revisitNote.createdAt ?? null);
      const tone = studyArcToneLabel(fp?.emotionalTone ?? null);
      const meta = [rel, fp?.themes?.[0], tone].filter(Boolean).join(' · ');
      out.push({
        id: revisitNote.id,
        kind: 'revisitNote',
        score: meaningWeightById[revisitNote.id] ?? 0.5,
        eyebrow: 'Worth another look',
        title: stripServerAutoUntitledNoteTitleForDisplay(revisitNote.title?.trim() ?? '') || 'New Note',
        meta,
        iconName: 'arrow-rotate-left',
        onOpen: wrapOpen(revisitNote.id, () => handleOpenRevisitNote(revisitNote)),
      });
    }

    if (spotlightHighlight) {
      out.push({
        id: spotlightHighlight.id,
        kind: 'highlight',
        score: 0.55,
        eyebrow: 'A highlight to revisit',
        title: prototypeHighlightListTitle(spotlightHighlight),
        meta: prototypeHighlightSubtitlePreview(spotlightHighlight, spotlightHighlight.parentNoteTitle),
        iconName: highlightEntryKindIconName(spotlightHighlight.entryKind),
        onOpen: wrapOpen(spotlightHighlight.id, () => onOpenHighlight(spotlightHighlight)),
      });
    }

    if (studyArc) {
      const id = `arc:${studyArc.theme.toLowerCase()}`;
      out.push({
        id,
        kind: 'arc',
        score: Math.min(1, studyArc.noteCount / 8),
        eyebrow: 'A through-line in your study',
        title: studyArc.theme,
        meta: studyArcCopy ?? '',
        iconName: 'arrows-turn-to-dots',
        onOpen: wrapOpen(id, openStudyArc),
      });
    }

    if (subjectConnection) {
      const id = `subject:${subjectConnection.subject.toLowerCase()}`;
      out.push({
        id,
        kind: 'subject',
        score: Math.min(1, subjectConnection.noteCount / 8),
        eyebrow: 'A theme taking shape in your notes',
        title: subjectConnection.subject,
        meta: `Across ${subjectConnection.noteCount} of your notes`,
        iconName: 'arrow-right-arrow-left',
        onOpen: wrapOpen(id, openSubjectConnection),
      });
    }

    if (crossRefConnection) {
      const id = `crossref:${crossRefConnection.from.displayRef}|${crossRefConnection.to.displayRef}`;
      out.push({
        id,
        kind: 'crossref',
        score: Math.min(1, crossRefConnection.noteCount / 8),
        eyebrow: 'A cross-reference in your notes',
        title: `${crossRefConnection.from.displayRef} and ${crossRefConnection.to.displayRef}`,
        meta: `Across ${crossRefConnection.noteCount} of your notes`,
        iconName: 'arrow-right-arrow-left',
        onOpen: wrapOpen(id, openCrossRefConnection),
      });
    }

    if (passageConnection) {
      const id = `passage:${passageConnection.displayRef}`;
      out.push({
        id,
        kind: 'passage',
        score: Math.min(1, passageConnection.noteCount / 8),
        eyebrow: 'A passage you keep returning to',
        title: passageConnection.displayRef,
        meta: `Across ${passageConnection.noteCount} of your notes`,
        iconName: 'book',
        onOpen: wrapOpen(id, openPassageConnection),
      });
    }

    return out;
  }, [
    revisitNote,
    spotlightHighlight,
    studyArc,
    studyArcCopy,
    subjectConnection,
    crossRefConnection,
    passageConnection,
    fingerprintsById,
    meaningWeightById,
    homeSpaceId,
    recallDayIndex,
    handleOpenRevisitNote,
    onOpenHighlight,
    openStudyArc,
    openSubjectConnection,
    openCrossRefConnection,
    openPassageConnection,
  ]);

  const recallOpportunities = useMemo(
    () =>
      selectRecallOpportunities(recallCandidates, {
        snoozedIds: recallSnoozedIds,
        dayIndex: recallDayIndex,
        limit: 6,
      }),
    [recallCandidates, recallSnoozedIds, recallDayIndex],
  );

  const recallTrendText = useMemo(() => {
    const trend = pickRecallTrend(recallCandidates);
    if (!trend) return '';
    if (trend.kind === 'arc' && studyArc) {
      return recallTrendLine({
        kind: 'arc',
        theme: studyArc.theme,
        noteCount: studyArc.noteCount,
        since: studyArcSinceLabel(studyArc.firstMs, Date.now()),
        toneLabel: studyArcToneLabel(studyArc.dominantTone),
      });
    }
    if (trend.kind === 'subject' && subjectConnection) {
      return recallTrendLine({ kind: 'subject', subject: subjectConnection.subject, noteCount: subjectConnection.noteCount });
    }
    if (trend.kind === 'passage' && passageConnection) {
      return recallTrendLine({ kind: 'passage', passageRef: passageConnection.displayRef });
    }
    if (trend.kind === 'crossref' && crossRefConnection) {
      return recallTrendLine({
        kind: 'crossref',
        fromRef: crossRefConnection.from.displayRef,
        toRef: crossRefConnection.to.displayRef,
      });
    }
    return '';
  }, [recallCandidates, studyArc, subjectConnection, passageConnection, crossRefConnection]);

  const handleRecallSnooze = useCallback(
    (id: string) => {
      recordRecallSnoozed(homeSpaceId, id, recallDayIndex);
      setRecallTick((t) => t + 1);
    },
    [homeSpaceId, recallDayIndex],
  );

  const onCreateFirstNote = useCallback(() => {
    if (!homeSpaceId) return;
    if (isMobileSidebar) closeDrawer();
    beginPrototypeComposeSession();
    navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: PROTOTYPE_DRAFT_NOTE_SLUG },
      search: PROTOTYPE_NOTE_LIST_NAV_SEARCH,
    });
  }, [beginPrototypeComposeSession, closeDrawer, homeSpaceId, isMobileSidebar, navigate]);

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
          trendLine={recallTrendText}
          onOpenScriptureBook={onOpenScriptureBook}
        />
      </div>

      <div className="proto-home-section">
        <PrototypeFounderLetterPill />
      </div>

      {votd ? (
        <div className="proto-home-section">
          <PrototypeDailyPassagePill
            homeSpaceId={homeSpaceId}
            notes={notes}
            votd={votd}
            scriptureBooks={scriptureBooks}
            onOpenScripturePassage={onOpenScripturePassage}
          />
        </div>
      ) : null}

      {notesListPhase === 'empty' ? (
        <div className="proto-home-section">
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
            onClick={onCreateFirstNote}
          >
            <div className="proto-home-card__body">
              <div className="proto-home-card__title-row">
                <span className="proto-home-card__icon-orb" aria-hidden>
                  <Icon name="note-sticky" size={13} />
                </span>
                <p className="pds-list-title proto-home-card__title">No notes yet</p>
                <span className="proto-home-card__chevron" aria-hidden>
                  <Icon name="chevron-right" size={11} />
                </span>
              </div>
              <p className="pds-list-preview proto-home-card__preview">Create your first note...</p>
            </div>
          </button>
        </div>
      ) : continueNote ? (
        <div className="proto-home-section">
          <HomeNoteCard
            eyebrow={homeContinueCardEyebrow(countForLogic)}
            iconName="pen-to-square"
            note={continueNote}
            onOpenNote={onOpenNote}
            prefetchNote={prefetchNote}
          />
        </div>
      ) : null}

      {recallOpportunities.length > 0 ? (
        <div className="proto-home-section">
          <PrototypeRecallCarousel opportunities={recallOpportunities} onSnooze={handleRecallSnooze} />
        </div>
      ) : null}

      {spotlightThread ? (
        <div className="proto-home-section">
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
            onClick={() => openThread(spotlightThread.id)}
          >
            <p className="proto-caption proto-home-card__eyebrow">
              {homeSpotlightThreadEyebrow(spotlightThread.noteCount)}
            </p>
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
