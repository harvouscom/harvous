/**
 * Home space view — the 'space' sidebar layer. A greeting with one consolidated
 * lead theme + liturgical-season line, Today's Passage, then a set of cards:
 * continue, a highlight to revisit, an older note to revisit, a study-thread
 * spotlight, a theme connecting your passages, and a loose-notes nudge. Each
 * card renders only when it qualifies.
 * Copy follows docs/BRAND_VOICE.md — friend-over-coffee, no hype, no em dashes.
 */
import { useUser } from '@clerk/clerk-react';
import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { resolveProfileFirstName } from '@/utils/nav-avatar-initials';
import Icon, { type IconName } from '@/components/react/Icon';
import {
  isPrototypeNotePath,
  prototypeHomeRouteTo,
  prototypeNoteRouteTo,
  prototypeReadRouteTo,
} from '@/lib/prototype-path';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { readingDwellCountsAsRead } from '@/utils/reading-event-kinds';
import { parseReaderQuery } from '@/utils/parse-reader-query';
import { buildRevisitCardStackOrigin } from './paper-stack-origins';
import { useReadingHistory } from '../../hooks/queries/useReadingHistory';
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
import { usePrototypeSpaceReferenceWordConnections } from '../../hooks/queries/usePrototypeSpaceReferenceWordConnections';
import { useProfile } from '../../hooks/queries/useProfile';
import { useVotdToday } from '../../hooks/queries/useVotdToday';
import type { PrototypeNotesListPhase } from '@/utils/prototype-notes-list-phase';
import {
  isPrototypeHomeContentReady,
  isPrototypeHomePresentationReady,
  isQuerySettled,
} from '@/utils/prototype-home-ready';
import {
  computeActivityRhythm,
  computeLastActivityTime,
  countWeeklyActivityDays,
  countLooseNotes,
  deriveSubjectConnections,
  derivePassageConnections,
  deriveStudyArcs,
  deriveSectionArcs,
  sectionArcCopy,
  deriveTopBooks,
  deriveTopFolders,
  deriveTopTags,
  deriveTopThread,
  formatHomeActivityLeadWithSection,
  deriveTopCanonSections,
  formatHomeNoteCount,
  greetingForHour,
  homeLeadCopyLayout,
  localDayIndex,
  pickContinueNote,
  pickRevisitNote,
  librarySectionCountsFromById,
  REVISIT_FALLBACK_MIN_AGE_MS,
  pickSpotlightThread,
  selectHomeLeadTheme,
  selectRecallOpportunities,
  pickRecallTrend,
  recallTrendGreetingParts,
  deriveContinueBook,
  deriveContinueReading,
  continueReadingEyebrow,
  continueReadingMeta,
  deriveRecurringPerson,
  pickBareHighlight,
  isHighlightUnannotated,
  isAnnotatableHighlight,
  findUnannotatedHighlightForRef,
  findUnannotatedHighlightForChapter,
  findHighlightForRef,
  findHighlightForChapter,
  deriveReflectionPrompt,
  connectSuggestionRecallMeta,
  connectSuggestionRecallEyebrow,
  formatConnectSuggestionTitle,
  suggestConnectThreadName,
  continueBookRecallMeta,
  recurringPersonRecallMeta,
  crossRefGapRecallMeta,
  studyArcSinceLabel,
  studyArcToneLabel,
  type HomeLeadTheme,
  type HomeTopCanonSection,
  type HomeSubjectPassageInput,
  type HomePassageConnectionInput,
  type StudyArcNoteInput,
  type RecallTrendGreetingParts,
} from '@/utils/prototype-home-trends';
import chapterSubjectsData from '@/data/chapter-subjects.json';
import { currentLiturgicalSeason } from '@/utils/liturgical-season';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { readerRouteForReference } from '../../utils/reader-nav';
import { protoRelativeCaption, protoRelativeCaptionAbbrev } from './proto-time';
import {
  highlightEntryKindIconName,
  prototypeHighlightListTitle,
  prototypeHighlightRecencyIso,
  prototypeHighlightSubtitlePreview,
} from './proto-highlight-subtitle';
import { loadPinnedHighlightIds } from './proto-pinned-stores';
import { stabilityById, mergeStabilityMaps } from './proto-recall-stability';
import {
  activeCooldownIds,
  mergeServerRecallHistoryIntoCooldowns,
  recallRestoredAt,
  recordRecallOpened,
  recordRecallSnoozed,
  subscribeRecallCooldownChanged,
  recentRecallSectionCounts,
  RECALL_OPENED_COOLDOWN_DAYS,
} from './proto-recall-cooldown';
import { useRecallEventHistory } from '../../hooks/queries/useRecallEventHistory';
import PrototypeHomeRow from './PrototypeHomeRow';
/* Shared with the shared-space view — see its docblock for why it moved out of here. */
import HomeSection from './PrototypeHomeSection';
import PrototypeRecallCarousel, { type RecallOpportunity } from './PrototypeRecallCarousel';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import { useProtoHomeViewClassName } from './useProtoHomeViewEnter';

/** Force Home to present even if an auxiliary query never settles. */
const HOME_PRESENTATION_DEADLINE_MS = 2500;
import { useNoteFingerprints } from '../../hooks/queries/useNoteFingerprints';
import { useCrossRefGaps } from '../../hooks/queries/useCrossRefGaps';
import { findMostRecentNoteForScriptureReference } from '@/utils/scripture-passage-drill';
import type { CrossRefGap } from '../../hooks/queries/useCrossRefGaps';
import { useConnectSuggestions } from '../../hooks/queries/useConnectSuggestions';
import { useChurchSermons } from '../../hooks/queries/useChurchSermons';
import { useChurchFeed } from '../../hooks/queries/useChurchFeed';
import PrototypeDailyPassagePill from './PrototypeDailyPassagePill';
import PrototypeFounderLetterPill from './PrototypeFounderLetterPill';
import PrototypeHomeChurchFeed, { HOME_FEED_LIMIT } from './PrototypeHomeChurchFeed';
import PrototypeHomeThisSunday from './PrototypeHomeThisSunday';
import PrototypeHomeReadingPlan from './PrototypeHomeReadingPlan';
import { noteParamSlug } from './proto-route-slugs';
import { bibleBookChapterCounts, bookSlug } from '@/utils/bible-book-chapters';
import { buildVotdScripturePillHtml } from '../../lib/votd-scripture-pill-html';
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

function pushAnnotateHighlightRecallCard(
  out: RecallOpportunity[],
  highlight: PrototypeHighlightStudyThreadRow,
  onOpenHighlight: (row: PrototypeHighlightStudyThreadRow) => boolean | void,
  usedHighlightIds: Set<string>,
) {
  if (usedHighlightIds.has(highlight.id)) return;
  usedHighlightIds.add(highlight.id);
  out.push({
    id: `annotate:${highlight.id}`,
    kind: 'annotateHighlight',
    noteId: highlight.id,
    score: 0.55,
    eyebrow: 'Add a thought',
    title: prototypeHighlightListTitle(highlight),
    meta: 'Worth a quick reflection',
    iconName: 'pen-to-square',
    onOpen: () => onOpenHighlight(highlight),
  });
}

