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
 * merely on offer. Now each lane is a `ProtoDeck`, one card high with the rest stacked behind:
 *
 * - **Pick up** — what you were already doing: the note you were in (or one worth returning
 *   to), the chapter you were reading, the Thread you have been building, your study plan's
 *   current step, a challenge in progress, and the getting-started checklist one step at a time.
 * - **Review** — the next question in today's sitting, beside Pick up once the sheet is wide
 *   enough for two.
 * - **Up next** — everything offered or arriving: today's passage (first, until you act on it),
 *   your church's Sunday and feed, recall prompts, a Thread worth strengthening, filing, import,
 *   the history window's notice, what's new, the founder's letter.
 *
 * Following lost its heading in the move: each of its rows already names where it came from
 * ("From your church", "This Sunday's sermon"), which is what the heading was for.
 *
 * It still takes the whole of `useHomeSurfaceData` as one prop, so a value added there cannot go
 * unnoticed here.
 */
import Icon from '@/components/react/Icon';
import PrototypeHomeRow, { HomeRowPresentation } from './PrototypeHomeRow';
import { stripHtmlPreview } from './sidebar-rows/sidebar-row-helpers';
import ProtoDeck from './ProtoDeck';
import PrototypeHomeThisSunday from './PrototypeHomeThisSunday';
import PrototypeHomeReadingPlan from './PrototypeHomeReadingPlan';
import PrototypeHomeChurchFeed from './PrototypeHomeChurchFeed';
import PrototypeFounderLetterPill from './PrototypeFounderLetterPill';
import PrototypeWhatsNewPill from './PrototypeWhatsNewPill';
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

import { useDismissibleImportPrompt } from './use-dismissible-import-prompt';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { prototypeSettingsDataRouteTo } from '@/lib/prototype-path';
import { onboardingOwnsOffer } from './onboarding-visible-steps';
import { useOnboardingState } from './useOnboardingState';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { OnboardingStepId } from '@/utils/onboarding-state';

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
      /* The note's own opening words, so the card says what you were writing. Never for a
         locked note — its body is ciphertext, and the list says "Locked" for the same reason. */
      excerpt={note.contentEncrypted ? null : stripHtmlPreview(note.content, 140) || null}
      onClick={() => onOpen(note)}
    />
  );
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
  const navigate = useNavigate();
  /* The checklist lists importing too, and both land on this same screen. While its row is
     up, this one steps aside; when the checklist retires, this becomes the only pointer to
     importing again — which is the audience it was aimed at in the first place. */
  const { state: onboardingState } = useOnboardingState();
  const { isGuest } = useHarvousIdentity();
  const onboardingOwnsImport = onboardingOwnsOffer(onboardingState, 'import', isGuest);
  const {
    dismissed: importDismissed,
    ready: importPromptReady,
    dismiss: dismissImportPrompt,
  } = useDismissibleImportPrompt();
  /* Which Up next card is in front, so a recall prompt counts as seen only when it is. */
  const [upNextShownId, setUpNextShownId] = useState<string | null>(null);

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
      <div className="proto-feed-decks">
        <HomeRowPresentation.Provider value="card">
          <ProtoDeck label="Pick up" className="proto-deck--cards">
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
                  'Thread',
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
        </HomeRowPresentation.Provider>

        {/*
          * Review, beside what you were doing rather than above it — a page that opens by asking
          * you a question before showing you the note you had open is the interstitial the
          * strategy doc rules out. Decides its own visibility, including whether it exists at all
          * for this account.
          */}
        <PrototypeReviewSection />
      </div>

      {/*
        * Everything offered or arriving, in one deck. Each source still decides for itself
        * whether it has anything to show; the deck counts what rendered.
        */}
      <ProtoDeck label="Up next" spotlight="home-up-next" onActiveChange={setUpNextShownId}>
        {votd && passageCard ? (
          <PrototypeDailyPassageCard homeSpaceId={homeSpaceId ?? ''} notes={notes} votd={votd} />
        ) : null}
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
          shownId={upNextShownId}
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
        {/*
          * The one pointer anyone gets to the fact that importing exists at all, shown to every
          * account: the people likeliest to have a shelf of notes elsewhere are the ones who have
          * been here longest. So the dismissal is the whole design — saying no is permanent and
          * account-wide, because whether you have notes to bring across is a fact about you.
          */}
        {!isGuest && importPromptReady && !importDismissed && !onboardingOwnsImport ? (
          <PrototypeHomeRow
            deckId="import"
            icon="cloud-arrow-up"
            title="Bring your notes from another app"
            meta={['Markdown, Word, Evernote, or a folder of files']}
            onClick={() => void navigate({ to: prototypeSettingsDataRouteTo() })}
            trailing={
              <button
                type="button"
                className="proto-side-panel__action-btn"
                aria-label="Hide this"
                onClick={(event) => {
                  event.stopPropagation();
                  dismissImportPrompt();
                }}
              >
                <Icon name="xmark" size={12} aria-hidden />
              </button>
            }
          />
        ) : null}
        {/* The free history window's soft landing — only while something is in its last week
            of view, and only for free accounts. */}
        <PrototypeHistoryLeavingRow />
        {/* Above the founder letter: one is news, the other has been true since the app
            existed. */}
        <PrototypeWhatsNewPill />
        <PrototypeFounderLetterPill />
      </ProtoDeck>
    </div>
  );
}
