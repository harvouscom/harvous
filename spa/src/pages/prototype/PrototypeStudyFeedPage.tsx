/**
 * Activity — your study as a stack of days, and the app's first screen.
 *
 * A day is a sheet of paper. The days behind it peek above as edges, the way a note parked
 * over the reader does, and flipping back is the same gesture in the same language: this is
 * a pile of pages you have written, not a list you scroll.
 *
 * Scrolling was the first shape and it was wrong for this surface. A feed says "here is
 * everything, keep going"; a day says "here is what this one was", which is the question
 * someone opening Harvous is actually asking. It also gives every day the same frame, so two
 * days can be compared by their shape before a word is read — and a day with nothing in it
 * still gets a sheet, because a rest day is part of the record and a stack that quietly
 * omitted it would rewrite the month into an unbroken streak.
 *
 * Readiness is settled here rather than through `isPrototypeHomePresentationReady`. That gate
 * exists because Home's recall shelf rotates modulo its candidate count, so a late query
 * reshuffles the deck under the reader. Nothing here rotates — days are days.
 */
import PrototypeStudyFeedDateJump from './PrototypeStudyFeedDateJump';
import { studyFeedJumpStep } from '@/utils/study-feed-date-jump';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { prototypeNoteRouteTo, prototypeReadRouteTo } from '@/lib/prototype-path';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import {
  buildStudyFeedDays,
  parseStudyFeedScope,
  serializeStudyFeedScope,
  STUDY_FEED_SCOPE_ALL,
  type StudyFeedItem,
  type StudyFeedScope,
} from '@/utils/study-feed-items';
import { useStudyFeed } from '../../hooks/queries/useStudyFeed';
import { useNavigation } from '../../hooks/queries/useNavigation';
import ProtoSelectMenu, { type ProtoSelectOption } from './ProtoSelectMenu';
import ProtoHouseIcon from './ProtoHouseIcon';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import { noteParamSlug } from './proto-route-slugs';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeStudyFeedPart from './PrototypeStudyFeedPart';
import { studyFeedEmptyDayCopy, summarizeStudyFeedDay } from './study-feed-presentation';
import { canonicalBookOrderMap } from '@/utils/scripture-passage-drill';
import type { LibraryTab } from './library-panel/library-panel-view';
import PrototypeHomeGreeting from './PrototypeHomeGreeting';
import { useHomeNotes } from './useHomeNotes';
import { useHomeSurfaceData } from './use-home-surface-data';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { usePrototypeSpaceScriptureIndex } from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import PrototypeStudyFeedToday from './PrototypeStudyFeedToday';
import PrototypeOnboardingDock from './PrototypeOnboardingDock';
import { takeOnboardingStep } from './onboarding-step-handoff';
import PrototypeThreadProposalReview from './PrototypeThreadProposalReview';
import { threadClusterDrillSlug } from '@/utils/thread-cluster-bulk-actions';
import { markOnboardingLedToday, onboardingHasLedToday } from './onboarding-day-marker';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { PrototypeHighlightStudyThreadRow } from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { useLibraryPanelNav } from './library-panel/use-library-panel-nav';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useOrganizeApi } from '../../lib/prototype-organize-runner-store';

/**
 * Edges drawn above the current sheet — the days immediately behind it.
 *
 * Two, matching every other stack in the app. The cap keeps the shape a stack rather than a
 * row of tabs; reaching further back is what flipping is for.
 */
const MAX_EDGES = 2;

/**
 * Where each of the day's counts goes when you tap it.
 *
 * A number in a sentence that names a kind of thing should be a way to that kind of thing.
 * These were inert spans while the greeting's chips beside them were buttons, so the same
 * line held two pills that looked alike and behaved differently — the reader has no way to
 * tell which is which except by trying.
 */
const STAT_TAB: Record<string, LibraryTab> = {
  written: 'notes',
  marks: 'highlights',
  reads: 'scripture',
  returns: 'notes',
};

/** The focus chip names a book, and the scripture drill wants its canonical ordinal. */
function bookOrderFor(book: string): number {
  return canonicalBookOrderMap().get(book) ?? 0;
}

/** The Activity mark, so the widest scope wears the same glyph as its toolbar half. */
function ProtoLayersMark() {
  return <Icon name="layer-group" size={13} />;
}

/**
 * How far back the picker lets you reach while pages are still loading.
 *
 * Deliberately earlier than Harvous has existed. It is not a claim that anything is there —
 * `studyFeedJumpStep` settles on the oldest real sheet when the study does not go that far —
 * it just declines to guess a floor before the feed knows one.
 */
