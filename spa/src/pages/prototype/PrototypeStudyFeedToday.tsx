/**
 * Today's band — what is open, what is offered, what is coming — as three decks.
 *
 * Everything here is ambient rather than chronological, which is exactly why it cannot live
 * among the day's parts. "Keep reading John 4" did not happen this morning; it is a standing
 * offer, and filing it under a time of day would date something that has no date. The band
 * sits above the record for the same reason the prompts do.
 *
 * Today only. A standing offer is about now — on a Tuesday you are flipping back through, the
 * question is what that day held, not what you might do next.
 *
 * It was five sections stacked — Today's passage, Continue, Review, Following, Suggested — and
 * on a busy account the day's own record started two screens down, under everything that was
 * merely on offer. Now:
 *
 * - **Today's passage** stands on its own at the top until you act on it — it is the day's one
 *   offer that is new every day — and then folds to a row in Suggestions.
 * - Under it, **one tab group** and one deck at a time (`ProtoDeck`, one card high with the rest
 *   stacked behind):
 *   - **Pick up** — what you were already doing: the note you were in (or one worth returning
 *     to), the chapter you were reading, the Thread you are building, your study plan's step, a
 *     challenge in progress, and the getting-started checklist one step at a time.
 *   - **Review** — the next question in today's sitting.
 *   - **Suggestions** — everything offered or arriving: your church's Sunday and feed, recall
 *     prompts, a Thread worth strengthening, filing, import, the history window's notice, what's
 *     new, the founder's letter.
 *
 * All three decks stay mounted while one shows, so each one's data is loaded with the page rather
 * than when its tab is pressed, and a tab whose deck has nothing in it is not offered at all.
 * Following lost its heading in the move: each of its rows already names where it came from.
 *
 * It still takes the whole of `useHomeSurfaceData` as one prop, so a value added there cannot go
 * unnoticed here.
 */
import PrototypeHomeRow from './PrototypeHomeRow';
import ProtoDeck, { DECK_SHOW_EVENT } from './ProtoDeck';
import PrototypeHomeThisSunday from './PrototypeHomeThisSunday';
import PrototypeHomeReadingPlan from './PrototypeHomeReadingPlan';
import PrototypeHomeChurchFeed from './PrototypeHomeChurchFeed';
import PrototypeDailyPassagePill from './PrototypeDailyPassagePill';
import PrototypeDailyPassageCard, { dailyPassageShowsCard } from './PrototypeDailyPassageCard';
import PrototypeRecallCarousel from './PrototypeRecallCarousel';
import PrototypeReviewSection from './PrototypeReviewSection';
import PrototypeHistoryLeavingRow from './PrototypeHistoryLeavingRow';
import PrototypeChallengeContinueRow from './PrototypeChallengeContinueRow';
import PrototypeOnboardingDock from './PrototypeOnboardingDock';
import PrototypeStrengthenThreadRow from './PrototypeStrengthenThreadRow';
import { continueReadingEyebrow, continueReadingMeta } from '@/utils/prototype-home-trends';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { protoRelativeCaptionAbbrev } from './proto-time';
import { useLibraryPanelNav } from './library-panel/use-library-panel-nav';
import { LOOSE_MIN, type useHomeSurfaceData } from './use-home-surface-data';

import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import ProtoChipBar from './components/ProtoChipBar';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { OnboardingStepId } from '@/utils/onboarding-state';

/* Off the critical path: a callout arrives after the page does. */
const PrototypeFeatureCalloutInline = lazy(() =>
  import('./callouts/PrototypeFeatureCallout').then((m) => ({ default: m.PrototypeFeatureCalloutInline })),
);

/** A note as a Continue row — the sidebar's `HomeNoteCard`, in this surface's row shape. */
function ContinueNoteRow({
  icon,
  note,
  onOpen,
}: {
  icon: 'pen-to-square' | 'arrow-rotate-left';
  note: SpaceNoteRow;
  onOpen: (note: SpaceNoteRow) => void;
}) {
  return (
    <PrototypeHomeRow
      deckId={`note:${note.id}`}
      icon={icon}
      title={stripServerAutoUntitledNoteTitleForDisplay(note.title?.trim() ?? '') || 'New Note'}
      meta={[
        icon === 'pen-to-square' ? 'Pick up where you left off' : 'Worth another look',
        protoRelativeCaptionAbbrev(note.updatedAt ?? note.createdAt ?? null),
      ]}
      onClick={() => onOpen(note)}
    />
  );
}

type TodayTab = 'pickup' | 'review' | 'suggestions';

const TODAY_TABS: { id: TodayTab; label: string }[] = [
  { id: 'pickup', label: 'Pick up' },
  { id: 'review', label: 'Review' },
  { id: 'suggestions', label: 'Suggestions' },
];

/** The tab you left Home on, on this device — a convenience, never a fact about the account. */
const TODAY_TAB_KEY = 'harvous-home-today-tab';

function readTodayTab(): TodayTab {
  try {
    const stored = window.localStorage.getItem(TODAY_TAB_KEY);
    if (stored === 'pickup' || stored === 'review' || stored === 'suggestions') return stored;
  } catch {
    /* private window or blocked storage: start on Pick up */
  }
  return 'pickup';
}

