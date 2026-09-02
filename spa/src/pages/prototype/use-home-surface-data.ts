/**
 * Everything Home *knows*, separated from the two surfaces that show it.
 *
 * This derivation used to live inside `PrototypeSidebarHomeView`, which meant Activity — the
 * surface replacing that sidebar — could only offer the subset it could re-derive cheaply.
 * The result was a visible drift the reader could see: the same greeting without its trend
 * clause, a Continue shelf missing two of its three slots, and four of thirteen recall kinds.
 * Every one of those gaps was the same bug wearing a different hat, so the fix is structural
 * rather than four patches: one hook, both surfaces, no second copy to fall behind.
 *
 * **Data here, destinations from the caller.** Nearly every handler below navigates the main
 * pane or the reader and is already right for either surface. Exactly two are not — raising
 * the thread-proposal review, and opening an existing Thread — because the sidebar drills its
 * own list while Activity opens the search panel. Those arrive as `destinations`, so the
 * cards, their ranking and their copy stay shared while each surface keeps its own furniture.
 *
 * The hook is large because the derivation is large; splitting it further would only scatter
 * memos whose dependencies genuinely interlock. It is organised in the same sections it had
 * as part of the view, in the same order.
 */

/**
 * Home space view — the 'space' sidebar layer. A greeting with one consolidated
 * lead theme + liturgical-season line, Today's Passage, then a set of cards:
 * continue, a highlight to revisit, an older note to revisit, a study-thread
 * spotlight, a theme connecting your passages, and a loose-notes nudge. Each
 * card renders only when it qualifies.
 * Copy follows docs/BRAND_VOICE.md — friend-over-coffee, no hype, no em dashes.
 */
import { reportRecallCompleted } from './proto-recall-completion';
import { useUser } from '@clerk/clerk-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';

