/**
 * Every recall card Home can offer, built in one place.
 *
 * This was ~275 lines inside a `useMemo` in `PrototypeSidebarHomeView`, which was fine while
 * the sidebar was the only surface that showed recall. Activity shows the same cards, and a
 * second copy of thirteen push sites is a guarantee that the two drift.
 *
 * A pure function of one input bag rather than a hook: the ranking that consumes it
 * (`selectRecallOpportunities`) is already pure, the assembly is the only part that was not,
 * and a plain function can be called from anywhere and reasoned about without a renderer.
 *
 * **The callbacks are inputs too.** A more declarative shape — seeds carrying `{action}`
 * descriptors that each surface maps to its own handler — was the plan, and it is the better
 * end state. It is not what this commit does: thirteen closures rewritten as descriptors in
 * one step is thirteen chances to change behaviour silently, and this code has no unit tests
 * to catch that. Moving the code verbatim and passing the handlers in keeps the output
 * provably identical, and the descriptors can follow once there is a second caller to prove
 * them against.
 */
import type { RecallOpportunity } from './PrototypeRecallCarousel';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { noteMarkPrompt } from '@/utils/note-mark-prompts';
import { RECALL_KIND_ICONS } from './recall-kind-icons';
import { protoRelativeCaptionAbbrev } from './proto-time';
import { isNoteDeleted } from './proto-deleted-notes';
import { buildVotdScripturePillHtml } from '../../lib/votd-scripture-pill-html';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import {
  connectSuggestionRecallEyebrow,
  connectSuggestionRecallMeta,
  continueBookRecallMeta,
  crossRefGapRecallMeta,
  findHighlightForChapter,
  findHighlightForRef,
  findUnannotatedHighlightForChapter,
  findUnannotatedHighlightForRef,
  formatConnectSuggestionTitle,
  isAnnotatableHighlight,
  isHighlightUnannotated,
  recurringPersonRecallMeta,
  studyArcToneLabel,
  suggestConnectThreadName,
} from '@/utils/prototype-home-trends';
import {
  highlightEntryKindIconName,
  prototypeHighlightListTitle,
  prototypeHighlightSubtitlePreview,
} from './proto-highlight-subtitle';

import type { PrototypeHighlightStudyThreadRow } from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';

/**
 * Everything the cards are assembled from — the memo's own dependency list, named.
 *
 * `handleRecallCompleted` is in here despite having been absent from that dependency array,
 * which is a stale-closure bug the move makes visible: the connect-notes card captured
 * whichever copy existed when the memo last ran.
 */
export interface RecallCandidateInput {
  deletedNoteKey: any;
  continueNote: SpaceNoteRow | null | undefined;
  revisitNote: SpaceNoteRow | null | undefined;
  revisitOnHome: SpaceNoteRow | null | undefined;
  spotlightHighlight: PrototypeHighlightStudyThreadRow | null | undefined;
  studyArc: any;
  sectionArc: any;
  activeArc: any;
  activeArcIsSection: any;
  studyArcCopy: any;
  subjectConnection: any;
  crossRefConnection: any;
  passageConnection: any;
  referenceWordConnection: any;
  fingerprintsById: any;
  meaningWeightById: any;
  handleOpenRevisitNote: any;
  onOpenHighlight: (row: PrototypeHighlightStudyThreadRow) => boolean | void;
  openStudyArc: any;
  openSubjectConnection: any;
  openCrossRefConnection: any;
  openPassageConnection: any;
  continueBookSuggestion: any;
  navigate: any;
  recurringPerson: any;
  bareHighlight: PrototypeHighlightStudyThreadRow | null | undefined;
  highlightsWithRecency: PrototypeHighlightStudyThreadRow[];
  reflectionPrompt: any;
  topCrossRefGap: any;
  topConnectSuggestion: any;
  homeSpaceId: any;
  onOpenCreateThreadPrefill: any;
  startDraftNote: any;
  openCrossRefGap: any;
  handleRecallCompleted: any;
  searchGap: { query: string } | null | undefined;
  /** A note worth going back into and marking. See `pickMarkNoteCandidate`. */
  markNote: SpaceNoteRow | null | undefined;
  handleOpenMarkNote: (note: SpaceNoteRow) => boolean | void;
}

/** Enough of a nameless note's opening to tell it from the next one, without wrapping. */
const MARK_NOTE_TITLE_CHARS = 60;

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
    iconName: RECALL_KIND_ICONS.annotateHighlight,
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