/**
 * How many cards each tab's deck holds, read off the decks themselves.
 *
 * Every source in a deck decides its own visibility, and Review decides whether it renders a deck
 * at all, so the counts can only be known after the fact — each `ProtoDeck` publishes its own on
 * `data-count`. Watched rather than read once, because cards arrive on their own schedule.
 */
function useDeckCounts(rootRef: RefObject<HTMLElement | null>): Record<TodayTab, number> {
  const [counts, setCounts] = useState<Record<TodayTab, number>>({ pickup: 0, review: 0, suggestions: 0 });
  const read = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const next = { pickup: 0, review: 0, suggestions: 0 } as Record<TodayTab, number>;
    for (const tab of TODAY_TABS) {
      const deck = root.querySelector(`[data-today-tab="${tab.id}"] .proto-deck`);
      next[tab.id] = Number(deck?.getAttribute('data-count') ?? 0) || 0;
    }
    setCounts((previous) =>
      previous.pickup === next.pickup && previous.review === next.review && previous.suggestions === next.suggestions
        ? previous
        : next,
    );
  }, [rootRef]);
  useLayoutEffect(() => {
    read();
  });
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(read);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-count'] });
    return () => observer.disconnect();
  }, [read, rootRef]);
  return counts;
}

export default function PrototypeStudyFeedToday({
  notes,
  home,
  onboardingLeads,
  onStepAction,
}: {
  notes: SpaceNoteRow[];
  home: ReturnType<typeof useHomeSurfaceData>;
  /**
   * The checklist leads Pick up on the day's first visit, and waits at the back of it after —
   * the same rule that used to decide whether its block sat above the band or below it.
   */
  onboardingLeads: boolean;
  onStepAction: (id: OnboardingStepId) => void;
}) {
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const libraryNav = useLibraryPanelNav();
  /* Which Up next card is in front, so a recall prompt counts as seen only when it is. */
  const [upNextShownId, setUpNextShownId] = useState<string | null>(null);
  const [chosenTab, setChosenTab] = useState<TodayTab>(readTodayTab);
  const panelsRef = useRef<HTMLDivElement>(null);
  /* Where the showing deck's pager goes; state, not a ref, so the decks re-render once it exists. */
  const [pagerSlot, setPagerSlot] = useState<HTMLSpanElement | null>(null);
  const counts = useDeckCounts(panelsRef);
  /* Offer only the tabs with something in them, and fall back to the first that has anything
     when the one you left on has emptied — answering today's last question empties Review. */
  const tabs = TODAY_TABS.filter((tab) => counts[tab.id] > 0);
  const activeTab: TodayTab = counts[chosenTab] > 0 ? chosenTab : (tabs[0]?.id ?? chosenTab);
  /*
   * Something inside a tab asked to be shown — today's passage, folded into Suggestions, when a
   * reminder link lands. The deck brings the card forward; the band brings the tab forward, or
   * the scroll that follows would land on a panel that is not showing.
   */
  useEffect(() => {
    const root = panelsRef.current;
    if (!root) return undefined;
    const onShow = (event: Event) => {
      const panel = (event.target as Element | null)?.closest?.('[data-today-tab]');
      const tab = panel?.getAttribute('data-today-tab') as TodayTab | null;
      if (tab) setChosenTab(tab);
    };
    root.addEventListener(DECK_SHOW_EVENT, onShow);
    return () => root.removeEventListener(DECK_SHOW_EVENT, onShow);
  }, []);

  const chooseTab = (tab: TodayTab) => {
    setChosenTab(tab);
    try {
      window.localStorage.setItem(TODAY_TAB_KEY, tab);
    } catch {
      /* the choice still holds for this visit */
    }
  };

  const {
    continueNote,
    continueIsActive,
    revisitOnHome,
    handleOpenRevisitNote,
    continueReadingSuggestion,
    openContinueReading,
    spotlightThread,
    openThread,
    recallOpportunities,
    handleRecallSnooze,
    handleRecallDismiss,
    handleRecallOpened,
    handleRecallSynced,
    looseCount,
    votd,
  } = home;

  /*
   * Continue's three slots, in the sidebar's order and on its terms: the note you were in — or,
   * when that note is already open, one worth returning to instead — then the chapter you were
   * reading, then the Thread you have been building.
   */
  const continueRow = continueNote && !continueIsActive ? continueNote : null;
  const revisitRow = !continueRow && revisitOnHome ? revisitOnHome : null;

  /* One passage, one place: the card at the front of Up next until it is acted on, then the row
     further back. */
  const passageCard = dailyPassageShowsCard(votd);

  const onboarding = <PrototypeOnboardingDock variant="deck" onStepAction={onStepAction} />;

  return (
    <div className="proto-feed-today">
      {/* On a phone, what's new arrives here, in the page, rather than floating over it. */}
      <Suspense fallback={null}>
        <PrototypeFeatureCalloutInline />
      </Suspense>
      {/*
        * Today's passage, on its own above the tabs, until you act on it — the day's one offer
        * that is new every day, so it is not filed behind a tab. Acted on, it folds to its row in
        * Suggestions for the rest of the day.
        */}
      {votd && passageCard ? (
        <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel proto-feed-today__passage">
          <PrototypeDailyPassageCard homeSpaceId={homeSpaceId ?? ''} notes={notes} votd={votd} />
        </div>
      ) : null}

      <div className="proto-feed-tabs">
        {/* The tabs on the left, the showing deck's "‹ 1 of 3 ›" on the right — one row, so
            the card under it is all card. */}
        <div className="proto-feed-tabs__bar">
          {tabs.length > 1 ? (
            <ProtoChipBar
              ariaLabel="Today"
              options={tabs}
              selectedId={activeTab}
              onSelect={chooseTab}
            />
          ) : null}
          <span ref={setPagerSlot} className="proto-feed-tabs__pager" />
        </div>
        <div ref={panelsRef} className="proto-feed-tabs__panels">
          <div className="proto-feed-tabs__panel" data-today-tab="pickup" role="tabpanel" hidden={activeTab !== 'pickup'}>
            <ProtoDeck label="Pick up" pagerSlot={activeTab === 'pickup' ? pagerSlot : null}>
              {onboardingLeads ? onboarding : null}
              {continueRow ? (
                <ContinueNoteRow icon="pen-to-square" note={continueRow} onOpen={home.onOpenNote} />
              ) : revisitRow ? (
                <ContinueNoteRow
                  icon="arrow-rotate-left"
                  note={revisitRow}
                  onOpen={handleOpenRevisitNote}
                />
              ) : null}

              {continueReadingSuggestion ? (
                <PrototypeHomeRow
                  deckId="continue-reading"
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
                  deckId={`thread:${spotlightThread.id}`}
                  icon="arrow-right-arrow-left"
                  title={spotlightThread.title}
                  meta={[
                    `${spotlightThread.noteCount} ${spotlightThread.noteCount === 1 ? 'note' : 'notes'}`,
                  ]}
                  onClick={() => openThread(spotlightThread.id)}
                />
              ) : null}

              {/* A study plan's current step continues something you started, so it is picked up
                  here rather than listed among what is arriving. */}
              <PrototypeHomeReadingPlan />
              <PrototypeChallengeContinueRow />
              {onboardingLeads ? null : onboarding}
            </ProtoDeck>
          </div>
          {/* Review decides its own visibility, including whether it exists at all for this
              account; an empty Review simply leaves its tab out. */}
          <div className="proto-feed-tabs__panel" data-today-tab="review" role="tabpanel" hidden={activeTab !== 'review'}>
            <PrototypeReviewSection />
          </div>
          <div className="proto-feed-tabs__panel" data-today-tab="suggestions" role="tabpanel" hidden={activeTab !== 'suggestions'}>
            <ProtoDeck
              label="Suggestions"
              spotlight="home-up-next"
              onActiveChange={setUpNextShownId}
              pagerSlot={activeTab === 'suggestions' ? pagerSlot : null}
            >
              <PrototypeHomeThisSunday homeSpaceId={homeSpaceId ?? ''} />
              <PrototypeHomeChurchFeed />
              {/*
                * The shelf's own rows, not a copy of them: the overflow with snooze and dismiss is the
                * carousel's, and rebuilding a second one here is how two menus start disagreeing about
                * what "not now" means.
                */}
              <PrototypeRecallCarousel
                opportunities={recallOpportunities}
                onSnooze={handleRecallSnooze}
                onDismiss={handleRecallDismiss}
                onOpened={handleRecallOpened}
                onRecallSynced={handleRecallSynced}
                homeSpaceId={homeSpaceId}
                shownId={activeTab === 'suggestions' ? upNextShownId : null}
              />
              {/* A Thread with enough in it to be worth a path through. Renders nothing when there
                  is no such Thread, when one already has a challenge open, or without the key. */}
              <PrototypeStrengthenThreadRow />
              {votd && !passageCard ? (
                <PrototypeDailyPassagePill homeSpaceId={homeSpaceId ?? ''} notes={notes} votd={votd} />
              ) : null}
              {/* Filing is a suggestion like any other. It opens the unfiled notes themselves, in
                  select mode — the row names a job, so it lands where the job is done. */}
              {looseCount >= LOOSE_MIN ? (
                <PrototypeHomeRow
                  deckId="unfiled"
                  icon="folder"
                  title={`${looseCount} ${looseCount === 1 ? 'note needs' : 'notes need'} a folder`}
                  onClick={() => libraryNav.openUnfiledNotes()}
                />
              ) : null}
              {/* The free history window's soft landing — only while something is in its last week
                  of view, and only for free accounts. */}
              <PrototypeHistoryLeavingRow />
              {/* What's new, importing and the founder's letter are Harvous talking about
                  itself, not suggestions about your study — they stack in the callout
                  (`callouts/use-notice-items.ts`). */}
            </ProtoDeck>
          </div>
        </div>
      </div>
    </div>
  );
}