const JUMP_FLOOR_KEY = '2020-01-01';

export default function PrototypeStudyFeedPage() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<StudyFeedScope>(STUDY_FEED_SCOPE_ALL);
  const { items, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = useStudyFeed(scope);

  const libraryNav = useLibraryPanelNav();
  const { openLibraryPanel, setSidebarThreadProposal } = useProtoShell();
  const organize = useOrganizeApi();
  const greeting = useHomeNotes();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const scriptureQuery = usePrototypeSpaceScriptureIndex(homeSpaceId ?? undefined);

  /* One destination vocabulary for the whole surface: a prompt opens the thing it is about,
     the same way the row beneath it does. */
  const openNoteRow = useCallback(
    (row: SpaceNoteRow) => {
      navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(row.id) },
        search: { ...PROTOTYPE_NOTE_LIST_NAV_SEARCH },
      });
    },
    [navigate],
  );

  const openHighlightRow = useCallback(
    (row: PrototypeHighlightStudyThreadRow) => {
      const noteId = row.parentNoteId ?? null;
      if (!noteId) return false;
      navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(noteId) },
        search: { ...PROTOTYPE_NOTE_LIST_NAV_SEARCH, highlight: row.id },
      });
      return true;
    },
    [navigate],
  );

  /*
   * Home's whole derivation, the same one the sidebar shows — greeting trend, all three
   * Continue slots, and the full recall deck rather than the four kinds this surface could
   * previously re-derive on its own.
   *
   * Two destinations are null, and the hook reads that and withholds the cards that would
   * land nowhere: reviewing a proposed grouping and prefilling a new Thread both need sheets
   * that still live inside `PrototypeSidebar`. They turn on when those come out.
   */
  const home = useHomeSurfaceData({
    homeSpaceId: homeSpaceId ?? '',
    notes: greeting.notes,
    notesListPhase: !greeting.ready ? 'loading' : greeting.notes.length > 0 ? 'list' : 'empty',
    hasMoreNotes: greeting.hasMoreNotes,
    noteTotal: greeting.noteTotal ?? undefined,
    scriptureBooks: scriptureQuery.data ?? [],
    scriptureSettled: !scriptureQuery.isPending,
    /* No note is open behind this surface, so nothing to suppress as redundant. */
    activeNoteId: undefined,
    onOpenNote: openNoteRow,
    onOpenHighlight: openHighlightRow,
    destinations: {
      /* The review is the shell's now, not the sidebar's, so a grouping proposed here has
         somewhere to land — it renders above the day. */
      proposeThread: setSidebarThreadProposal,
      /* And the create-Thread sheet is the host's, so the connect-suggestion card — the
         thirteenth kind, withheld while this was null — can finally be offered here. */
      createThread: organize?.openCreateThread ?? null,
      openThread: (threadId?: string) =>
        threadId ? libraryNav.openThread(threadId) : libraryNav.openList('threads'),
    },
  });

  /* A proposal carries ids and titles; the day sheet already has the rows they name. */
  const notesById = useMemo(
    () => new Map(greeting.notes.map((n) => [n.id, n])),
    [greeting.notes],
  );
  const resolveProposalRow = useCallback(
    (brief: { id: string; title: string | null }): SpaceNoteRow =>
      notesById.get(brief.id) ?? ({ id: brief.id, title: brief.title } as SpaceNoteRow),
    [notesById],
  );
  const navigation = useNavigation();
  /*
   * Only the spaces someone actually shares with other people. A personal space is not a
   * scope — narrowing to it is what "My home" already means, and listing it twice would
   * make the row look like it filters by place when it filters by whose study.
   */
  const sharedSpaces = useMemo(
    () =>
      [...(navigation.data?.spaces ?? []), ...(navigation.data?.memberOfSpaces ?? [])]
        .filter((space) => space.type && space.type !== 'personal')
        .filter(
          (space, i, all) => all.findIndex((other) => other.id === space.id) === i,
        ),
    [navigation.data],
  );

  /*
   * Whose study this day is of — including one room's, which is a scope and not a place.
   *
   * These spaces were taken out of here once, on the reasoning that the switcher is the
   * app's one control for "which space" and a second one could disagree with it out loud:
   * the toolbar saying My Home over a sheet showing Young Adults. That removal named its own
   * cost — "you can no longer see one space's day-by-day trail" — and the cost is the part
   * that turned out to matter. A space's hub shows its recent work; nothing else stacks it
   * by day, which is the whole thing Activity is for.
   *
   * The disagreement was never really one, because the two controls answer different
   * questions and each says which it is answering. The switcher says where you *are* — the
   * place whose surface this is. This chip says whose study the sheet is showing, and takes
   * the space's own name and colour tile when that is a space, so the sheet describes itself
   * rather than leaving the toolbar to be read as describing it.
   *
   * "All" first because it is the default and the widest; "My home" next because it is the
   * only other scope about a person rather than a place. Spaces group under a heading so a
   * long list stays readable — the menu's own grouping, not a second idea.
   *
   * Still nothing at all when someone shares no spaces: every option would then describe the
   * same day, and a filter with one outcome is furniture.
   */
  const scopeOptions = useMemo<ProtoSelectOption<string>[]>(() => {
    if (sharedSpaces.length === 0) return [];
    return [
      { value: 'all', label: 'All activity', triggerLabel: 'All', icon: <ProtoLayersMark /> },
      {
        value: 'home',
        label: 'My home only',
        triggerLabel: 'My home',
        icon: <ProtoHouseIcon size={13} />,
      },
      ...sharedSpaces.map((space) => ({
        value: `space:${space.id}`,
        label: space.title,
        group: 'Spaces',
        /* The space's own colour tile — how someone finds their space in a list before they
           have read a single name. Same mark the note destination picker uses, so the two
           menus of the same spaces look like the same spaces. */
        icon: <ProtoSpaceMenuIcon color={space.color || 'paper'} />,
      })),
    ];
  }, [sharedSpaces]);

  // `now` is read once per render pass, not per item: day labels have to agree with each
  // other, and "Today" computed twice across a midnight boundary would disagree.
  const days = useMemo(() => buildStudyFeedDays(items, new Date()), [items]);

  /** Index into `days`, newest first. 0 is today. */
  const [index, setIndex] = useState(0);

  /* A narrower scope has fewer days in it, so the sheet you were on is not the sheet that
     index now points at. Going back to today is the only answer that is never surprising. */
  useEffect(() => {
    setIndex(0);
  }, [scope]);
  const safeIndex = Math.min(index, Math.max(0, days.length - 1));
  const day = days[safeIndex];

  const goBack = useCallback(() => {
    setIndex((i) => {
      /*
       * Reaching the end of what is loaded asks for more rather than stopping. The stack
       * only reaches as far back as the pages fetched, so without this the oldest sheet is
       * a wall with older study visibly behind it.
       */
      if (i + 1 >= days.length - 1 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
      return Math.min(i + 1, Math.max(0, days.length - 1));
    });
  }, [days.length, fetchNextPage, hasNextPage, isFetchingNextPage]);

  const goForward = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  /*
   * Jumping to a date the stack has not fetched yet.
   *
   * A date inside the loaded run is just an index. A date behind it does not exist yet and
   * cannot be conjured — pages only go backwards — so the request is held and the effect below
   * pulls one page at a time until the run reaches it. Holding it in state rather than looping
   * inline is what keeps that a sequence of ordinary renders instead of an await loop that
   * would have to know when to give up.
   */
  const [pendingJumpKey, setPendingJumpKey] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingJumpKey) return;
    const step = studyFeedJumpStep({ days, targetDayKey: pendingJumpKey, hasMore: Boolean(hasNextPage) });
    if (step.action === 'fetch') {
      if (!isFetchingNextPage) void fetchNextPage();
      return;
    }
    if (step.action === 'jump' || step.action === 'settle') setIndex(step.index);
    setPendingJumpKey(null);
  }, [pendingJumpKey, days, hasNextPage, isFetchingNextPage, fetchNextPage]);

  /* Jumping straight to a depth still has to ask for more, the same way stepping one day
     did — the edges are the way back now, so the fetch has to travel with them. */
  const jumpTo = useCallback(
    (next: number) => {
      if (next >= days.length - 1 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
      setIndex(Math.min(next, Math.max(0, days.length - 1)));
    },
    [days.length, fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  /* Arrow keys step the stack, so a keyboard reader is not forced through every row of a
     sheet to reach the day behind it. Ignored while typing — on this surface that means the
     Library panel's search or another search field. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        goBack();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        goForward();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goBack, goForward]);

  /**
   * Where a moment goes when it is opened.
   *
   * A passage opens the reader; everything else that names a note opens that note. Reading
   * Activity never stamps anything — the note's own visit tracking takes over once it opens,
   * which is the only place a visit is a real event.
   */
  const openMoment = useCallback(
    (item: StudyFeedItem) => {
      if (item.kind === 'passage-read') {
        navigate({
          to: prototypeReadRouteTo(),
          params: { book: item.book, chapter: String(item.chapters[0] ?? 1) },
        });
        return;
      }

      if (item.kind === 'highlight-scripture' && item.reference) {
        const match = /^(.+?)\s+(\d+)/.exec(item.reference);
        if (match) {
          navigate({
            to: prototypeReadRouteTo(),
            params: { book: match[1], chapter: match[2] },
            search: { ref: item.reference },
          });
          return;
        }
      }

      const noteId = 'noteId' in item && item.noteId ? item.noteId : null;
      if (!noteId) return;

      navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(noteId) },
        // Spread the list-nav base rather than building a search object: dropping it drops
        // `space`, and a note reachable only through a shared space 404s without it.
        search: { ...PROTOTYPE_NOTE_LIST_NAV_SEARCH },
      });
    },
    [navigate],
  );

  // The shell's own waiting vocabulary. A skeleton here would be a second one for the same
  // wait, and the dots already answer it everywhere else a pane loads.
  /*
   * Getting started leads the day, once a day.
   *
   * The checklist stays until it is dismissed or finished, so what "each day" buys is where
   * it sits: first thing on a day you have not seen it, and below the day's offers after
   * that. Decided once per mount rather than watched, so the position cannot change under
   * someone mid-read — a fresh visit is what moves it, which is also when a new day starts.
   */
  const [onboardingLeads] = useState(() => !onboardingHasLedToday());
  useEffect(() => {
    if (safeIndex === 0 && onboardingLeads) markOnboardingLedToday();
  }, [safeIndex, onboardingLeads]);

  /*
   * A row pressed from the toolbar's checklist, anywhere in the app, arrives here.
   *
   * Performed on arrival rather than at the press, because this is the only place that knows
   * what each step means — see `onboarding-step-handoff.ts`.
   *
   * **Above the early returns below, and it has to be.** This first sat next to the code that
   * uses it, past the loading branch — so on the first render the hook was not called and on
   * the second it was, which is "Rendered more hooks than during the previous render" and takes
   * the whole page down. It only showed up for members, because a guest renders
   * `PrototypeGuestHome` and never reaches this file.
   *
   * It still waits for `contentReady`, because `handleOnboardingStep` needs the data those
   * queries carry — hence the readiness check *inside* the effect rather than a return above
   * it. The `take` is on the far side of that check too: consuming the handoff while the page
   * could not act on it would swallow the request silently.
   */
  const onboardingHandoffDone = useRef(false);
  useEffect(() => {
    if (onboardingHandoffDone.current) return;
    if (isPending || !home.contentReady) return;
    onboardingHandoffDone.current = true;
    const pending = takeOnboardingStep();
    if (pending) home.handleOnboardingStep(pending);
    // `home` is a fresh object each render; the ref above is what makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, home.contentReady]);

  /*
   * One presentation, not a trickle. `home.contentReady` is the sidebar's own gate — every
   * query the greeting, Continue and Suggested draw from has settled, or the 2.5s deadline
   * inside the hook has called it. Without it this page painted the moment the feed landed
   * and then grew a row at a time as fingerprints, threads and highlights each arrived —
   * the exact jumping the gate's comment describes curing on Home, reproduced here because
   * Activity gated on the feed alone.
   *
   * The feed snapshot keeps its value: the feed fetch no longer sits anywhere on this
   * gate's critical path, so the wait is only ever the aux queries, bounded by the deadline.
   */
  if (isPending || !home.contentReady) {
    return <ProtoSpaceLoading label="Loading your study" />;
  }

  if (!day) {
    return (
      <div className="proto-feed proto-feed--empty">
        <p className="proto-feed__empty">
          Your study will gather here — what you read, what you write, and what you want to come
          back to.
        </p>
      </div>
    );
  }

  const summary = summarizeStudyFeedDay(day.parts.flatMap((part) => part.items), {
    isToday: safeIndex === 0,
    partsCount: day.parts.length,
  });
  const showGreeting = safeIndex === 0 && greeting.ready && home.countForLogic > 0;



  /* Only on today's sheet: a checklist is about now, and a day you flipped back to has no
     business asking you to go and read something. */
  const onboardingDock =
    safeIndex === 0 ? <PrototypeOnboardingDock onStepAction={home.handleOnboardingStep} /> : null;

  /*
   * The day's tally as a sentence fragment rather than a paragraph, so it can either join
   * the greeting or stand as its own.
   *
   * The template literals are deliberate: JSX turns a line break between the last chip and
   * the full stop into a text node, leaving the period floating.
   */
  const summarySentence = summary ? (
    <>
      {`${summary.lead} `}
      {summary.stats.map((stat, i) => (
        <span key={stat.key}>
          {i > 0 ? (i === summary.stats.length - 1 ? ' and ' : ', ') : ''}
          <button
            type="button"
            className="proto-glass-surface proto-feed-sheet__stat"
            aria-label={`Browse ${stat.label}`}
            onClick={() => openLibraryPanel({ tab: STAT_TAB[stat.key], drill: null })}
          >
            {stat.label}
          </button>
        </span>
      ))}
      {summary.focus ? (
        <>
          {', mostly in '}
          <button
            type="button"
            className="proto-glass-surface proto-feed-sheet__stat"
            aria-label={`Browse ${summary.focus}`}
            onClick={() => libraryNav.openScriptureBook(bookOrderFor(summary.focus!))}
          >
            {summary.focus}
          </button>
        </>
      ) : null}
      {`${summary.tail}.`}
    </>
  ) : null;

  const edges = days.slice(safeIndex + 1, safeIndex + 1 + MAX_EDGES);
  /*
   * The edges are the way back now, so they carry what the "Earlier" button used to: at the
   * oldest loaded day there is nothing to slice, and without a page of its own the stack
   * would end in a wall with older study visibly behind it. One more edge, which fetches.
   */
  const showFetchEdge = edges.length === 0 && hasNextPage;


  return (
    <div className="proto-feed">
      <div className="proto-feed-stack">
        {/* Deepest edge first, so the nearest day sits closest to the sheet. */}
        <div className="proto-feed-stack__edges">
          {[...edges].reverse().map((behind, i) => {
            const depth = edges.length - i;
            return (
              <button
                key={behind.dayKey}
                type="button"
                className="proto-feed-stack__edge"
                style={{ '--edge-depth': depth } as CSSProperties}
                onClick={() => jumpTo(safeIndex + depth)}
                aria-label={`Show ${behind.label}`}
              >
                <span className="pds-caption proto-feed-stack__edge-label">{behind.label}</span>
              </button>
            );
          })}
          {showFetchEdge ? (
            <button
              type="button"
              className="proto-feed-stack__edge proto-feed-stack__edge--fetch"
              style={{ '--edge-depth': 1 } as CSSProperties}
              onClick={goBack}
              disabled={isFetchingNextPage}
              aria-label="Show earlier days"
            >
              <span className="pds-caption proto-feed-stack__edge-label">
                {isFetchingNextPage ? 'Loading…' : 'Earlier'}
              </span>
            </button>
          ) : null}
        </div>

        <article className="proto-feed-sheet">
          <header className="proto-feed-sheet__head">
            {/*
              * The sidebar's back row, borrowed: a tile you press to leave, then the name of
              * where you are with its date beneath. The sheet already printed the second
              * half; it was the way out that was a text button reading "Today" while every
              * other drilldown in the app used a tile. One anatomy, two surfaces.
              *
              * It steps one day forward rather than jumping straight to today, because the
              * stack is a pile you flipped back through and a tile that skipped the whole
              * way would lose the days between. Holding the newest day is what makes it
              * disappear at index 0.
              */}
            {safeIndex > 0 ? (
              <button
                type="button"
                className="proto-sidebar-back-tile proto-feed-sheet__back"
                onClick={goForward}
                aria-label={`Back to ${days[safeIndex - 1]?.label ?? 'today'}`}
              >
                <Icon name="caret-left" size={16} aria-hidden />
              </button>
            ) : null}
            <div className="proto-feed-sheet__title">
              <h2 className="proto-feed-sheet__day">{day.label}</h2>
              <PrototypeStudyFeedDateJump
                dateLabel={day.dateLabel}
                dayKey={day.dayKey}
                /*
                 * The floor is only real once there is nothing left to fetch.
                 *
                 * Using the oldest *loaded* sheet would have been wrong in a way that quietly
                 * removed the feature: it would grey out every date the stack has not reached
                 * yet, which is precisely the set of dates the deep-fetch exists to reach. So
                 * while pages remain, anything back to `JUMP_FLOOR_KEY` is selectable and the
                 * jump pulls until it arrives; once the feed is fully loaded the oldest sheet
                 * genuinely is the floor, and offering earlier days would promise sheets that
                 * cannot exist.
                 */
                earliestDayKey={hasNextPage ? JUMP_FLOOR_KEY : days[days.length - 1]?.dayKey}
                todayKey={days[0]?.dayKey ?? day.dayKey}
                onPick={setPendingJumpKey}
              />
            </div>
            <div className="proto-feed-sheet__controls">
              {/*
                * One trigger and a menu, not a row of chips.
                * Eight chips wrapped to two lines and turned the top of the sheet into a
                * toolbar — and this app has a settled answer for choosing one of a list
                * (`ProtoSelectMenu`: a trigger plus a portaled menu of radio rows), used by
                * the space switcher, the list picker and the planner's scopes. A ninth
                * hand-rolled variant is how those four drifted apart in the first place.
                */}
              {scopeOptions.length > 1 ? (
                <ProtoSelectMenu
                  value={serializeStudyFeedScope(scope)}
                  options={scopeOptions}
                  onChange={(next) => setScope(parseStudyFeedScope(next))}
                  label="Whose study to show"
                  className="proto-feed-sheet__scope"
                  menuClassName="proto-note-destination"
                  filterPlaceholder="Filter spaces…"
                />
              ) : null}
            </div>
          </header>

          <div className="proto-feed-sheet__body">
            {/*
              * Today opens with the greeting the sidebar opens with — the same sentence, the
              * same chips, one component. Only today: it is written in the present tense
              * ("you keep coming back to Romans"), which is a claim about now, not about the
              * Tuesday you are flipping back to.
              *
              * `countForLogic > 0` skips the greeting's brand-new-account branch on purpose.
              * That copy welcomes someone into an empty library by naming sidebar lists to go
              * and fill — the wrong invitation on a surface whose own empty state already says
              * what will gather here.
              *
              * The day's tally rides in as the greeting's trailing clause rather than as its
              * own paragraph. Both sentences are about this same moment — who you are and
              * what you did today — and stacked as two blocks they read as two separate
              * announcements with a gap of nothing between them.
              */}
            {showGreeting ? (
              <PrototypeHomeGreeting
                notes={greeting.notes}
                countForLogic={home.countForLogic}
                hasMoreForLogic={home.hasMoreForLogic}
                lead={home.lead}
                /* The clause that closes the sentence — "lately returning to Romans". It was
                   the sidebar's alone while this surface re-derived only the lead. */
                trend={home.recallTrendGreeting}
                /* A chip on a day sheet opens the Library panel at the thing it names.
                   This used to summon the sidebar instead, and the scripture chip could
                   only reach the list rather than the book — see `useLibraryPanelNav`. */
                nav={libraryNav}
                trailing={summarySentence}
              />
            ) : (
              /* A day you flipped back to has no greeting to join, so the tally stands
                 alone — the same sentence, just carrying the paragraph by itself. */
              summarySentence ? <p className="proto-feed-sheet__summary">{summarySentence}</p> : null
            )}

            {/* Above everything when it is up: it is a question waiting on an answer, and
                the day's record can wait behind it. */}
            <PrototypeThreadProposalReview
              variant="inline"
              homeSpaceId={homeSpaceId}
              canCreate
              resolveNoteRow={resolveProposalRow}
              prefetchNote={() => {}}
              onOpenNote={openNoteRow}
              onDismiss={() => setSidebarThreadProposal(undefined)}
              onCreated={(repNoteId) => {
                setSidebarThreadProposal(undefined);
                libraryNav.openThread(threadClusterDrillSlug(repNoteId));
              }}
            />

            {onboardingLeads ? onboardingDock : null}

            {/* Home's own order: what you were doing, then what is coming, then what is
                offered, and only then the record of the day itself. */}
            {safeIndex === 0 && greeting.ready ? (
              <PrototypeStudyFeedToday notes={greeting.notes} home={home} />
            ) : null}

            {onboardingLeads ? null : onboardingDock}

            {day.isEmpty ? (
              <p className="proto-feed-sheet__rest">
                {studyFeedEmptyDayCopy(safeIndex === 0)}
              </p>
            ) : (
              day.parts.map((group) => (
                <PrototypeStudyFeedPart key={group.part} group={group} onOpen={openMoment} />
              ))
            )}
          </div>

        </article>
      </div>
    </div>
  );
}
