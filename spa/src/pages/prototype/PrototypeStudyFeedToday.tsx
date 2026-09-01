/**
 * Today's band — what is open, what is offered, what is coming.
 *
 * Everything here is ambient rather than chronological, which is exactly why it cannot live
 * among the day's parts. "Keep reading John 4" did not happen this morning; it is a standing
 * offer, and filing it under a time of day would date something that has no date. The band
 * sits above the record for the same reason the prompts do.
 *
 * Today only. A standing offer is about now — on a Tuesday you are flipping back through, the
 * question is what that day held, not what you might do next.
 *
 * The sections are Home's, in Home's order (Continue, then Following), because this is the
 * content the sidebar's Home layer used to carry and someone moving between the two should
 * not have to relearn it. Since the derivation became `useHomeSurfaceData` this band shows
 * the same three Continue slots and the same recall rows rather than a subset — it takes the
 * whole thing as one prop so a value added there cannot go unnoticed here.
 */
import PrototypeHomeRow from './PrototypeHomeRow';
import PrototypeHomeSection from './PrototypeHomeSection';
import PrototypeHomeThisSunday from './PrototypeHomeThisSunday';
import PrototypeHomeReadingPlan from './PrototypeHomeReadingPlan';
import PrototypeHomeChurchFeed from './PrototypeHomeChurchFeed';
import PrototypeFounderLetterPill from './PrototypeFounderLetterPill';
import PrototypeWhatsNewPill from './PrototypeWhatsNewPill';
import PrototypeDailyPassagePill from './PrototypeDailyPassagePill';
import PrototypeRecallCarousel from './PrototypeRecallCarousel';
import PrototypeStudyInbox from './PrototypeStudyInbox';
import PrototypeStrengthenThreadRow from './PrototypeStrengthenThreadRow';
import { continueReadingEyebrow, continueReadingMeta } from '@/utils/prototype-home-trends';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { usePrototypeSpaceScriptureIndex } from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import { protoRelativeCaptionAbbrev } from './proto-time';
import { useLibraryPanelNav } from './library-panel/use-library-panel-nav';
import { LOOSE_MIN, type useHomeSurfaceData } from './use-home-surface-data';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';

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

export default function PrototypeStudyFeedToday({
  notes,
  home,
}: {
  notes: SpaceNoteRow[];
  home: ReturnType<typeof useHomeSurfaceData>;
}) {
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const scriptureQuery = usePrototypeSpaceScriptureIndex(homeSpaceId ?? undefined);
  const libraryNav = useLibraryPanelNav();

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
   * The sidebar's three slots, in its order and on its terms: the note you were in — or, when
   * that note is already open, one worth returning to instead — then the chapter you were
   * reading, then the Thread you have been building. Activity used to show the first two only,
   * which made the same shelf look shorter here for no reason a reader could name.
   */
  const continueRow = continueNote && !continueIsActive ? continueNote : null;
  const revisitRow = !continueRow && revisitOnHome ? revisitOnHome : null;
  const hasContinue = Boolean(
    continueRow || revisitRow || continueReadingSuggestion || spotlightThread,
  );

  return (
    <div className="proto-feed-today">
      {hasContinue ? (
        <PrototypeHomeSection title="Continue">
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
              meta={[
                `${spotlightThread.noteCount} ${spotlightThread.noteCount === 1 ? 'note' : 'notes'}`,
              ]}
              onClick={() => openThread(spotlightThread.id)}
            />
          ) : null}
        </PrototypeHomeSection>
      ) : null}

      {/*
        * The Study Inbox, between what you were doing and what is coming.
        *
        * Above Following because it is about your own study rather than about something
        * arriving from elsewhere, and below Continue because Continue is where you already
        * were — a page that opens by asking you a question before showing you the note you
        * had open is the interstitial the strategy doc rules out.
        *
        * Decides its own visibility, including whether it exists at all for this account:
        * guest renders null, free renders one dismissible line, Plus with nothing due renders
        * null and the section collapses.
        */}
      <PrototypeStudyInbox />

      {/* Both of these decide for themselves whether they have anything to show, so the
          section wrapper is theirs to fill or collapse — the same contract Home relies on. */}
      <PrototypeHomeSection title="Following">
        <PrototypeHomeThisSunday homeSpaceId={homeSpaceId ?? ''} />
        <PrototypeHomeReadingPlan />
        <PrototypeHomeChurchFeed />
        {/* Above the founder letter: one is news, the other has been true since the app
            existed, and the row that changes should not sit under the one that never does. */}
        <PrototypeWhatsNewPill />
        <PrototypeFounderLetterPill />
      </PrototypeHomeSection>

      {/*
        * One Suggested group, not two — and now actually one.
        *
        * The daily passage and the recall prompts are the same offer in the sidebar's Home
        * layer. This comment claimed they were grouped while the prompts rendered in their
        * own div below the section, which gave the sheet two unlabelled piles of suggestion
        * and gave the prompts a dashed frame nothing else on the page wore.
        */}
      {/*
        * Unconditional, like Following above it, and for the same reason.
        *
        * This used to gate on `votd || looseCount || recallOpportunities.length`, which was a
        * correct list of everything the section could hold — right up until it held something
        * else. The strengthen-a-Thread row decides its own visibility from its own queries, so
        * a parent enumerating its children's conditions cannot include it without duplicating
        * them, and would silently hide it for any reader whose other three offers were empty.
        *
        * `.proto-home-section--group:not(:has(...))` already collapses a group whose children
        * all render null, which is the mechanism Following relies on. Asking after the fact
        * beats keeping a list in sync.
        */}
      <PrototypeHomeSection title="Suggested">
          {votd ? (
            <PrototypeDailyPassagePill
              homeSpaceId={homeSpaceId ?? ''}
              notes={notes}
              votd={votd}
              scriptureBooks={scriptureQuery.data ?? []}
              /* The panel's Scripture tab. This used to summon the sidebar, which is the
                 last of that coupling on this surface — see `useLibraryPanelNav`. */
              onOpenScripturePassage={() => libraryNav.openList('scripture')}
            />
          ) : null}
          {/* Filing is a suggestion like any other, and it was the sidebar's alone. It opens
              the unfiled notes themselves, in select mode — the row names a job, so it lands
              where the job is done rather than on the list of folders. */}
          {looseCount >= LOOSE_MIN ? (
            <PrototypeHomeRow
              icon="folder"
              title={`${looseCount} ${looseCount === 1 ? 'note needs' : 'notes need'} a folder`}
              onClick={() => libraryNav.openUnfiledNotes()}
            />
          ) : null}
          {/*
            * The shelf's own rows, not a copy of them.
            *
            * Activity used to render a plain row per prompt, which meant a suggestion here had
            * no way to be put off or turned down — the overflow with snooze and dismiss is the
            * carousel's, and rebuilding a second one beside it is how two menus start
            * disagreeing about what "not now" means. It returns a bare fragment, so it drops
            * into this section as rows rather than arriving with a frame of its own.
            */}
          {/* A Thread with enough in it to be worth a path through. Renders nothing when there
              is no such Thread, when one already has a challenge open, or without the key. */}
          <PrototypeStrengthenThreadRow />
          <PrototypeRecallCarousel
            opportunities={recallOpportunities}
            onSnooze={handleRecallSnooze}
            onDismiss={handleRecallDismiss}
            onOpened={handleRecallOpened}
            onRecallSynced={handleRecallSynced}
            homeSpaceId={homeSpaceId}
          />
        </PrototypeHomeSection>
    </div>
  );
}