import {
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
import {
  usePrototypeSpaceScriptureConnections,
} from '../../hooks/queries/usePrototypeSpaceScriptureConnections';
import {
  usePrototypeSpaceReferenceWordConnections,
} from '../../hooks/queries/usePrototypeSpaceReferenceWordConnections';

import { useVotdToday } from '../../hooks/queries/useVotdToday';
import type { PrototypeNotesListPhase } from '@/utils/prototype-notes-list-phase';
import {
  isPrototypeHomeContentReady,
  isPrototypeHomePresentationReady,
  isQuerySettled,
} from '@/utils/prototype-home-ready';
import {
  countLooseNotes,
  deriveSubjectConnections,
  derivePassageConnections,
  deriveStudyArcs,
  deriveStudyArcsFromNodes,
  deriveSectionArcs,
  sectionArcCopy,
  deriveTopBooks,
  deriveTopFolders,
  deriveTopTags,
  deriveTopThread,
  homeLeadDisplayName,
  excludeRecallCandidatesMatchingName,
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
  deriveRecurringPerson,
  pickBareHighlight,
  deriveReflectionPrompt,
  studyArcSinceLabel,
  studyArcToneLabel,
  type HomeSubjectPassageInput,
  type HomePassageConnectionInput,
  type StudyArcNoteInput,
} from '@/utils/prototype-home-trends';
import chapterSubjectsData from '@/data/chapter-subjects.json';
import { currentLiturgicalSeason } from '@/utils/liturgical-season';

import { landAgain, readerRouteForReference } from '../../utils/reader-nav';
import { protoRelativeCaptionAbbrev } from './proto-time';
import { prototypeHighlightRecencyIso } from './proto-highlight-subtitle';
import { loadPinnedHighlightIds } from './proto-pinned-stores';
import { stabilityById, mergeStabilityMaps } from './proto-recall-stability';
import {
  activeCooldownIds,
  dismissedRecallIds,
  mergeServerRecallHistoryIntoCooldowns,
  recallRestoredAt,
  recordRecallDismissed,
  recordRecallOpened,
  recordRecallSnoozed,
  subscribeRecallCooldownChanged,
  recentRecallSectionCounts,
  RECALL_OPENED_COOLDOWN_DAYS,
  RECALL_COMPLETED_COOLDOWN_DAYS,
} from './proto-recall-cooldown';
import { recordRecallOpportunityEvent } from './proto-recall-events';
import { markRecallShelfSeen } from './proto-recall-seen';
import type { RecallOpportunityKind } from '@/utils/recall-opportunity-kinds';
import { useRecallEventHistory } from '../../hooks/queries/useRecallEventHistory';

import { type HomeGreetingTrend } from './PrototypeHomeGreeting';
import { buildRecallCandidates } from './proto-recall-candidates';
/* Shared with the shared-space view — see its docblock for why it moved out of here. */

import { type RecallOpportunity } from './PrototypeRecallCarousel';

import { useProtoHomeViewClassName } from './useProtoHomeViewEnter';

/** Force Home to present even if an auxiliary query never settles. */
const HOME_PRESENTATION_DEADLINE_MS = 2500;
import { useNoteFingerprints } from '../../hooks/queries/useNoteFingerprints';
import { useStudyBibleNodes } from '../../hooks/queries/useStudyBibleNodes';
import type { NodeKind } from '@/utils/study-bible-nodes';
import { deletedNoteIds, isNoteDeleted, subscribeDeletedNotes } from './proto-deleted-notes';
import { useCrossRefGaps } from '../../hooks/queries/useCrossRefGaps';
import { useSearchEvents } from '../../hooks/queries/useSearchEvents';
import { deriveSearchGap, hasNoteAnsweringGap } from '@/utils/search-gap';
import { findMostRecentNoteForScriptureReference } from '@/utils/scripture-passage-drill';
import type { CrossRefGap } from '../../hooks/queries/useCrossRefGaps';
import { useConnectSuggestions } from '../../hooks/queries/useConnectSuggestions';
import { useChurchSermons } from '../../hooks/queries/useChurchSermons';
import { useChurchFeed } from '../../hooks/queries/useChurchFeed';

import { spotlightNow } from './useSpotlightOnArrival';
import {
  markOnboardingStepDone,
  requestSpotlight,
  seedOnboardingFromSignals,
  useOnboardingState,
} from './useOnboardingState';
import type { OnboardingStepId } from '@/utils/onboarding-state';
import { HOME_FEED_LIMIT } from './PrototypeHomeChurchFeed';

import { noteParamSlug } from './proto-route-slugs';
import { bibleBookChapterCounts, bookSlug } from '@/utils/bible-book-chapters';
import { buildVotdScripturePillHtml } from '../../lib/votd-scripture-pill-html';
import { useProtoShell } from '../../layouts/proto-shell-context';
import type { ThreadProposal } from '../../layouts/proto-shell-context';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Don't nag about loose notes until a few have piled up. */
export const LOOSE_MIN = 3;

/** Resurface a note only after it's gone quiet for two weeks. */
const REVISIT_MIN_AGE_MS = 14 * DAY_MS;
/** Don't nudge "revisit" until there's a real backlog. */
const REVISIT_MIN_NOTES = 5;

const chapterSubjects = chapterSubjectsData as Record<string, Record<string, string[]>>;
// A subject must connect at least this many distinct notes to earn the Home "theme" card.
const SUBJECT_CONNECTION_MIN = 3;
// A TSK cross-reference pair must touch at least this many distinct notes.
const CROSSREF_CONNECTION_MIN = 2;
// A passage must be cited by at least this many distinct notes to resurface on Home.
const PASSAGE_CONNECTION_MIN = 2;

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


export type HomeSurfaceDestinations = {
  /**
   * Raise the review for a grouping Home is suggesting — a subject, a cross-reference pair,
   * or a study arc.
   *
   * `null` where a surface has no frame to review one in. The state is the shell's, but the
   * panel that renders it still lives inside `PrototypeSidebar`, so Activity cannot yet show
   * a proposal it sets. As with `createThread`, the hook reads this and withholds the three
   * kinds that would land nowhere rather than offering cards that do nothing.
   */
  proposeThread: ((proposal: ThreadProposal) => void) | null;
  /**
   * Start a Thread from two notes the recall engine paired up, with the sheet prefilled.
   *
   * `null` where a surface has no sheet to raise — Activity, until the organize sheets come
   * out of `PrototypeSidebar`. Null rather than a no-op on purpose: the hook reads it and
   * withholds the connect-suggestion card entirely, because a card whose whole promise is
   * "connect these two" and which does nothing when pressed is worse than no card at all.
   */
  createThread:
    | ((prefill: {
        noteIds: [string, string];
        threadName: string;
        /** Fired once the thread actually exists — see `handleRecallCompleted`. */
        onCreated?: () => void;
      }) => void)
    | null;
  /**
   * Open a Thread that already exists — or, with no id, the list of them. The getting-
   * started step for Threads has no particular one in mind, and both surfaces can say
   * "here is where they live" without inventing one.
   */
  openThread: (threadId?: string) => void;
};

export type HomeSurfaceInput = {
  homeSpaceId: string;
  notes: SpaceNoteRow[];
  notesListPhase: PrototypeNotesListPhase;
  hasMoreNotes: boolean;
  noteTotal?: number;
  scriptureBooks: ScriptureIndexBook[];
  scriptureSettled: boolean;
  /** Currently open note in the main pane — suppresses a redundant "continue" card. */
  activeNoteId?: string;
  onOpenNote: (row: SpaceNoteRow) => void;
  onOpenHighlight: (row: PrototypeHighlightStudyThreadRow) => boolean | void;
  destinations: HomeSurfaceDestinations;
};

/** Only themes, for now. People and places are tracked but nothing on Home reads them yet. */
const STUDY_ARC_NODE_KINDS: readonly NodeKind[] = ['theme'];

export function useHomeSurfaceData({
  homeSpaceId,
  notes,
  notesListPhase,
  hasMoreNotes,
  noteTotal,
  scriptureBooks,
  scriptureSettled,
  activeNoteId,
  onOpenNote,
  onOpenHighlight,
  destinations: { proposeThread, openThread, createThread },
}: HomeSurfaceInput) {
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
  // Themes from the reader's own Study Bible layer, which counts server-side and so can answer
  // for someone whose notes are paginated. See the study arc below.
  const studyBibleNodesQuery = useStudyBibleNodes(STUDY_ARC_NODE_KINDS);
  const recallHistoryQuery = useRecallEventHistory();
  const readingHistoryQuery = useReadingHistory();
  // Declared up here, above the presentation gate, because the gate reads their settled state.
  // They used to sit further down beside the recall memo that consumes them, which put them
  // out of the gate's reach — so each one landed after Home had already painted and inserted a
  // card into a deck the reader was looking at.
  const crossRefGapsQuery = useCrossRefGaps();
  const searchEventsQuery = useSearchEvents();
  const connectSuggestionsQuery = useConnectSuggestions();
  const churchSermonsQuery = useChurchSermons();
  const churchFeedQuery = useChurchFeed({ limit: HOME_FEED_LIMIT });
  const {
    meaningWeightById,
    fingerprintsById,
    canonSectionById,
    recallStabilityById,
    lastRecallEngagedAtById,
    visitCountById,
    lastSubstantiveVisitAtById,
  } = fingerprintsQuery;

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { beginPrototypeComposeSession, isMobileSidebar, closeDrawer, stackNote } =
    useProtoShell();

  const tagsSettled = isQuerySettled(tagsQuery.isPending, tagsQuery.data != null);
  const threadsSettled = isQuerySettled(threadsQuery.isPending, threadsQuery.data != null);
  const highlightsSettled = isQuerySettled(highlightsQuery.isPending, highlightsQuery.data != null);
  const votdSettled =
    isQuerySettled(votdQuery.isPending, votdQuery.data != null) || Boolean(votdQuery.isError);
  const fingerprintsSettled = isQuerySettled(
    fingerprintsQuery.isPending,
    fingerprintsQuery.data != null,
  );
  const studyBibleSettled =
    isQuerySettled(studyBibleNodesQuery.isPending, studyBibleNodesQuery.data != null) ||
    Boolean(studyBibleNodesQuery.isError);
  const connectionsSettled =
    isQuerySettled(crossRefConnectionsQuery.isPending, crossRefConnectionsQuery.data != null) &&
    isQuerySettled(
      referenceWordConnectionsQuery.isPending,
      referenceWordConnectionsQuery.data != null,
    );
  const searchEventsSettled = isQuerySettled(
    searchEventsQuery.isPending,
    searchEventsQuery.data != null,
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
    searchEventsSettled,
    crossRefGapsSettled,
    connectSuggestionsSettled,
    recallHistorySettled,
    churchSermonsSettled,
    churchFeedSettled,
    readingPositionSettled,
    studyBibleSettled,
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
   * should I read", and a first run is exactly when that question is loudest. Genesis 1
   * otherwise, matching the toolbar's own smart-jump fallback.
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
    return { book: 'Genesis', chapter: 1, verse: null, reference: 'Genesis 1' };
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

  /*
   * Notes deleted in this session, as a memo key.
   *
   * The store is module state, so nothing here would re-run when it changes. In practice a
   * delete also rewrites the notes cache, which moves every memo below — but that is the
   * mutation's behaviour, not this file's, and it is exactly the kind of implicit link that
   * put a deleted note back on the shelf in the first place. Reading the ids each render is
   * a handful of strings; depending on them is the part that matters.
   */
  const [, setDeletedTick] = useState(0);
  useEffect(() => subscribeDeletedNotes(() => setDeletedTick((t) => t + 1)), []);
  const deletedNoteKey = deletedNoteIds().join(',');
  const deletedIdList = useMemo(
    () => (deletedNoteKey ? deletedNoteKey.split(',') : []),
    [deletedNoteKey],
  );

  const continueCandidate = useMemo(
    () => pickContinueNote(notes, { excludeIds: deletedIdList, lastSubstantiveVisitAtById }),
    [notes, deletedIdList, lastSubstantiveVisitAtById],
  );
  const continueIsActive = Boolean(
    continueCandidate && activeNoteId && continueCandidate.id === activeNoteId,
  );
  const continueNote = useMemo(() => {
    if (continueIsActive) return continueCandidate;
    if (!activeNoteId) return continueCandidate;
    return (
      pickContinueNote(notes, {
        excludeIds: [activeNoteId, ...deletedIdList],
        lastSubstantiveVisitAtById,
      }) ?? continueCandidate
    );
  }, [
    notes,
    activeNoteId,
    continueIsActive,
    continueCandidate,
    deletedIdList,
    lastSubstantiveVisitAtById,
  ]);
  const spotlightHighlight = useMemo(() => pickSpotlightHighlight(highlights, homeSpaceId), [highlights, homeSpaceId]);
  const recallSnoozedIds = useMemo(
    () =>
      // Local store is per-device; the server history is what makes a card dismissed on
      // one device stay dismissed on the others.
      mergeServerRecallHistoryIntoCooldowns(
        // Two local stores, because the two answers have different lifetimes: the cooldown map
        // expires by window, and "not interested" never does.
        new Set([
          ...activeCooldownIds(homeSpaceId, recallDayIndex),
          ...dismissedRecallIds(homeSpaceId),
        ]),
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
        ...deletedIdList,
      ].filter((id): id is string => Boolean(id)),
    [activeNoteId, continueNote, spotlightHighlight, recallSnoozedIds, deletedIdList],
  );
  const activeContinueExcludeIds = useMemo(
    () =>
      [activeNoteId, ...recallSnoozedIds, ...deletedIdList].filter((id): id is string =>
        Boolean(id),
      ),
    [activeNoteId, recallSnoozedIds, deletedIdList],
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
      lastSubstantiveVisitAtById,
      visitCountById,
      canonSectionById,
      librarySectionCounts,
      recentRecallSectionCounts: recallSectionCounts,
    }),
    [
      recallDayIndex,
      meaningWeightById,
      recallStability,
      lastRecallEngagedAtById,
      lastSubstantiveVisitAtById,
      visitCountById,
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
    proposeThread?.({
      subject: subjectConnection.subject,
      notes: proposalNotes,
    });
  }, [subjectConnection, loadedNoteIds, proposeThread]);

  const openCrossRefConnection = useCallback(() => {
    if (!crossRefConnection) return;
    const proposalNotes = crossRefConnection.notes.filter((n) => loadedNoteIds.has(n.id));
    if (proposalNotes.length < CROSSREF_CONNECTION_MIN) return;
    proposeThread?.({
      subject: `${crossRefConnection.from.displayRef} and ${crossRefConnection.to.displayRef}`,
      notes: proposalNotes,
      variant: 'crossref',
    });
  }, [crossRefConnection, loadedNoteIds, proposeThread]);

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
    navigate(landAgain(readerRoute));
  }, [passageConnection, isMobileSidebar, closeDrawer, navigate]);

  // Memory layer Workstream C: a study arc — a theme that keeps returning across your notes over
  // weeks or months ("living commentary on your life"). Joins each note's fingerprint themes/tone
  // (Workstream A) with its timestamp; needs the full note set to count honestly. Tapping opens the
  // thread-review dialog listing notes in the arc.
  const studyArc = useMemo(() => {
    const nowMs = Date.now();

    /*
     * The layer's counts first, because they are the only ones that survive pagination.
     *
     * The note-side derive below can only count the notes currently in the browser, so it
     * refuses to answer at all once there are more — a reader with two thousand notes and a
     * first page of twenty would be told "3 notes on adoption" when the truth is thirty. The
     * Study Bible layer counted as the study happened, so it has no such limit.
     */
    const themeNodes = studyBibleNodesQuery.data?.nodes ?? [];
    const fromLayer = themeNodes.length
      ? deriveStudyArcsFromNodes(themeNodes, { nowMs, limit: 1 })[0]
      : undefined;
    if (fromLayer) {
      // The layer knows the theme was studied; the notes on screen are what the arc can open.
      const noteIds = notes
        .filter((n) =>
          (fingerprintsById.get(n.id)?.themes ?? []).some(
            (theme) => theme.trim().toLowerCase() === fromLayer.theme.toLowerCase(),
          ),
        )
        .map((n) => n.id);
      return { ...fromLayer, noteIds };
    }

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
    return deriveStudyArcs(arcNotes, { nowMs, limit: 1 })[0];
  }, [notes, fingerprintsById, hasMoreNotes, studyBibleNodesQuery.data]);

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
    proposeThread?.({
      subject,
      notes: proposalNotes,
      variant: 'arc',
    });
  }, [activeArc, activeArcIsSection, sectionArc, studyArc, notes, proposeThread]);

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
    (opts: {
      title?: string;
      contentHtml?: string;
      /* Which card asked for this note. Carried on the seed so the save that finishes it can
         say so — see `proto-recall-completion.ts`. */
      recall?: { opportunityId: string; kind: RecallOpportunityKind };
    }): boolean => {
      if (!homeSpaceId) return false;
      if (isMobileSidebar) closeDrawer({ preserveHistory: true });
      beginPrototypeComposeSession({
        targetSpaceId: homeSpaceId,
        seed: {
          title: opts.title,
          contentHtml: opts.contentHtml,
          startedFromRecallOpportunityId: opts.recall?.opportunityId,
          startedFromRecallKind: opts.recall?.kind,
        },
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
          recall: { opportunityId: `crossrefgap:${gap.from.displayRef}:${gap.to.displayRef}`, kind: 'crossrefGap' },
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
      search: {
        /*
         * The verse only when picking a chapter back up. "Next in Mark" is a chapter you have
         * not read, so there is nowhere in it to return to — landing anywhere but its first
         * verse would be inventing a position rather than restoring one.
         */
        v: continueReadingSuggestion.resumeVerse
          ? String(continueReadingSuggestion.resumeVerse)
          : undefined,
        t: continueReadingSuggestion.translation || undefined,
      },
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
  /*
   * The first suggestion that does not name a note deleted in this session.
   *
   * Both queries hold their answer for ten minutes and both answer with note titles, so
   * invalidating them on delete leaves a window — Home's readiness gate settles on cached
   * data, and paints from it before the refetch lands. Skipping to the next candidate is
   * what closes it. The connect card is checked on *both* ids: it names two notes and
   * threads them together, so either one being gone makes the whole suggestion wrong.
   */
  const topCrossRefGap = crossRefGapsQuery.data?.find((gap) => !isNoteDeleted(gap.fromNoteId));
  /* Withheld where there is no sheet to prefill — see `destinations.createThread`. */
  const topConnectSuggestion = !createThread
    ? undefined
    : connectSuggestionsQuery.data?.find(
        (s) => !isNoteDeleted(s.noteAId) && !isNoteDeleted(s.noteBId),
      );

  // ── Recall carousel (Home resurfacing) ──
  // Fold the per-kind recall/trend memos above into one varied, ranked, snoozable carousel. Each
  // opportunity is enriched with its fingerprint theme/tone where we have it; only snoozing
  // ("not now") rests it via the recall-cooldown store; the set rotates daily.

  /*
   * Declared above the candidate build because that build now *reads* it rather than closing
   * over it. It sat below for as long as the cards were assembled inline, where the closure
   * deferred the read until a tap — which also meant the connect-notes card captured whichever
   * copy existed when the memo last ran, and the dependency array never listed it.
   */
  const handleRecallCompleted = useCallback(
    (id: string, kind: RecallOpportunityKind, noteId?: string) => {
      /* The rest and the event both live in `reportRecallCompleted` now, because the other
         caller is the note page — where a seeded draft is actually finished, and where none
         of this hook's state exists. The tick is the only part that is Home's alone. */
      reportRecallCompleted({ spaceId: homeSpaceId, opportunityId: id, kind, noteId });
      setRecallTick((t) => t + 1);
    },
    [homeSpaceId],
  );

  /*
   * A question asked more than once and never answered.
   *
   * Derived on the client because the gating counts *distinct local days*, and the server does
   * not know the reader's timezone — the same split `study-feed` makes. Notes are checked by
   * title only: a passing mention is not an answer, but a note named for the term is, and
   * offering to start one you already have is the fastest way to make this card feel dumb.
   */
  const searchGap = useMemo(() => {
    const events = searchEventsQuery.data;
    if (!events || events.length === 0) return null;
    const gap = deriveSearchGap(
      events.map((event) => ({
        query: event.query,
        action: event.action,
        resultCount: event.resultCount,
        dayIndex: localDayIndex(new Date(event.createdAt)),
      })),
      { todayDayIndex: recallDayIndex },
    );
    if (!gap) return null;
    return hasNoteAnsweringGap(gap, notes.map((row) => row.title)) ? null : gap;
  }, [searchEventsQuery.data, recallDayIndex, notes]);

  const recallCandidates = useMemo<RecallOpportunity[]>(
    () =>
      buildRecallCandidates({
        searchGap,
        deletedNoteKey,
        continueNote,
        revisitNote,
        revisitOnHome,
        spotlightHighlight,
        /* All five go quiet together where a proposal has nowhere to land — the arc kinds
           and the two connection kinds exist only to open one. */
        studyArc: proposeThread ? studyArc : undefined,
        sectionArc: proposeThread ? sectionArc : undefined,
        activeArc: proposeThread ? activeArc : undefined,
        activeArcIsSection: proposeThread ? activeArcIsSection : undefined,
        studyArcCopy: proposeThread ? studyArcCopy : undefined,
        subjectConnection: proposeThread ? subjectConnection : undefined,
        crossRefConnection: proposeThread ? crossRefConnection : undefined,
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
        onOpenCreateThreadPrefill: createThread ?? (() => undefined),
        startDraftNote,
        openCrossRefGap,
        handleRecallCompleted,
      }),
    [
      deletedNoteKey,
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
      proposeThread,
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
      createThread,
      startDraftNote,
      openCrossRefGap,
      handleRecallCompleted,
    ],
  );

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
   * Once a row has been shown, it keeps its place.
   *
   * The presentation gate waits on fifteen queries and presents Home once — but it has a
   * 2.5s deadline behind it, because a disabled query stays pending forever and a blank
   * Home is worse than a little jitter. On a cold load that deadline fires first, and
   * whatever lands afterwards used to reorder the deck.
   *
   * That was tolerable while this was a card stack: one card showed and a late arrival
   * changed something behind it. Flat, every arrival moves rows under the pointer in a list
   * someone is already reading. So position is what is frozen: a row that has been shown
   * stays where it is for the visit.
   *
   * What is *not* frozen is the count. Freezing the id list alone meant the shelf could only
   * ever shrink — see the resolution below — so a slow load left it short and late data
   * quietly took rows away. Removals still apply: snoozing is how the deck gets trained, and
   * a row that has been put away has to leave.
   */
  const [shownRecallIds, setShownRecallIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (!contentReady || shownRecallIds !== null || selectedRecallOpportunities.length === 0) return;
    setShownRecallIds(selectedRecallOpportunities.map((op) => op.id));
  }, [contentReady, shownRecallIds, selectedRecallOpportunities]);

  const recallOpportunities = useMemo(() => {
    if (shownRecallIds === null) return selectedRecallOpportunities;

    /*
     * Resolve against every live candidate, not the selected six.
     *
     * `selectRecallOpportunities` rotates by a modulus of the candidate count and *then*
     * slices — so when a late page changes membership, everything in the tail moves and a row
     * that is still perfectly valid can fall outside the top six. Looking it up in the sliced
     * list found nothing and the row disappeared mid-read, which is the one thing freezing the
     * shelf was supposed to prevent. Snoozed rows are still excluded, because putting one away
     * has to remove it.
     */
    const snoozed = new Set(recallSnoozedIds);
    const live = new Map(
      recallCandidates.filter((op) => !snoozed.has(op.id)).map((op) => [op.id, op]),
    );

    const pinned = shownRecallIds
      .map((id) => live.get(id))
      .filter((op): op is RecallOpportunity => Boolean(op));

    /*
     * Then top back up to the limit. The presentation gate has a 2.5s deadline behind it, so a
     * cold load can snapshot a half-assembled shelf and — with joining frozen — leave it short
     * for the whole visit. Backfilling only ever appends, and only into space something else
     * vacated or never filled, so the rows already being read stay put.
     */
    const shown = new Set(pinned.map((op) => op.id));
    const backfill = selectedRecallOpportunities.filter((op) => !shown.has(op.id));
    return [...pinned, ...backfill].slice(0, 6);
  }, [shownRecallIds, selectedRecallOpportunities, recallCandidates, recallSnoozedIds]);

  /*
   * Anything that made it onto the shelf joins the frozen set, backfilled rows included.
   * Without this they would be the only unpinned rows on screen and would keep the exact
   * instability this is here to stop — just one row further down.
   */
  useEffect(() => {
    if (shownRecallIds === null) return;
    const known = new Set(shownRecallIds);
    const added = recallOpportunities.map((op) => op.id).filter((id) => !known.has(id));
    if (added.length === 0) return;
    setShownRecallIds([...shownRecallIds, ...added]);
  }, [recallOpportunities, shownRecallIds]);

  const leadName = useMemo(() => homeLeadDisplayName(lead), [lead]);

  const recallTrendGreeting = useMemo((): HomeGreetingTrend | undefined => {
    // Skip a trend that would just repeat the lead chip's name — e.g. lead "Romans" and a
    // "lately returning to Romans" arc clause read as the same fact said twice.
    const trend = pickRecallTrend(excludeRecallCandidatesMatchingName(recallCandidates, leadName));
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
    leadName,
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

  /** The window comes from this card's own deferral history — see `nextSnoozeWindowDays`. */
  const handleRecallSnooze = useCallback(
    (id: string) => {
      recordRecallSnoozed(homeSpaceId, id, recallDayIndex);
      setRecallTick((t) => t + 1);
    },
    [homeSpaceId, recallDayIndex],
  );

  /**
   * "Not interested" — the answer with no expiry.
   *
   * Its own store rather than a snooze with a large window; see `recordRecallDismissed` for
   * why the cooldown map cannot hold one (it prunes by window on every write).
   */
  const handleRecallDismiss = useCallback(
    (id: string) => {
      recordRecallDismissed(homeSpaceId, id);
      setRecallTick((t) => t + 1);
    },
    [homeSpaceId],
  );

  const handleRecallOpened = useCallback(
    (id: string) => {
      // Acting on a card rests it. This is the call that never existed: only the ✕ ever
      // recorded anything, so a suggestion you had already followed came straight back —
      // and generative cards (continue book, reflection, cross-ref gap) have no noteId,
      // so they didn't even get the server-side stability bump.
      recordRecallOpened(homeSpaceId, id, recallDayIndex, RECALL_OPENED_COOLDOWN_DAYS);
      setRecallTick((t) => t + 1);
      // The checklist's "revisit something" step, reported from the one place that knows a
      // resurfaced card was actually followed. There is no query that could tell Home this.
      markOnboardingStepDone('recall');
    },
    [homeSpaceId, recallDayIndex],
  );

  /**
   * The loop closed: the thing the card asked for now exists.
   *
   * Distinct from `handleRecallOpened`, which fires on the tap. Opening the create-thread
   * sheet and abandoning it should leave the suggestion in its short rest and let it come
   * back; a thread that actually got made should not be suggested again for a good while,
   * because it is no longer a suggestion — it is a description of what already happened.
   */
  /**
   * Today's shelf has been looked at, so the way back to it stops being marked.
   *
   * Gated on the shelf having something: marking an empty one as seen would spend the day's
   * only chance to tell you about suggestions that had not been assembled yet.
   */
  useEffect(() => {
    if (recallOpportunities.length > 0) markRecallShelfSeen(homeSpaceId, recallDayIndex);
  }, [recallOpportunities.length, homeSpaceId, recallDayIndex]);

  const onCreateFirstNote = useCallback(() => {
    if (!homeSpaceId) return;
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    beginPrototypeComposeSession({ targetSpaceId: homeSpaceId });
    navigate({ to: prototypeHomeRouteTo() });
  }, [beginPrototypeComposeSession, closeDrawer, homeSpaceId, isMobileSidebar, navigate]);

  const openFirstRunPassage = useCallback(
    (spotlight?: string) => {
      if (isMobileSidebar) closeDrawer({ preserveHistory: true });
      if (spotlight) requestSpotlight(spotlight);
      void navigate({
        to: prototypeReadRouteTo(),
        params: {
          book: bookSlug(firstRunPassage.book),
          chapter: String(firstRunPassage.chapter),
        },
        search: {
          v: firstRunPassage.verse ? String(firstRunPassage.verse) : undefined,
          t: undefined,
          req: String(Date.now()),
        },
      });
    },
    [closeDrawer, firstRunPassage, isMobileSidebar, navigate],
  );

  // ─── Getting-started checklist ─────────────────────────────────────────────

  const { hydrated: onboardingHydrated } = useOnboardingState();

  /*
   * Tell the checklist what this account's own data already answers.
   *
   * Gated on both `contentReady` and `onboardingHydrated`, and each gate stops a different
   * wrong answer. Running before the queries settle would read "no notes, no highlights" off
   * a Home that is merely still loading, and pre-check nothing for someone who has done
   * everything. Running before the account answers would let a device that has simply never
   * synced look identical to a brand-new account — and the auto-complete decision inside is
   * only ever made once.
   *
   * Four of the six steps live here. The other two — connecting notes, following a recall
   * card — are reported by the surfaces that own them, because no query Home already runs
   * could tell it either one happened.
   */
  useEffect(() => {
    if (!contentReady || !onboardingHydrated) return;
    seedOnboardingFromSignals({
      hasReadPosition: (readingHistoryQuery.data?.lastRead ?? null) != null,
      hasNote: countForLogic > 0,
      hasScripturePill: scriptureBooks.length > 0,
      hasHighlight: highlights.length > 0,
    });
  }, [
    contentReady,
    onboardingHydrated,
    readingHistoryQuery.data?.lastRead,
    countForLogic,
    scriptureBooks.length,
    highlights.length,
  ]);

  const handleOnboardingStep = useCallback(
    (id: OnboardingStepId) => {
      switch (id) {
        case 'read':
          openFirstRunPassage();
          return;
        case 'note':
        case 'pill':
          // Both end at a page you can type on. 'pill' does not get its own destination
          // because there is nowhere else to mention a verse — the note *is* the feature.
          onCreateFirstNote();
          return;
        case 'highlight':
          openFirstRunPassage('reader-verses');
          return;
        case 'thread':
          openThread();
          return;
        case 'recall':
          // Already on this page — no navigation, just point at the shelf.
          spotlightNow('home-suggested');
          return;
      }
    },
    [onCreateFirstNote, openFirstRunPassage, openThread],
  );

  return {
    /* Gate — the view decides what to paint while this is false. */
    contentReady,
    homeViewClassName,

    /* Greeting. */
    lead,
    recallTrendGreeting,

    /* Continue: what you were doing, what you were reading, what you were building. */
    continueNote,
    continueIsActive,
    /* Handed back so a surface can take the whole bag as one prop rather than threading the
       opener separately alongside it. */
    onOpenNote,
    revisitOnHome,
    handleOpenRevisitNote,
    continueReadingSuggestion,
    openContinueReading,
    spotlightThread,
    openThread,

    /* Suggested — the ranked recall deck, and the four verbs a card answers to. */
    recallOpportunities,
    handleRecallSnooze,
    handleRecallDismiss,
    handleRecallOpened,
    handleRecallSynced,

    /* Getting started. */
    onboardingHydrated,
    handleOnboardingStep,

    /* Counts the surfaces use to decide whether a nudge is honest yet. */
    countForLogic,
    hasMoreForLogic,
    looseCount,
    votd,
  };
}