export function buildRecallCandidates(input: RecallCandidateInput): RecallOpportunity[] {
  const {
    searchGap,
    deletedNoteKey,
    continueNote,
    revisitNote,
    markNote,
    handleOpenMarkNote,
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
    handleRecallCompleted,
  } = input;

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
      // Safe to warm: for this kind the id really is the note the row opens.
      prefetchNoteId: note.id,
      canonSection: fp?.canonSection ?? undefined,
      score: meaningWeightById[note.id] ?? 0.5,
      eyebrow: 'Worth another look',
      title: stripServerAutoUntitledNoteTitleForDisplay(note.title?.trim() ?? '') || 'New Note',
      meta,
      iconName: RECALL_KIND_ICONS.revisitNote,
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
      iconName: RECALL_KIND_ICONS.arc,
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
      iconName: RECALL_KIND_ICONS.subject,
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
      iconName: RECALL_KIND_ICONS.crossref,
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
      iconName: RECALL_KIND_ICONS.passage,
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
        iconName: RECALL_KIND_ICONS.referenceWord,
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
          iconName: RECALL_KIND_ICONS.continueBook,
          onOpen: () =>
            startDraftNote({
              title: ref,
              contentHtml: buildVotdScripturePillHtml(ref, 'NET'),
              /* The id has to match this card's own, or the completion rests a suggestion
                 that was never shown. */
              recall: {
                opportunityId: `book:${continueBookSuggestion.book}:${continueBookSuggestion.nextChapter}`,
                kind: 'continueBook',
              },
            }),
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
      iconName: RECALL_KIND_ICONS.studyPerson,
      onOpen: () =>
        startDraftNote({
          title: recurringPerson.name,
          recall: { opportunityId: `person:${recurringPerson.name.toLowerCase()}`, kind: 'studyPerson' },
        }),
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
      iconName: isSeason ? 'calendar' : RECALL_KIND_ICONS.reflection,
      onOpen: () =>
        startDraftNote({
          title: reflectionPrompt.title,
          recall: {
            opportunityId: `reflection:${reflectionPrompt.source}:${reflectionPrompt.label.toLowerCase()}`,
            kind: 'reflection',
          },
        }),
    });
  }

  if (searchGap?.query) {
    /*
     * The one card built from something the reader wanted and did not find.
     *
     * The eyebrow names its own source in four words, which is the whole anti-creepiness
     * design: nobody has to wonder how the app knows, and it is never told back how many
     * times or on which days — "you searched this 4 times, on Tuesday and Friday" is
     * surveillance, where "something you searched for" is a helpful memory.
     *
     * Score is capped low. `selectRecallOpportunities` pins the head slot, and a brand-new
     * kind on a brand-new signal type does not get promoted on hope.
     */
    const searchGapId = `searchgap:${searchGap.query}`;
    out.push({
      id: searchGapId,
      kind: 'searchGap',
      isGenerative: true,
      score: 0.45,
      eyebrow: 'From something you searched for',
      title: searchGap.query,
      meta: 'Nothing in your notes yet. Want to start one?',
      iconName: RECALL_KIND_ICONS.searchGap,
      onOpen: () =>
        startDraftNote({
          title: searchGap.query,
          recall: { opportunityId: searchGapId, kind: 'searchGap' },
        }),
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
          iconName: RECALL_KIND_ICONS.crossrefGap,
          onOpen: () => openCrossRefGap(topCrossRefGap),
        });
      }
    }
  }

  if (topConnectSuggestion && homeSpaceId) {
    const pairKey = [topConnectSuggestion.noteAId, topConnectSuggestion.noteBId].sort().join('|');
    const connectId = `connect:${pairKey}`;
    out.push({
      id: connectId,
      kind: 'connectNotes',
      noteId: topConnectSuggestion.noteAId,
      isGenerative: true,
      score: Math.min(0.85, 0.5 + topConnectSuggestion.score / 10),
      eyebrow: connectSuggestionRecallEyebrow(),
      title: formatConnectSuggestionTitle(topConnectSuggestion.noteATitle, topConnectSuggestion.noteBTitle),
      meta: connectSuggestionRecallMeta(
        topConnectSuggestion.reason,
        topConnectSuggestion.sharedSubject,
      ),
      iconName: RECALL_KIND_ICONS.connectNotes,
      onOpen: () => {
        onOpenCreateThreadPrefill({
          noteIds: [topConnectSuggestion.noteAId, topConnectSuggestion.noteBId],
          threadName: suggestConnectThreadName(
            topConnectSuggestion.noteATitle,
            topConnectSuggestion.noteBTitle,
            topConnectSuggestion.reason,
            topConnectSuggestion.sharedSubject,
          ),
          onCreated: () =>
            handleRecallCompleted(connectId, 'connectNotes', topConnectSuggestion.noteAId),
        });
      },
    });
  }

  /*
   * The five questions that used to be note reviews.
   *
   * They are here rather than in Review because none of them has a right answer — "what stuck
   * with you?" is not something the app can mark you on, and asking it as a review made Review
   * look like it was grading your reasons for writing. What the question actually wants is for
   * you to go back into the note and mark the part that answers it, which is a suggestion.
   *
   * Last, and low-scored, because it is an invitation rather than a thread being picked up.
   */
  if (markNote && !out.some((o) => o.noteId === markNote.id)) {
    out.push({
      id: `mark:${markNote.id}`,
      kind: 'markNote',
      noteId: markNote.id,
      prefetchNoteId: markNote.id,
      score: 0.4,
      eyebrow: 'Worth marking',
      /*
       * Its opening words when it has no name, not "New Note".
       *
       * The title is the only thing on this card that says *which* note, and a picker that
       * prefers long-untouched notes will keep landing on untitled ones — a shelf of cards all
       * reading "New Note" identifies nothing. Same reasoning as the review row's context line.
       */
      title:
        stripServerAutoUntitledNoteTitleForDisplay(markNote.title?.trim() ?? '') ||
        stripHtmlForListPreview(markNote.content ?? '').trim().slice(0, MARK_NOTE_TITLE_CHARS) ||
        'New Note',
      meta: noteMarkPrompt(markNote.id),
      iconName: RECALL_KIND_ICONS.markNote,
      onOpen: () => handleOpenMarkNote(markNote),
    });
  }

  /*
   * Backstop. Every source above is filtered at its own seam, which is where the fix
   * belongs — but there are a dozen push sites and this memo also feeds the *frozen*
   * shelf below, where a row that has already been shown keeps its place for the whole
   * visit as long as it is still a live candidate. A deleted note reaching that map would
   * stay on screen until the page was reloaded, so it is cheaper to be sure here.
   *
   * Highlight kinds put a highlight row's id in `noteId` rather than a note's; ids do not
   * collide across the two, so checking it is harmless there and correct everywhere else.
   */
  return out.filter((op) => !isNoteDeleted(op.noteId) && !isNoteDeleted(op.prefetchNoteId));
}