function pushRevisitHighlightRecallCard(
  out: RecallOpportunity[],
  highlight: PrototypeHighlightStudyThreadRow,
  onOpenHighlight: (row: PrototypeHighlightStudyThreadRow) => boolean | void,
  usedHighlightIds: Set<string>,
  meta: string,
) {
  if (usedHighlightIds.has(highlight.id)) return;
  usedHighlightIds.add(highlight.id);
  out.push({
    id: highlight.id,
    kind: 'highlight',
    noteId: highlight.id,
    score: 0.55,
    eyebrow: 'A highlight to revisit',
    title: prototypeHighlightListTitle(highlight),
    meta,
    iconName: highlightEntryKindIconName(highlight.entryKind),
    onOpen: () => onOpenHighlight(highlight),
  });
}

type Props = {
  homeSpaceId: string;
  notes: SpaceNoteRow[];
  notesListPhase: PrototypeNotesListPhase;
  hasMoreNotes: boolean;
  noteTotal?: number;
  scriptureBooks: ScriptureIndexBook[];
  scriptureSettled: boolean;
  /** Currently open note in the main pane — suppresses redundant "continue" card. */
  activeNoteId?: string;
  onOpenNote: (row: SpaceNoteRow) => void;
  prefetchNote: (row: SpaceNoteRow) => void;
  onOpenScriptureBook: (bookOrder: number) => void;
  onOpenScripturePassage: (bookOrder: number, passageKey: string) => void;
  onOpenHighlight: (row: PrototypeHighlightStudyThreadRow) => boolean | void;
  onOpenCreateThreadPrefill: (prefill: { noteIds: [string, string]; threadName: string }) => void;
};

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

type HomeGreetingTrendKind = 'arc' | 'subject' | 'passage' | 'crossref' | 'referenceWord';

type HomeGreetingTrend = {
  kind: HomeGreetingTrendKind;
  parts: RecallTrendGreetingParts;
  onOpen: () => boolean | void;
};

function HomeGreeting({
  notes,
  countForLogic,
  hasMoreForLogic,
  lead,
  trend,
  topCanonSection,
  onOpenScriptureBook,
}: {
  notes: SpaceNoteRow[];
  countForLogic: number;
  hasMoreForLogic: boolean;
  lead: HomeLeadTheme;
  trend?: HomeGreetingTrend;
  topCanonSection?: HomeTopCanonSection;
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
      formatHomeActivityLeadWithSection(
        {
          rhythm,
          weeklyDays,
          lastActivityMs,
          now: new Date(),
          totalNoteCount: countForLogic,
        },
        lead,
        topCanonSection,
      ),
    [rhythm, weeklyDays, lastActivityMs, countForLogic, lead, topCanonSection],
  );
  const activityClause = activityTail ? <>, {activityTail}</> : null;

  const trendClause = trend ? (
    <>
      {trend.parts.prefix}
      {trend.parts.labels.map((label, i) => {
        const isPassage = trend.kind === 'passage';
        const chipClass = isPassage
          ? 'proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--passage'
          : 'proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--thread';
        const iconName: IconName = trend.kind === 'passage' ? 'book' : 'arrow-right-arrow-left';
        const iconSize = isPassage ? 11 : 10;
        return (
          <Fragment key={`${label}-${i}`}>
            {i > 0 ? ' and ' : null}
            <button
              type="button"
              className={chipClass}
              aria-label={`Open ${label}`}
              onClick={trend.onOpen}
            >
              <Icon name={iconName} size={iconSize} aria-hidden />
              <span>{label}</span>
            </button>
          </Fragment>
        );
      })}
      {trend.parts.suffix}
    </>
  ) : null;

  const sentenceEnd = (
    <>
      {activityClause}
      {trendClause}.
    </>
  );

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
        aria-label={`Open Thread ${lead.thread.title}`}
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
        <Icon name="scroll" size={11} aria-hidden />
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
              {countChip} saved so far{sentenceEnd}
            </>
          ) : (
            sentenceEnd
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
          {sentenceEnd}
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
            {countChip} saved so far{sentenceEnd}
          </>
        ) : (
          sentenceEnd
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
      {seasonLine}
    </>
  );
}

/**
 * A group of Home cards under one heading — the church hub's section pattern.
 *
 * Home used to be a flat stack where every card carried its own eyebrow, so seven different
 * labels competed with no hierarchy and nothing said which cards belonged together. The
 * heading now belongs to the group and the cards inside it go bare, exactly as the church
 * hub's lanes do, so the two sidebars read as one system.
 *
 * Empty groups hide themselves in CSS rather than here: several children (This Sunday, the
 * church feed) decide for themselves whether they have anything to show, and a parent cannot
 * know that without rendering them first. `:has()` asks the question after the fact.
 */
/**
 * A note as a Home row (continue / revisit).
 *
 * The row is one title line and one meta line, so the preview that the old card carried
 * on its own line moves into the meta and takes its chances with the ellipsis. Time and
 * folder come after it: what the note says is worth more of the line than when it was
 * touched.
 */
