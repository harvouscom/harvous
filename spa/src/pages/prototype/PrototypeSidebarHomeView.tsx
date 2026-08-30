/**
 * Home space view — the 'space' sidebar layer. A greeting with one consolidated lead theme +
 * liturgical-season line, Today's Passage, then three shelves: Continue, Following, Suggested.
 * Each card renders only when it qualifies.
 *
 * What it *knows* is `useHomeSurfaceData`, shared with Activity so the two surfaces cannot
 * drift; what stays here is how this one arranges it, and where a Thread opens. Copy follows
 * docs/BRAND_VOICE.md — friend-over-coffee, no hype, no em dashes.
 */

import { useCallback } from 'react';

import Icon, { type IconName } from '@/components/react/Icon';

import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { ScriptureIndexBook } from '../../hooks/queries/usePrototypeSpaceScriptureIndex';

import type { PrototypeHighlightStudyThreadRow } from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';

import type { PrototypeNotesListPhase } from '@/utils/prototype-notes-list-phase';
import { continueReadingEyebrow, continueReadingMeta } from '@/utils/prototype-home-trends';

import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { stripHtmlForListPreview } from '@/utils/html-stripper';

import { protoRelativeCaptionAbbrev } from './proto-time';

import PrototypeHomeRow from './PrototypeHomeRow';
import PrototypeHomeGreeting from './PrototypeHomeGreeting';

/* Shared with the shared-space view — see its docblock for why it moved out of here. */
import HomeSection from './PrototypeHomeSection';
import PrototypeRecallCarousel from './PrototypeRecallCarousel';
import ProtoSpaceLoading from './ProtoSpaceLoading';

import PrototypeDailyPassagePill from './PrototypeDailyPassagePill';
import PrototypeFounderLetterPill from './PrototypeFounderLetterPill';
import PrototypeOnboardingDock from './PrototypeOnboardingDock';

import PrototypeHomeChurchFeed from './PrototypeHomeChurchFeed';
import PrototypeHomeThisSunday from './PrototypeHomeThisSunday';
import PrototypeHomeReadingPlan from './PrototypeHomeReadingPlan';

import { useProtoShell, type ThreadProposal } from '../../layouts/proto-shell-context';
import { LOOSE_MIN, useHomeSurfaceData } from './use-home-surface-data';

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
  onOpenCreateThreadPrefill: (prefill: {
    noteIds: [string, string];
    threadName: string;
    /** Fired once the thread actually exists — see `handleRecallCompleted`. */
    onCreated?: () => void;
  }) => void;
};

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
  /*
   * Home's data lives in `useHomeSurfaceData`, shared with Activity. What stays here is the
   * part that is genuinely this surface's: where a suggested grouping and a Thread open.
   * The sidebar answers both inside itself — the proposal replaces its list, a Thread drills
   * it — where Activity raises the shell's host and the search panel respectively.
   */
  const {
    setSidebarListMode,
    setSidebarLayer,
    setSidebarFolderDrilldown,
    setSidebarThreadDrilldownId,
    setSidebarThreadProposal,
    ensureSidebarExpanded,
    openSidebarTagSearch,
  } = useProtoShell();

  const proposeThread = useCallback(
    (proposal: ThreadProposal) => {
      setSidebarThreadProposal(proposal);
      setSidebarLayer('list');
      ensureSidebarExpanded();
    },
    [setSidebarThreadProposal, setSidebarLayer, ensureSidebarExpanded],
  );

  const openThread = useCallback(
    (threadId?: string) => {
      setSidebarListMode('threads');
      setSidebarThreadDrilldownId(
        threadId
          ? threadId.startsWith('note_')
            ? threadId.slice('note_'.length)
            : threadId
          : undefined,
      );
      ensureSidebarExpanded();
    },
    [setSidebarListMode, setSidebarThreadDrilldownId, ensureSidebarExpanded],
  );

  const {
    contentReady,
    homeViewClassName,
    lead,
    recallTrendGreeting,
    continueNote,
    continueIsActive,
    revisitOnHome,
    handleOpenRevisitNote,
    continueReadingSuggestion,
    openContinueReading,
    spotlightThread,
    recallOpportunities,
    handleRecallSnooze,
    handleRecallDismiss,
    handleRecallOpened,
    handleRecallSynced,
    handleOnboardingStep,
    countForLogic,
    hasMoreForLogic,
    looseCount,
    votd,
  } = useHomeSurfaceData({
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
    destinations: { proposeThread, openThread, createThread: onOpenCreateThreadPrefill },
  });

  if (!contentReady) {
    return <ProtoSpaceLoading label="Loading home" />;
  }

  return (
    <div className={homeViewClassName}>
      <div className="proto-home-section">
        <PrototypeHomeGreeting
          notes={notes}
          countForLogic={countForLogic}
          hasMoreForLogic={hasMoreForLogic}
          lead={lead}
          trend={recallTrendGreeting}
          /* The sidebar's chips open sidebar lists — the destinations it has. */
          nav={{
            openList: (mode) => {
              setSidebarListMode(mode);
              ensureSidebarExpanded();
            },
            openThread: (threadId) => {
              setSidebarListMode('threads');
              setSidebarThreadDrilldownId(threadId);
              ensureSidebarExpanded();
            },
            openFolder: (folderName) => {
              setSidebarListMode('folders');
              setSidebarFolderDrilldown(folderName);
              ensureSidebarExpanded();
            },
            /* The rail's own way to the same place: `null` is the Unsorted drill, which is
               the notes without a folder rather than the folders they lack. The sidebar has
               no select-on-arrival, so it lands there in browse mode. */
            openUnfiledNotes: () => {
              setSidebarListMode('folders');
              setSidebarFolderDrilldown(null);
              ensureSidebarExpanded();
            },
            openTag: (tagId, tagName) => openSidebarTagSearch({ tagId, tagName }),
            openScriptureBook: onOpenScriptureBook,
          }}
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

      <HomeSection title="Suggested" spotlight="home-suggested">
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
            title={`${looseCount} ${looseCount === 1 ? 'note needs' : 'notes need'} a folder`}
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
            onDismiss={handleRecallDismiss}
            onOpened={handleRecallOpened}
            onRecallSynced={handleRecallSynced}
            homeSpaceId={homeSpaceId}
          />
        ) : null}
      </HomeSection>

      {/*
        The getting-started checklist, which absorbed the old first-run block.

        That block was two rows — "Start reading" and "Write a note" — shown only while the
        account had no notes at all, and gone the moment one existed. It led with reading for
        a good reason (a blank account asked to "create your first note" is being asked to
        produce something before it has been given anything), and the dock keeps that order.

        What it did not do was survive the first note. Everything past writing — mentioning a
        verse, highlighting, connecting two notes, coming back to something — a new reader
        found by accident or not at all. The dock stays until those are done or put away, and
        every row still leaves on the first tap of its ×.
      */}
      <PrototypeOnboardingDock onStepAction={handleOnboardingStep} />

    </div>
  );
}
