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
 * not have to relearn it.
 */
import { useCallback, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeReadRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import {
  continueReadingEyebrow,
  continueReadingMeta,
  deriveContinueReading,
  pickContinueNote,
} from '@/utils/prototype-home-trends';
import { bibleBookChapterCounts, bookSlug } from '@/utils/bible-book-chapters';
import { readingDwellCountsAsRead } from '@/utils/reading-event-kinds';
import { useReadingHistory } from '../../hooks/queries/useReadingHistory';
import { useNoteFingerprints } from '../../hooks/queries/useNoteFingerprints';
import { useVotdToday } from '../../hooks/queries/useVotdToday';
import { usePrototypeSpaceScriptureIndex } from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import PrototypeHomeRow from './PrototypeHomeRow';
import PrototypeHomeSection from './PrototypeHomeSection';
import PrototypeHomeThisSunday from './PrototypeHomeThisSunday';
import PrototypeHomeReadingPlan from './PrototypeHomeReadingPlan';
import PrototypeHomeChurchFeed from './PrototypeHomeChurchFeed';
import PrototypeFounderLetterPill from './PrototypeFounderLetterPill';
import PrototypeDailyPassagePill from './PrototypeDailyPassagePill';
import { noteParamSlug } from './proto-route-slugs';
import { protoRelativeCaptionAbbrev } from './proto-time';
import PrototypeStudyFeedActionCard from './PrototypeStudyFeedActionCard';
import { useLibraryPanelNav } from './library-panel/use-library-panel-nav';
import type { RecallOpportunity } from './PrototypeRecallCarousel';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';

export default function PrototypeStudyFeedToday({
  notes,
  prompts,
}: {
  notes: SpaceNoteRow[];
  /** Recall prompts, shown under Suggested — the shelf they live on in the sidebar. */
  prompts: RecallOpportunity[];
}) {
  const navigate = useNavigate();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const readingHistory = useReadingHistory();
  const { lastSubstantiveVisitAtById } = useNoteFingerprints();
  const votdQuery = useVotdToday({ enabled: Boolean(homeSpaceId) });
  const scriptureQuery = usePrototypeSpaceScriptureIndex(homeSpaceId ?? undefined);
  const libraryNav = useLibraryPanelNav();

  /*
   * The note you were actually working in, by the visit signal rather than by `updatedAt` —
   * opening a note bumps neither, and "continue" has to mean the thing you were reading, not
   * the thing most recently touched by a sync.
   */
  const continueNote = useMemo(
    () => pickContinueNote(notes, { lastSubstantiveVisitAtById }),
    [notes, lastSubstantiveVisitAtById],
  );

  /* A glance is not a read — the dwell bucket decides, the same way it does on Home. */
  const readChapters = useMemo(
    () =>
      (readingHistory.data?.chapters ?? []).map((c) => ({
        book: c.book,
        chapter: c.chapter,
        countsAsRead: readingDwellCountsAsRead(c.dwellBucket),
      })),
    [readingHistory.data],
  );

  const continueReading = useMemo(
    () =>
      deriveContinueReading(
        { lastRead: readingHistory.data?.lastRead ?? null, readChapters },
        bibleBookChapterCounts(),
      ),
    [readingHistory.data?.lastRead, readChapters],
  );

  const openNote = useCallback(
    (noteId: string) => {
      navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(noteId) },
        search: { ...PROTOTYPE_NOTE_LIST_NAV_SEARCH },
      });
    },
    [navigate],
  );

  /* Carries the translation the chapter was last read in, so continuing does not silently
     switch translations partway through a book. */
  const openContinueReading = useCallback(() => {
    if (!continueReading) return;
    void navigate({
      to: prototypeReadRouteTo(),
      params: {
        book: bookSlug(continueReading.book),
        chapter: String(continueReading.chapter),
      },
      search: { t: continueReading.translation || undefined },
    });
  }, [continueReading, navigate]);

  const hasContinue = Boolean(continueNote || continueReading);

  return (
    <div className="proto-feed-today">
      {hasContinue ? (
        <PrototypeHomeSection title="Continue">
          {continueNote ? (
            <PrototypeHomeRow
              icon="pen-to-square"
              title={continueNote.title?.trim() || 'Untitled note'}
              meta={[
                'Pick up where you left off',
                protoRelativeCaptionAbbrev(
                  continueNote.updatedAt ?? continueNote.createdAt ?? null,
                ),
              ]}
              onClick={() => openNote(continueNote.id)}
            />
          ) : null}
          {continueReading ? (
            <PrototypeHomeRow
              icon="book-open"
              title={`${continueReading.book} ${continueReading.chapter}`}
              meta={[
                continueReadingEyebrow(continueReading),
                continueReadingMeta(continueReading),
              ]}
              onClick={openContinueReading}
            />
          ) : null}
        </PrototypeHomeSection>
      ) : null}

      {/* Both of these decide for themselves whether they have anything to show, so the
          section wrapper is theirs to fill or collapse — the same contract Home relies on. */}
      <PrototypeHomeSection title="Following">
        <PrototypeHomeThisSunday homeSpaceId={homeSpaceId ?? ''} />
        <PrototypeHomeReadingPlan />
        <PrototypeHomeChurchFeed />
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
      {votdQuery.data || prompts.length > 0 ? (
        <PrototypeHomeSection title="Suggested">
          {votdQuery.data ? (
            <PrototypeDailyPassagePill
              homeSpaceId={homeSpaceId ?? ''}
              notes={notes}
              votd={votdQuery.data}
              scriptureBooks={scriptureQuery.data ?? []}
              /* The panel's Scripture tab. This used to summon the sidebar, which is the
                 last of that coupling on this surface — see `useLibraryPanelNav`. */
              onOpenScripturePassage={() => libraryNav.openList('scripture')}
            />
          ) : null}
          {prompts.map((opportunity) => (
            <PrototypeStudyFeedActionCard key={opportunity.id} opportunity={opportunity} />
          ))}
        </PrototypeHomeSection>
      ) : null}
    </div>
  );
}