function HomeNoteCard({
  eyebrow,
  iconName,
  note,
  onOpenNote,
  prefetchNote,
}: {
  /** Folded into the meta line — a row has no eyebrow. Usually omitted inside a
      `HomeSection`, whose heading already says which shelf this is on. */
  eyebrow?: string;
  iconName: IconName;
  note: SpaceNoteRow;
  onOpenNote: (row: SpaceNoteRow) => void;
  prefetchNote: (row: SpaceNoteRow) => void;
}) {
  const title = stripServerAutoUntitledNoteTitleForDisplay(note.title?.trim() ?? '') || 'New Note';
  const preview = note.content ? stripHtmlForListPreview(note.content, 90) : '';
  const rel = protoRelativeCaptionAbbrev(note.updatedAt ?? note.createdAt ?? null);
  return (
    <PrototypeHomeRow
      icon={iconName}
      title={title}
      meta={[
        eyebrow,
        preview,
        rel,
        note.primaryCollection ? (
          <>
            <Icon name="folder" size={10} aria-hidden /> {note.primaryCollection}
          </>
        ) : null,
      ]}
      onClick={() => onOpenNote(note)}
      onMouseEnter={() => prefetchNote(note)}
      onFocus={() => prefetchNote(note)}
    />
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
  activeNoteId,
  onOpenNote,
  prefetchNote,
  onOpenScriptureBook,
  onOpenScripturePassage,
  onOpenHighlight,
  onOpenCreateThreadPrefill,
}: Props) {
  const tagsQuery = useTagsList();
  const threadsQuery = usePrototypeStudyThreads(homeSpaceId);
  const highlightsQuery = usePrototypeSpaceStudyThreadHighlights(homeSpaceId);
  const crossRefConnectionsQuery = usePrototypeSpaceScriptureConnections(homeSpaceId);
  const referenceWordConnectionsQuery = usePrototypeSpaceReferenceWordConnections(homeSpaceId);
  const votdQuery = useVotdToday({ enabled: Boolean(homeSpaceId) });
  // Only the greeting's first name needs Clerk, but presenting before it loads means the
  // greeting line rewrites itself a beat later — one more thing moving after first paint.
  const { isLoaded: clerkLoaded } = useUser();
  const fingerprintsQuery = useNoteFingerprints();
  const recallHistoryQuery = useRecallEventHistory();
  const readingHistoryQuery = useReadingHistory();
  // Declared up here, above the presentation gate, because the gate reads their settled state.
  // They used to sit further down beside the recall memo that consumes them, which put them
  // out of the gate's reach — so each one landed after Home had already painted and inserted a
  // card into a deck the reader was looking at.
  const crossRefGapsQuery = useCrossRefGaps();
  const connectSuggestionsQuery = useConnectSuggestions();
  const churchSermonsQuery = useChurchSermons();
  const churchFeedQuery = useChurchFeed({ limit: HOME_FEED_LIMIT });
  const {
    meaningWeightById,
    fingerprintsById,
    canonSectionById,
    recallStabilityById,
    lastRecallEngagedAtById,
  } = fingerprintsQuery;

  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
    stackNote,
  } = useProtoShell();

  const tagsSettled = isQuerySettled(tagsQuery.isPending, tagsQuery.data != null);
  const threadsSettled = isQuerySettled(threadsQuery.isPending, threadsQuery.data != null);
  const highlightsSettled = isQuerySettled(highlightsQuery.isPending, highlightsQuery.data != null);
  const votdSettled =
    isQuerySettled(votdQuery.isPending, votdQuery.data != null) || Boolean(votdQuery.isError);
  const fingerprintsSettled = isQuerySettled(
    fingerprintsQuery.isPending,
    fingerprintsQuery.data != null,
  );
  const connectionsSettled =
    isQuerySettled(crossRefConnectionsQuery.isPending, crossRefConnectionsQuery.data != null) &&
    isQuerySettled(
      referenceWordConnectionsQuery.isPending,
      referenceWordConnectionsQuery.data != null,
    );
  const crossRefGapsSettled = isQuerySettled(
    crossRefGapsQuery.isPending,
    crossRefGapsQuery.data != null,
  );
  const connectSuggestionsSettled = isQuerySettled(
    connectSuggestionsQuery.isPending,
    connectSuggestionsQuery.data != null,
  );
  const recallHistorySettled = isQuerySettled(
    recallHistoryQuery.isPending,
    recallHistoryQuery.data != null,
  );
  // Read here purely to gate on. PrototypeHomeThisSunday and PrototypeHomeChurchFeed each call
  // these themselves and return null until they resolve — "This Sunday" sits *above* the daily
  // passage, so it arriving late pushes the passage pill, the continue card and the whole recall
  // deck down. React Query dedupes by key, so subscribing again here costs one cache read, not a
  // second request.
  const churchSermonsSettled = isQuerySettled(
    churchSermonsQuery.isPending,
    churchSermonsQuery.data != null,
  );
  const churchFeedSettled = isQuerySettled(churchFeedQuery.isPending, churchFeedQuery.data != null);
  /*
   * `data != null` will not do here: "no bookmark" is a legitimate answer and arrives as
   * `null`, so waiting for data would hold Home forever for anyone who has not read yet.
   */
  const readingPositionSettled =
    !readingHistoryQuery.isPending || readingHistoryQuery.isFetched || Boolean(readingHistoryQuery.isError);

  // Home used to paint the moment notes resolved, then insert or remove a whole section
  // each time one of ~9 independent queries landed — the visible jumping. Wait for them
  // all, then present once. isPrototypeHomeContentReady only ever read notesListPhase;
  // the other flags passed to it were silently dropped.
  const presentationReady = isPrototypeHomePresentationReady({
    notesReady: isPrototypeHomeContentReady(notesListPhase),
    clerkLoaded,
    fingerprintsSettled,
    tagsSettled,
    threadsSettled,
    scriptureSettled,
    connectionsSettled,
    highlightsSettled,
    votdSettled,
    crossRefGapsSettled,
    connectSuggestionsSettled,
    recallHistorySettled,
    churchSermonsSettled,
    churchFeedSettled,
    readingPositionSettled,
  });

  // Backstop: a disabled query stays `isPending` forever in React Query v5, so without a
  // deadline one misconfigured auxiliary would strand Home on loading dots. Trading a
  // little jitter for a blank Home would be a worse bug than the one being fixed.
  const [presentationDeadlinePassed, setPresentationDeadlinePassed] = useState(false);
  useEffect(() => {
    if (presentationReady) return;
    const id = window.setTimeout(
      () => setPresentationDeadlinePassed(true),
      HOME_PRESENTATION_DEADLINE_MS,
    );
    return () => window.clearTimeout(id);
  }, [presentationReady]);

  const contentReady = presentationReady || presentationDeadlinePassed;

  const homeViewClassName = useProtoHomeViewClassName(contentReady, homeSpaceId);

  const tags = tagsQuery.data?.tags ?? [];
  const threads = threadsQuery.data ?? [];
  const highlights = highlightsQuery.data ?? [];
  const votd = votdQuery.data;

  /*
   * Where a brand-new account is invited to start reading.
   *
   * Today's verse of the day when there is one — it is already the app's answer to "what
   * should I read", and a first run is exactly when that question is loudest. John 1 is the
   * fallback rather than Genesis 1: someone opening a Bible app for the first time is more
   * likely to be looking for Jesus than for a genealogy.
   */
  /*
   * Where reading actually stopped, which is a different question from which chapters the
   * notes cite. Most reading leaves no note behind, and the chapter someone stopped in is
   * precisely the one they have not written about — so inferring "keep going" from citations
   * always pointed at where they had already been.
   */

  const firstRunPassage = useMemo(() => {
    const parsed = votd?.reference ? parseReaderQuery(votd.reference) : null;
    if (parsed) return parsed;
    return { book: 'John', chapter: 1, verse: null, reference: 'John 1' };
  }, [votd?.reference]);

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

  const localRecallStability = useMemo(() => stabilityById(homeSpaceId), [homeSpaceId]);
  const recallStability = useMemo(
    () => mergeStabilityMaps(recallStabilityById, localRecallStability),
    [recallStabilityById, localRecallStability],
  );
  const recallDayIndex = useMemo(() => localDayIndex(new Date()), []);
  const [recallTick, setRecallTick] = useState(0);

  const continueCandidate = useMemo(() => pickContinueNote(notes), [notes]);
  const continueIsActive = Boolean(
    continueCandidate && activeNoteId && continueCandidate.id === activeNoteId,
  );
  const continueNote = useMemo(() => {
    if (continueIsActive) return continueCandidate;
    if (!activeNoteId) return continueCandidate;
    return pickContinueNote(notes, { excludeIds: [activeNoteId] }) ?? continueCandidate;
  }, [notes, activeNoteId, continueIsActive, continueCandidate]);
  const spotlightHighlight = useMemo(() => pickSpotlightHighlight(highlights, homeSpaceId), [highlights, homeSpaceId]);
  const recallSnoozedIds = useMemo(
    () =>
      // Local store is per-device; the server history is what makes a card dismissed on
      // one device stay dismissed on the others.
      mergeServerRecallHistoryIntoCooldowns(
        activeCooldownIds(homeSpaceId, recallDayIndex),
        recallHistoryQuery.data?.events,
        new Date(),
        undefined,
        recallRestoredAt(homeSpaceId),
      ),
    // recallTick forces a re-read of the snooze store after the user snoozes an item.
    [homeSpaceId, recallDayIndex, recallTick, recallHistoryQuery.data],
  );

  /*
   * The other writer is the breadcrumb edge over whatever a suggestion opened — "nevermind"
   * puts the row back, "ignore" rests it for good — and that edge lives in the shell, not in
   * this tree, so nothing here would otherwise know the store had changed.
   */
  useEffect(() => subscribeRecallCooldownChanged(() => setRecallTick((t) => t + 1)), []);
  const revisitExcludeIds = useMemo(
    () =>
      [
        activeNoteId,
        continueNote?.id,
        spotlightHighlight?.parentNoteId,
        ...recallSnoozedIds,
      ].filter((id): id is string => Boolean(id)),
    [activeNoteId, continueNote, spotlightHighlight, recallSnoozedIds],
  );
  const activeContinueExcludeIds = useMemo(
    () => [activeNoteId, ...recallSnoozedIds].filter((id): id is string => Boolean(id)),
    [activeNoteId, recallSnoozedIds],
  );
  const canPickRevisitStandard = countForLogic >= REVISIT_MIN_NOTES && !hasMoreNotes;
  const canPickRevisitActiveContinue = continueIsActive && notes.length >= 2;
  const librarySectionCounts = useMemo(
    () => librarySectionCountsFromById(canonSectionById),
    [canonSectionById],
  );
  const recallSectionCounts = useMemo(
    () => recentRecallSectionCounts(homeSpaceId),
    [homeSpaceId, recallTick],
  );
  const revisitPickBase = useMemo(
    () => ({
      nowMs: Date.now(),
      minAgeMs: REVISIT_MIN_AGE_MS,
      fallbackMinAgeMs: REVISIT_FALLBACK_MIN_AGE_MS,
      rotationDayIndex: recallDayIndex,
      meaningWeightById,
      stabilityById: recallStability,
      lastRecallEngagedAtById,
      canonSectionById,
      librarySectionCounts,
      recentRecallSectionCounts: recallSectionCounts,
    }),
    [
      recallDayIndex,
      meaningWeightById,
      recallStability,
      lastRecallEngagedAtById,
      canonSectionById,
      librarySectionCounts,
      recallSectionCounts,
    ],
  );
  const revisitNote = useMemo(() => {
    if (continueIsActive && canPickRevisitActiveContinue) {
      return pickRevisitNote(notes, {
        ...revisitPickBase,
        excludeIds: activeContinueExcludeIds,
        tertiaryMinAgeMs: 0,
      });
    }

    if (!canPickRevisitStandard) return undefined;

    return pickRevisitNote(notes, {
      ...revisitPickBase,
      excludeIds: revisitExcludeIds,
    });
  }, [
    notes,
    continueIsActive,
    canPickRevisitActiveContinue,
    canPickRevisitStandard,
    activeContinueExcludeIds,
    revisitExcludeIds,
    revisitPickBase,
  ]);
  const revisitOnHome = continueIsActive ? revisitNote : undefined;

  /**
   * The resurfaced note opens as a sheet over the card that surfaced it, so the edge above the
   * note says why it is open — "Worth another look" — and flipping it down shows the card
   * again rather than a blank pane. Stacked before routing; the navigation itself is unchanged.
   */
  /**
   * @param stack whether to raise the edge here. Home's standalone "Worth another look"
   *   card is its own origin and says so. The Suggested shelf's revisitNote row runs through
   *   the same handler but is a *suggestion*, and the carousel stacks that one itself — with
   *   the row id attached, so its edge can put the suggestion back. Both stacking meant two
   *   `stackNote` calls per tap, the second overwriting the first, and the one that survived
   *   was the one without the suggestion.
   */
  const handleOpenRevisitNote = useCallback(
    (row: SpaceNoteRow, { stack = true }: { stack?: boolean } = {}) => {
      if (stack) {
        stackNote(
          buildRevisitCardStackOrigin({
            title: row.title,
            meta: protoRelativeCaptionAbbrev(row.updatedAt ?? row.createdAt ?? null),
          }),
          row.id,
        );
      }
      onOpenNote(row);
    },
    [onOpenNote, stackNote],
  );
  const handleRecallSynced = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['note-fingerprints'] });
  }, [queryClient]);
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
    if (!crossRefConnection) return;
    const proposalNotes = crossRefConnection.notes.filter((n) => loadedNoteIds.has(n.id));
    if (proposalNotes.length < CROSSREF_CONNECTION_MIN) return;
    setSidebarThreadProposal({
      subject: `${crossRefConnection.from.displayRef} and ${crossRefConnection.to.displayRef}`,
      notes: proposalNotes,
      variant: 'crossref',
    });
    setSidebarLayer('list');
    ensureSidebarExpanded();
  }, [
    crossRefConnection,
    loadedNoteIds,
    setSidebarLayer,
    setSidebarThreadProposal,
    ensureSidebarExpanded,
  ]);

  /**
   * "A passage you keep returning to — John 3:16" opens the passage.
   *
   * It used to call `onOpenScripturePassage`, which only drills the *sidebar* to that passage's
   * note list: the list mode changed and no dock opened, so the card with a scroll icon
   * promising a passage showed you a list of notes instead. It then opened a standalone
   * passage pane on Home — a second document type with no editing, tappable rows, or path
   * of its own — until the reader existed to be a real destination for "just a passage,
   * no note". Now it opens that.
   */
  const openPassageConnection = useCallback(() => {
    if (!passageConnection) return;
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    const readerRoute = readerRouteForReference(
      passageConnection.displayRef,
      getEffectiveDefaultTranslation(),
    );
    if (!readerRoute) return;
    navigate(readerRoute);
  }, [passageConnection, isMobileSidebar, closeDrawer, navigate]);

  // Memory layer Workstream C: a study arc — a theme that keeps returning across your notes over
  // weeks or months ("living commentary on your life"). Joins each note's fingerprint themes/tone
  // (Workstream A) with its timestamp; needs the full note set to count honestly. Tapping opens the
  // thread-review dialog listing notes in the arc.
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

  const sectionArc = useMemo(() => {
    if (hasMoreNotes || studyArc) return undefined;
    const arcNotes = notes.map((n) => {
      const fp = fingerprintsById.get(n.id);
      return {
        id: n.id,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        canonSection: fp?.canonSection ?? null,
        canonSectionLabel: fp?.canonSectionLabel ?? null,
        testament: fp?.testament ?? null,
      };
    });
    return deriveSectionArcs(arcNotes, { nowMs: Date.now(), limit: 1 })[0];
  }, [notes, fingerprintsById, hasMoreNotes, studyArc]);

  const activeArc = studyArc ?? sectionArc;
  const activeArcIsSection = !studyArc && Boolean(sectionArc);

  const studyArcCopy = useMemo(() => {
    if (studyArc) {
      const since = studyArcSinceLabel(studyArc.firstMs, Date.now());
      const tone = studyArcToneLabel(studyArc.dominantTone);
      const base = `Across ${studyArc.noteCount} notes since ${since}`;
      return tone ? `${base} · ${tone}` : base;
    }
    if (sectionArc) return sectionArcCopy(sectionArc, Date.now());
    return null;
  }, [studyArc, sectionArc]);

  const openStudyArc = useCallback(() => {
    if (!activeArc) return;
    const noteIds = 'noteIds' in activeArc ? activeArc.noteIds : [];
    const subject =
      activeArcIsSection && sectionArc
        ? sectionArc.sectionLabel
        : studyArc
          ? studyArc.theme
          : '';
    const proposalNotes = noteIds
      .map((id) => notes.find((n) => n.id === id))
      .filter((n): n is SpaceNoteRow => Boolean(n))
      .map((n) => ({ id: n.id, title: n.title ?? null }));
    if (proposalNotes.length === 0) return;
    setSidebarThreadProposal({
      subject,
      notes: proposalNotes,
      variant: 'arc',
    });
    setSidebarLayer('list');
    ensureSidebarExpanded();
  }, [
    activeArc,
    activeArcIsSection,
    sectionArc,
    studyArc,
    notes,
    setSidebarLayer,
    setSidebarThreadProposal,
    ensureSidebarExpanded,
  ]);

  // ── Generative recall: seed a draft note + derive prompts (Phase 1, client-side) ──
  const season = useMemo(() => currentLiturgicalSeason(new Date()), []);

  /**
   * Open a seeded note (title + optional scripture pill) immediately.
   *
   * This used to `await createDraftNote.mutateAsync` and only navigate once the server had
   * returned an id, which meant every generative recall card sat `aria-busy` for a round trip
   * after a tap. It also needed a re-entrancy guard, because the card stayed on screen while
   * the create was in flight and a second tap made a second note. The compose session is
   * synchronous and single — both problems go away with the await.
   */
  /** @returns whether a draft actually opened — see `RecallOpportunity.onOpen`. */
  const startDraftNote = useCallback(
    (opts: { title?: string; contentHtml?: string }): boolean => {
      if (!homeSpaceId) return false;
      if (isMobileSidebar) closeDrawer({ preserveHistory: true });
      beginPrototypeComposeSession({
        targetSpaceId: homeSpaceId,
        seed: { title: opts.title, contentHtml: opts.contentHtml },
      });
      navigate({ to: prototypeHomeRouteTo() });
      return true;
    },
    [homeSpaceId, isMobileSidebar, closeDrawer, beginPrototypeComposeSession, navigate],
  );

  /** @returns whether it landed on a note — see `RecallOpportunity.onOpen`. */
  const openCrossRefGap = useCallback(
    (gap: CrossRefGap): boolean => {
      if (isMobileSidebar) closeDrawer({ preserveHistory: true });
      const candidates = [
        gap.fromNoteId?.trim(),
        findMostRecentNoteForScriptureReference(scriptureBooks, gap.from.displayRef)?.id,
      ].filter((id): id is string => Boolean(id?.trim()));
      const noteId =
        candidates.find((id) => {
          const row = notes.find((n) => n.id === id);
          return !row || row.noteType !== 'scripture';
        }) ?? null;
      if (!noteId) {
        return startDraftNote({
          title: gap.to.displayRef,
          contentHtml: buildVotdScripturePillHtml(gap.to.displayRef, gap.fromTranslation || 'NET'),
        });
      }
      navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(noteId) },
        // Spread the nav-search base rather than building the search from scratch. Dropping it
        // drops `space`, and onHighlightRow carries an explicit warning about exactly that: a
        // note reachable only through a shared space 404s ("Note not found") without it.
        // Harmless while recall only runs on My Home; a latent bug the moment it doesn't.
        search: {
          ...PROTOTYPE_NOTE_LIST_NAV_SEARCH,
          scriptureRef: gap.from.displayRef,
          scriptureTranslation: gap.fromTranslation,
          crossRefTarget: gap.to.displayRef,
          dockReq: String(Date.now()),
        },
      });
      return true;
    },
    [isMobileSidebar, closeDrawer, scriptureBooks, notes, startDraftNote, navigate],
  );

  /**
   * Chapters read, whether or not anything was ever written about them. Everything else on
   * Home is derived from notes, so without this a chapter someone read twice still looks
   * untouched.
   */
  const readChapters = useMemo(
    () =>
      (readingHistoryQuery.data?.chapters ?? []).map((c) => ({
        book: c.book,
        chapter: c.chapter,
        countsAsRead: readingDwellCountsAsRead(c.dwellBucket),
      })),
    [readingHistoryQuery.data],
  );

  const continueBookSuggestion = useMemo(() => {
    if (hasMoreNotes) return undefined;
    const readByBook = new Map<string, number[]>();
    for (const c of readChapters) {
      if (!c.countsAsRead) continue;
      const list = readByBook.get(c.book);
      if (list) list.push(c.chapter);
      else readByBook.set(c.book, [c.chapter]);
    }
    const input = scriptureBooks.map((b) => ({
      book: b.title,
      bookOrder: b.bookOrder,
      citedChapters: b.passages.map((p) => p.chapter),
      readChapters: readByBook.get(b.title) ?? [],
    }));
    return deriveContinueBook(input, bibleBookChapterCounts(), { limit: 1 })[0];
  }, [scriptureBooks, hasMoreNotes, readChapters]);

  /**
   * Where to pick reading back up. Kept separate from `continueBookSuggestion`, which answers a
   * different question — that one names the next chapter of a book you have been *studying*,
   * this one the next chapter of what you were actually *reading*, and someone can be doing
   * both in different books at once.
   */
  const continueReadingSuggestion = useMemo(
    () =>
      deriveContinueReading(
        { lastRead: readingHistoryQuery.data?.lastRead ?? null, readChapters },
        bibleBookChapterCounts(),
      ),
    [readingHistoryQuery.data?.lastRead, readChapters],
  );

  /**
   * Open the chapter in the reader. A card offering to continue reading has to land on the
   * text — and now that the reader exists, on the surface built for reading it rather than the
   * standalone passage pane this originally used.
   *
   * Carries the translation the chapter was last read in rather than the account default, so
   * continuing does not silently switch translations partway through a book.
   */
  const openContinueReading = useCallback(() => {
    if (!continueReadingSuggestion) return;
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    void navigate({
      to: prototypeReadRouteTo(),
      params: {
        book: bookSlug(continueReadingSuggestion.book),
        chapter: String(continueReadingSuggestion.chapter),
      },
      search: { v: undefined, t: continueReadingSuggestion.translation || undefined },
    });
  }, [continueReadingSuggestion, isMobileSidebar, closeDrawer, navigate]);

  const recurringPerson = useMemo(() => {
    if (hasMoreNotes) return undefined;
    const input = notes.map((n) => ({
      noteId: n.id,
      title: n.title ?? null,
      people: fingerprintsById.get(n.id)?.people ?? [],
    }));
    return deriveRecurringPerson(input, { limit: 1 })[0];
  }, [notes, fingerprintsById, hasMoreNotes]);

  const highlightsWithRecency = useMemo(
    () =>
      highlights.map((h) => ({
        ...h,
        recencyMs: Date.parse(prototypeHighlightRecencyIso(h) ?? '') || 0,
      })),
    [highlights],
  );

  const bareHighlight = useMemo(() => pickBareHighlight(highlightsWithRecency), [highlightsWithRecency]);

  const referenceWordConnection = referenceWordConnectionsQuery.data?.[0];

  const openReferenceWordConnection = useCallback(() => {
    if (!referenceWordConnection) return;
    const row = highlightsWithRecency.find((h) => h.id === referenceWordConnection.latestRowId);
    if (row) onOpenHighlight(row);
  }, [referenceWordConnection, highlightsWithRecency, onOpenHighlight]);

  const reflectionPrompt = useMemo(
    () =>
      deriveReflectionPrompt({
        seasonLabel: season?.label,
        arcTheme: studyArc?.theme ?? sectionArc?.sectionLabel,
      }),
    [season, studyArc, sectionArc],
  );

  // ── Generative recall Phase 2 (backend queries) ──
  // The queries themselves are declared above the presentation gate, which reads their settled
  // state; only the derived values live here, next to what consumes them.
  const topCrossRefGap = crossRefGapsQuery.data?.[0];
  const topConnectSuggestion = connectSuggestionsQuery.data?.[0];

  // ── Recall carousel (Home resurfacing) ──
  // Fold the per-kind recall/trend memos above into one varied, ranked, snoozable carousel. Each
  // opportunity is enriched with its fingerprint theme/tone where we have it; only snoozing
  // ("not now") rests it via the recall-cooldown store; the set rotates daily.

  const recallCandidates = useMemo<RecallOpportunity[]>(() => {
    const out: RecallOpportunity[] = [];
    const usedHighlightIds = new Set<string>();

    const pushRevisitOpportunity = (note: SpaceNoteRow) => {
      if (revisitOnHome?.id === note.id) return;
      if (out.some((o) => o.id === note.id)) return;
      const fp = fingerprintsById.get(note.id);
      const rel = protoRelativeCaptionAbbrev(note.updatedAt ?? note.createdAt ?? null);
      const tone = studyArcToneLabel(fp?.emotionalTone ?? null);
      const meta = [rel, fp?.themes?.[0], tone].filter(Boolean).join(' · ');
      out.push({
        id: note.id,
        kind: 'revisitNote',
        noteId: note.id,
        canonSection: fp?.canonSection ?? undefined,
        score: meaningWeightById[note.id] ?? 0.5,
        eyebrow: 'Worth another look',
        title: stripServerAutoUntitledNoteTitleForDisplay(note.title?.trim() ?? '') || 'New Note',
        meta,
        iconName: 'arrow-rotate-left',
        onOpen: () => handleOpenRevisitNote(note, { stack: false }),
      });
    };

    if (revisitNote) {
      pushRevisitOpportunity(revisitNote);
    }

    if (spotlightHighlight) {
      if (continueNote && spotlightHighlight.parentNoteId === continueNote.id) {
        if (revisitNote) pushRevisitOpportunity(revisitNote);
      } else if (isHighlightUnannotated(spotlightHighlight) && isAnnotatableHighlight(spotlightHighlight)) {
        pushAnnotateHighlightRecallCard(out, spotlightHighlight, onOpenHighlight, usedHighlightIds);
      } else {
        // Through the helper, not inline. This branch used to build the same card by hand,
        // which meant it never registered itself in `usedHighlightIds` the way both sibling
        // branches do — so when the spotlight highlight also matched the continue-book chapter
        // or the cross-ref gap below, it was emitted a second time with an identical id.
        pushRevisitHighlightRecallCard(
          out,
          spotlightHighlight,
          onOpenHighlight,
          usedHighlightIds,
          prototypeHighlightSubtitlePreview(spotlightHighlight, spotlightHighlight.parentNoteTitle),
        );
      }
    }

    if (activeArc) {
      const arcTitle = studyArc?.theme ?? sectionArc?.sectionLabel ?? '';
      const id = `arc:${arcTitle.toLowerCase()}`;
      const noteCount = studyArc?.noteCount ?? sectionArc?.noteCount ?? 0;
      out.push({
        id,
        kind: 'arc',
        score: Math.min(1, noteCount / 8),
        eyebrow: activeArcIsSection ? 'A section on your mind' : 'Seems to be on your mind',
        title: arcTitle,
        meta: studyArcCopy ?? '',
        iconName: 'arrow-right-arrow-left',
        onOpen: openStudyArc,
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
        onOpen: openSubjectConnection,
      });
    }

    if (crossRefConnection) {
      const id = `crossref:${crossRefConnection.from.displayRef}|${crossRefConnection.to.displayRef}`;
      out.push({
        id,
        kind: 'crossref',
        score: Math.min(1, crossRefConnection.noteCount / 8),
        eyebrow: 'Linked in your study',
        title: `${crossRefConnection.from.displayRef} and ${crossRefConnection.to.displayRef}`,
        meta: `Across ${crossRefConnection.noteCount} of your notes`,
        iconName: 'arrow-right-arrow-left',
        onOpen: openCrossRefConnection,
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
        iconName: 'scroll',
        onOpen: openPassageConnection,
      });
    }

    if (referenceWordConnection) {
      const latestRow = highlightsWithRecency.find((h) => h.id === referenceWordConnection.latestRowId);
      if (latestRow && !usedHighlightIds.has(latestRow.id)) {
        usedHighlightIds.add(latestRow.id);
        out.push({
          id: `referenceWord:${referenceWordConnection.wordKey}`,
          kind: 'referenceWord',
          noteId: latestRow.id,
          score: Math.min(1, referenceWordConnection.noteCount / 8),
          eyebrow: 'A word you keep looking up',
          title: referenceWordConnection.displayWord,
          meta: `Across ${referenceWordConnection.noteCount} of your notes`,
          iconName: 'lines-leaning',
          onOpen: () => onOpenHighlight(latestRow),
        });
      }
    }

    // ── Generative opportunities ("go make something new") ──
    if (continueBookSuggestion) {
      const ref = `${continueBookSuggestion.book} ${continueBookSuggestion.nextChapter}`;
      const chapterHighlight = findUnannotatedHighlightForChapter(
        highlightsWithRecency,
        continueBookSuggestion.book,
        continueBookSuggestion.nextChapter,
      );
      if (chapterHighlight) {
        pushAnnotateHighlightRecallCard(out, chapterHighlight, onOpenHighlight, usedHighlightIds);
      } else {
        const revisitChapterHighlight = findHighlightForChapter(
          highlightsWithRecency,
          continueBookSuggestion.book,
          continueBookSuggestion.nextChapter,
        );
        if (revisitChapterHighlight) {
          pushRevisitHighlightRecallCard(
            out,
            revisitChapterHighlight,
            onOpenHighlight,
            usedHighlightIds,
            prototypeHighlightSubtitlePreview(revisitChapterHighlight, revisitChapterHighlight.parentNoteTitle),
          );
        } else {
          out.push({
            id: `book:${continueBookSuggestion.book}:${continueBookSuggestion.nextChapter}`,
            kind: 'continueBook',
            isGenerative: true,
            score: Math.min(0.85, 0.5 + continueBookSuggestion.citedCount / 20),
            eyebrow: `Keep going in ${continueBookSuggestion.book}`,
            title: ref,
            meta: continueBookRecallMeta(continueBookSuggestion.book, continueBookSuggestion.nextChapter),
            iconName: 'scroll',
            onOpen: () => startDraftNote({ title: ref, contentHtml: buildVotdScripturePillHtml(ref, 'NET') }),
          });
        }
      }
    }

    if (recurringPerson) {
      out.push({
        id: `person:${recurringPerson.name.toLowerCase()}`,
        kind: 'studyPerson',
        isGenerative: true,
        score: Math.min(0.8, 0.45 + recurringPerson.noteCount / 20),
        eyebrow: 'Someone you keep meeting',
        title: recurringPerson.name,
        meta: recurringPersonRecallMeta(recurringPerson.noteCount),
        iconName: 'circle-user',
        onOpen: () => startDraftNote({ title: recurringPerson.name }),
      });
    }

    if (bareHighlight && !usedHighlightIds.has(bareHighlight.id)) {
      pushAnnotateHighlightRecallCard(out, bareHighlight, onOpenHighlight, usedHighlightIds);
    }

    if (reflectionPrompt) {
      const isSeason = reflectionPrompt.source === 'season';
      out.push({
        id: `reflection:${reflectionPrompt.source}:${reflectionPrompt.label.toLowerCase()}`,
        kind: 'reflection',
        isGenerative: true,
        score: isSeason ? 0.6 : 0.45,
        eyebrow: isSeason ? `It's ${reflectionPrompt.label}` : 'A prayer to write',
        title: reflectionPrompt.title,
        meta: isSeason ? 'Start a reflection for the season' : 'Bring this stretch of study to prayer',
        iconName: isSeason ? 'calendar' : 'pen-to-square',
        onOpen: () => startDraftNote({ title: reflectionPrompt.title }),
      });
    }

    // Phase 2 — backend-powered generative cards
    if (topCrossRefGap) {
      const gapHighlight = findUnannotatedHighlightForRef(highlightsWithRecency, topCrossRefGap.to.displayRef);
      if (gapHighlight) {
        pushAnnotateHighlightRecallCard(out, gapHighlight, onOpenHighlight, usedHighlightIds);
      } else {
        const revisitGapHighlight = findHighlightForRef(highlightsWithRecency, topCrossRefGap.to.displayRef);
        if (revisitGapHighlight) {
          pushRevisitHighlightRecallCard(
            out,
            revisitGapHighlight,
            onOpenHighlight,
            usedHighlightIds,
            prototypeHighlightSubtitlePreview(revisitGapHighlight, revisitGapHighlight.parentNoteTitle),
          );
        } else {
          const id = `crossref-gap:${topCrossRefGap.from.displayRef}|${topCrossRefGap.to.displayRef}`;
          out.push({
            id,
            kind: 'crossrefGap',
            isGenerative: true,
            score: Math.min(0.9, 0.6 + topCrossRefGap.votes / 20),
            eyebrow: 'A cross-reference to explore',
            title: topCrossRefGap.to.displayRef,
            meta: crossRefGapRecallMeta(topCrossRefGap.from.displayRef, topCrossRefGap.to.displayRef),
            iconName: 'arrow-right-arrow-left',
            onOpen: () => openCrossRefGap(topCrossRefGap),
          });
        }
      }
    }

    if (topConnectSuggestion && homeSpaceId) {
      const pairKey = [topConnectSuggestion.noteAId, topConnectSuggestion.noteBId].sort().join('|');
      out.push({
        id: `connect:${pairKey}`,
        kind: 'connectNotes',
        noteId: topConnectSuggestion.noteAId,
        isGenerative: true,
        score: Math.min(0.85, 0.5 + topConnectSuggestion.score / 10),
        eyebrow: connectSuggestionRecallEyebrow(),
        title: formatConnectSuggestionTitle(topConnectSuggestion.noteATitle, topConnectSuggestion.noteBTitle),
        meta: connectSuggestionRecallMeta(topConnectSuggestion.reason),
        iconName: 'arrow-right-arrow-left',
        onOpen: () => {
          onOpenCreateThreadPrefill({
            noteIds: [topConnectSuggestion.noteAId, topConnectSuggestion.noteBId],
            threadName: suggestConnectThreadName(
              topConnectSuggestion.noteATitle,
              topConnectSuggestion.noteBTitle,
              topConnectSuggestion.reason,
            ),
          });
        },
      });
    }

    return out;
  }, [
    continueNote,
    revisitNote,
    revisitOnHome,
    spotlightHighlight,
    studyArc,
    sectionArc,
    activeArc,
    activeArcIsSection,
    studyArcCopy,
    subjectConnection,
    crossRefConnection,
    passageConnection,
    referenceWordConnection,
    fingerprintsById,
    meaningWeightById,
    handleOpenRevisitNote,
    onOpenHighlight,
    openStudyArc,
    openSubjectConnection,
    openCrossRefConnection,
    openPassageConnection,
    continueBookSuggestion,
    navigate,
    recurringPerson,
    bareHighlight,
    highlightsWithRecency,
    reflectionPrompt,
    topCrossRefGap,
    topConnectSuggestion,
    homeSpaceId,
    onOpenCreateThreadPrefill,
    startDraftNote,
    openCrossRefGap,
  ]);

  const selectedRecallOpportunities = useMemo(
    () =>
      selectRecallOpportunities(recallCandidates, {
        snoozedIds: recallSnoozedIds,
        dayIndex: recallDayIndex,
        limit: 6,
      }),
    [recallCandidates, recallSnoozedIds, recallDayIndex],
  );

  /*
   * Once the shelf has been shown, it does not grow.
   *
   * The presentation gate waits on fifteen queries and presents Home once — but it has a
   * 2.5s deadline behind it, because a disabled query stays pending forever and a blank
   * Home is worse than a little jitter. On a cold load that deadline fires first, and
   * whatever lands afterwards used to join the deck.
   *
   * That was tolerable while this was a card stack: one card showed and a late arrival
   * changed something behind it. Flat, every arrival is a row appearing under the pointer
   * in a list someone is already reading. So the first set to be presented is the set for
   * this visit — newcomers wait for the next mount, which is the right cadence for a shelf
   * that is a daily selection rather than a feed.
   *
   * Removals still apply: snoozing is how the deck gets trained, and a row that has been
   * put away has to leave. Only joining is frozen, and only after something has shown.
   */
  const [shownRecallIds, setShownRecallIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (!contentReady || shownRecallIds !== null || selectedRecallOpportunities.length === 0) return;
    setShownRecallIds(selectedRecallOpportunities.map((op) => op.id));
  }, [contentReady, shownRecallIds, selectedRecallOpportunities]);

  const recallOpportunities = useMemo(() => {
    if (shownRecallIds === null) return selectedRecallOpportunities;
    const byId = new Map(selectedRecallOpportunities.map((op) => [op.id, op]));
    return shownRecallIds
      .map((id) => byId.get(id))
      .filter((op): op is RecallOpportunity => Boolean(op));
  }, [shownRecallIds, selectedRecallOpportunities]);

  const topCanonSection = useMemo(
    () => deriveTopCanonSections([...fingerprintsById.values()], 1)[0],
    [fingerprintsById],
  );

  const recallTrendGreeting = useMemo((): HomeGreetingTrend | undefined => {
    const trend = pickRecallTrend(recallCandidates);
    if (!trend) return undefined;

    if (trend.kind === 'arc' && activeArc) {
      const theme = studyArc?.theme ?? sectionArc?.sectionLabel ?? '';
      const parts = recallTrendGreetingParts({ kind: 'arc', theme });
      if (!parts) return undefined;
      return { kind: 'arc', parts, onOpen: openStudyArc };
    }
    if (trend.kind === 'subject' && subjectConnection) {
      const parts = recallTrendGreetingParts({ kind: 'subject', subject: subjectConnection.subject });
      if (!parts) return undefined;
      return { kind: 'subject', parts, onOpen: openSubjectConnection };
    }
    if (trend.kind === 'passage' && passageConnection) {
      const parts = recallTrendGreetingParts({ kind: 'passage', passageRef: passageConnection.displayRef });
      if (!parts) return undefined;
      return { kind: 'passage', parts, onOpen: openPassageConnection };
    }
    if (trend.kind === 'crossref' && crossRefConnection) {
      const parts = recallTrendGreetingParts({
        kind: 'crossref',
        fromRef: crossRefConnection.from.displayRef,
        toRef: crossRefConnection.to.displayRef,
      });
      if (!parts) return undefined;
      return { kind: 'crossref', parts, onOpen: openCrossRefConnection };
    }
    if (trend.kind === 'referenceWord' && referenceWordConnection) {
      const parts = recallTrendGreetingParts({
        kind: 'referenceWord',
        referenceWord: referenceWordConnection.displayWord,
      });
      if (!parts) return undefined;
      return { kind: 'referenceWord', parts, onOpen: openReferenceWordConnection };
    }
    return undefined;
  }, [
    recallCandidates,
    activeArc,
    studyArc,
    sectionArc,
    subjectConnection,
    passageConnection,
    crossRefConnection,
    referenceWordConnection,
    openStudyArc,
    openSubjectConnection,
    openPassageConnection,
    openCrossRefConnection,
    openReferenceWordConnection,
  ]);

  const handleRecallSnooze = useCallback(
    (id: string) => {
      recordRecallSnoozed(homeSpaceId, id, recallDayIndex);
      setRecallTick((t) => t + 1);
    },
    [homeSpaceId, recallDayIndex],
  );

  const handleRecallOpened = useCallback(
    (id: string) => {
      // Acting on a card rests it. This is the call that never existed: only the ✕ ever
      // recorded anything, so a suggestion you had already followed came straight back —
      // and generative cards (continue book, reflection, cross-ref gap) have no noteId,
      // so they didn't even get the server-side stability bump.
      recordRecallOpened(homeSpaceId, id, recallDayIndex, RECALL_OPENED_COOLDOWN_DAYS);
      setRecallTick((t) => t + 1);
    },
    [homeSpaceId, recallDayIndex],
  );

  const onCreateFirstNote = useCallback(() => {
    if (!homeSpaceId) return;
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    beginPrototypeComposeSession({ targetSpaceId: homeSpaceId });
    navigate({ to: prototypeHomeRouteTo() });
  }, [beginPrototypeComposeSession, closeDrawer, homeSpaceId, isMobileSidebar, navigate]);

  if (!contentReady) {
    return <ProtoSpaceLoading label="Loading home" />;
  }

  const openThread = (threadId: string) => {
    const slug = threadId.startsWith('note_') ? threadId.slice('note_'.length) : threadId;
    setSidebarListMode('threads');
    setSidebarThreadDrilldownId(slug);
    ensureSidebarExpanded();
  };

  return (
    <div className={homeViewClassName}>
      <div className="proto-home-section">
        <HomeGreeting
          notes={notes}
          countForLogic={countForLogic}
          hasMoreForLogic={hasMoreForLogic}
          lead={lead}
          trend={recallTrendGreeting}
          topCanonSection={topCanonSection}
          onOpenScriptureBook={onOpenScriptureBook}
        />
      </div>

      {/*
        Three shelves, in the order a reader can act on them: what you were already doing,
        what someone else has put in front of you, then what is merely worth a look. The
        old flat stack made all eight cards equally loud.
      */}
      <HomeSection title="Continue">
        {notesListPhase === 'empty' ? null : continueNote && !continueIsActive ? (
          <HomeNoteCard
            iconName="pen-to-square"
            note={continueNote}
            onOpenNote={onOpenNote}
            prefetchNote={prefetchNote}
          />
        ) : revisitOnHome ? (
          <HomeNoteCard
            iconName="arrow-rotate-left"
            note={revisitOnHome}
            onOpenNote={handleOpenRevisitNote}
            prefetchNote={prefetchNote}
          />
        ) : null}

        {continueReadingSuggestion ? (
          <PrototypeHomeRow
            icon="book-open"
            title={`${continueReadingSuggestion.book} ${continueReadingSuggestion.chapter}`}
            meta={[
              continueReadingEyebrow(continueReadingSuggestion),
              continueReadingMeta(continueReadingSuggestion),
            ]}
            onClick={openContinueReading}
          />
        ) : null}

        {spotlightThread ? (
          <PrototypeHomeRow
            icon="arrow-right-arrow-left"
            title={spotlightThread.title}
            meta={[`${spotlightThread.noteCount} ${spotlightThread.noteCount === 1 ? 'note' : 'notes'}`]}
            onClick={() => openThread(spotlightThread.id)}
          />
        ) : null}
      </HomeSection>

      {/*
        This Sunday sits above the founder letter: a church's Sunday is an appointment, the
        letter is evergreen. Both render nothing when they have nothing, and the group hides
        itself when they all do.
      */}
      <HomeSection title="Following">
        <PrototypeHomeThisSunday homeSpaceId={homeSpaceId} />
        {/* Below the church's appointments: a plan you set yourself is a habit,
            and on a Saturday the appointment still wins. */}
        <PrototypeHomeReadingPlan />
        <PrototypeHomeChurchFeed />
        <PrototypeFounderLetterPill />
      </HomeSection>

      <HomeSection title="Suggested">
        {votd ? (
          <PrototypeDailyPassagePill
            homeSpaceId={homeSpaceId}
            notes={notes}
            votd={votd}
            scriptureBooks={scriptureBooks}
            onOpenScripturePassage={onOpenScripturePassage}
          />
        ) : null}

        {looseCount >= LOOSE_MIN ? (
          <PrototypeHomeRow
            icon="folder"
            title={`${looseCount} ${looseCount === 1 ? 'note needs' : 'notes need'} a home`}
            onClick={() => {
              setSidebarListMode('folders');
              setSidebarFolderDrilldown(null);
              ensureSidebarExpanded();
            }}
          />
        ) : null}

        {recallOpportunities.length > 0 ? (
          <PrototypeRecallCarousel
            opportunities={recallOpportunities}
            onSnooze={handleRecallSnooze}
            onOpened={handleRecallOpened}
            onRecallSynced={handleRecallSynced}
            homeSpaceId={homeSpaceId}
          />
        ) : null}
      </HomeSection>

      {/*
        First run leads with reading, not writing.
        A blank account used to open on "Create your first note", which asks someone to
        produce something before they have been given anything. Harvous has the whole Bible
        in it now, so the first move offered is to open it — today's passage when there is
        one, John 1 otherwise. Writing is still one tap away, underneath, where it belongs
        once there is something to write about.
      */}
      {notesListPhase === 'empty' ? (
        <div className="proto-home-section">
          <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel">
            <PrototypeHomeRow
              icon="book-open"
              title="Start reading"
              meta={[`${firstRunPassage.reference} — highlight a verse to begin a note from it.`]}
              onClick={() => {
                void navigate({
                  to: prototypeReadRouteTo(),
                  params: {
                    book: bookSlug(firstRunPassage.book),
                    chapter: String(firstRunPassage.chapter),
                  },
                  search: {
                    v: firstRunPassage.verse ? String(firstRunPassage.verse) : undefined,
                    t: undefined,
                  },
                });
              }}
            />
            <PrototypeHomeRow
              icon="note-sticky"
              title="Write a note"
              meta={['Start from a blank page instead.']}
              onClick={onCreateFirstNote}
            />
          </div>
        </div>
      ) : null}

    </div>
  );
}
