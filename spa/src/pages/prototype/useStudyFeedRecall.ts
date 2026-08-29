/**
 * The review prompts Activity can offer, from the same builder Home uses.
 *
 * `buildRecallCandidates` assembles thirteen kinds of card, and every push site inside it is
 * guarded by its own input. That is what makes a partial input bag a coherent request rather
 * than a broken one: hand it what this surface has and it returns the kinds that data can
 * support, ranked by the same `selectRecallOpportunities` and worded by the same copy.
 *
 * **Activity offers the note-and-highlight kinds today** — worth another look, add a thought,
 * a highlight to revisit, a reflection prompt. The connection kinds (arcs, subjects,
 * cross-references, passages, connect-notes) need eight more queries and roughly three hundred
 * lines of derivation that still live inside `PrototypeSidebarHomeView`; they arrive here when
 * that view is retired and its data layer comes with it. Passing `undefined` for them is
 * deliberate and safe, not a stub.
 */
import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import {
  deriveReflectionPrompt,
  localDayIndex,
  pickBareHighlight,
  pickRevisitNote,
  selectRecallOpportunities,
  REVISIT_FALLBACK_MIN_AGE_MS,
} from '@/utils/prototype-home-trends';
import { currentLiturgicalSeason } from '@/utils/liturgical-season';
import { useNoteFingerprints } from '../../hooks/queries/useNoteFingerprints';
import { usePrototypeSpaceStudyThreadHighlights } from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { buildRecallCandidates } from './proto-recall-candidates';
import { prototypeHighlightRecencyIso } from './proto-highlight-subtitle';
import { stabilityById } from './proto-recall-stability';
import { noteParamSlug } from './proto-route-slugs';
import type { RecallOpportunity } from './PrototypeRecallCarousel';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';

/**
 * A note has to have rested this long before it is worth resurfacing — the sidebar's own
 * threshold, restated here because it is a local constant there rather than an export.
 */
const REVISIT_MIN_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** How many prompts a sheet offers. One is the doc's own scope; a second is a choice. */
const FEED_RECALL_LIMIT = 2;

export function useStudyFeedRecall(notes: SpaceNoteRow[]): RecallOpportunity[] {
  const navigate = useNavigate();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const fingerprints = useNoteFingerprints();
  const highlightsQuery = usePrototypeSpaceStudyThreadHighlights(homeSpaceId ?? undefined);

  const {
    meaningWeightById,
    fingerprintsById,
    canonSectionById,
    lastRecallEngagedAtById,
    visitCountById,
    lastSubstantiveVisitAtById,
  } = fingerprints;

  const recallDayIndex = useMemo(() => localDayIndex(new Date()), []);

  const highlightsWithRecency = useMemo(
    () =>
      (highlightsQuery.data ?? []).map((h) => ({
        ...h,
        recencyMs: Date.parse(prototypeHighlightRecencyIso(h) ?? '') || 0,
      })),
    [highlightsQuery.data],
  );

  const revisitNote = useMemo(
    () =>
      pickRevisitNote(notes, {
        nowMs: Date.now(),
        minAgeMs: REVISIT_MIN_AGE_MS,
        fallbackMinAgeMs: REVISIT_FALLBACK_MIN_AGE_MS,
        rotationDayIndex: recallDayIndex,
        meaningWeightById,
        stabilityById: stabilityById(homeSpaceId),
        lastRecallEngagedAtById,
        lastSubstantiveVisitAtById,
        visitCountById,
        canonSectionById,
      }),
    [
      notes,
      homeSpaceId,
      recallDayIndex,
      meaningWeightById,
      lastRecallEngagedAtById,
      lastSubstantiveVisitAtById,
      visitCountById,
      canonSectionById,
    ],
  );

  const candidates = useMemo(
    () =>
      buildRecallCandidates({
        // What this surface has.
        revisitNote,
        highlightsWithRecency,
        bareHighlight: pickBareHighlight(highlightsWithRecency),
        reflectionPrompt: deriveReflectionPrompt({
          seasonLabel: currentLiturgicalSeason(new Date())?.label,
        }),
        fingerprintsById,
        meaningWeightById,
        homeSpaceId,

        /*
         * Opening a prompt is opening the thing it is about — Activity has one destination
         * vocabulary, and a card that behaved differently from the row beneath it would be
         * two ways to reach the same note.
         */
        handleOpenRevisitNote: (note: SpaceNoteRow) => {
          navigate({
            to: prototypeNoteRouteTo(),
            params: { noteId: noteParamSlug(note.id) },
            search: { ...PROTOTYPE_NOTE_LIST_NAV_SEARCH },
          });
        },
        onOpenHighlight: (row: { parentNoteId?: string | null; id: string }) => {
          const noteId = row.parentNoteId ?? null;
          if (!noteId) return false;
          navigate({
            to: prototypeNoteRouteTo(),
            params: { noteId: noteParamSlug(noteId) },
            search: { ...PROTOTYPE_NOTE_LIST_NAV_SEARCH, highlight: row.id },
          });
          return true;
        },
        startDraftNote: () => undefined,

        // Kinds this surface cannot source yet — see the note at the top of the file.
        deletedNoteKey: undefined,
        continueNote: undefined,
        revisitOnHome: undefined,
        spotlightHighlight: undefined,
        studyArc: undefined,
        sectionArc: undefined,
        activeArc: undefined,
        activeArcIsSection: undefined,
        studyArcCopy: undefined,
        subjectConnection: undefined,
        crossRefConnection: undefined,
        passageConnection: undefined,
        referenceWordConnection: undefined,
        openStudyArc: () => undefined,
        openSubjectConnection: () => undefined,
        openCrossRefConnection: () => undefined,
        openPassageConnection: () => undefined,
        continueBookSuggestion: undefined,
        navigate,
        recurringPerson: undefined,
        topCrossRefGap: undefined,
        topConnectSuggestion: undefined,
        onOpenCreateThreadPrefill: () => undefined,
        openCrossRefGap: () => undefined,
        handleRecallCompleted: () => undefined,
      }),
    [
      revisitNote,
      highlightsWithRecency,
      fingerprintsById,
      meaningWeightById,
      homeSpaceId,
      navigate,
    ],
  );

  /* The same ranking the shelf uses, so a prompt does not change its mind about importance
     between two surfaces showing it on the same day. */
  return useMemo(
    () =>
      selectRecallOpportunities(candidates, {
        limit: FEED_RECALL_LIMIT,
        dayIndex: recallDayIndex,
      }),
    [candidates, recallDayIndex],
  );
}
