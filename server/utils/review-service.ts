/**
 * The database half of Review: turning stored rows into questions, and answers back into rows.
 *
 * The route file above this is HTTP plumbing; everything that needs to know what a review item
 * *means* lives here, so the same logic serves the inbox, the session, and (later) native
 * calling the same endpoints. The scheduling arithmetic and the prompt wording are one layer
 * further out again, in `src/utils/review-scheduling.ts` and `src/utils/review-prompts.ts`,
 * because neither needs a database and both need to be exercised by tests that do not have one.
 */

import {
  DEFAULT_SAMPLE_EXERCISE,
  availableSampleExercises,
  buildSampleExercise,
  gradeSampleAnswer,
  pickSampleReference,
  sampleSeed,
  type ReviewSampleExercise,
  type ReviewSampleSpec,
  type SampleAnswer,
  type SampleExercise,
  type SampleMaterial,
  type SampleSource,
} from '@/utils/review-sample';
import type { VerseClozeSegments } from '@/utils/verse-cloze';
import {
  db,
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  lte,
  ne,
  or,
  Notes,
  NoteConnections,
  NoteFingerprints,
  NoteScriptureReferences,
  ScriptureMetadata,
  ReadingEvents,
  ReviewEvents,
  ReviewItems,
  StudyThreadEntries,
  UserNodeStates,
  sql,
  first,
  ScriptureTopics,
  BiblePeople,
  BiblePlaces,
  UserMetadata,
  isNull,
} from '../db';
import { generateTimestampId } from '@/utils/ids';
import {
  type ReviewEventAction,
  type ReviewItemKind,
  type ReviewItemOrigin,
  type ReviewItemStatus,
  type ReviewOutcome,
  type RecallState,
  isReviewAskableKind,
} from '@/utils/review-item-kinds';
import {
  REVIEW_LEECH_LAPSES,
  deferReview,
  firstDueAt,
  firstDueAtFor,
  nextReviewAfter,
  reviewHasStalled,
  stepBackRung,
} from '@/utils/review-scheduling';
import {
  type ChapterMaterial,
  chapterRungFor,
  fillReviewPrompt,
  nextLadderStep,
  reviewPromptFor,
  reviewSeed,
  reviewTaskFor,
  type ReviewPromptKey,
  verseRungFor,
  type VerseMaterial,
} from '@/utils/review-prompts';
import { splitChapterHtmlIntoVerses, verseHtml, versesHtml, type ChapterVerse } from '@/utils/chapter-text';
import {
  CHAPTER_CUE_WORDS,
  WELL_KNOWN_CHAPTERS,
  askablePeople,
  askablePlaces,
  buildChapterFinish,
  buildChapterMarked,
  buildChapterOrder,
  buildChapterPerson,
  buildChapterPlace,
  buildChapterVerse,
  chapterCueCandidates,
  chapterCueFor,
  chapterFinishCandidates,
  gradeChapterMarked,
  gradeChapterVerse,
  type ChapterFinishExercise,
  type ChapterOrderExercise,
  type ChapterVerseExercise,
} from '@/utils/chapter-ladder-exercises';
import {
  RECALL_MIN_SHARE,
  buildVerseBefore,
  buildVerseBook,
  buildVerseInitials,
  buildVerseKeywords,
  buildVerseRecall,
  markVerseInitials,
  markVerseInitialsParts,
  buildVerseLocate,
  buildVerseMarked,
  buildVerseNext,
  buildVerseRecognize,
  buildVerseSequence,
  contentWords,
  gradeVerseBefore,
  gradeVerseInitials,
  gradeVerseKeywords,
  gradeVerseLocate,
  gradeVerseMarked,
  gradeVerseNext,
  gradeVerseRecall,
  gradeVerseSequence,
  markVerseKeywords,
  markVerseRecall,
  markVerseSequence,
  readerSpanFragment,
  type VerseNextExercise,
  verseRecallCoverage,
} from '@/utils/verse-ladder-exercises';
import {
  buildVerseAltered,
  gradeVerseAltered,
  type VerseAlteredExercise,
} from '@/utils/verse-altered';
import {
  buildVerseCloze,
  clozeSegments,
  gradeVerseRebuild,
  hashSeed,
  markVerseRebuild,
  seededIndex,
  type VerseCloze,
  verseClozeRatio,
  verseCue,
} from '@/utils/verse-cloze';
import {
  verseClozeSpec,
  verseInitialsShare,
  verseKeywordsCount,
  verseRecallMode,
} from '@/utils/review-difficulty';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { collectStudyThreadGraph } from './study-thread-graph';
import { fetchStudyThreadNoteRows } from './study-thread-note-rows';
import { pickRepNoteIdForCluster } from './study-thread-cluster-count';
import { formatVerseAddress, lastVerseOf, neighbourVerseAddresses, nextVerseAddress } from '@/utils/verse-adjacency';
import { partitionByBook } from '@/utils/scripture-book';
import {
  CROSSREF_MIN_VOTES,
  VERSE_THEME_MIN_RELEVANCE,
  buildVerseCrossref,
  buildVersePerson,
  buildVersePlace,
  buildVerseTheme,
} from '@/utils/verse-knowledge-exercises';
import { getKnowledgeForChapter, getKnowledgeForReference } from './scripture-knowledge';
import { normalizePlaceName } from '@/utils/bible-place-name';
import { curatedTopicLabelForDisplay } from '@/utils/prototype-home-trends';
import { gradeChoiceExercise } from '@/utils/choice-exercise';
import { reviewFraming, type ReviewFramingSpec } from '@/utils/review-framing';
import { rungIdentityIsTheAnswer } from '@/utils/review-row-subtitle';
import { nodeKey as studyNodeKey } from '@/utils/study-bible-nodes';
import { fetchVerseText } from './fetch-verse-text';
import { recordNoteRecallEngaged } from './note-recall-state';
import { countableUserNotesWhere } from './purge-onboarding-content';
import {
  chapterTouch,
  noteTouch,
  touchNodes,
  verseTouches,
  type NodeTouch,
} from './study-bible-layer';
import {
  chapterKeyPartsFromReference,
  chapterReferenceLabel,
  nodeKey,
  verseNodesForReference,
  verseReferenceLabel,
} from '@/utils/study-bible-nodes';
import {
  buildNoteChoice,
  labelNamesWhat,
  buildNoteRecognize,
  gradeNoteChoice,
  chooseNoteStem,
  resolveNoteRung,
  type NoteMaterial,
  buildNoteSpan,
  buildNoteAnnotation,
  type NoteSpan,
} from '@/utils/note-ladder-exercises';
import type { ChoiceExercise } from '@/utils/choice-exercise';
import { reviewExerciseFamily } from '@/utils/review-exercise-families';
import {
  parseReviewExerciseSettings,
  skippedKeySet,
} from '@/utils/review-exercise-settings';
import {
  quietedKeySet,
  reviewDislikeWindowStart,
  type ReviewDislikeRow,
} from '@/utils/review-exercise-feedback';
import { getNotePassages } from './scripture-knowledge';
import { REVIEWED_SOURCE } from '@/utils/study-bible-source-copy';
import { READING_DWELL_BUCKETS, readingDwellCountsAsRead } from '@/utils/reading-event-kinds';

export interface ReviewItemRow {
  id: string;
  userId: string;
  kind: string;
  sourceKey: string;
  noteId: string | null;
  secondaryNoteId: string | null;
  studyThreadEntryId: string | null;
  scriptureReference: string | null;
  translation: string | null;
  status: string;
  recallState: string;
  intervalDays: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
  lastOutcome: string | null;
  successStreak: number;
  reviewCount: number;
  ladderStep: number;
  /** Absent on a row read before the column was applied; treat as 0. */
  lapseCount?: number;
  lastRungKey?: string | null;
  origin: string;
  challengeId: string | null;
  sourceLabel: string | null;
  sourceAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

/** What a surface needs to render one item without fetching the note behind it. */
export interface ReviewItemView {
  id: string;
  kind: ReviewItemKind;
  prompt: string;
  /**
   * The instruction with the subject removed, for the row's meta line.
   *
   * The row leads with what is being reviewed and puts the doing underneath; the dock, where the
   * card stands alone, keeps the full `prompt`. Additive rather than a replacement so every
   * existing consumer of `prompt` keeps working.
   */
  task: string;
  /**
   * Which kind of exercise this is, in one word and one glyph.
   *
   * Resolved here rather than on the client: the rung a step wears depends on the item's seed
   * and on material only the server holds, so a client deriving it from `promptKey` alone would
   * be right until the day it was not. See `verseRungFor`.
   */
  exercise: { id: string; label: string; icon: string; typed: boolean };
  /**
   * One line saying why this is here or what it connects to, or null. A template and its
   * arguments rather than text, because the month in it belongs in the reader's zone — the
   * client renders it with `fillFraming`.
   */
  framing: ReviewFramingSpec | null;
  promptKey: string;
  recallState: RecallState;
  status: ReviewItemStatus;
  origin: ReviewItemOrigin;
  dueAt: string;
  reviewCount: number;
  ladderStep: number;
  /** Titles for the row's meta line; never the note body, which is the point of the reveal. */
  noteTitle: string | null;
  secondaryNoteTitle: string | null;
  /**
   * The shortest thing that says *which* note this is — title, else the first passage it
   * cites. Null when the note has neither, and `noteWrittenAt` is the last resort.
   *
   * Never a snippet of the body. A preview of what you wrote partly answers the question
   * being asked, which is the one thing a review row must not do.
   */
  noteLabel: string | null;
  /**
   * The note's own opening words — the row's context line, the way a verse row carries its cue.
   * Present whether or not the note has a title, because a title names it and this shows it.
   */
  noteContext: string | null;
  /** When the note was written, for a reader to place a note that has no name of its own. */
  noteWrittenAt: string | null;
  scriptureReference: string | null;
  noteId: string | null;
  challengeId: string | null;
  /** Why this row is here, in the reader's words. Null on items they added themselves. */
  sourceLabel: string | null;
  sourceAt: string | null;
  /**
   * The stem, when the row cannot name the subject. A quoted line from the note, or a
   * fragment of the verse. Null on every other rung — the title already says which thing it is.
   */
  cue: string | null;
}

/**
 * The same queue, without building a question for any of it.
 *
 * Home reads the active list on every load and renders none of it: the suggestion handoff wants
 * `kind` and `scriptureReference` so a passage already in Review is not also offered as a nudge,
 * and the Review section wants counts — how many are due, how many are coming back. The rows a
 * reader actually sees when the section is closed come from `/api/review/inbox`, which is a
 * different request capped at three.
 *
 * So the full build was assembling eighteen questions — cue text, cross-reference openings,
 * curated knowledge, a database round trip apiece — to render at most two, on the critical path
 * of Home's first paint. Measured at 3.4s against 750ms for this.
 *
 * Membership is identical to {@link buildReviewItemViews}: same askable-kind rule, same
 * unaskable-note drop, via the same `noteRungFor`. A count from one and a list from the other is
 * how a "12 more" fold opens onto eleven rows.
 */
export interface ReviewItemSummary {
  id: string;
  kind: ReviewItemKind;
  status: ReviewItemStatus;
  recallState: RecallState;
  dueAt: string;
  scriptureReference: string | null;
  noteId: string | null;
}

/**
 * How much stored body to fetch for one line of context. The same `left()` cap the note list
 * uses, trimmed hard: this becomes ~64 characters on screen.
 */
const REVIEW_EXCERPT_SOURCE_CHARS = 600;
/**
 * Enough to recognise your own note, not enough to read it.
 *
 * The meta line shares its width with the reason ("· You wrote this"), so a longer excerpt
 * buys nothing: it only pushes the reason out of view. Recognition happens in the first few
 * words anyway — these are the reader's own sentences.
 */
const REVIEW_EXCERPT_CHARS = 48;

/**
 * A note's opening line, as the note lists already render it.
 *
 * This was deliberately withheld at first, on the reasoning that previewing what someone wrote
 * partly answers the question being asked. That was wrong twice over. A row the reader cannot
 * identify is useless, and uselessness is a worse failure than a partial cue — Review is a
 * prompt to return to your study, not an exam: outcomes are self-reported, nothing is graded,
 * and the strategy doc is explicit that reading a note you could not remember is a perfectly
 * good outcome. It was also inconsistent, since a *titled* note has always shown its title,
 * which is the reader's own summary of the very same content.
 */
function noteExcerpt(html: string | null | undefined): string | null {
  if (!html) return null;
  const preview = stripHtmlForListPreview(html, REVIEW_EXCERPT_CHARS).trim();
  /*
   * Trailing punctuation is trimmed here, at the source, so the excerpt is one string
   * everywhere. The prompt joins it to a question with an em dash and cannot carry the stop;
   * if the label kept it, the row's "does the question already name this?" check would fail
   * on the punctuation alone and print the excerpt twice, once in each line.
   */
  const trimmed = preview.replace(/[.,;:—–-]+$/, '').trim();
  return trimmed || null;
}

function displayTitle(title: string | null | undefined): string | null {
  const cleaned = stripServerAutoUntitledNoteTitleForDisplay((title ?? '').trim());
  return cleaned || null;
}

/**
 * What each note can actually be asked, in three queries for the whole batch.
 *
 * The ladder is material-gated: a note with no links cannot be asked what it was linked to, and
 * a note that is one scripture pill has no prose to quote back. `resolveNoteRung` turns the
 * stored step into the rung a given note can answer, and this is what it needs to decide.
 *
 * Batched deliberately. The session read renders ten items; asking per note would be a
 * straightforward N+1 on the page a subscriber uses most.
 */
/**
 * Every label in this account that names *what* a note is, and the label for each pool member.
 *
 * One loader, because the material probe and the exercise builder must agree about rung 0. When
 * the probe thinks a note can be recognised and the builder cannot build the question, the reader
 * gets "Which of your notes says this?" above nothing at all — which is exactly what the first
 * preview showed.
 */
async function loadNoteLabelPool(
  userId: string,
): Promise<{ distinguishing: string[]; byId: Map<string, string>; bookByLabel: Map<string, string> }> {
  const rows = await db
    .select({ id: Notes.id, title: Notes.title, createdAt: Notes.createdAt })
    .from(Notes)
    .where(and(eq(Notes.userId, userId), ne(Notes.noteType, 'scripture'), countableUserNotesWhere()))
    .orderBy(desc(Notes.updatedAt))
    .limit(NOTE_OPTION_POOL_LIMIT);

  // `loadTitles` already resolves title, then excerpt, then cited passage — the same ladder the
  // option label wants, minus the excerpt, which is barred here because it is the stem.
  const resolved = await loadTitles(
    userId,
    rows.map((row) => row.id),
  );

  const distinguishing: string[] = [];
  const byId = new Map<string, string>();
  const bookByLabel = new Map<string, string>();
  const seen = new Set<string>();
  for (const row of rows) {
    const passage = resolved.get(row.id)?.passage ?? null;
    const { label, distinguishing: names } = noteOptionLabel({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt,
      passage,
    });
    byId.set(row.id, label);
    if (passage) bookByLabel.set(label.toLowerCase(), passage);
    if (!names) continue;
    const key = label.toLowerCase();
    // Two rows reading the same is one option, not two.
    if (seen.has(key)) continue;
    seen.add(key);
    distinguishing.push(label);
  }
  return { distinguishing, byId, bookByLabel };
}

/**
 * The words a reader typed on a highlight.
 *
 * `miniNoteBody` first — the note written on the highlight itself — then `notesBody`. Both the
 * probe and the builder read through here so they cannot disagree about which field is the one.
 *
 * **Both fields are HTML**, canonicalised as such on write (`server/routes/study-threads.ts`).
 * This collapsed whitespace but never stripped tags, and the dock renders the result as escaped
 * text — so an annotation carrying a scripture pill was shown to the reader as a literal
 * `<span data-scripture-reference="…">…</span>` inside quotation marks. Every neighbouring rung
 * (note.recognize, the verse cue, the row excerpt) already strips; this was the one that didn't.
 *
 * Stripping here also fixes the three-word floor that both call sites apply to this result:
 * counting `split(/\s+/)` over markup let a one-word annotation qualify on its tags alone.
 */
/**
 * **Both fields are HTML**, canonicalised as such on write (`server/routes/study-threads.ts`).
 * That collapsed whitespace but never stripped tags, and the dock renders the result as escaped
 * text — so an annotation carrying a scripture pill was shown to the reader as a literal
 * `<span data-scripture-reference="…">…</span>` inside quotation marks. Every neighbouring rung
 * (note.recognize, the verse cue, the row excerpt) already strips; this was the one that didn't.
 *
 * Stripping here also fixes the three-word floor both call sites apply to this result: counting
 * `split(/\s+/)` over markup let a one-word annotation qualify on its tags alone.
 */
function annotationTextOf(row: { miniNoteBody?: string | null; notesBody?: string | null }): string {
  const raw = row.miniNoteBody?.trim() || row.notesBody?.trim() || '';
  return stripHtml(raw);
}

async function loadNoteMaterial(
  userId: string,
  noteIds: readonly string[],
): Promise<Map<string, NoteMaterial>> {
  const unique = [...new Set(noteIds.filter(Boolean))];
  const out = new Map<string, NoteMaterial>();
  if (!unique.length) return out;

  const [bodies, viaPill, ownPassage, links, quotes, annotated, pool, labels, skip] = await Promise.all([
    db
      .select({
        id: Notes.id,
        length: sql<number>`length(${Notes.content})`,
        contentEncrypted: Notes.contentEncrypted,
      })
      .from(Notes)
      .where(and(eq(Notes.userId, userId), inArray(Notes.id, unique))),
    /*
     * Both halves of what `getNotePassages` sees, because the probe deciding *whether* to ask
     * "which of these did you cite here?" and the builder answering it must read the same thing.
     * A pill points at a canonical scripture child, but a note can also carry its own metadata
     * row — checking only the first silently drops the rung for every note of the second kind.
     */
    db
      .select({ noteId: NoteScriptureReferences.noteId })
      .from(NoteScriptureReferences)
      .innerJoin(
        ScriptureMetadata,
        eq(NoteScriptureReferences.scriptureNoteId, ScriptureMetadata.noteId),
      )
      .where(inArray(NoteScriptureReferences.noteId, unique)),
    db
      .select({ noteId: ScriptureMetadata.noteId })
      .from(ScriptureMetadata)
      .where(inArray(ScriptureMetadata.noteId, unique)),
    db
      .select({ from: NoteConnections.fromNoteId, to: NoteConnections.toNoteId })
      .from(NoteConnections)
      .where(
        and(
          eq(NoteConnections.userId, userId),
          or(
            inArray(NoteConnections.fromNoteId, unique),
            inArray(NoteConnections.toNoteId, unique),
          ),
        ),
      ),
    // A span the reader selected themselves. `resolved` matters: a detached anchor holds a
    // quote that is no longer anywhere in the note. `miniNote` matters too: a derived
    // reference or scripture link carries an anchor without anyone having marked it, and a
    // one-word "kids" is not a line to recognise a note by. The floor is the builder's.
    db
      .select({ parentNoteId: StudyThreadEntries.parentNoteId, quote: StudyThreadEntries.anchorQuote })
      .from(StudyThreadEntries)
      .where(
        and(
          eq(StudyThreadEntries.userId, userId),
          inArray(StudyThreadEntries.parentNoteId, unique),
          eq(StudyThreadEntries.anchorStatus, 'resolved'),
          eq(StudyThreadEntries.entryKindRaw, 'miniNote'),
          isNotNull(StudyThreadEntries.anchorQuote),
        ),
      ),
    /*
     * Highlights in these notes that carry words the reader typed, on a passage that can be
     * named. Both ends have to be theirs for the annotation rung to have a question: the stem
     * is what they wrote, the answer is where they wrote it.
     */
    db
      .select({
        parentNoteId: StudyThreadEntries.parentNoteId,
        reference: StudyThreadEntries.scriptureReference,
        miniNoteBody: StudyThreadEntries.miniNoteBody,
        notesBody: StudyThreadEntries.notesBody,
      })
      .from(StudyThreadEntries)
      .where(
        and(
          eq(StudyThreadEntries.userId, userId),
          inArray(StudyThreadEntries.parentNoteId, unique),
          isNotNull(StudyThreadEntries.scriptureReference),
        ),
      ),
    loadNoteLabelPool(userId),
    loadNoteSubjectLabels(userId, unique),
    loadSkippedRungs(userId),
  ]);

  const withAnnotation = new Set(
    annotated
      .filter((row) => annotationTextOf(row).split(/\s+/).filter(Boolean).length >= 3)
      .map((row) => row.parentNoteId)
      .filter((id): id is string => Boolean(id)),
  );

  const withPassage = new Set([...viaPill, ...ownPassage].map((row) => row.noteId));
  const withLink = new Set<string>();
  for (const edge of links) {
    withLink.add(edge.from);
    withLink.add(edge.to);
  }
  // The same floor the reveal applies, so the probe never promises a span the reveal refuses.
  const withQuote = new Set(
    quotes
      .filter((row) => buildNoteSpan({ quote: row.quote ?? '' }) !== null)
      .map((row) => row.parentNoteId)
      .filter((id): id is string => Boolean(id)),
  );

  for (const row of bodies) {
    /*
     * Rung 0 needs more than a body: it needs an *answer someone could name*. A note labelled
     * "Written 10 Jul" cannot be picked out of a line of its own prose, and neither can the three
     * options beside it. Checked here rather than in the builder so that the question the list
     * asks and the exercise the reveal builds are decided by one rule.
     */
    const label = labels.get(row.id);
    const namedRivals = label
      ? pool.distinguishing.filter((other) => other.toLowerCase() !== label.label.toLowerCase())
      : pool.distinguishing;
    const answerable = Boolean(label?.distinguishing) && namedRivals.length >= MIN_NOTE_DISTRACTORS;

    out.set(row.id, {
      // Encrypted bodies are ciphertext the server cannot quote from, so those notes get the
      // two rungs built on plaintext tables instead.
      canRecognize:
        answerable &&
        !row.contentEncrypted &&
        ((row.length ?? 0) >= MIN_QUIZZABLE_BODY_CHARS || withQuote.has(row.id)),
      canPassage: withPassage.has(row.id),
      canConnect: withLink.has(row.id),
      canAnnotation: withAnnotation.has(row.id),
      skip,
    });
  }
  return out;
}

/**
 * Below this a body has nothing recognisable to quote — see `MIN_FRAGMENT_WORDS` next door.
 * Measured in stored characters because that is what a batched query can ask cheaply, and the
 * fragment builder does the real check on words once it has the text.
 */
const MIN_QUIZZABLE_BODY_CHARS = 120;

/** A note the probe knows nothing about can be asked nothing — the safe reading, not the loud one. */
const EMPTY_NOTE_MATERIAL: NoteMaterial = {
  canRecognize: false,
  canPassage: false,
  canConnect: false,
  canAnnotation: false,
};

/**
 * Titles for a batch of items in one query rather than per row.
 *
 * The inbox renders at most three, but the session and the manage list do not, and a
 * per-item lookup there is a straightforward N+1 on the page a subscriber uses most.
 */
interface NoteLabelRow {
  title: string | null;
  writtenAt: Date | null;
  /** The note's own opening line, for a note with no title of its own. */
  excerpt: string | null;
  /** First passage the note cites, filled in only for notes with no usable title. */
  passage: string | null;
}

async function loadTitles(userId: string, noteIds: string[]): Promise<Map<string, NoteLabelRow>> {
  const unique = [...new Set(noteIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({
      id: Notes.id,
      title: Notes.title,
      createdAt: Notes.createdAt,
      // A prefix, not the body: this is for one line of context, and the same `left()` cap
      // the note list uses. An encrypted body is ciphertext and is never previewed.
      contentPrefix: sql<string>`left(${Notes.content}, ${REVIEW_EXCERPT_SOURCE_CHARS})`,
      contentEncrypted: Notes.contentEncrypted,
    })
    .from(Notes)
    .where(and(eq(Notes.userId, userId), inArray(Notes.id, unique)));

  const byId = new Map<string, NoteLabelRow>(
    rows.map((r) => [
      r.id,
      {
        title: displayTitle(r.title),
        writtenAt: r.createdAt,
        excerpt: r.contentEncrypted ? null : noteExcerpt(r.contentPrefix),
        passage: null,
      },
    ]),
  );

  /*
   * The passage a nameless note cites, for the ones whose body gives nothing away either.
   *
   * Queried only for the notes that still need it after the excerpt, and through both joins,
   * because a pill points at the canonical scripture child rather than at the reader's own note.
   */
  const unnamed = [...byId.entries()].filter(([, v]) => !v.title && !v.excerpt).map(([id]) => id);
  if (unnamed.length > 0) {
    const [viaChild, viaOwn] = await Promise.all([
      db
        .select({ noteId: NoteScriptureReferences.noteId, reference: ScriptureMetadata.reference })
        .from(ScriptureMetadata)
        .innerJoin(
          NoteScriptureReferences,
          eq(NoteScriptureReferences.scriptureNoteId, ScriptureMetadata.noteId),
        )
        .where(inArray(NoteScriptureReferences.noteId, unnamed)),
      db
        .select({ noteId: ScriptureMetadata.noteId, reference: ScriptureMetadata.reference })
        .from(ScriptureMetadata)
        .where(inArray(ScriptureMetadata.noteId, unnamed)),
    ]);
    for (const row of [...viaChild, ...viaOwn]) {
      const entry = byId.get(row.noteId);
      if (entry && !entry.passage) entry.passage = row.reference?.trim() || null;
    }
  }

  return byId;
}

/**
 * Thread items name the cluster, not the representative note.
 *
 * "What is taking shape across your `Adoption, not slavery` Thread" is wrong in a way a
 * reader notices immediately — that is one note inside the Thread, and the rep is an
 * implementation detail of how the graph picks a label.
 */
async function threadTitleFor(userId: string, repNoteId: string): Promise<string | null> {
  const rep = first(
    await db
      .select({ studyThreadTitle: Notes.studyThreadTitle, title: Notes.title })
      .from(Notes)
      .where(and(eq(Notes.id, repNoteId), eq(Notes.userId, userId)))
      .limit(1),
  );
  if (!rep) return null;
  return displayTitle(rep.studyThreadTitle) ?? displayTitle(rep.title);
}

/**
 * The rung a note item can actually answer, or null when there is nothing to ask about it.
 *
 * The stored step is nominal — a note with no links skips past "what did you link this to?"
 * rather than showing a question with no possible answer, and a note with none of the three is
 * dropped from the queue entirely. Shared with {@link buildReviewItemSummaries} so the full list
 * and the counts can never disagree about which rows exist.
 */
function noteRungFor(row: ReviewItemRow, material: Map<string, NoteMaterial>) {
  if (row.kind !== 'note' || !row.noteId) return null;
  return resolveNoteRung(
    row.ladderStep,
    material.get(row.noteId) ?? EMPTY_NOTE_MATERIAL,
    reviewSeed(row),
  );
}

/**
 * Which stored rows are rows a reader can actually be asked about, in order.
 *
 * The queue's visibility rules on their own, with no question built for any of them: a kind
 * Review no longer asks about is dropped, and so is a note the resolver can say nothing about.
 * Costs one `loadNoteMaterial` — eight batched queries — and only when the list holds notes.
 *
 * Extracted because three callers need the same answer at three different prices. The summary
 * shape below wants it and nothing else; `/api/review/inbox` wants to know *which* rows are
 * askable before it pays to build any, so it can build the three it will show instead of the
 * eight it listed; and {@link buildReviewItemViews} applies the same rules while building.
 */
export async function filterAskableReviewRows(
  userId: string,
  rows: ReviewItemRow[],
  options: { dropUnaskable?: boolean } = {},
): Promise<ReviewItemRow[]> {
  const noteIds = rows
    .filter((r) => r.kind === 'note')
    .map((r) => r.noteId)
    .filter((id): id is string => Boolean(id));
  const material =
    options.dropUnaskable && noteIds.length
      ? await loadNoteMaterial(userId, noteIds)
      : new Map<string, NoteMaterial>();

  /*
   * Chapters need their text before we can say whether they are askable, because every rung of a
   * chapter is built out of its verses — one that could not be fetched is a prompt above nothing.
   *
   * This rule was missed when these three were first pulled out of the build loop, and it broke
   * Review in production: the inbox cut to three rows *before* building, so a chapter that the
   * build then dropped left the section short, and short enough became empty and the whole
   * section rendered nothing. The slack the inbox lists beyond its three rows exists for exactly
   * this and cutting first defeated it.
   *
   * `fetchVerseText` rather than `loadChapterMaterial`: the question here is only whether there
   * are verses at all, which is one cached read per distinct chapter, where the full material
   * load is five concurrent queries for facts only a built prompt needs.
   */
  const chapterRefs = options.dropUnaskable
    ? [
        ...new Set(
          rows
            .filter((r) => r.kind === 'chapter' && r.scriptureReference)
            .map((r) => `${r.scriptureReference}|${r.translation ?? 'NET'}`),
        ),
      ]
    : [];
  const chapterHasVerses = new Map<string, boolean>();
  await Promise.all(
    chapterRefs.map(async (key) => {
      const [reference, translation] = key.split('|');
      const parts = chapterKeyPartsFromReference(reference);
      const html = parts
        ? await fetchVerseText(chapterReferenceLabel(parts), translation).catch(() => '')
        : '';
      chapterHasVerses.set(key, Boolean(html) && splitChapterHtmlIntoVerses(html).length > 0);
    }),
  );

  return rows.filter((row) => {
    const kind = row.kind as ReviewItemKind;
    if (!isReviewAskableKind(kind)) return false;
    if (kind === 'note' && options.dropUnaskable && !noteRungFor(row, material)) return false;
    if (kind === 'chapter' && options.dropUnaskable) {
      const key = `${row.scriptureReference}|${row.translation ?? 'NET'}`;
      if (!chapterHasVerses.get(key)) return false;
    }
    return true;
  });
}

/**
 * Counts and routing keys for a queue, with no question built for any row.
 *
 * See {@link ReviewItemSummary} for why this exists.
 */
export async function buildReviewItemSummaries(
  userId: string,
  rows: ReviewItemRow[],
  options: { dropUnaskable?: boolean } = {},
): Promise<ReviewItemSummary[]> {
  const askable = await filterAskableReviewRows(userId, rows, options);
  return askable.map((row) => ({
    id: row.id,
    kind: row.kind as ReviewItemKind,
    status: row.status as ReviewItemStatus,
    recallState: row.recallState as RecallState,
    dueAt: row.dueAt.toISOString(),
    scriptureReference: row.scriptureReference,
    noteId: row.noteId,
  }));
}

export async function buildReviewItemViews(
  userId: string,
  rows: ReviewItemRow[],
  /**
   * Drop note items the resolver can ask nothing about.
   *
   * True when assembling a queue, false when rebuilding one item the caller already has in hand
   * — a route that just recorded an outcome must get its item back, not an empty array.
   */
  options: { dropUnaskable?: boolean } = {},
): Promise<ReviewItemView[]> {
  const titles = await loadTitles(
    userId,
    rows.flatMap((r) => [r.noteId, r.secondaryNoteId].filter((id): id is string => Boolean(id))),
  );
  // Only note items need it, and only they pay for it.
  const material = await loadNoteMaterial(
    userId,
    rows.filter((r) => r.kind === 'note').map((r) => r.noteId).filter((id): id is string => Boolean(id)),
  );

  /*
   * The facts a framing line is chosen from, loaded once for the whole build.
   *
   * Counters live on the Study Bible layer, keyed the way the engine keys them; a reader's own
   * marks in the Bible reader are keyed by reference. Both are one query over the batch.
   */
  // Kind first, always: `lastVerseOf` does not normalise a chapter-only reference, so a
  // chapter row must never reach the verse branch.
  const nodeKeyFor = (row: ReviewItemRow): string | null => {
    if (row.kind === 'note' && row.noteId) return studyNodeKey.note(row.noteId);
    if (row.kind === 'chapter' && row.scriptureReference) {
      const parts = chapterKeyPartsFromReference(row.scriptureReference);
      return parts ? studyNodeKey.chapter(parts) : null;
    }
    if (row.kind === 'verse' && row.scriptureReference) {
      const at = lastVerseOf(row.scriptureReference);
      return at ? studyNodeKey.verse(at) : null;
    }
    return null;
  };
  const nodeKeys = rows.map(nodeKeyFor).filter((key): key is string => Boolean(key));
  const references = [
    ...new Set(rows.map((row) => row.scriptureReference?.trim()).filter((r): r is string => Boolean(r))),
  ];
  const [nodes, marks] = await Promise.all([
    nodeKeys.length
      ? db
          .select({
            nodeKey: UserNodeStates.nodeKey,
            revisitCount: UserNodeStates.revisitCount,
            firstStudiedAt: UserNodeStates.firstStudiedAt,
            // When it was last turned to, for the chapter framing line.
            lastSeenAt: UserNodeStates.lastSeenAt,
          })
          .from(UserNodeStates)
          .where(and(eq(UserNodeStates.userId, userId), inArray(UserNodeStates.nodeKey, nodeKeys)))
      : Promise.resolve([]),
    references.length
      ? db
          .select({
            reference: StudyThreadEntries.scriptureReference,
            excerpt: StudyThreadEntries.scripturePassageExcerpt,
          })
          .from(StudyThreadEntries)
          .where(
            and(
              eq(StudyThreadEntries.userId, userId),
              isNull(StudyThreadEntries.parentNoteId),
              inArray(StudyThreadEntries.scriptureReference, references),
            ),
          )
      : Promise.resolve([]),
  ]);
  const nodeByKey = new Map(nodes.map((n) => [n.nodeKey, n]));
  const markedReferences = new Set(marks.map((m) => m.reference?.trim().toLowerCase()).filter(Boolean));
  const readerSpans = readerSpansByReference(marks);

  // One probe per passage per build, however many rows share it.
  const materialCache = new Map<string, Promise<VerseKnowledgeMaterial>>();
  const materialFor = (reference: string, translation: string) => {
    const key = `${reference.toLowerCase()}|${translation}`;
    let pending = materialCache.get(key);
    if (!pending) {
      pending = loadVerseMaterial(userId, reference, translation);
      materialCache.set(key, pending);
    }
    return pending;
  };
  const chapterMaterialCache = new Map<string, Promise<ChapterKnowledgeMaterial>>();
  const chapterMaterialFor = (reference: string, translation: string) => {
    const key = `${reference.toLowerCase()}|${translation}`;
    let pending = chapterMaterialCache.get(key);
    if (!pending) {
      pending = loadChapterMaterial(userId, reference, translation);
      chapterMaterialCache.set(key, pending);
    }
    return pending;
  };

  /*
   * Warm every row's text and material at once, before the loop reads them one at a time.
   *
   * The loop below awaits per row — a verse fetch here, a knowledge probe there — which turned
   * a sitting of four into four round trips end to end while the reader watched an empty card.
   * Both awaits already go through per-build caches, so priming them in parallel leaves the
   * loop's logic untouched and its awaits already resolved.
   */
  await Promise.all(
    rows.flatMap((row) => {
      if (!row.scriptureReference) return [];
      const translation = row.translation ?? 'NET';
      if (row.kind === 'chapter') return [chapterMaterialFor(row.scriptureReference, translation)];
      if (row.kind !== 'verse') return [];
      /*
       * `materialFor` alone: `loadVerseMaterial` already fetches this exact text internally to
       * fill `.text`, so a second, separate `fetchVerseText` call here paid for a round trip
       * whose result was thrown away the moment it resolved. The loop below reads `.text` off
       * the material instead of re-fetching — see there.
       */
      const warm: Promise<unknown>[] = [materialFor(row.scriptureReference, translation)];
      return warm;
    }),
  );

  const recognizeNoteIds = [
    ...new Set(
      rows
        .filter((row) => row.kind === 'note' && row.noteId && noteRungFor(row, material) === 'note.recognize')
        .map((row) => row.noteId as string),
    ),
  ];
  /*
   * The body, the marked spans and the note's own option label — the three things `noteStemFor`
   * needs, batched. The row has to build the same stem the dock will, and the dock builds it
   * from all three; loading only the body here is what let the two surfaces disagree.
   */
  const [recognizeBodies, recognizeSpans, recognizeLabels] = recognizeNoteIds.length
    ? await Promise.all([
        db
          .select({ id: Notes.id, content: Notes.content, contentEncrypted: Notes.contentEncrypted })
          .from(Notes)
          .where(and(eq(Notes.userId, userId), inArray(Notes.id, recognizeNoteIds))),
        loadNoteSpans(userId, recognizeNoteIds),
        loadNoteSubjectLabels(userId, recognizeNoteIds),
      ])
    : [[], new Map<string, NoteSpan[]>(), new Map<string, { label: string; distinguishing: boolean }>()];
  const recognizeBodyById = new Map(recognizeBodies.map((row) => [row.id, row]));

  const views: ReviewItemView[] = [];
  for (const row of rows) {
    const kind = row.kind as ReviewItemKind;
    const primary = row.noteId ? titles.get(row.noteId) ?? null : null;
    const noteTitle = primary?.title ?? null;
    const secondaryNoteTitle = row.secondaryNoteId
      ? titles.get(row.secondaryNoteId)?.title ?? null
      : null;
    const threadTitle =
      kind === 'thread' && row.noteId ? await threadTitleFor(userId, row.noteId) : null;

    /*
     * A note is asked the rung it can answer, not the rung it has climbed to. The stored step
     * is nominal; a note with no links skips past "what did you link this to?" rather than
     * showing a question with no possible answer.
     */
    const noteRung = noteRungFor(row, material);

    /*
     * A note the resolver can ask nothing about is not shown at all.
     *
     * The floor in `review-opportunities.ts` stops new ones being created, but items made before
     * the note ladder existed are already in the table, and every one of them is a note with no
     * name, no cited passage and no link. Falling back to the ladder's own wording would print
     * "Which of your notes says this?" above no question — which is what the first preview did.
     * These notes are not lost: they are exactly what the Home mark-a-note suggestion is for.
     */
    if (kind === 'note' && !noteRung && options.dropUnaskable) continue;

    /*
     * A row for a kind Review no longer asks about — always, not only when dropping unaskable
     * notes. These exist in the table from before the open questions moved to Home, and there
     * is no prompt left to render for them.
     */
    if (!isReviewAskableKind(kind)) continue;

    const verseMaterial =
      kind === 'verse' && row.scriptureReference
        ? await materialFor(row.scriptureReference, row.translation ?? 'NET')
        : undefined;
    const chapterMaterial =
      kind === 'chapter' && row.scriptureReference
        ? await chapterMaterialFor(row.scriptureReference, row.translation ?? 'NET')
        : undefined;
    /*
     * A chapter whose text could not be fetched has no exercise on any rung — every one of
     * them is built from the verses — and would reach the dock as a prompt above nothing.
     * Dropped the way a note with nothing to ask about is dropped.
     */
    if (kind === 'chapter' && options.dropUnaskable && !chapterMaterial?.verses.length) continue;

    /*
     * The recognize rung shows a fragment of the verse, so it needs the text.
     *
     * Read off `verseMaterial.text` rather than fetched again: `loadVerseMaterial` already holds
     * the stripped text as one of six things it loads in parallel, and issuing a second
     * `fetchVerseText` here for the same reference and translation was a second, unwarmed round
     * trip for a value already sitting in hand. Every other prompt is built from titles and
     * references alone.
     */
    let cue: string | null = null;
    if (kind === 'verse' && row.ladderStep === 0 && verseMaterial?.text) {
      // The words the reader marked while reading, where they marked any; the opening otherwise.
      const span = readerSpanFragment(
        row.scriptureReference ? readerSpans.get(row.scriptureReference.trim().toLowerCase()) : null,
        verseMaterial.text,
      );
      cue = verseCue(span ?? verseMaterial.text);
    }
    /*
     * Which tier this rung is asking at, resolved *before* the prompt so the instruction can
     * describe the exercise the reveal is about to build. "Write it from memory" printed above
     * two thirds of the verse is the app misdescribing its own question, and the staged rungs
     * made that reachable — so the prompt takes the same `pass` the builder will.
     *
     * Resolved through `verseRungFor` here and again inside `reviewPromptFor`, which is free
     * (both are pure over the same inputs) and is the only way to keep one resolver.
     */
    const promptSeed = reviewSeed(row);
    const promptPass =
      kind === 'verse' ? verseRungFor(row.ladderStep, promptSeed, verseMaterial).pass : 0;
    const promptRecallState = row.recallState as RecallState;
    const { key, prompt } = reviewPromptFor(
      {
        kind,
        reviewCount: row.reviewCount,
        ladderStep: row.ladderStep,
        id: row.id,
        material: verseMaterial,
        chapterMaterial,
      },
      {
        reference: row.scriptureReference,
        noteTitle,
        secondaryNoteTitle,
        threadTitle,
        cue,
        recallMode: kind === 'verse' ? verseRecallMode(promptPass, promptRecallState) : null,
        keywordCount: kind === 'verse' ? verseKeywordsCount(promptPass, promptRecallState) : null,
        initialsTier:
          kind === 'verse' ? (verseInitialsShare(promptPass, promptRecallState) >= 1 ? 2 : 0) : null,
      },
    );

    const resolvedKey = noteRung ?? key;
    /*
     * When the name is the answer, the row leads with the stem instead of "One of your notes".
     * A quoted line from the middle of the note, or a fragment of the verse — unique, and not
     * a spoiler. Opening words are barred: they are the untitled note's option label.
     */
    let subjectCue: string | null = cue;
    if (resolvedKey === 'note.recognize' && row.noteId) {
      const body = recognizeBodyById.get(row.noteId);
      subjectCue = body
        ? noteStemFor({
            content: body.content,
            contentEncrypted: body.contentEncrypted,
            spans: recognizeSpans.get(row.noteId) ?? [],
            seed: reviewSeed(row),
            ownLabel: recognizeLabels.get(row.noteId)?.label ?? null,
          })?.fragment ?? null
        : null;
    } else if (
      (resolvedKey === 'verse.locate' || resolvedKey === 'verse.book') &&
      row.scriptureReference
    ) {
      // `verseMaterial` is always set here — locate/book are verse-only rungs — so this is a
      // property read, not the third fetch of the same passage it used to be.
      if (!subjectCue && verseMaterial?.text) subjectCue = verseCue(verseMaterial.text);
    } else if (resolvedKey !== 'verse.recognize') {
      subjectCue = null;
    }
    const framingNodeKey = nodeKeyFor(row);
    const node = framingNodeKey ? nodeByKey.get(framingNodeKey) : undefined;
    const seed = promptSeed;
    const pass =
      kind === 'verse'
        ? promptPass
        : kind === 'chapter'
          ? chapterRungFor(row.ladderStep, seed, chapterMaterial).pass
          : 0;
    const framing = reviewFraming(
      {
        kind: kind === 'note' ? 'note' : kind === 'chapter' ? 'chapter' : 'verse',
        rungKey: resolvedKey,
        identityIsAnswer: rungIdentityIsTheAnswer({ kind, ladderStep: row.ladderStep, promptKey: resolvedKey }),
        pass,
        recallState: row.recallState as RecallState,
        revisitCount: node?.revisitCount ?? 0,
        citedInNotes: verseMaterial?.citedInNotes ?? chapterMaterial?.citedInNotes ?? 0,
        firstStudiedAt: node?.firstStudiedAt?.toISOString() ?? null,
        topTheme: verseMaterial?.themes[0] ?? null,
        person: verseMaterial?.people[0] ?? (chapterMaterial ? askablePeople(chapterMaterial.people)[0] ?? null : null),
        crossRefCount: verseMaterial?.crossRefTotal ?? 0,
        // A chapter is "marked" when the reader highlighted a verse in it.
        readerMarked:
          (chapterMaterial?.highlightedNumbers.length ?? 0) > 0 ||
          Boolean(row.scriptureReference && markedReferences.has(row.scriptureReference.trim().toLowerCase())),
        /*
         * Reading facts. The timestamp comes from the reading log, not from the node's
         * `lastSeenAt` — that is the last touch of any kind, and answering a review about a
         * chapter bumps it, so the row would tell the reader they had read something today
         * when what they did today was answer a question about it. The count is the node's
         * `revisitCount`, which only reading ever increments on a chapter.
         */
        lastReadAt: chapterMaterial?.lastReadAt?.toISOString() ?? null,
        readCount: kind === 'chapter' ? node?.revisitCount ?? 0 : 0,
      },
      `${row.id}:framing`,
    );

    views.push({
      id: row.id,
      kind,
      framing,
      // Real context on the note rungs too: `fillReviewPrompt(noteRung, {})` was throwing the
      // note's own name away, so every note prompt rendered in its nameless form.
      prompt: noteRung
        ? fillReviewPrompt(noteRung, { reference: row.scriptureReference, noteTitle, threadTitle })
        : prompt,
      task: reviewTaskFor(noteRung ?? key),
      exercise: (() => {
        const family = reviewExerciseFamily(noteRung ?? key);
        return { id: family.id, label: family.label, icon: family.icon, typed: family.typed };
      })(),
      promptKey: noteRung ?? key,
      recallState: row.recallState as RecallState,
      status: row.status as ReviewItemStatus,
      origin: row.origin as ReviewItemOrigin,
      dueAt: row.dueAt.toISOString(),
      reviewCount: row.reviewCount,
      ladderStep: row.ladderStep,
      noteTitle: threadTitle ?? noteTitle,
      secondaryNoteTitle,
      scriptureReference: row.scriptureReference,
      noteId: row.noteId,
      challengeId: row.challengeId,
      noteLabel: noteTitle ?? primary?.excerpt ?? primary?.passage ?? null,
      noteContext: primary?.excerpt ?? null,
      noteWrittenAt: primary?.writtenAt?.toISOString() ?? null,
      sourceLabel: row.sourceLabel,
      sourceAt: row.sourceAt?.toISOString() ?? null,
      cue: subjectCue,
    });
  }
  return views;
}

/**
 * The reader's exercise preferences, read once per request.
 *
 * Memoised because a sitting resolves a rung for every item in it, and each resolution needs the
 * same set. Without this a queue of eighteen would read the same row eighteen times on the way to
 * one response. The cache is per-call rather than process-wide: a preference changed in Settings
 * must take effect on the next question, not the next deploy.
 */
const skipCache = new Map<string, Promise<ReadonlySet<ReviewPromptKey>>>();

async function loadPreferredSkips(userId: string): Promise<ReadonlySet<ReviewPromptKey>> {
  const cached = skipCache.get(userId);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const [row] = await db
        .select({ value: UserMetadata.reviewExerciseSettings })
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, userId))
        .limit(1);
      return skippedKeySet(parseReviewExerciseSettings(row?.value ?? null));
    } catch {
      /*
       * An unreadable preference is "no preferences", never a broken queue. This runs before the
       * column exists on a database the migration has not reached, and Review working is worth
       * more than a preference being honoured a deploy early.
       */
      return new Set<ReviewPromptKey>();
    }
  })();
  skipCache.set(userId, pending);
  // Cleared on the next tick: within one request the answer is fixed, across requests it is not.
  void pending.finally(() => queueMicrotask(() => skipCache.delete(userId)));
  return pending;
}

/**
 * The reader's recent thumbs-down votes, read once per request and memoised the same way.
 *
 * Narrow by construction: `disliked` rows are the rarest thing in the log, the window is thirty
 * days, and the cap is there so a pathological account cannot make a rung resolution unbounded.
 * The tally is done in JS rather than SQL so the rung-to-family mapping stays derived from
 * `FAMILY_BY_KEY` — see `review-exercise-feedback.ts`.
 */
const dislikeCache = new Map<string, Promise<ReviewDislikeRow[]>>();

const DISLIKE_ROW_CAP = 500;

async function loadRecentDislikes(userId: string): Promise<ReviewDislikeRow[]> {
  const cached = dislikeCache.get(userId);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const rows = await db
        .select({ reviewItemId: ReviewEvents.reviewItemId, rungKey: ReviewEvents.rungKey })
        .from(ReviewEvents)
        .where(
          and(
            eq(ReviewEvents.userId, userId),
            eq(ReviewEvents.action, 'disliked'),
            gte(ReviewEvents.createdAt, reviewDislikeWindowStart(new Date())),
            isNotNull(ReviewEvents.rungKey),
          ),
        )
        .orderBy(desc(ReviewEvents.createdAt))
        .limit(DISLIKE_ROW_CAP);
      return rows as ReviewDislikeRow[];
    } catch {
      /*
       * The same bargain `loadPreferredSkips` strikes: on a database the migration has not
       * reached, `rungKey` does not exist and this throws. A Review that asks without leaning
       * away is worth far more than a Review that will not open.
       */
      return [];
    }
  })();
  dislikeCache.set(userId, pending);
  void pending.finally(() => queueMicrotask(() => dislikeCache.delete(userId)));
  return pending;
}

/**
 * Every reason to walk past a rung: what the reader switched off, and what they keep thumbing down.
 *
 * One function, because the list, the reveal, the grader and the truth must resolve the same rung
 * from the same material — if the two halves entered by different doors they could diverge. Both
 * halves fail soft to empty, and neither can return nothing: quieting joins `material.skip`, which
 * every walk already treats as a reason to move on rather than a reason to stop.
 */
async function loadSkippedRungs(userId: string): Promise<ReadonlySet<ReviewPromptKey>> {
  const [preferred, dislikes] = await Promise.all([
    loadPreferredSkips(userId),
    loadRecentDislikes(userId),
  ]);
  if (!dislikes.length) return preferred;
  const merged = new Set<ReviewPromptKey>(preferred);
  for (const key of quietedKeySet(dislikes)) merged.add(key);
  return merged;
}

/** The tally behind the card's "Noted." — read after a vote lands, so it bypasses the memo. */
export async function reviewDislikeRowsFor(userId: string): Promise<ReviewDislikeRow[]> {
  dislikeCache.delete(userId);
  return loadRecentDislikes(userId);
}

/** Verse text arrives as formatted HTML with superscript verse numbers. */
export function stripHtml(html: string): string {
  return html
    .replace(/<sup[^>]*>.*?<\/sup>/gs, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function listDueReviewItems(
  userId: string,
  limit: number,
  now: Date = new Date(),
): Promise<ReviewItemRow[]> {
  return (await db
    .select()
    .from(ReviewItems)
    .where(
      and(
        eq(ReviewItems.userId, userId),
        eq(ReviewItems.status, 'active'),
        lte(ReviewItems.dueAt, now),
      ),
    )
    .orderBy(ReviewItems.dueAt)
    .limit(limit)) as ReviewItemRow[];
}

/** Active items not yet due, soonest first — the pool a mixed sitting may pull from. */
export async function listUpcomingReviewItems(
  userId: string,
  limit: number,
  now: Date = new Date(),
): Promise<ReviewItemRow[]> {
  return (await db
    .select()
    .from(ReviewItems)
    .where(
      and(
        eq(ReviewItems.userId, userId),
        eq(ReviewItems.status, 'active'),
        gt(ReviewItems.dueAt, now),
      ),
    )
    .orderBy(ReviewItems.dueAt)
    .limit(limit)) as ReviewItemRow[];
}

export async function listReviewItems(
  userId: string,
  status?: ReviewItemStatus,
): Promise<ReviewItemRow[]> {
  const where = status
    ? and(eq(ReviewItems.userId, userId), eq(ReviewItems.status, status))
    : eq(ReviewItems.userId, userId);
  return (await db
    .select()
    .from(ReviewItems)
    .where(where)
    .orderBy(ReviewItems.dueAt)
    .limit(200)) as ReviewItemRow[];
}

/**
 * When the next thing is scheduled to come back, or null when nothing is.
 *
 * For the one line an empty queue is allowed to say. A date is not a count of what is owed —
 * the thing this feature's vocabulary refuses — it is the opposite: a reason to put the app
 * down. Only ever read when there is nothing due, so a normal sitting pays nothing for it, and
 * it runs straight down the index the inbox already uses.
 */
export async function nextScheduledReviewAt(userId: string, now: Date = new Date()): Promise<Date | null> {
  const row = first(
    await db
      .select({ dueAt: ReviewItems.dueAt })
      .from(ReviewItems)
      .where(
        and(eq(ReviewItems.userId, userId), eq(ReviewItems.status, 'active'), gt(ReviewItems.dueAt, now)),
      )
      .orderBy(ReviewItems.dueAt)
      .limit(1),
  );
  return row?.dueAt ? new Date(row.dueAt) : null;
}

export async function getReviewItem(userId: string, id: string): Promise<ReviewItemRow | null> {
  const row = first(
    await db
      .select()
      .from(ReviewItems)
      .where(and(eq(ReviewItems.id, id), eq(ReviewItems.userId, userId)))
      .limit(1),
  );
  return (row as ReviewItemRow | undefined) ?? null;
}

export interface CreateReviewItemInput {
  kind: ReviewItemKind;
  noteId?: string | null;
  secondaryNoteId?: string | null;
  studyThreadEntryId?: string | null;
  scriptureReference?: string | null;
  translation?: string | null;
  origin?: ReviewItemOrigin;
  challengeId?: string | null;
  /** Engine only: why this is here, in the reader's words. See study-bible-source-copy.ts. */
  sourceLabel?: string | null;
  sourceAt?: Date | null;
  /**
   * Opening rung. Engine sittings stagger this so five new verses are not the same exercise.
   * User-added items omit it and start at 0.
   */
  ladderStep?: number;
}

export function reviewSourceKey(input: {
  kind: ReviewItemKind;
  noteId?: string | null;
  secondaryNoteId?: string | null;
  studyThreadEntryId?: string | null;
  scriptureReference?: string | null;
}): string | null {
  switch (input.kind) {
    case 'note':
    case 'thread':
      return input.noteId ? `${input.kind}:${input.noteId}` : null;
    case 'highlight':
      return input.studyThreadEntryId ? `highlight:${input.studyThreadEntryId}` : null;
    case 'verse':
      return input.scriptureReference
        ? `verse:${input.scriptureReference.trim().toLowerCase()}`
        : null;
    case 'chapter': {
      // The node key itself — `chapter:John|3` — since a chapter has one canonical spelling.
      const parts = input.scriptureReference ? chapterKeyPartsFromReference(input.scriptureReference) : null;
      return parts ? nodeKey.chapter(parts) : null;
    }
    case 'connection': {
      if (!input.noteId || !input.secondaryNoteId) return null;
      // Sorted, so a link added from either end is one review item.
      const [a, b] = [input.noteId, input.secondaryNoteId].sort();
      return `connection:${a}:${b}`;
    }
  }
}

async function ownsNote(userId: string, noteId: string): Promise<boolean> {
  const row = first(
    await db
      .select({ id: Notes.id })
      .from(Notes)
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
      .limit(1),
  );
  return Boolean(row);
}

export interface CreateReviewItemResult {
  item: ReviewItemRow;
  created: boolean;
}

/**
 * Add something to Review, or hand back what is already there.
 *
 * Refuses the retired kinds before it touches the database. A highlight, a link and a Thread
 * were all asked open questions with no answer to mark, and those moved to Home.
 *
 * Idempotent by `sourceKey`, and the existing row is returned rather than an error: the
 * reader tapping "Add to Review" on a note they already added meant "make sure this is in
 * Review", and it now is. A 409 would be technically accurate and useless.
 */
export async function createReviewItem(
  userId: string,
  input: CreateReviewItemInput,
  now: Date = new Date(),
): Promise<CreateReviewItemResult | { error: string }> {
  // Before anything is read or written: these kinds have no question left to ask.
  if (!isReviewAskableKind(input.kind)) {
    return { error: 'Review asks about notes, passages and chapters; Threads and links are on Home now' };
  }

  const noteId = input.noteId?.trim() || null;
  const secondaryNoteId = input.secondaryNoteId?.trim() || null;

  if (noteId && !(await ownsNote(userId, noteId))) return { error: 'Note not found' };
  if (secondaryNoteId && !(await ownsNote(userId, secondaryNoteId))) {
    return { error: 'Note not found' };
  }

  /*
   * A note the ladder cannot ask about is refused, with a reason the reader can act on.
   *
   * Not a failure — the note is fine. It just has no body to quote, no passage cited and no
   * link drawn, so every question would be one we invented rather than one they can answer.
   * Citing a passage or linking it to something makes it reviewable.
   */
  if (input.kind === 'note' && noteId && !(await noteHasReviewableMaterial(userId, noteId))) {
    return { error: 'Nothing to ask about yet — cite a passage or link it to another note' };
  }

  // A verse item made from a highlight inherits that highlight's reference and translation:
  // without it the row has no subject at all, since `verse` is keyed by reference.
  let scriptureReference = input.scriptureReference?.trim() || null;
  let translation = input.translation?.trim() || null;

  if (input.kind === 'verse' && input.studyThreadEntryId) {
    const entry = first(
      await db
        .select({
          id: StudyThreadEntries.id,
          reference: StudyThreadEntries.scriptureReference,
          translation: StudyThreadEntries.scripturePassageTranslation,
        })
        .from(StudyThreadEntries)
        .where(
          and(
            eq(StudyThreadEntries.id, input.studyThreadEntryId),
            eq(StudyThreadEntries.userId, userId),
          ),
        )
        .limit(1),
    );
    if (!entry) return { error: 'Highlight not found' };
    scriptureReference = scriptureReference ?? entry.reference ?? null;
    translation = translation ?? entry.translation ?? null;
  }

  /*
   * A chapter item is about a whole chapter and nothing finer. The reference is canonicalised
   * ("Psalm 23" becomes "Psalms 23") so the source key, the node key and the prompt agree; a
   * verse or a partial range is refused with the reason, since that is a verse item's business.
   */
  if (input.kind === 'chapter') {
    const parts = scriptureReference ? chapterKeyPartsFromReference(scriptureReference) : null;
    if (!parts) return { error: 'A chapter review is about a whole chapter — name one, like John 3' };
    scriptureReference = chapterReferenceLabel(parts);
  }

  const sourceKey = reviewSourceKey({ ...input, noteId, secondaryNoteId, scriptureReference });
  if (!sourceKey) return { error: 'Not enough to review' };

  const existing = first(
    await db
      .select()
      .from(ReviewItems)
      .where(and(eq(ReviewItems.userId, userId), eq(ReviewItems.sourceKey, sourceKey)))
      .limit(1),
  ) as ReviewItemRow | undefined;

  if (existing) {
    // Adding something that was paused or archived is how the reader brings it back.
    if (existing.status !== 'active') {
      const revived = first(
        await db
          .update(ReviewItems)
          .set({ status: 'active', dueAt: firstDueAt(now), updatedAt: now })
          .where(eq(ReviewItems.id, existing.id))
          .returning(),
      ) as ReviewItemRow;
      return { item: revived, created: false };
    }
    return { item: existing, created: false };
  }

  const inserted = first(
    await db
      .insert(ReviewItems)
      .values({
        id: generateTimestampId('review'),
        userId,
        kind: input.kind,
        sourceKey,
        noteId,
        secondaryNoteId,
        studyThreadEntryId: input.studyThreadEntryId?.trim() || null,
        scriptureReference,
        translation,
        status: 'active',
        recallState: 'new',
        intervalDays: 1,
        dueAt: firstDueAtFor(input.kind, input.origin ?? 'user', now),
        successStreak: 0,
        reviewCount: 0,
        ladderStep: Number.isFinite(input.ladderStep) ? Math.max(0, Math.trunc(input.ladderStep!)) : 0,
        origin: input.origin ?? 'user',
        challengeId: input.challengeId ?? null,
        sourceLabel: input.sourceLabel?.trim() || null,
        sourceAt: input.sourceAt ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning(),
  ) as ReviewItemRow | undefined;

  if (!inserted) {
    // Lost a race against another device adding the same thing.
    const raced = first(
      await db
        .select()
        .from(ReviewItems)
        .where(and(eq(ReviewItems.userId, userId), eq(ReviewItems.sourceKey, sourceKey)))
        .limit(1),
    ) as ReviewItemRow | undefined;
    if (!raced) return { error: 'Could not add to Review' };
    return { item: raced, created: false };
  }

  return { item: inserted, created: true };
}

export async function recordReviewEvent(
  userId: string,
  item: ReviewItemRow,
  action: ReviewEventAction,
  extra: {
    attempt?: string | null;
    previousIntervalDays?: number;
    nextIntervalDays?: number;
    /** The rung this event was about. Derived once by the caller, which already resolved it. */
    rungKey?: string | null;
    /** Which go this was, on a rung that allows more than one. Outcomes only. */
    attemptNumber?: number | null;
    /** Whether the rung was marked against an answer key rather than self-judged. */
    graded?: boolean | null;
  } = {},
  now: Date = new Date(),
): Promise<void> {
  await db.insert(ReviewEvents).values({
    id: generateTimestampId('revev'),
    userId,
    reviewItemId: item.id,
    noteId: item.noteId,
    action,
    attempt: extra.attempt?.trim() || null,
    rungKey: extra.rungKey ?? null,
    previousIntervalDays: extra.previousIntervalDays ?? null,
    nextIntervalDays: extra.nextIntervalDays ?? null,
    attemptNumber: extra.attemptNumber ?? null,
    graded: extra.graded ?? null,
    createdAt: now,
  });
}

export interface ReviewOutcomeResult {
  item: ReviewItemRow;
  nextReturnDays: number;
  /** This miss made the item a leech: the dock offers a step back rather than a fifth go. */
  leech: boolean;
  /** The same offer, for an item never once recalled. The card says it differently. */
  stalled: boolean;
}

/**
 * Answer an item: reschedule it, log the answer, and feed the passive layer.
 *
 * The `recordNoteRecallEngaged` call is the one place these two systems touch. Review's own
 * schedule lives on this row; that call lengthens the *resurfacing* stability on
 * NoteFingerprints, so a note the reader is actively reviewing stops being offered as a
 * "worth another look" card on Home. Without it the two surfaces would compete over the same
 * note — one because it is due, the other because it looks neglected.
 */
export async function applyReviewOutcome(
  userId: string,
  item: ReviewItemRow,
  outcome: ReviewOutcome,
  attempt: string | null,
  now: Date = new Date(),
  /** The rung actually answered. Decides the weight of a recall and whether a miss can lapse. */
  rungKey: string | null = null,
  /**
   * How the answer was reached, for the log only — neither value touches the schedule, which
   * the caller has already folded into `outcome`.
   */
  answered: { attemptNumber?: number | null; graded?: boolean | null } = {},
): Promise<ReviewOutcomeResult> {
  const next = nextReviewAfter(
    outcome,
    {
      intervalDays: item.intervalDays,
      successStreak: item.successStreak,
      reviewCount: item.reviewCount,
      lastOutcome: (item.lastOutcome as ReviewOutcome | null) ?? null,
      lapseCount: item.lapseCount ?? 0,
      rungKey,
    },
    now,
  );

  // A ladder only advances on a clean recall — half-remembering something is not a reason to be
  // asked a harder question about it next time. Notes climb now too; `nextLadderStep` knows
  // which kinds have a ladder and how far each one goes.
  const ladderStep =
    outcome === 'recalled'
      ? nextLadderStep(item.kind as ReviewItemKind, item.ladderStep)
      : item.ladderStep;

  const updated = first(
    await db
      .update(ReviewItems)
      .set({
        intervalDays: next.intervalDays,
        dueAt: next.dueAt,
        successStreak: next.successStreak,
        reviewCount: next.reviewCount,
        recallState: next.recallState,
        lastOutcome: outcome,
        lastReviewedAt: now,
        ladderStep,
        lapseCount: next.lapseCount,
        lastRungKey: rungKey,
        updatedAt: now,
      })
      .where(and(eq(ReviewItems.id, item.id), eq(ReviewItems.userId, userId)))
      .returning(),
  ) as ReviewItemRow;

  await recordReviewEvent(userId, item, outcome, {
    attempt,
    previousIntervalDays: item.intervalDays,
    nextIntervalDays: next.intervalDays,
    // Already resolved just above for `lastRungKey`; the log keeps every asking, not the last.
    rungKey,
    attemptNumber: answered.attemptNumber ?? null,
    graded: answered.graded ?? null,
  }, now);

  if (outcome === 'recalled') {
    for (const id of [item.noteId, item.secondaryNoteId]) {
      if (id) await recordNoteRecallEngaged(userId, id);
    }
  }

  // Study Bible layer: what the reader just answered, and when it comes back. The mirror
  // columns exist so the engine can skip a node that is already scheduled without joining
  // this table; ReviewItems above stays the authority on the schedule itself.
  void recordReviewOutcomeNodes(userId, item, outcome, attempt, next, now);

  return {
    item: updated,
    nextReturnDays: next.intervalDays,
    leech: next.leech,
    stalled: next.stalled ?? false,
  };
}

/**
 * The way out for an item that has stopped working, at the reader's request: a different ask,
 * lapses forgiven.
 *
 * Refused unless the item has actually stopped working. Stepping back is not a general control —
 * the engine is not the reader's to tune — it is the one offer Review makes when its own asking
 * has failed. Two things count as failure: four lapses, and never having recalled it at all. The
 * second was missing, and it is the case where the offer matters most.
 */
export async function stepBackReviewItem(
  userId: string,
  item: ReviewItemRow,
  now: Date = new Date(),
): Promise<ReviewItemRow | null> {
  const stalled = reviewHasStalled({
    reviewCount: item.reviewCount,
    successStreak: item.successStreak,
    lapseCount: item.lapseCount,
    lastOutcome: item.lastOutcome as ReviewOutcome | null,
  });
  if ((item.lapseCount ?? 0) < REVIEW_LEECH_LAPSES && !stalled) return null;
  const back = stepBackRung({
    ladderStep: item.ladderStep,
    reviewCount: item.reviewCount,
    successStreak: item.successStreak,
    // Only read at the foot of the ladder, where the way out is sideways rather than down.
    kind: item.kind as ReviewItemKind,
  });
  return first(
    await db
      .update(ReviewItems)
      .set({ ...back, updatedAt: now })
      .where(and(eq(ReviewItems.id, item.id), eq(ReviewItems.userId, userId)))
      .returning(),
  ) as ReviewItemRow;
}

/**
 * The node(s) an answered item is about.
 *
 * Kind by kind, because a review item and a node are addressed differently: a `verse` item
 * carries a display reference that has to be expanded back into verses, a `highlight` item
 * may or may not have one, and a `connection` is two notes plus the link between them.
 */
async function recordReviewOutcomeNodes(
  userId: string,
  item: ReviewItemRow,
  outcome: ReviewOutcome,
  attempt: string | null,
  next: { dueAt: Date; recallState: RecallState },
  now: Date,
): Promise<void> {
  const mirror = { lastReviewedAt: now, nextReviewAt: next.dueAt, recallState: next.recallState };
  const touches: NodeTouch[] = [];

  /*
   * A chapter item was asked about the chapter, so the chapter node carries the mirror. Kept
   * out of the verse path below on purpose: that one expands a reference into verses and gives
   * the chapter above them a bare touch, which for a chapter-only reference would be thirty-six
   * verse touches about a question that named none of them.
   */
  const chapterParts = item.kind === 'chapter' && item.scriptureReference
    ? chapterKeyPartsFromReference(item.scriptureReference)
    : null;
  if (chapterParts) {
    touches.push({
      ...chapterTouch({
        chapter: chapterParts,
        signal: 'review',
        at: now,
        sourceLabel: REVIEWED_SOURCE,
        translation: item.translation,
      }),
      reviewMirror: mirror,
    });
  } else if (item.scriptureReference) {
    const { verses, chapters } = verseNodesForReference(item.scriptureReference);
    for (const touch of verseTouches({
      verses,
      chapters,
      signal: 'review',
      at: now,
      sourceLabel: REVIEWED_SOURCE,
      translation: item.translation,
    })) {
      // Only the verses carry the mirror; the chapter above them is not what was asked about.
      touches.push(touch.kind === 'verse' ? { ...touch, reviewMirror: mirror } : touch);
    }
  }

  if ((item.kind === 'note' || item.kind === 'highlight') && item.noteId) {
    touches.push({
      ...noteTouch({ noteId: item.noteId, signal: 'review', at: now, sourceLabel: REVIEWED_SOURCE }),
      reviewMirror: mirror,
    });
  }

  if (item.kind === 'connection' && item.noteId && item.secondaryNoteId) {
    const [a, b] = [item.noteId, item.secondaryNoteId].sort();
    touches.push({
      key: nodeKey.connection(item.noteId, item.secondaryNoteId),
      kind: 'connection',
      signal: 'review',
      at: now,
      noteId: a,
      secondaryNoteId: b,
      sourceLabel: REVIEWED_SOURCE,
      reviewMirror: mirror,
    });
  }

  if (item.kind === 'thread' && item.noteId) {
    touches.push({
      key: nodeKey.thread(item.noteId),
      kind: 'thread',
      signal: 'review',
      at: now,
      noteId: item.noteId,
      sourceLabel: REVIEWED_SOURCE,
      reviewMirror: mirror,
    });
    // Answering "what is this cluster forming?" in your own words is synthesis — the only
    // one the app can observe deterministically outside of naming a Thread.
    if (attempt?.trim() && outcome !== 'revealed') {
      touches.push({
        key: nodeKey.thread(item.noteId),
        kind: 'thread',
        signal: 'synthesis',
        at: now,
        noteId: item.noteId,
      });
    }
  }

  await touchNodes(userId, touches);
}

export async function deferReviewItem(
  userId: string,
  item: ReviewItemRow,
  now: Date = new Date(),
): Promise<ReviewItemRow> {
  const { dueAt } = deferReview({ dueAt: item.dueAt }, now);
  const updated = first(
    await db
      .update(ReviewItems)
      .set({ dueAt, updatedAt: now })
      .where(and(eq(ReviewItems.id, item.id), eq(ReviewItems.userId, userId)))
      .returning(),
  ) as ReviewItemRow;
  await recordReviewEvent(userId, item, 'deferred', {}, now);
  return updated;
}

export async function setReviewItemStatus(
  userId: string,
  item: ReviewItemRow,
  status: ReviewItemStatus,
  now: Date = new Date(),
): Promise<ReviewItemRow> {
  // Coming back from a pause starts the clock again rather than arriving already overdue.
  const dueAt = status === 'active' && item.status !== 'active' ? firstDueAt(now) : item.dueAt;
  const updated = first(
    await db
      .update(ReviewItems)
      .set({ status, dueAt, updatedAt: now })
      .where(and(eq(ReviewItems.id, item.id), eq(ReviewItems.userId, userId)))
      .returning(),
  ) as ReviewItemRow;

  const action: ReviewEventAction =
    status === 'active' ? 'resumed' : status === 'paused' ? 'paused' : 'archived';
  await recordReviewEvent(userId, item, action, {}, now);
  return updated;
}

export interface ReviewRevealPayload {
  note?: { id: string; title: string | null; content: string } | null;
  secondaryNote?: { id: string; title: string | null; content: string } | null;
  verseText?: string | null;
  /**
   * The gapped line and how many gaps it has — never the tokens, never the words.
   *
   * `VerseCloze` carries `tokens` (the whole verse) and `blanks[].word` (every answer), so
   * shipping it wholesale handed the client both. Withholding `verseText` beside that achieved
   * nothing: the passage was still in the payload, spelled differently.
   */
  cloze?: { segments: string[]; blankLengths: number[] } | null;
  thread?: { title: string | null; members: { id: string; title: string | null }[] } | null;
  /** The ordering puzzle, without its answer key — see verse-ladder-exercises.ts. */
  sequence?: { phrases: string[] } | null;
  /** The four references, without which one is right. */
  locate?: { phrase: string; options: string[] } | null;
  /**
   * A note rung: the question's own material and its four options, never which is right.
   *
   * `fragment` is present only on `note.recognize`, where the question quotes the reader's own
   * writing back at them. The other two rungs name the note in the row and ask about it.
   */
  noteChoice?: {
    fragment: string | null;
    /** Present when the stem is a span the reader marked: the quote, and the words either side. */
    span?: { before: string; quote: string; after: string } | null;
    /**
     * The stem is a clause, not a whole sentence.
     *
     * The card quotes the fragment, and a quotation that reads as a complete sentence when it is
     * half of one is a small lie about the reader's own writing. An ellipsis says where it stops.
     */
    truncated?: boolean;
    options: string[];
  } | null;
  /**
   * The four openings on "what comes after this?", and never the next verse's reference.
   *
   * Naming it would answer the question outright — the reader would only have to know that
   * Romans 1:8 follows Romans 1:7, which is arithmetic rather than memory.
   */
  next?: { options: string[] } | null;
  /**
   * The context-step rungs — which note cites this, which theme, who, which cross-reference.
   * Four options, and whether they are openings to trail off. Never which one is right.
   */
  choice?: { options: string[]; opening: boolean } | null;
  /** First letters of every word, and how many words. The verse itself is never sent. */
  /**
   * The line with some words on their first letter, and — below the top tier — the pieces either
   * side of each reduced word so they can be typed in place. Never `reduced`: that is the key.
   */
  initials?: {
    initials: string;
    wordCount: number;
    tier: number;
    segments?: { segments: string[]; blankLengths: number[]; letters: string[] } | null;
  } | null;
  /** How much of the verse is given before the reader writes the rest. `null` shown = nothing. */
  recall?: { shown: string | null; mode: string } | null;
  /**
   * Where in the reader's Harvous this question came from — the line the row shows about its
   * provenance, and the highlight or thought it was built out of. For the result card, which
   * had none of it.
   */
  context?: {
    sourceLabel: string | null;
    sourceAt: string | null;
    annotation: { quote: string | null; thought: string | null } | null;
  } | null;
  /** How many words to name. Nothing about which. */
  keywords?: { count: number } | null;
  /** Two openings from the same chapter; which comes first stays here. */
  before?: { options: string[] } | null;
  /**
   * The altered verse, and nothing else.
   *
   * `alteredIndex`, `original` and `substitute` stay on the server — a puzzle whose answer is in
   * the page is a puzzle with the answer written on the back, and here it would also mean the
   * client holding a record of exactly which word was falsified.
   */
  altered?: { tokens: string[] } | null;
}

/**
 * The reader's own references, as distractors for the locate rung.
 *
 * Their passages rather than a canned list: telling Romans 8 from Ephesians 2 is a real
 * distinction when you have worked in both, and a stranger reference is not a distractor at
 * all. Falls back to well-known references inside `buildVerseLocate` when the layer is thin.
 */
export async function listUserVerseReferences(userId: string, exclude: string): Promise<string[]> {
  try {
    const rows = await db
      .select({ nodeKey: UserNodeStates.nodeKey, label: UserNodeStates.label })
      .from(UserNodeStates)
      .where(
        and(
          eq(UserNodeStates.userId, userId),
          eq(UserNodeStates.nodeKind, 'verse'),
          eq(UserNodeStates.status, 'active'),
        ),
      )
      .orderBy(desc(UserNodeStates.lastSeenAt))
      .limit(40);
    const excluded = exclude.trim().toLowerCase();
    return rows
      .map((row) => row.label?.trim() ?? '')
      .filter((label) => label && label.toLowerCase() !== excluded);
  } catch {
    return [];
  }
}

/**
 * Rebuild a graded rung's answer key from the item, and mark the reader's answer against it.
 *
 * Recomputed rather than stored: the puzzle is a pure function of `${item.id}:${ladderStep}`
 * and the verse text, so there is nothing to keep and nothing to go stale. It also means the
 * key never travels to the client, which is the point — a `verse.locate` whose answer sits in
 * the page's memory is a multiple choice with the answer written on the back.
 */
/**
 * What a verse can be asked, with the material behind each answer.
 *
 * The pure `VerseMaterial` carries counts and decides which family member a step resolves to;
 * this carries the labels and texts the builders need. One load per verse per request, cached by
 * reference inside a view build so ten rows on one passage cost one probe.
 *
 * Bounded on purpose: at most three cross-reference texts are fetched, and the reader's *other*
 * verses — the distractor source — are sampled, not enumerated.
 */
interface VerseKnowledgeMaterial extends VerseMaterial {
  reference: string;
  /** Curated topics at or above the relevance floor, as display labels. */
  themes: string[];
  /** Every topic on the verse at any relevance — barred as a distractor. */
  allThemeLabels: string[];
  people: string[];
  /** Places the index names at this verse, normalised, barred labels included. */
  places: string[];
  /** Cross-reference targets above the vote floor whose text could be fetched. */
  crossRefs: { reference: string; text: string }[];
  /** How many targets clear the vote floor at all, for the framing line. Capped by the query. */
  crossRefTotal: number;
  /** Distinguishing labels of the reader's notes that cite this verse. */
  citingNoteLabels: string[];
  /** The verse's own text, stripped, so the text-keyed gates can count its words once. */
  text: string;
  /** The span the reader marked on this verse, floored and verified against the text. */
  markedSpan: string | null;
}

const EMPTY_VERSE_MATERIAL: VerseKnowledgeMaterial = {
  reference: '',
  citedInNotes: 0,
  themeCount: 0,
  personCount: 0,
  placeCount: 0,
  crossRefCount: 0,
  themes: [],
  allThemeLabels: [],
  people: [],
  places: [],
  crossRefs: [],
  crossRefTotal: 0,
  citingNoteLabels: [],
  text: '',
  markedSpan: null,
  readerSpanWords: 0,
};

/**
 * One material load per passage per request, instead of four.
 *
 * Recording a single answer used to load the same verse's material four times over: once to
 * resolve which rung was asked, once to mark it, once to fetch the verse it withheld, and once
 * more to build the row that comes back. Measured against a real account, that was 2.9 seconds
 * for one tap, on a database whose round-trip floor is 82ms — the work was not expensive, there
 * was just four times too much of it.
 *
 * A short time-to-live rather than a request scope, because the four callers are separate
 * exported functions with no shared context to hang one on, and threading a material object
 * through every signature would put the burden of not double-loading on every future caller.
 * The window is a couple of seconds: long enough to span one request's passes, far too short to
 * serve a reader a stale answer to a later one.
 *
 * **Safe against the drift this file warns about elsewhere.** The reveal, the grader and the
 * truth must resolve the same rung from the same material; sharing one load makes them agree by
 * construction rather than by coincidence. The risk of a cache here is staleness, not
 * disagreement — and a highlight added two seconds ago changing which rung is offered on the
 * next question is not a defect anyone can observe.
 */
const MATERIAL_TTL_MS = 3000;
/** Bounded so a long-lived process cannot accumulate one entry per passage ever asked about. */
const MATERIAL_CACHE_MAX = 200;

const materialMemo = new Map<string, { at: number; value: Promise<unknown> }>();

function memoisedMaterial<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = materialMemo.get(key);
  if (hit && now - hit.at < MATERIAL_TTL_MS) return hit.value as Promise<T>;

  const value = load();
  materialMemo.set(key, { at: now, value });
  // A failed load must not be served for the rest of the window.
  void value.catch(() => materialMemo.delete(key));

  if (materialMemo.size > MATERIAL_CACHE_MAX) {
    for (const [k, entry] of materialMemo) {
      if (now - entry.at >= MATERIAL_TTL_MS) materialMemo.delete(k);
    }
    // Still over after dropping the expired: evict oldest-first until it fits.
    while (materialMemo.size > MATERIAL_CACHE_MAX) {
      const oldest = materialMemo.keys().next().value;
      if (oldest === undefined) break;
      materialMemo.delete(oldest);
    }
  }
  return value;
}

async function loadVerseMaterial(
  userId: string,
  reference: string | null,
  translation: string,
): Promise<VerseKnowledgeMaterial> {
  return memoisedMaterial(`${userId}:verse:${reference ?? ''}:${translation}`, () =>
    loadVerseMaterialUncached(userId, reference, translation),
  );
}

async function loadChapterMaterial(
  userId: string,
  reference: string | null,
  translation: string,
): Promise<ChapterKnowledgeMaterial> {
  return memoisedMaterial(`${userId}:chapter:${reference ?? ''}:${translation}`, () =>
    loadChapterMaterialUncached(userId, reference, translation),
  );
}

const CROSSREF_TEXT_FETCHES = 3;

async function loadVerseMaterialUncached(
  userId: string,
  reference: string | null,
  translation: string,
): Promise<VerseKnowledgeMaterial> {
  const ref = reference?.trim();
  if (!ref) return EMPTY_VERSE_MATERIAL;
  const at = lastVerseOf(ref);
  if (!at) return { ...EMPTY_VERSE_MATERIAL, reference: ref };

  const [knowledge, citing, ownHtml, rivals, readerSpan, skip] = await Promise.all([
    getKnowledgeForReference(at.book, at.chapter, at.verse, {
      minRelevance: 0,
      minVotes: CROSSREF_MIN_VOTES,
      // Wide enough that "cross-referenced N times" is a count and not a cap.
      crossRefLimit: 40,
      themeLimit: 16,
    }).catch(() => null),
    loadNotesCitingVerse(userId, at),
    fetchVerseText(ref, translation),
    listUserVerseReferences(userId, ref),
    // What the reader marked on this verse, for the rung that asks them to find it again.
    loadReaderSpan(userId, ref).catch(() => null),
    loadSkippedRungs(userId),
  ]);
  const text = ownHtml ? stripHtml(ownHtml) : '';
  const markedSpan = readerSpanFragment(readerSpan, text);

  const themesAbove = (knowledge?.themes ?? []).filter(
    (t) => t.relevance >= VERSE_THEME_MIN_RELEVANCE,
  );
  const label = (t: { label: string }) => curatedTopicLabelForDisplay(t.label);

  // Single-verse targets first: a whole-chapter cross-reference has no one opening to show.
  const targets = (knowledge?.crossReferences ?? [])
    .filter((c) => c.chapterStart === c.chapterEnd)
    .slice(0, CROSSREF_TEXT_FETCHES);
  /*
   * The three cross-reference openings, fetched together rather than one after another.
   *
   * `fetchVerseText` is a database round trip (a `VerseTextCache` read, then `BibleVerses`, then
   * a cache write) — not an in-memory lookup — so awaiting them in a loop cost three serial trips
   * per verse item. A queue of eighteen paid that eighteen times over, and it was the largest
   * single component of a `/api/review/items` response that Home's first paint waits on.
   *
   * `Promise.all` preserves order, and the falsy-`html` rows are dropped after rather than never
   * pushed, so the list this returns is identical to the one the loop built.
   */
  const crossRefTargets = targets.map((c) => `${c.book} ${c.chapterStart}:${c.verseStart}`);
  const crossRefHtml = await Promise.all(
    crossRefTargets.map((targetRef) => fetchVerseText(targetRef, translation)),
  );
  const crossRefs = crossRefTargets
    .map((reference, i) => ({ reference, html: crossRefHtml[i] }))
    .filter((entry) => Boolean(entry.html))
    .map((entry) => ({ reference: entry.reference, text: stripHtml(entry.html) }));

  return {
    reference: ref,
    citedInNotes: citing.length,
    themeCount: themesAbove.length,
    personCount: knowledge?.people.length ?? 0,
    // The count is of places that can actually be asked, so a verse naming only "the earth"
    // never resolves to a place rung the builder would then refuse.
    placeCount: askablePlaces((knowledge?.places ?? []).map((place) => place.name)).length,
    crossRefCount: crossRefs.length,
    themes: themesAbove.map(label),
    allThemeLabels: (knowledge?.themes ?? []).map(label),
    people: (knowledge?.people ?? []).map((p) => p.name),
    places: (knowledge?.places ?? []).map((place) => place.name),
    crossRefs,
    crossRefTotal: knowledge?.crossReferences.length ?? 0,
    citingNoteLabels: citing,
    text,
    locateRivals: rivals.length,
    contentWordCount: contentWords(text).length,
    readerSpanWords: markedSpan ? markedSpan.split(' ').filter(Boolean).length : 0,
    markedSpan,
    skip,
  };
}

/** Distinguishing labels of the reader's notes that cite this verse, via either join. */
async function loadNotesCitingVerse(
  userId: string,
  at: { book: string; chapter: number; verse: number },
): Promise<string[]> {
  const meta = await db
    .select({ noteId: ScriptureMetadata.noteId })
    .from(ScriptureMetadata)
    .where(
      and(
        eq(ScriptureMetadata.book, at.book),
        eq(ScriptureMetadata.chapter, at.chapter),
        eq(ScriptureMetadata.verse, at.verse),
      ),
    );
  if (!meta.length) return [];
  const scriptureNoteIds = meta.map((m) => m.noteId);
  const viaPill = await db
    .select({ noteId: NoteScriptureReferences.noteId })
    .from(NoteScriptureReferences)
    .where(inArray(NoteScriptureReferences.scriptureNoteId, scriptureNoteIds));
  const candidates = [...new Set([...scriptureNoteIds, ...viaPill.map((r) => r.noteId)])];
  const owned = await db
    .select({ id: Notes.id })
    .from(Notes)
    .where(
      and(
        eq(Notes.userId, userId),
        inArray(Notes.id, candidates),
        ne(Notes.noteType, 'scripture'),
        countableUserNotesWhere(),
      ),
    );
  if (!owned.length) return [];
  const labels = await loadNoteSubjectLabels(
    userId,
    owned.map((r) => r.id),
  );
  const out = new Set<string>();
  for (const { label, distinguishing } of labels.values()) if (distinguishing) out.add(label);
  return [...out];
}

/**
 * The context-step rungs, built once for both the question and the marking.
 *
 * `acceptable` is what the grader marks against; `exercise.options` is all the client ever sees.
 * Distractors are the reader's own study first — themes and people from passages they have
 * cited — and the wider index only when that runs short, because an option someone has never
 * met is noise rather than a distractor.
 */
async function buildVerseContextFor(
  userId: string,
  item: ReviewItemRow,
  rungKey: ReviewPromptKey,
  material: VerseKnowledgeMaterial,
  seed: string,
): Promise<{ exercise: ChoiceExercise; acceptable: string[]; opening: boolean } | null> {
  if (!item.scriptureReference) return null;

  if (rungKey === 'verse.connect') {
    if (!material.citingNoteLabels.length) return null;
    const pool = (await loadNoteLabelPool(userId)).distinguishing.filter(
      (label) => !material.citingNoteLabels.includes(label),
    );
    const exercise = buildNoteChoice({ acceptable: material.citingNoteLabels, poolLabels: pool, seed });
    return exercise ? { exercise, acceptable: material.citingNoteLabels, opening: false } : null;
  }

  // The reader's other passages, sampled, for distractors that are things they have met.
  const otherRefs = (await listUserVerseReferences(userId, item.scriptureReference)).slice(0, 5);
  const others = await Promise.all(
    otherRefs.map(async (ref) => {
      const at = lastVerseOf(ref);
      if (!at) return null;
      const k = await getKnowledgeForReference(at.book, at.chapter, at.verse, {
        minRelevance: VERSE_THEME_MIN_RELEVANCE,
        themeLimit: 6,
        crossRefLimit: 0,
      }).catch(() => null);
      return k
        ? {
            ref,
            themes: k.themes.map((t) => curatedTopicLabelForDisplay(t.label)),
            people: k.people.map((p) => p.name),
            places: k.places.map((place) => place.name),
          }
        : null;
    }),
  );

  if (rungKey === 'verse.theme') {
    if (!material.themes.length) return null;
    const pool = others.flatMap((o) => o?.themes ?? []);
    const fallback = await sampleTopicLabels(seed);
    const exercise = buildVerseTheme({
      answers: material.themes,
      onVerse: material.allThemeLabels,
      pool,
      fallbackPool: fallback,
      seed,
    });
    return exercise ? { exercise, acceptable: material.themes, opening: false } : null;
  }

  if (rungKey === 'verse.person') {
    if (!material.people.length) return null;
    const pool = others.flatMap((o) => o?.people ?? []);
    const fallback = await samplePeopleNames(seed);
    const exercise = buildVersePerson({
      answers: material.people,
      onVerse: material.people,
      pool,
      fallbackPool: fallback,
      seed,
    });
    return exercise ? { exercise, acceptable: material.people, opening: false } : null;
  }

  if (rungKey === 'verse.place') {
    /*
     * `answers` is the askable set and `onVerse` is every place the index names here, barred
     * labels included — so "the earth" is never the answer, and never a wrong answer either.
     */
    const answers = askablePlaces(material.places);
    if (!answers.length) return null;
    const pool = others.flatMap((o) => o?.places ?? []);
    const fallback = await samplePlaceNames(seed);
    const exercise = buildVersePlace({
      answers,
      onVerse: material.places,
      pool,
      fallbackPool: fallback,
      seed,
    });
    return exercise ? { exercise, acceptable: answers, opening: false } : null;
  }

  if (rungKey === 'verse.crossref') {
    if (!material.crossRefs.length) return null;
    const answer = material.crossRefs[seededIndex(seed, material.crossRefs.length)];
    const barred = new Set(material.crossRefs.map((c) => c.reference.toLowerCase()));
    const distractorTexts: string[] = [];
    for (const ref of otherRefs) {
      if (barred.has(ref.toLowerCase())) continue;
      const html = await fetchVerseText(ref, item.translation ?? 'NET');
      if (html) distractorTexts.push(stripHtml(html));
    }
    const exercise = buildVerseCrossref({ answerText: answer.text, distractorTexts, seed });
    return exercise
      ? { exercise, acceptable: [exercise.options[exercise.answerIndex]], opening: true }
      : null;
  }

  return null;
}

/** A dozen topics from the index, offset by seed so the fallback is not the same dozen every time. */
async function sampleTopicLabels(seed: string): Promise<string[]> {
  const rows = await db
    .select({ label: ScriptureTopics.label })
    .from(ScriptureTopics)
    .orderBy(ScriptureTopics.id)
    .limit(12)
    .offset(hashSeed(seed) % 6000)
    .catch(() => []);
  return rows.map((r) => curatedTopicLabelForDisplay(r.label));
}

async function samplePeopleNames(seed: string): Promise<string[]> {
  const rows = await db
    .select({ name: BiblePeople.name })
    .from(BiblePeople)
    .orderBy(BiblePeople.id)
    .limit(12)
    .offset(hashSeed(seed) % 3000)
    .catch(() => []);
  return rows.map((r) => r.name);
}

async function samplePlaceNames(seed: string): Promise<string[]> {
  const rows = await db
    .select({ name: BiblePlaces.name })
    .from(BiblePlaces)
    .orderBy(BiblePlaces.id)
    .limit(12)
    .offset(hashSeed(seed) % 1200)
    .catch(() => []);
  return askablePlaces(rows.map((r) => normalizePlaceName(r.name)));
}

const VERSE_CONTEXT_KEYS = new Set<ReviewPromptKey>([
  'verse.connect',
  'verse.theme',
  'verse.person',
  'verse.place',
  'verse.crossref',
]);

/**
 * The "what comes after this?" rung, built once for both the question and the marking.
 *
 * Over-fetches neighbours: a verse whose text is missing from the cache contributes no option,
 * and three distractors is the difference between a question and a coin toss.
 */
/**
 * The verse itself, for after an answer on a rung that withheld it.
 *
 * `verse.sequence` and `verse.locate` both hide the text — one because the words are the
 * puzzle, the other because they name the reference. That is right while the question stands,
 * and wrong the moment it is answered: the reader is left holding four shuffled phrases and no
 * verse, which is the one thing they came to review. Returns null for rungs that showed it all
 * along, so the client has nothing extra to render.
 */
/**
 * The "one word has been changed" rung, built once for both the question and the marking.
 *
 * Neighbours supply the substitute, so an altered verse reads like the passage around it rather
 * than like a word picked out of a dictionary. Returns null freely: a verse with nothing safe to
 * change is common, and the rung falls through the way `verse.next` does at the end of a book.
 */
async function buildVerseAlteredFor(item: ReviewItemRow): Promise<VerseAlteredExercise | null> {
  if (!item.scriptureReference) return null;
  const translation = item.translation ?? 'NET';

  const html = await fetchVerseText(item.scriptureReference, translation);
  if (!html) return null;

  const neighbours = neighbourVerseAddresses(item.scriptureReference, VERSE_ALTERED_NEIGHBOURS);
  const texts = await Promise.all(
    neighbours.map((address) => fetchVerseText(formatVerseAddress(address), translation)),
  );

  return buildVerseAltered({
    text: stripHtml(html),
    candidateTexts: texts.filter(Boolean).map((candidate) => stripHtml(candidate)),
    seed: reviewSeed(item),
  });
}

/** A wide net, because most candidate words are barred by one list or another. */
const VERSE_ALTERED_NEIGHBOURS = 8;

export async function verseTruthFor(item: ReviewItemRow, userId?: string): Promise<string | null> {
  if (item.kind !== 'verse' || !item.scriptureReference) return null;
  const material = userId
    ? await loadVerseMaterial(userId, item.scriptureReference, item.translation ?? 'NET')
    : undefined;
  const rung = verseRungFor(item.ladderStep, reviewSeed(item), material);
  // `verse.altered` most of all: leaving someone with a falsified line and no correction is the
  // one ending this rung must never have.
  const withheld = new Set<ReviewPromptKey>([
    'verse.recognize',
    'verse.recall',
    'verse.sequence',
    'verse.locate',
    'verse.book',
    'verse.altered',
    'verse.rebuild',
    'verse.initials',
    'verse.keywords',
    'verse.before',
    'verse.marked',
  ]);
  if (!withheld.has(rung.key)) return null;
  const html = await fetchVerseText(item.scriptureReference, item.translation ?? 'NET');
  return html || null;
}

async function buildVerseNextFor(item: ReviewItemRow): Promise<VerseNextExercise | null> {
  if (!item.scriptureReference) return null;

  const next = nextVerseAddress(item.scriptureReference);
  // The end of a book, or a reference the canon map does not recognise. Neither is askable.
  if (!next) return null;

  const translation = item.translation ?? 'NET';
  const answerHtml = await fetchVerseText(formatVerseAddress(next), translation);
  if (!answerHtml) return null;

  const neighbours = neighbourVerseAddresses(item.scriptureReference, VERSE_NEXT_NEIGHBOURS);
  const texts = await Promise.all(
    neighbours.map((address) => fetchVerseText(formatVerseAddress(address), translation)),
  );

  return buildVerseNext({
    answerText: stripHtml(answerHtml),
    neighbourTexts: texts.filter(Boolean).map((html) => stripHtml(html)),
    seed: reviewSeed(item),
  });
}

/**
 * The recognition rung's options: this verse's opening against three others the reader has cited.
 *
 * Their own passages first, so the choice is between things they have actually studied; a fixed
 * well-known set tops it up for a reader with nothing else on file yet.
 */
async function buildVerseRecognizeFor(
  userId: string,
  item: ReviewItemRow,
  text: string,
): Promise<VerseNextExercise | null> {
  if (!item.scriptureReference) return null;
  const translation = item.translation ?? 'NET';
  const others = (await listUserVerseReferences(userId, item.scriptureReference)).slice(0, 5);
  const pool = (
    await Promise.all(others.map((reference) => fetchVerseText(reference, translation)))
  )
    .filter(Boolean)
    .map((html) => stripHtml(html));
  return buildVerseRecognize({
    answerText: text,
    poolTexts: pool,
    seed: reviewSeed(item),
  });
}

/**
 * "Which comes first": this verse against another from the same chapter, never adjacent.
 *
 * Adjacent would make it a question about a digit. The partner is seeded from the non-adjacent
 * neighbours so the reveal and the grader pick the same one.
 */
async function buildVerseBeforeFor(item: ReviewItemRow, text: string, seed: string) {
  if (!item.scriptureReference) return null;
  const at = lastVerseOf(item.scriptureReference);
  if (!at) return null;
  const partners = neighbourVerseAddresses(item.scriptureReference, 8).filter(
    (n) => Math.abs(n.verse - at.verse) >= 2,
  );
  if (!partners.length) return null;
  const partner = partners[seededIndex(seed, partners.length)];
  const html = await fetchVerseText(formatVerseAddress(partner), item.translation ?? 'NET');
  if (!html) return null;
  return buildVerseBefore({
    verse: { number: at.verse, text },
    other: { number: partner.verse, text: stripHtml(html) },
    seed,
  });
}

/**
 * "Pick the words you marked in this verse." One builder for the question and the marking.
 *
 * Neighbours are fetched only as a top-up: a short verse cannot always spare four windows of
 * the span's length that do not overlap it, and three distractors is the difference between a
 * question and a coin toss.
 */
async function buildVerseMarkedFor(
  item: ReviewItemRow,
  material: VerseKnowledgeMaterial,
  seed: string,
): Promise<ChoiceExercise | null> {
  if (!item.scriptureReference || !material.markedSpan) return null;
  const translation = item.translation ?? 'NET';
  const neighbours = neighbourVerseAddresses(item.scriptureReference, VERSE_MARKED_NEIGHBOURS);
  const texts = await Promise.all(
    neighbours.map((address) => fetchVerseText(formatVerseAddress(address), translation)),
  );
  return buildVerseMarked({
    verseText: material.text,
    neighbourTexts: texts.filter(Boolean).map((html) => stripHtml(html)),
    span: material.markedSpan,
    seed,
  });
}

/** Enough neighbours that a short verse still fills four options. */
const VERSE_MARKED_NEIGHBOURS = 4;

/** The books behind a list of references, deduplicated, for the book rung's pool. */
function booksOf(references: readonly string[]): string[] {
  const out = new Set<string>();
  for (const ref of references) {
    const at = lastVerseOf(ref);
    if (at) out.add(at.book);
  }
  return [...out];
}

/**
 * The longest span the reader marked on each passage, keyed by reference.
 *
 * Longest, because a reader who marked "hate the light" and later the whole sentence around it
 * has told us which one carries the thought. Whether a span *fits* is decided at the point of
 * use by `readerSpanFragment`, since only there is the translation known.
 */
function readerSpansByReference(
  marks: readonly { reference: string | null; excerpt: string | null }[],
): Map<string, string> {
  const spans = new Map<string, string>();
  for (const mark of marks) {
    const key = mark.reference?.trim().toLowerCase();
    const excerpt = mark.excerpt?.trim();
    if (!key || !excerpt) continue;
    const current = spans.get(key);
    if (!current || excerpt.length > current.length) spans.set(key, excerpt);
  }
  return spans;
}

/** One passage's reader-marked span, for the reveal, which builds one item at a time. */
async function loadReaderSpan(userId: string, reference: string): Promise<string | null> {
  const marks = await db
    .select({
      reference: StudyThreadEntries.scriptureReference,
      excerpt: StudyThreadEntries.scripturePassageExcerpt,
    })
    .from(StudyThreadEntries)
    .where(
      and(
        eq(StudyThreadEntries.userId, userId),
        isNull(StudyThreadEntries.parentNoteId),
        eq(StudyThreadEntries.scriptureReference, reference),
      ),
    );
  return readerSpansByReference(marks).get(reference.trim().toLowerCase()) ?? null;
}

/** The same middle fragment locate shows, so the book rung reads as its easier twin. */
function locateFragmentOf(text: string): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length < 6) return words.join(' ');
  const start = Math.min(2, Math.max(0, words.length - 8));
  return words.slice(start, start + 8).join(' ');
}

// ─── The chapter rungs ────────────────────────────────────────────────────────

/**
 * What a chapter can be asked, with the material behind each answer.
 *
 * The chapter twin of `VerseKnowledgeMaterial`: the pure `ChapterMaterial` counts decide which
 * family member a step resolves to, and this carries the verses and names the builders need.
 * One load per chapter per request, cached inside a view build.
 */
interface ChapterKnowledgeMaterial extends ChapterMaterial {
  reference: string;
  book: string;
  chapter: number;
  translation: string;
  verses: ChapterVerse[];
  /** Verse numbers the reader highlighted in this chapter, in the Bible reader. */
  highlightedNumbers: number[];
  /** Everyone the index places in the chapter, barred names included (they bar distractors). */
  people: string[];
  /** Everywhere it names in the chapter, barred labels included (they bar distractors). */
  places: string[];
  /** How many of the reader's notes cite any verse in this chapter. For the framing line only. */
  citedInNotes: number;
  /**
   * When the reader last actually read this chapter, glances excluded. Null if never.
   *
   * From `ReadingEvents` rather than from the node's `lastSeenAt`, which is the last touch of
   * *any* kind — answering a review about a chapter bumps it, and "you read this today" is then
   * the app describing its own question back to the reader as if it were their reading.
   */
  lastReadAt: Date | null;
}

const EMPTY_CHAPTER_MATERIAL: ChapterKnowledgeMaterial = {
  reference: '',
  book: '',
  chapter: 0,
  translation: 'NET',
  verses: [],
  highlightedNumbers: [],
  people: [],
  places: [],
  citedInNotes: 0,
  lastReadAt: null,
  verseCount: 0,
  finishCandidates: 0,
  personCount: 0,
  placeCount: 0,
  highlightCount: 0,
};

/**
 * How many of the reader's own notes cite any verse in this chapter.
 *
 * The chapter twin of `loadNotesCitingVerse`, and it counts rather than naming: the count is
 * only ever a framing line ("Cited in 3 of your notes"), and no chapter rung asks which note,
 * so there is nothing here to leak. One query against the citation index rather than one per
 * verse — a chapter has up to a hundred and seventy-six of them.
 */
async function countNotesCitingChapter(
  userId: string,
  parts: { book: string; chapter: number },
): Promise<number> {
  try {
    const meta = await db
      .select({ noteId: ScriptureMetadata.noteId })
      .from(ScriptureMetadata)
      .where(and(eq(ScriptureMetadata.book, parts.book), eq(ScriptureMetadata.chapter, parts.chapter)));
    if (!meta.length) return 0;
    const scriptureNoteIds = [...new Set(meta.map((m) => m.noteId))];
    const viaPill = await db
      .select({ noteId: NoteScriptureReferences.noteId })
      .from(NoteScriptureReferences)
      .where(inArray(NoteScriptureReferences.scriptureNoteId, scriptureNoteIds));
    const candidates = [...new Set([...scriptureNoteIds, ...viaPill.map((r) => r.noteId)])];
    const owned = await db
      .select({ id: Notes.id })
      .from(Notes)
      .where(
        and(
          eq(Notes.userId, userId),
          inArray(Notes.id, candidates),
          ne(Notes.noteType, 'scripture'),
          countableUserNotesWhere(),
        ),
      );
    return owned.length;
  } catch {
    return 0;
  }
}

/** When this chapter was last read for long enough to count. Glances are not reading. */
async function loadLastReadAt(
  userId: string,
  parts: { book: string; chapter: number },
): Promise<Date | null> {
  try {
    const row = first(
      await db
        .select({ createdAt: ReadingEvents.createdAt })
        .from(ReadingEvents)
        .where(
          and(
            eq(ReadingEvents.userId, userId),
            eq(ReadingEvents.book, parts.book),
            eq(ReadingEvents.chapter, parts.chapter),
            // The buckets that count as having read it — a glance is not reading.
            inArray(
              ReadingEvents.dwellBucket,
              READING_DWELL_BUCKETS.filter((bucket) => readingDwellCountsAsRead(bucket)),
            ),
          ),
        )
        .orderBy(desc(ReadingEvents.createdAt))
        .limit(1),
    );
    return row?.createdAt ? new Date(row.createdAt) : null;
  } catch {
    return null;
  }
}

/** The verse numbers of the reader's own highlights within one chapter. */
async function loadReaderHighlightsInChapter(
  userId: string,
  parts: { book: string; chapter: number },
): Promise<number[]> {
  const rows = await db
    .select({ reference: StudyThreadEntries.scriptureReference })
    .from(StudyThreadEntries)
    .where(
      and(
        eq(StudyThreadEntries.userId, userId),
        isNull(StudyThreadEntries.parentNoteId),
        sql`${StudyThreadEntries.scriptureReference} LIKE ${`${parts.book} ${parts.chapter}:%`}`,
      ),
    )
    .catch(() => []);
  const numbers = new Set<number>();
  for (const row of rows) {
    if (!row.reference) continue;
    for (const verse of verseNodesForReference(row.reference).verses) {
      if (verse.book === parts.book && verse.chapter === parts.chapter) numbers.add(verse.verse);
    }
  }
  return [...numbers].sort((a, b) => a - b);
}

async function loadChapterMaterialUncached(
  userId: string,
  reference: string | null,
  translation: string,
): Promise<ChapterKnowledgeMaterial> {
  const parts = reference ? chapterKeyPartsFromReference(reference) : null;
  if (!parts) return EMPTY_CHAPTER_MATERIAL;
  const label = chapterReferenceLabel(parts);
  const [html, highlightedNumbers, knowledge, citedInNotes, lastReadAt, skip] = await Promise.all([
    fetchVerseText(label, translation).catch(() => ''),
    loadReaderHighlightsInChapter(userId, parts),
    getKnowledgeForChapter(parts.book, parts.chapter).catch(() => null),
    countNotesCitingChapter(userId, parts),
    loadLastReadAt(userId, parts),
    loadSkippedRungs(userId),
  ]);
  const verses = html ? splitChapterHtmlIntoVerses(html) : [];
  const people = (knowledge?.people ?? []).map((p) => p.name);
  const places = (knowledge?.places ?? []).map((place) => place.name);
  return {
    reference: label,
    book: parts.book,
    chapter: parts.chapter,
    translation,
    verses,
    highlightedNumbers,
    people,
    places,
    citedInNotes,
    lastReadAt,
    verseCount: verses.length,
    finishCandidates: chapterFinishCandidates(verses, highlightedNumbers).length,
    personCount: askablePeople(people).length,
    placeCount: askablePlaces(places).length,
    highlightCount: highlightedNumbers.length,
    skip,
  };
}

/** Other chapters the reader has turned to, most recent first, for distractors they have met. */
async function listUserReadChapters(
  userId: string,
  exclude: { book: string; chapter: number },
  limit: number,
): Promise<{ book: string; chapter: number }[]> {
  try {
    const rows = await db
      .select({
        book: ReadingEvents.book,
        chapter: ReadingEvents.chapter,
        last: sql<string>`max(${ReadingEvents.createdAt})`,
      })
      .from(ReadingEvents)
      .where(eq(ReadingEvents.userId, userId))
      .groupBy(ReadingEvents.book, ReadingEvents.chapter)
      .orderBy(desc(sql`max(${ReadingEvents.createdAt})`))
      .limit(limit + 1);
    return rows
      .filter((row) => !(row.book === exclude.book && row.chapter === exclude.chapter))
      .slice(0, limit)
      .map((row) => ({ book: row.book, chapter: row.chapter }));
  } catch {
    return [];
  }
}

/** How many other chapters to draw distractors from, and how many a choice needs. */
const CHAPTER_DISTRACTOR_CHAPTERS = 5;
const CHAPTER_DISTRACTORS_NEEDED = 3;

/**
 * "Pick the verse that is in John 3": one opening per chapter the reader has read, then
 * well-known chapters fetched one at a time until three distractors exist. The prefix guard
 * inside `buildChapterVerse` drops any that open like the answer.
 */
async function buildChapterVerseFor(
  userId: string,
  material: ChapterKnowledgeMaterial,
  seed: string,
): Promise<ChapterVerseExercise | null> {
  if (!material.verses.length) return null;
  const others = await listUserReadChapters(userId, material, CHAPTER_DISTRACTOR_CHAPTERS);
  const cueOf = async (label: string): Promise<string | null> => {
    const html = await fetchVerseText(label, material.translation).catch(() => '');
    return html ? chapterCueFor(splitChapterHtmlIntoVerses(html), `${seed}:${label}`) : null;
  };
  const own = (await Promise.all(others.map((c) => cueOf(chapterReferenceLabel(c))))).filter(
    (cue): cue is string => Boolean(cue),
  );
  const fallback: string[] = [];
  const taken = new Set([material.reference, ...others.map(chapterReferenceLabel)]);
  for (const label of WELL_KNOWN_CHAPTERS) {
    if (own.length + fallback.length >= CHAPTER_DISTRACTORS_NEEDED) break;
    if (taken.has(label)) continue;
    const cue = await cueOf(label);
    if (cue) fallback.push(cue);
  }
  return buildChapterVerse({ verses: material.verses, distractorTexts: own, fallbackTexts: fallback, seed });
}

function buildChapterFinishFor(
  material: ChapterKnowledgeMaterial,
  seed: string,
  pass: number,
  recallState?: RecallState | null,
): ChapterFinishExercise | null {
  const spec = verseClozeSpec(pass, recallState);
  return buildChapterFinish({
    verses: material.verses,
    highlightedNumbers: material.highlightedNumbers,
    seed,
    ratio: spec.ratio,
    maxBlanks: spec.maxBlanks,
  });
}

function buildChapterOrderFor(material: ChapterKnowledgeMaterial, seed: string): ChapterOrderExercise | null {
  return buildChapterOrder({ verses: material.verses, seed });
}

/** "Pick who appears in John 3": people of other read chapters as distractors, the index as fallback. */
async function buildChapterPersonFor(
  userId: string,
  material: ChapterKnowledgeMaterial,
  seed: string,
): Promise<ChoiceExercise | null> {
  if (!askablePeople(material.people).length) return null;
  const others = await listUserReadChapters(userId, material, 3);
  const pool = (
    await Promise.all(others.map((c) => getKnowledgeForChapter(c.book, c.chapter).catch(() => null)))
  ).flatMap((k) => k?.people.map((p) => p.name) ?? []);
  const fallback = await samplePeopleNames(seed);
  return buildChapterPerson({ people: material.people, pool, fallbackPool: fallback, seed });
}

/**
 * "Pick a place named in this chapter."
 *
 * The same shape as the person rung, drawing its distractors from other chapters the reader has
 * read so a wrong answer is somewhere they have actually been.
 */
async function buildChapterPlaceFor(
  userId: string,
  material: ChapterKnowledgeMaterial,
  seed: string,
): Promise<ChoiceExercise | null> {
  if (!material.places.length) return null;
  const others = await listUserReadChapters(userId, material, CHAPTER_DISTRACTOR_CHAPTERS);
  const pool = (
    await Promise.all(others.map((c) => getKnowledgeForChapter(c.book, c.chapter).catch(() => null)))
  ).flatMap((k) => k?.places.map((place) => place.name) ?? []);
  const fallback = await samplePlaceNames(seed);
  return buildChapterPlace({ places: material.places, pool, fallbackPool: fallback, seed });
}

/**
 * "Pick the verse you marked in this chapter." Pure, so it takes no round trip: the highlights
 * are already on the material, loaded once per chapter per request.
 */
function buildChapterMarkedFor(
  material: ChapterKnowledgeMaterial,
  seed: string,
): ChapterVerseExercise | null {
  return buildChapterMarked({
    verses: material.verses,
    highlightedNumbers: material.highlightedNumbers,
    seed,
  });
}

/** The cue of every verse the reader marked here — all of them are right answers. */
function markedCuesFor(material: ChapterKnowledgeMaterial): string[] {
  const marked = new Set(material.highlightedNumbers);
  return chapterCueCandidates(material.verses)
    .filter((verse) => marked.has(verse.number))
    .map((verse) => verseCue(verse.text, CHAPTER_CUE_WORDS))
    .filter(Boolean);
}

export async function gradeChapterAnswer(
  userId: string,
  item: ReviewItemRow,
  answer: { order?: number[]; option?: string; words?: string[] },
): Promise<GradedAnswer | null> {
  if (item.kind !== 'chapter' || !item.scriptureReference) return null;
  const seed = reviewSeed(item);
  const material = await loadChapterMaterial(userId, item.scriptureReference, item.translation ?? 'NET');
  const rung = chapterRungFor(item.ladderStep, seed, material);

  if (rung.key === 'chapter.verse' && typeof answer.option === 'string') {
    const exercise = await buildChapterVerseFor(userId, material, seed);
    if (!exercise) return null;
    return {
      correct: gradeChapterVerse(exercise, answer.option),
      correctAnswer: exercise.options[exercise.answerIndex] ?? null,
    };
  }
  if (rung.key === 'chapter.finish' && Array.isArray(answer.words)) {
    const exercise = buildChapterFinishFor(material, seed, rung.pass, item.recallState as RecallState);
    if (!exercise) return null;
    const marked = markVerseRebuild(exercise.cloze, answer.words);
    return { correct: marked.correct, correctAnswer: null, parts: marked.parts };
  }
  if (rung.key === 'chapter.order' && Array.isArray(answer.order)) {
    const exercise = buildChapterOrderFor(material, seed);
    if (!exercise) return null;
    const marked = markVerseSequence(exercise, answer.order);
    return { correct: marked.correct, correctAnswer: null, parts: marked.parts };
  }
  if (rung.key === 'chapter.person' && typeof answer.option === 'string') {
    const exercise = await buildChapterPersonFor(userId, material, seed);
    if (!exercise) return null;
    // Anyone the index places in the chapter is right, whichever one the build showed.
    return {
      correct: gradeChoiceExercise(exercise, answer.option, askablePeople(material.people)),
      correctAnswer: exercise.options[exercise.answerIndex] ?? null,
    };
  }
  if (rung.key === 'chapter.marked' && typeof answer.option === 'string') {
    const exercise = buildChapterMarkedFor(material, seed);
    if (!exercise) return null;
    // Any verse they marked is right, whichever one the build put forward.
    return {
      correct: gradeChapterMarked(exercise, answer.option, markedCuesFor(material)),
      correctAnswer: exercise.options[exercise.answerIndex] ?? null,
    };
  }
  if (rung.key === 'chapter.place' && typeof answer.option === 'string') {
    const exercise = await buildChapterPlaceFor(userId, material, seed);
    if (!exercise) return null;
    // Anywhere the index names in the chapter is right, whichever one the build showed.
    return {
      correct: gradeChoiceExercise(exercise, answer.option, askablePlaces(material.places)),
      correctAnswer: exercise.options[exercise.answerIndex] ?? null,
    };
  }
  return null;
}

/**
 * What a chapter rung owes once it is answered: the verse that was finished, the three that
 * were ordered (in their true order), the verse whose opening was picked. Nothing on the person
 * rung — the name is the answer, and the route already sends that.
 */
export async function chapterTruthFor(item: ReviewItemRow, userId: string): Promise<string | null> {
  if (item.kind !== 'chapter' || !item.scriptureReference) return null;
  const seed = reviewSeed(item);
  const material = await loadChapterMaterial(userId, item.scriptureReference, item.translation ?? 'NET');
  const rung = chapterRungFor(item.ladderStep, seed, material);
  if (rung.key === 'chapter.finish') {
    const exercise = buildChapterFinishFor(material, seed, rung.pass, item.recallState as RecallState);
    return exercise ? verseHtml(exercise.verse) : null;
  }
  if (rung.key === 'chapter.order') {
    const exercise = buildChapterOrderFor(material, seed);
    return exercise ? versesHtml(exercise.verses) : null;
  }
  if (rung.key === 'chapter.verse') {
    const exercise = await buildChapterVerseFor(userId, material, seed);
    return exercise ? verseHtml(exercise.verse) : null;
  }
  if (rung.key === 'chapter.marked') {
    const exercise = buildChapterMarkedFor(material, seed);
    return exercise ? verseHtml(exercise.verse) : null;
  }
  return null;
}

/**
 * The two rungs that ask for the verse in the reader's own typing, and how much of it counts.
 *
 * The share differs by what the question gave away: the first rung hands over the opening
 * words, the recall rung hands over only the reference.
 */
const FREE_RECALL_KEYS = new Set<ReviewPromptKey>(['verse.recall']);

/** Five asked for, three needed — see `buildVerseNextFor`. */
const VERSE_NEXT_NEIGHBOURS = 5;

export async function gradeVerseAnswer(
  userId: string,
  item: ReviewItemRow,
  answer: { order?: number[]; option?: string; wordIndex?: number; words?: string[]; text?: string },
): Promise<GradedAnswer | null> {
  if (item.kind !== 'verse' || !item.scriptureReference) return null;
  const seedForRung = reviewSeed(item);
  const material = await loadVerseMaterial(userId, item.scriptureReference, item.translation ?? 'NET');
  const rung = verseRungFor(item.ladderStep, seedForRung, material);

  if (VERSE_CONTEXT_KEYS.has(rung.key) && typeof answer.option === 'string') {
    const built = await buildVerseContextFor(userId, item, rung.key, material, seedForRung);
    if (!built) return null;
    return {
      correct: built.opening
        ? gradeVerseNext(built.exercise as VerseNextExercise, answer.option)
        : gradeChoiceExercise(built.exercise, answer.option, built.acceptable),
      correctAnswer: built.exercise.options[built.exercise.answerIndex] ?? null,
    };
  }

  if (rung.key === 'verse.recognize' && typeof answer.option === 'string') {
    const exercise = await buildVerseRecognizeFor(userId, item, material.text);
    if (!exercise) return null;
    return {
      correct: gradeVerseNext(exercise, answer.option),
      correctAnswer: exercise.options[exercise.answerIndex] ?? null,
    };
  }
  if (FREE_RECALL_KEYS.has(rung.key) && typeof answer.text === 'string') {
    /*
     * Graded against what was *asked for*, not against the whole verse.
     *
     * At the lower tiers most of the verse is on screen and the reader writes the rest; marking
     * the coverage share against the full text would score a perfect finish at two thirds.
     */
    const built = buildVerseRecall(material.text, verseRecallMode(rung.pass, item.recallState as RecallState));
    const marked = markVerseRecall(built.hiddenText, answer.text, RECALL_MIN_SHARE);
    return {
      correct: marked.correct,
      correctAnswer: null,
      parts: marked.parts,
      reached: marked.reached,
      hint: marked.correct ? undefined : recallHint(built.hiddenText, answer.text),
    };
  }
  if (rung.key === 'verse.initials') {
    /*
     * Which shape is graded is decided by the **tier**, never by which field the client sent.
     *
     * Reading the field instead would let a page choose its own marking: send `text` on a
     * tier-0 item and the all-or-nothing subsequence match runs against a verse that was mostly
     * on screen. The tier is derived from stored state the client cannot set.
     */
    const share = verseInitialsShare(rung.pass, item.recallState as RecallState);
    const exercise = buildVerseInitials(material.text, seedForRung, share);
    if (!exercise) return null;
    if (exercise.tier < 2 && Array.isArray(answer.words)) {
      const marked = markVerseInitialsParts(exercise, answer.words);
      return {
        correct: marked.correct,
        correctAnswer: null,
        parts: marked.parts,
        hint: marked.correct ? undefined : blankHint(exercise.reduced, answer.words, marked.parts),
      };
    }
    if (exercise.tier === 2 && typeof answer.text === 'string') {
      const marked = markVerseInitials(material.text, answer.text);
      return {
        correct: marked.correct,
        correctAnswer: null,
        parts: marked.parts,
        reached: marked.reached,
        hint: marked.correct ? undefined : wordHint(material.text, answer.text),
      };
    }
    return null;
  }
  if (rung.key === 'verse.keywords' && Array.isArray(answer.words)) {
    const count = verseKeywordsCount(rung.pass, item.recallState as RecallState);
    const marked = markVerseKeywords(material.text, answer.words, count);
    return {
      correct: marked.correct,
      correctAnswer: null,
      parts: marked.parts,
      hint: marked.correct ? undefined : keywordHint(material.text, answer.words, seedForRung),
    };
  }
  if (rung.key === 'verse.before' && typeof answer.option === 'string') {
    const exercise = await buildVerseBeforeFor(item, material.text, seedForRung);
    if (!exercise) return null;
    return {
      correct: gradeVerseBefore(exercise, answer.option),
      correctAnswer: exercise.options[exercise.answerIndex] ?? null,
    };
  }
  if (rung.key === 'verse.marked' && typeof answer.option === 'string') {
    const exercise = await buildVerseMarkedFor(item, material, seedForRung);
    if (!exercise) return null;
    return {
      correct: gradeVerseMarked(exercise, answer.option, material.markedSpan ?? ''),
      correctAnswer: exercise.options[exercise.answerIndex] ?? null,
    };
  }
  if (rung.key === 'verse.book' && typeof answer.option === 'string') {
    const exercise = buildVerseBook({
      book: lastVerseOf(item.scriptureReference)?.book ?? '',
      poolBooks: booksOf(await listUserVerseReferences(userId, item.scriptureReference)),
      seed: seedForRung,
    });
    if (!exercise) return null;
    return {
      correct: gradeChoiceExercise(exercise, answer.option, [exercise.options[exercise.answerIndex]]),
      correctAnswer: exercise.options[exercise.answerIndex] ?? null,
    };
  }

  const isSequence = rung.key === 'verse.sequence' && Array.isArray(answer.order);
  const isLocate = rung.key === 'verse.locate' && typeof answer.option === 'string';
  const isNext = rung.key === 'verse.next' && typeof answer.option === 'string';
  const isAltered = rung.key === 'verse.altered' && Number.isInteger(answer.wordIndex);
  const isRebuild = rung.key === 'verse.rebuild' && Array.isArray(answer.words);
  if (!isSequence && !isLocate && !isNext && !isAltered && !isRebuild) return null;

  if (isRebuild) {
    const html = await fetchVerseText(item.scriptureReference, item.translation ?? 'NET');
    if (!html) return null;
    const spec = verseClozeSpec(rung.pass, item.recallState as RecallState);
    const cloze = buildVerseCloze(stripHtml(html), reviewSeed(item), spec.ratio, {
      maxBlanks: spec.maxBlanks,
    });
    const marked = markVerseRebuild(cloze, answer.words!);
    return {
      correct: marked.correct,
      correctAnswer: null,
      parts: marked.parts,
      hint: marked.correct ? undefined : blankHint(cloze.blanks, answer.words!, marked.parts),
    };
  }

  if (isAltered) {
    const exercise = await buildVerseAlteredFor(item);
    if (!exercise) return null;
    return { correct: gradeVerseAltered(exercise, answer.wordIndex!), correctAnswer: null };
  }

  if (isNext) {
    const exercise = await buildVerseNextFor(item);
    if (!exercise) return null;
    return {
      correct: gradeVerseNext(exercise, answer.option!),
      correctAnswer: exercise.options[exercise.answerIndex] ?? null,
    };
  }

  const html = await fetchVerseText(item.scriptureReference, item.translation ?? 'NET');
  if (!html) return null;
  const text = stripHtml(html);
  const seed = reviewSeed(item);

  if (isSequence) {
    const exercise = buildVerseSequence(text, seed);
    if (!exercise) return null;
    const marked = markVerseSequence(exercise, answer.order!);
    return { correct: marked.correct, correctAnswer: null, parts: marked.parts };
  }

  const pool = await listUserVerseReferences(userId, item.scriptureReference);
  const { close, rest } = partitionByBook([item.scriptureReference], pool);
  const exercise = buildVerseLocate(
    item.scriptureReference,
    text,
    close.length ? close : pool,
    seed,
    null,
    close.length ? rest : undefined,
  );
  if (!exercise) return null;
  return {
    correct: gradeVerseLocate(exercise, answer.option!),
    correctAnswer: exercise.options[exercise.answerIndex] ?? null,
  };
}

/**
 * Can this note be asked anything at all?
 *
 * The floor under the note ladder. Every rung needs material the reader committed — a body to
 * quote, a passage cited, a link drawn — and a note with none of those has no question that is
 * not invented. There is deliberately no reflective fallback: those five prompts left for Home,
 * and putting one back here as a safety net would undo the change.
 */
export async function noteHasReviewableMaterial(userId: string, noteId: string): Promise<boolean> {
  const material = (await loadNoteMaterial(userId, [noteId])).get(noteId);
  return Boolean(material && resolveNoteRung(0, material));
}

/**
 * How a note is named *as an option*, which is not how it is named as a row.
 *
 * `noteLabel` falls back to the note's own opening line, and that is right for a row — it shows
 * you which note without you opening it. It is wrong here, because the question quotes the
 * note's body, so the opening line can be the fragment itself. An option that repeats the
 * question is the answer.
 *
 * Title, then the first passage it cites, then when it was written. Never the excerpt.
 */
function noteOptionLabel(row: {
  id: string;
  title: string | null;
  createdAt: Date | null;
  passage?: string | null;
}): { label: string; distinguishing: boolean } {
  const title = displayTitle(row.title);
  // A note titled "August 13, 2026" is a date wearing a title. It names *when*, not *what*, so
  // it cannot be told from the next day's note by anyone reading a sentence out of one.
  if (title && labelNamesWhat(title)) return { label: title, distinguishing: true };
  if (row.passage?.trim()) return { label: row.passage.trim(), distinguishing: true };
  if (title) return { label: title, distinguishing: false };
  const written = row.createdAt;
  if (written) {
    return {
      label: `Written ${written.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      distinguishing: false,
    };
  }
  return { label: 'A note', distinguishing: false };
}


/**
 * The note's own option label, and a pool of other notes to sit beside it.
 *
 * `distinguishing` carries the whole quality of the exercise. Four options reading "Written 10
 * Jul", "August 13, 2026", "Written 26 Jun" and "August 16, 2026" is not a question anyone can
 * answer — the reader is being asked which of four days a sentence came from. Rung 0 requires
 * every option to name *what* rather than *when*, and falls through when it cannot.
 */
async function loadNoteOptionLabels(
  userId: string,
  noteId: string,
): Promise<{ own: string; ownDistinguishing: boolean; others: string[]; close: string[]; rest: string[] }> {
  const [pool, subject, passages] = await Promise.all([
    loadNoteLabelPool(userId),
    loadNoteSubjectLabels(userId, [noteId]),
    getNotePassages(noteId),
  ]);
  const ownLabel = subject.get(noteId) ?? { label: 'A note', distinguishing: false };
  const own = ownLabel.label.toLowerCase();
  const others = pool.distinguishing.filter((label) => label.toLowerCase() !== own);
  const anchors = passages.map((p) => verseReferenceLabel(p));
  const { close, rest } = partitionByBook(
    anchors,
    others.map((label) => pool.bookByLabel.get(label.toLowerCase()) ?? label),
  );
  // The pool is labels (titles or passages). Re-map close/rest back to the labels that produced them.
  const labelFor = (value: string): string | undefined =>
    others.find((label) => label === value || (pool.bookByLabel.get(label.toLowerCase()) ?? '') === value);
  return {
    own: ownLabel.label,
    ownDistinguishing: ownLabel.distinguishing,
    others,
    close: close.map((value) => labelFor(value)).filter((label): label is string => Boolean(label)),
    rest: rest.map((value) => labelFor(value)).filter((label): label is string => Boolean(label)),
  };
}

/**
 * Every span the reader marked in these notes, in the order the picker has always used.
 *
 * Batched, because the shelf builds a page of rows at once and the dock builds one. Both draw
 * from this so a row and the card it opens quote the same line — see `chooseNoteStem`. The
 * ordering is load-bearing: the span is picked by hash over the array, so a query without
 * `orderBy` would hand the row one span and the reveal another from the same seed.
 */
async function loadNoteSpans(
  userId: string,
  noteIds: readonly string[],
): Promise<Map<string, NoteSpan[]>> {
  const unique = [...new Set(noteIds.filter(Boolean))];
  const out = new Map<string, NoteSpan[]>();
  if (!unique.length) return out;

  const rows = await db
    .select({
      parentNoteId: StudyThreadEntries.parentNoteId,
      quote: StudyThreadEntries.anchorQuote,
      prefix: StudyThreadEntries.anchorPrefixContext,
      suffix: StudyThreadEntries.anchorSuffixContext,
    })
    .from(StudyThreadEntries)
    .where(
      and(
        eq(StudyThreadEntries.userId, userId),
        inArray(StudyThreadEntries.parentNoteId, unique),
        eq(StudyThreadEntries.anchorStatus, 'resolved'),
        eq(StudyThreadEntries.entryKindRaw, 'miniNote'),
        isNotNull(StudyThreadEntries.anchorQuote),
      ),
    )
    .orderBy(StudyThreadEntries.createdAt, StudyThreadEntries.id);

  for (const row of rows) {
    if (!row.parentNoteId || !row.quote) continue;
    /*
     * Only spans that clear the floor are in the draw, so a short one cannot win the seed.
     *
     * Stripped defensively: these three columns normally hold plain text (the anchor is built
     * from canonicalised text), but the failure branch in `study-threads.ts` writes the
     * client-supplied quote raw — and both surfaces that show a span render it as escaped text,
     * so one HTML quote that got through would print as markup rather than words.
     */
    const span = buildNoteSpan({
      quote: stripHtml(row.quote),
      prefix: row.prefix ? stripHtml(row.prefix) : row.prefix,
      suffix: row.suffix ? stripHtml(row.suffix) : row.suffix,
    });
    if (!span) continue;
    const list = out.get(row.parentNoteId);
    if (list) list.push(span);
    else out.set(row.parentNoteId, [span]);
  }
  return out;
}

/**
 * The line a note is quoted by — the one call both the shelf row and the dock card make.
 *
 * They used to choose separately, and chose differently: the card preferred a span the reader
 * had marked, the row only ever took a random window of the prose. Same note, same seed, two
 * different lines, and the better one never reached the list. One helper, one seed, one `avoid`.
 */
function noteStemFor(input: {
  content: string | null;
  contentEncrypted: boolean | null;
  spans: readonly NoteSpan[];
  seed: string;
  ownLabel: string | null;
}): { fragment: string; span: NoteSpan | null; truncated: boolean } | null {
  if (input.contentEncrypted) return null;
  return chooseNoteStem({
    html: input.content ?? '',
    spans: input.spans,
    seed: input.seed,
    avoid: input.ownLabel ? [input.ownLabel] : [],
  });
}

/** The option label for specific notes, which may be older than the pool reaches. */
async function loadNoteSubjectLabels(
  userId: string,
  noteIds: readonly string[],
): Promise<Map<string, { label: string; distinguishing: boolean }>> {
  const unique = [...new Set(noteIds.filter(Boolean))];
  const out = new Map<string, { label: string; distinguishing: boolean }>();
  if (!unique.length) return out;

  const [rows, resolved] = await Promise.all([
    db
      .select({ id: Notes.id, title: Notes.title, createdAt: Notes.createdAt })
      .from(Notes)
      .where(and(eq(Notes.userId, userId), inArray(Notes.id, unique))),
    loadTitles(userId, unique),
  ]);

  for (const row of rows) {
    out.set(
      row.id,
      noteOptionLabel({
        id: row.id,
        title: row.title,
        createdAt: row.createdAt,
        passage: resolved.get(row.id)?.passage ?? null,
      }),
    );
  }
  return out;
}

/** The notes on the other end of this one's links — every one of them is a right answer. */
async function loadConnectedNoteLabels(userId: string, noteId: string): Promise<string[]> {
  const edges = await db
    .select({ from: NoteConnections.fromNoteId, to: NoteConnections.toNoteId })
    .from(NoteConnections)
    .where(
      and(
        eq(NoteConnections.userId, userId),
        or(eq(NoteConnections.fromNoteId, noteId), eq(NoteConnections.toNoteId, noteId)),
      ),
    );
  const ids = [...new Set(edges.flatMap((e) => [e.from, e.to]))].filter((id) => id !== noteId);
  if (!ids.length) return [];

  const rows = await db
    .select({ id: Notes.id, title: Notes.title, createdAt: Notes.createdAt })
    .from(Notes)
    .where(and(eq(Notes.userId, userId), inArray(Notes.id, ids)));
  return rows.map((row) => noteOptionLabel(row).label);
}

/**
 * How wide the option pool is drawn.
 *
 * Generously, on purpose: every acceptable answer is barred from being a distractor, so a note
 * citing three passages the reader has also studied elsewhere shrinks the usable pool by three.
 */
const NOTE_OPTION_POOL_LIMIT = 60;
/** Three wrong options, or the question is a coin toss between two. */
const MIN_NOTE_DISTRACTORS = 3;

/**
 * Everything a note rung needs, built once so the reveal and the grader cannot disagree.
 *
 * Both call this. The reveal keeps `options` and throws the key away; the grader keeps the key
 * and throws the options away. One function means there is no second implementation to drift.
 */
async function buildNoteExercise(
  userId: string,
  item: ReviewItemRow,
): Promise<{
  rung: ReviewPromptKey;
  exercise: ChoiceExercise;
  fragment: string | null;
  /** The marked span behind `fragment`, where the reader highlighted rather than the app chose. */
  span: NoteSpan | null;
  /** The stem is a clause cut out of a longer sentence, so the card may show it as partial. */
  truncated?: boolean;
  acceptable: string[];
} | null> {
  if (item.kind !== 'note' || !item.noteId) return null;

  const material = (await loadNoteMaterial(userId, [item.noteId])).get(item.noteId);
  if (!material) return null;
  const rung = resolveNoteRung(item.ladderStep, material, reviewSeed(item));
  if (!rung) return null;

  const seed = reviewSeed(item);
  const labels = await loadNoteOptionLabels(userId, item.noteId);

  if (rung === 'note.recognize') {
    const [note] = await db
      .select({ content: Notes.content, contentEncrypted: Notes.contentEncrypted })
      .from(Notes)
      .where(and(eq(Notes.id, item.noteId), eq(Notes.userId, userId)))
      .limit(1);
    if (!note || note.contentEncrypted) return null;

    /*
     * A span the reader marked beats a sentence the app chose, and a sentence beats a window
     * cut out of the middle of the note. `chooseNoteStem` holds that order, and the shelf row
     * calls it with the same seed and the same `avoid`, so the list and this card agree.
     */
    const spans = (await loadNoteSpans(userId, [item.noteId])).get(item.noteId) ?? [];
    const stem = noteStemFor({
      content: note.content,
      contentEncrypted: note.contentEncrypted,
      spans,
      seed,
      ownLabel: labels.own,
    });
    if (!stem) return null;
    const { fragment, span } = stem;

    // An answer nobody could name is not an answer. Falls through to the passage rung.
    if (!labels.ownDistinguishing) return null;

    const exercise = buildNoteRecognize({
      fragment,
      span,
      answerLabel: labels.own,
      poolLabels: labels.close.length ? labels.close : labels.others,
      fallbackLabels: labels.close.length ? labels.rest : undefined,
      seed,
    });
    return exercise
      ? {
          rung,
          exercise,
          fragment: exercise.fragment,
          span: span ?? null,
          truncated: stem.truncated,
          acceptable: [labels.own],
        }
      : null;
  }

  if (rung === 'note.passage') {
    const passages = await getNotePassages(item.noteId);
    const acceptable = passages.map((p) => verseReferenceLabel(p));
    if (!acceptable.length) return null;
    // Generous pool: every acceptable answer is also barred as a distractor.
    const pool = await listUserVerseReferences(userId, '');
    const { close, rest } = partitionByBook(acceptable, pool);
    const exercise = buildNoteChoice({
      acceptable,
      poolLabels: close.length ? close : pool,
      fallbackLabels: close.length ? rest : undefined,
      seed,
    });
    return exercise ? { rung, exercise, fragment: null, span: null, acceptable } : null;
  }

  if (rung === 'note.annotation') {
    /*
     * The words the reader typed on a highlight, and the passage they typed them on. Ordered and
     * seeded for the same reason the marked span is: the reveal and the grader must build the
     * same question from the same inputs.
     */
    const rows = await db
      .select({
        reference: StudyThreadEntries.scriptureReference,
        miniNoteBody: StudyThreadEntries.miniNoteBody,
        notesBody: StudyThreadEntries.notesBody,
      })
      .from(StudyThreadEntries)
      .where(
        and(
          eq(StudyThreadEntries.userId, userId),
          eq(StudyThreadEntries.parentNoteId, item.noteId),
          isNotNull(StudyThreadEntries.scriptureReference),
        ),
      )
      .orderBy(StudyThreadEntries.createdAt, StudyThreadEntries.id);

    const usable = rows.filter(
      (row) => annotationTextOf(row).split(/\s+/).filter(Boolean).length >= 3 && row.reference,
    );
    if (!usable.length) return null;

    const chosen = usable[hashSeed(seed) % usable.length];
    const reference = chosen.reference!.trim();
    const pool = await listUserVerseReferences(userId, reference);
    const { close, rest } = partitionByBook([reference], pool);
    const exercise = buildNoteAnnotation({
      annotation: annotationTextOf(chosen),
      reference,
      poolReferences: close.length ? close : pool,
      fallbackReferences: close.length ? rest : undefined,
      seed,
    });
    return exercise
      ? { rung, exercise, fragment: exercise.fragment, span: null, acceptable: [reference] }
      : null;
  }

  const neighbours: string[] = await loadConnectedNoteLabels(userId, item.noteId);
  if (!neighbours.length) return null;
  const distractors = labels.others.filter((label) => !neighbours.includes(label));
  const close = labels.close.filter((label) => !neighbours.includes(label));
  const rest = labels.rest.filter((label) => !neighbours.includes(label));
  const exercise = buildNoteChoice({
    acceptable: neighbours,
    poolLabels: close.length ? close : distractors,
    fallbackLabels: close.length ? rest : undefined,
    seed,
  });
  return exercise ? { rung, exercise, fragment: null, span: null, acceptable: neighbours } : null;
}

/**
 * Mark a note rung, rebuilt from the same inputs the question was built from.
 *
 * Returns null when the effective rung has moved since the question was shown — the reader
 * deleted the link they were about to be asked about, say. `graded ?? outcome` in the route
 * then falls back to their own verdict, which is the safe failure.
 */
/**
 * Whether an answer was right, and what the right answer was.
 *
 * The second half is only filled in for the rungs where the answer is one of the options on
 * screen. On the rungs built out of the verse itself — put it back in order, fill the gaps, find
 * the changed word — the correct answer *is* the verse, and `verseTruthFor` already hands that
 * back once the question is done with.
 */
export interface GradedAnswer {
  correct: boolean;
  correctAnswer: string | null;
  /**
   * Which parts of the answer were right, aligned to what the reader submitted — the gaps they
   * filled, the words they named, the phrases they placed, the words they wrote. Absent on the
   * rungs that have no parts: one tap has nothing to break down.
   */
  parts?: boolean[];
  /** How much of the verse a written answer reached. Names nothing; it is a count. */
  reached?: { matched: number; total: number };
  /**
   * One thing to go on for the next try. Only ever computed for a wrong answer, and the route
   * only ever sends it while there is a go left — see `ReviewHint`.
   */
  hint?: ReviewHint;
}

/**
 * What the reader is given after a miss, when the question is still in front of them.
 *
 * A retry that repeats the identical question with no new information is a second chance to make
 * the same mistake; a retry that hands over one piece is the repetition this feature is for.
 *
 * **Computed, never stored.** The grader rebuilds the exercise from the same seed and tier it was
 * asked at, looks at what missed, and names one thing. A second identical attempt yields the same
 * hint, which is correct — nothing about the reader's progress has changed.
 *
 * A hinted answer can never earn the long interval: the outcome route already maps every
 * second-or-later attempt to `almost`, so the most a hint can buy is a few days rather than a
 * fortnight. That is the price, and it is the right one — help is not the same as recall.
 */
export type ReviewHint =
  /** A gap, filled. The reader sees the word appear in place and locked. */
  | { kind: 'blank'; index: number; word: string }
  /** The next few words of what they were asked to produce, from where they got to. */
  | { kind: 'lead'; text: string }
  /** One word they have not reached yet, named. */
  | { kind: 'word'; word: string }
  /** The first letter of a word that would have counted. */
  | { kind: 'letter'; letter: string };

/** How many words a `lead` hint hands over. Enough to restart a sentence, not to finish it. */
const HINT_LEAD_WORDS = 3;

/**
 * The first gap that is wrong or empty, filled in.
 *
 * Deterministic and dull on purpose: the first one they have not got. Walking to a *random*
 * missing gap would mean a second identical attempt hinting at a different word, which reads as
 * the exercise changing under them.
 */
function blankHint(
  blanks: readonly { word: string }[],
  answers: readonly string[],
  parts: readonly boolean[],
): ReviewHint | undefined {
  for (let i = 0; i < blanks.length; i++) {
    if (parts[i] === true) continue;
    if (!blanks[i]?.word) continue;
    return { kind: 'blank', index: i, word: blanks[i].word };
  }
  return undefined;
}

/** Where the reader got to in what they were asked to produce, plus the next few words. */
function recallHint(hiddenText: string, attempt: string): ReviewHint | undefined {
  const wanted = hiddenText.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!wanted.length) return undefined;
  const marked = markVerseRecall(hiddenText, attempt, RECALL_MIN_SHARE);
  /*
   * `reached.matched` counts content words; the lead has to start at a *token*. Walking forward
   * to the token after the last content word they landed gives a hint that continues their
   * sentence rather than one that restates it.
   */
  const from = Math.min(wanted.length - 1, Math.max(0, marked.reached.matched));
  const text = wanted.slice(from, from + HINT_LEAD_WORDS).join(' ');
  return text ? { kind: 'lead', text } : undefined;
}

/** The first content word of the verse the reader has not reached. */
function wordHint(text: string, attempt: string): ReviewHint | undefined {
  const marked = markVerseInitials(text, attempt);
  const words = contentWords(text);
  const next = words[Math.min(words.length - 1, Math.max(0, marked.reached.matched))];
  return next ? { kind: 'word', word: next } : undefined;
}

/** A letter that would have counted, for the rung where any of several words is right. */
function keywordHint(
  text: string,
  words: readonly string[],
  seed: string,
): ReviewHint | undefined {
  const used = new Set(words.map((word) => word.trim().toLowerCase()).filter(Boolean));
  const options = contentWords(text).filter((word) => !used.has(word.toLowerCase()));
  if (!options.length) return undefined;
  const letter = options[hashSeed(`${seed}:hint`) % options.length].charAt(0);
  return letter ? { kind: 'letter', letter } : undefined;
}

export async function gradeNoteAnswer(
  userId: string,
  item: ReviewItemRow,
  answer: { option?: string; promptKey?: string },
): Promise<GradedAnswer | null> {
  if (typeof answer.option !== 'string') return null;
  const built = await buildNoteExercise(userId, item);
  if (!built) return null;
  // The client tells us which question it was shown; disagreement means the material moved.
  if (answer.promptKey && answer.promptKey !== built.rung) return null;
  return {
    correct: gradeNoteChoice(built.exercise, answer.option, built.acceptable),
    correctAnswer: built.exercise.options[built.exercise.answerIndex] ?? null,
  };
}

/**
 * One door for marking, whatever the kind.
 *
 * The route used to choose between two graders with a ternary, which made a third kind fall
 * into whichever branch was the `else` — a chapter would have been marked as a verse and
 * returned null, and null on a graded rung means the client's own verdict is recorded as truth.
 */
/**
 * Which rung this item is being asked on, and nothing else.
 *
 * The outcome route needs one string — the resolved prompt key, which decides how many goes the
 * reader gets — and was getting it by building the item's whole view: framing lines, node states,
 * thread titles, the note label pool, every row's provenance sentence. Measured against a real
 * account that was 1.1 of the 2.9 seconds it took to record a single answer.
 *
 * Resolved exactly the way `buildReviewItemViews` resolves it, through the same three functions
 * and the same seed, because a route that graded against a different rung than the one the reader
 * was shown would be worse than a slow one.
 */
export async function askedRungFor(
  userId: string,
  item: ReviewItemRow,
): Promise<ReviewPromptKey | null> {
  const kind = item.kind as ReviewItemKind;
  if (!isReviewAskableKind(kind)) return null;

  if (kind === 'note') {
    if (!item.noteId) return null;
    const material = (await loadNoteMaterial(userId, [item.noteId])).get(item.noteId);
    return material ? resolveNoteRung(item.ladderStep, material, reviewSeed(item)) : null;
  }

  const translation = item.translation ?? 'NET';
  if (kind === 'chapter') {
    const material = await loadChapterMaterial(userId, item.scriptureReference, translation);
    return chapterRungFor(item.ladderStep, reviewSeed(item), material).key;
  }
  const material = await loadVerseMaterial(userId, item.scriptureReference, translation);
  return verseRungFor(item.ladderStep, reviewSeed(item), material).key;
}

export async function gradeAnswerFor(
  userId: string,
  item: ReviewItemRow,
  answer: { order?: number[]; option?: string; wordIndex?: number; words?: string[]; text?: string; promptKey?: string },
): Promise<GradedAnswer | null> {
  switch (item.kind) {
    case 'note':
      return gradeNoteAnswer(userId, item, answer);
    case 'verse':
      return gradeVerseAnswer(userId, item, answer);
    case 'chapter':
      return gradeChapterAnswer(userId, item, answer);
    default:
      return null;
  }
}

/** What the reader sees after they answer, or after they give up and open it. */
export async function buildReviewReveal(
  userId: string,
  item: ReviewItemRow,
): Promise<ReviewRevealPayload> {
  const payload: ReviewRevealPayload = {};

  if (item.kind === 'verse' || item.kind === 'highlight') {
    if (item.scriptureReference) {
      const html = await fetchVerseText(item.scriptureReference, item.translation ?? 'NET');
      payload.verseText = html || null;
      if (item.kind === 'verse' && html) {
        const text = stripHtml(html);
        const seed = reviewSeed(item);
        /*
         * Which rung this is, rather than which number the step happens to be. Past the top of
         * the ladder the same rungs come round again on a maintenance pass, and every branch
         * below has to recognise them when they do.
         */
        const material = await loadVerseMaterial(userId, item.scriptureReference, item.translation ?? 'NET');
        const rung = verseRungFor(item.ladderStep, seed, material);
        if (VERSE_CONTEXT_KEYS.has(rung.key)) {
          const built = await buildVerseContextFor(userId, item, rung.key, material, seed);
          // Options only. The verse stays on screen: it is the question, not the answer.
          payload.choice = built ? { options: built.exercise.options, opening: built.opening } : null;
        }
        if (rung.key === 'verse.recognize') {
          const exercise = await buildVerseRecognizeFor(userId, item, text);
          // Openings, and the verse withheld: it is the answer on this rung now.
          payload.choice = exercise ? { options: exercise.options, opening: true } : null;
          payload.verseText = null;
        }
        if (FREE_RECALL_KEYS.has(rung.key)) {
          /*
           * At the top tier the prompt is the whole question and nothing is built. Below it the
           * reader is given a way in — most of the verse to finish, or its opening few words —
           * and `shown` is that much and no more. The rest is still withheld and still comes
           * back as truth once the answer is in.
           */
          const built = buildVerseRecall(text, verseRecallMode(rung.pass, item.recallState as RecallState));
          payload.recall = { shown: built.shown, mode: built.mode };
          payload.verseText = null;
        }
        if (rung.key === 'verse.initials') {
          const exercise = buildVerseInitials(
            text,
            seed,
            verseInitialsShare(rung.pass, item.recallState as RecallState),
          );
          // `reduced` is the answer key and never leaves the server; the letters are the question.
          payload.initials = exercise
            ? {
                initials: exercise.initials,
                wordCount: exercise.wordCount,
                tier: exercise.tier,
                segments: exercise.segments ?? null,
              }
            : null;
          if (payload.initials) payload.verseText = null;
        }
        if (rung.key === 'verse.keywords') {
          payload.keywords = buildVerseKeywords(
            text,
            verseKeywordsCount(rung.pass, item.recallState as RecallState),
          );
          if (payload.keywords) payload.verseText = null;
        }
        if (rung.key === 'verse.before') {
          const exercise = await buildVerseBeforeFor(item, text, seed);
          payload.before = exercise ? { options: exercise.options } : null;
          // One of the two openings is this verse; showing it would mark the pair.
          if (exercise) payload.verseText = null;
        }
        if (rung.key === 'verse.book') {
          const exercise = buildVerseBook({
            book: lastVerseOf(item.scriptureReference)?.book ?? '',
            poolBooks: booksOf(await listUserVerseReferences(userId, item.scriptureReference)),
            seed,
          });
          payload.locate = exercise
            ? {
                phrase:
                  readerSpanFragment(await loadReaderSpan(userId, item.scriptureReference), text) ??
                  locateFragmentOf(text),
                options: exercise.options,
              }
            : null;
          payload.verseText = null;
        }
        if (rung.key === 'verse.rebuild') {
          // A later pass hides more, and the seed carries the step, so it hides a different set.
          const spec = verseClozeSpec(rung.pass, item.recallState as RecallState);
          const cloze = buildVerseCloze(text, seed, spec.ratio, { maxBlanks: spec.maxBlanks });
          // The pieces either side of each gap, so the page can put an input where the gap is
          // rather than a picture of one. `display` is never sent: it is unfillable.
          // `uniformWidths` withdraws the letter-count hint at the top tier.
          payload.cloze =
            cloze.blanks.length > 0
              ? clozeSegments(cloze, { uniformWidths: spec.uniformWidths })
              : null;
          /*
           * The gaps, not the verse. This rung shipped both and rendered neither: it was not
           * graded, so the reveal was only fetched after "Check the verse", and the dock had no
           * branch for a cloze — the reader got a textarea and then the whole passage. Fetching
           * it up front is what makes the exercise appear, and the answer has to stop coming
           * with it.
           */
          if (cloze.blanks.length > 0) payload.verseText = null;
        }
        if (rung.key === 'verse.sequence') {
          const exercise = buildVerseSequence(text, seed);
          // Phrases only. `order` is the answer, and stays here — as does the verse itself,
          // which is the same information in one line.
          payload.sequence = exercise ? { phrases: exercise.phrases } : null;
          if (exercise) payload.verseText = null;
        }
        if (rung.key === 'verse.next') {
          const exercise = await buildVerseNextFor(item);
          // The verse asked about stays: it is the question, not the answer.
          payload.next = exercise ? { options: exercise.options } : null;
        }
        if (rung.key === 'verse.altered') {
          const exercise = await buildVerseAlteredFor(item);
          payload.altered = exercise ? { tokens: exercise.tokens } : null;
          // The true verse alongside a falsified one would answer the question, and worse,
          // would print the passage twice with only one of them right.
          if (exercise) payload.verseText = null;
        }
        if (rung.key === 'verse.marked') {
          const exercise = await buildVerseMarkedFor(item, material, seed);
          payload.choice = exercise ? { options: exercise.options, opening: false } : null;
          /*
           * The verse itself would print the marked words among the options and again in full,
           * with only the highlighting missing — which is the question. It comes back as the
           * truth once the answer is in.
           */
          if (exercise) payload.verseText = null;
        }
        if (rung.key === 'verse.locate') {
          const pool = await listUserVerseReferences(userId, item.scriptureReference);
          const { close, rest } = partitionByBook([item.scriptureReference], pool);
          // The reader's own marked span, where one fits; the verse's middle otherwise.
          const exercise = buildVerseLocate(
            item.scriptureReference,
            text,
            close.length ? close : pool,
            seed,
            readerSpanFragment(await loadReaderSpan(userId, item.scriptureReference), text),
            close.length ? rest : undefined,
          );
          payload.locate = exercise ? { phrase: exercise.phrase, options: exercise.options } : null;
          // The verse text itself would give the answer away on this rung.
          payload.verseText = null;
        }
      }
    }
  }

  /*
   * A chapter rung ships its exercise and never the chapter's text: on every rung here the text
   * is the key. The same payload fields the verse rungs use, so the dock renders these through
   * the branches it already has.
   */
  if (item.kind === 'chapter' && item.scriptureReference) {
    const seed = reviewSeed(item);
    const material = await loadChapterMaterial(userId, item.scriptureReference, item.translation ?? 'NET');
    const rung = chapterRungFor(item.ladderStep, seed, material);
    if (rung.key === 'chapter.verse') {
      const exercise = await buildChapterVerseFor(userId, material, seed);
      payload.choice = exercise ? { options: exercise.options, opening: true } : null;
    }
    if (rung.key === 'chapter.finish') {
      const spec = verseClozeSpec(rung.pass, item.recallState as RecallState);
      const exercise = buildChapterFinishFor(material, seed, rung.pass, item.recallState as RecallState);
      payload.cloze = exercise
        ? clozeSegments(exercise.cloze, { uniformWidths: spec.uniformWidths })
        : null;
    }
    if (rung.key === 'chapter.order') {
      const exercise = buildChapterOrderFor(material, seed);
      payload.sequence = exercise ? { phrases: exercise.phrases } : null;
    }
    if (rung.key === 'chapter.person') {
      const exercise = await buildChapterPersonFor(userId, material, seed);
      payload.choice = exercise ? { options: exercise.options, opening: false } : null;
    }
    if (rung.key === 'chapter.place') {
      const exercise = await buildChapterPlaceFor(userId, material, seed);
      payload.choice = exercise ? { options: exercise.options, opening: false } : null;
    }
    if (rung.key === 'chapter.marked') {
      const exercise = buildChapterMarkedFor(material, seed);
      // Openings, so the reader recognises the words rather than a verse number.
      payload.choice = exercise ? { options: exercise.options, opening: true } : null;
    }
  }

  /*
   * A note rung ships its options and its fragment, and nothing else. `answerIndex` stays here,
   * exactly as it does for the verse rungs — a multiple choice whose key is in the page is a
   * multiple choice with the answer written on the back.
   */
  if (item.kind === 'note') {
    const built = await buildNoteExercise(userId, item);
    payload.noteChoice = built
      ? {
          fragment: built.fragment,
          // `span` only where the reader marked one; `answerIndex` never.
          span: built.span,
          truncated: built.truncated ?? false,
          options: built.exercise.options,
        }
      : null;
  }

  const noteIds = [item.noteId, item.secondaryNoteId].filter((id): id is string => Boolean(id));
  if (noteIds.length > 0 && item.kind !== 'thread') {
    const rows = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        contentEncrypted: Notes.contentEncrypted,
      })
      .from(Notes)
      .where(and(eq(Notes.userId, userId), inArray(Notes.id, noteIds)));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const primary = item.noteId ? byId.get(item.noteId) : undefined;
    const secondary = item.secondaryNoteId ? byId.get(item.secondaryNoteId) : undefined;
    /*
     * A locked note's body is ciphertext the server cannot read, so there is nothing here worth
     * sending and every reason not to. `loadTitles` above has always guarded this; the reveal
     * did not, and shipped the encrypted bytes to whatever asked. The reader still gets the
     * item — its title and the question — and opening the note is where the key lives.
     */
    const revealBody = (row: { id: string; title: string | null; content: string; contentEncrypted: boolean }) => ({
      id: row.id,
      title: displayTitle(row.title),
      content: row.contentEncrypted ? '' : row.content,
    });
    payload.note = primary ? revealBody(primary) : null;
    payload.secondaryNote = secondary ? revealBody(secondary) : null;
  }

  if (item.kind === 'thread' && item.noteId) {
    const graph = await collectStudyThreadGraph(item.noteId, userId);
    const rows = await fetchStudyThreadNoteRows(graph.nodeIds, userId);
    payload.thread = {
      title: await threadTitleFor(userId, item.noteId),
      members: rows.map((r) => ({ id: r.id, title: displayTitle(r.title) })),
    };
  }

  /*
   * Where this came from, for the card that is shown once the answering is over.
   *
   * The result card said what was asked, what the reader answered and when it comes back, and
   * nothing at all about the thing in their Harvous the question was made from. A verse item
   * exists *because* they marked it while reading, or wrote something on it — and that is the
   * connection the whole feature is for. The reveal already carried the note's title and body
   * and the dock threw them away; this adds the one thing it never fetched.
   *
   * Only the source label and the annotation. The note itself is already on the payload, and
   * the framing line belongs to the item view, which the client holds.
   */
  payload.context = {
    sourceLabel: item.sourceLabel ?? null,
    sourceAt: item.sourceAt ? item.sourceAt.toISOString() : null,
    annotation: await loadItemAnnotation(userId, item),
  };

  return payload;
}

/**
 * The highlight or note the item was made from, in the reader's own words.
 *
 * `ReviewItems.studyThreadEntryId` has been on the row since highlights became reviewable and
 * nothing ever read it back: the reveal touched `StudyThreadEntries` nowhere, so a question
 * built from a passage someone marked and wrote a paragraph about revealed the parent note's
 * body and not one word of the marking itself.
 *
 * Both halves are optional and either may be missing: a highlight with no note attached is a
 * quote and nothing else, and a thought written on a passage with the span since detached is a
 * thought with no quote. The card renders whichever it is given.
 */
async function loadItemAnnotation(
  userId: string,
  item: ReviewItemRow,
): Promise<{ quote: string | null; thought: string | null } | null> {
  if (!item.studyThreadEntryId) return null;
  try {
    const [row] = await db
      .select({
        excerpt: StudyThreadEntries.scripturePassageExcerpt,
        miniNoteBody: StudyThreadEntries.miniNoteBody,
        notesBody: StudyThreadEntries.notesBody,
      })
      .from(StudyThreadEntries)
      .where(
        and(
          eq(StudyThreadEntries.id, item.studyThreadEntryId),
          // Scoped to the reader, because an id alone is not an authorisation.
          eq(StudyThreadEntries.userId, userId),
        ),
      );
    if (!row) return null;
    const quote = stripHtml(row.excerpt ?? '').trim() || null;
    const thought = stripHtml(row.miniNoteBody || row.notesBody || '').trim() || null;
    return quote || thought ? { quote, thought } : null;
  } catch {
    // A missing table or column costs the card one block, never the answer the reader is owed.
    return null;
  }
}

/**
 * A highlight was deleted: retire what was anchored to it.
 *
 * Archived rather than deleted, matching how a challenge is retired rather than removed. The
 * reader's answers to this item are in ReviewEvents and are worth keeping — the item is what
 * has no subject any more, not the history of having worked at it.
 *
 * Non-throwing on a missing table: this runs after a deletion that already committed.
 */
export async function retireReviewForStudyThreadEntry(
  userId: string,
  studyThreadEntryId: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(ReviewItems)
    .set({ status: 'archived', updatedAt: now })
    .where(
      and(
        eq(ReviewItems.userId, userId),
        eq(ReviewItems.studyThreadEntryId, studyThreadEntryId),
        inArray(ReviewItems.status, ['active', 'paused']),
      ),
    );
}


// ─── The sample: one marked question for an account without Review ───────────────

/**
 * See `src/utils/review-sample.ts` for what the sample is and is not. This is the I/O half:
 * which passages the reader has been around, and the text of the one chosen. Nothing is written.
 */
export async function buildReviewSample(
  userId: string,
  dayKey: string,
  translation = 'NET',
  kind: SampleExercise = DEFAULT_SAMPLE_EXERCISE,
): Promise<{
  reference: string;
  source: SampleSource;
  translation: string;
  exercise: ReviewSampleExercise;
  /** Which of the four this verse can carry, so the chips only offer what will build. */
  available: SampleExercise[];
} | null> {
  const seed = sampleSeed(userId, dayKey);
  const own = await listUserVerseReferences(userId, '');
  /*
   * Start at the day's pick, then walk the rest of their passages.
   *
   * Both halves matter. The walk is why a verse too short to hide anything in falls through to
   * another of theirs rather than straight to the well-known list. Starting at a seeded offset
   * is what makes it a different verse each morning — `pickSampleReference` has rotated by the
   * day for a while and says so in its docblock, but this caller never used it that way: it
   * mapped `own` in storage order and took the first that worked, so a free reader with any
   * passage at all met the same verse every day with only the blanks moving. That is a poor
   * argument for a feature whose whole claim is that it varies what it asks.
   */
  const start = own.length ? seededIndex(seed, own.length) : 0;
  const ordered = own.length ? [...own.slice(start), ...own.slice(0, start)] : [];
  const candidates: ReviewSampleSpec[] = ordered.map((reference) => ({ reference, source: 'yours' }));
  candidates.push(pickSampleReference({ ownReferences: [], seed }));
  for (const candidate of candidates) {
    const material = await loadSampleMaterial(candidate.reference, translation);
    if (!material) continue;
    const available = availableSampleExercises(material, seed);
    if (!available.length) continue;
    /*
     * A verse that cannot carry the chosen exercise falls back to one it can, rather than to no
     * question at all. The response says which are available, so the chips can grey out the rest
     * and the card can show what it actually got.
     */
    const chosen = available.includes(kind) ? kind : available[0];
    const exercise = buildSampleExercise(material, seed, chosen);
    if (!exercise) continue;
    return {
      reference: candidate.reference,
      source: candidate.source,
      translation,
      exercise,
      available,
    };
  }
  return null;
}

/**
 * The verse the sample asks about, plus what "what follows" needs.
 *
 * The translation was ignored here until now: the card has shown a picker since it shipped and
 * sent the chosen translation on both requests, and both ends hard-coded NET — so the verse on
 * screen was NET whatever the label beside it said.
 */
async function loadSampleMaterial(
  reference: string,
  translation: string,
): Promise<(SampleMaterial & { html: string }) | null> {
  const html = await fetchVerseText(reference, translation);
  if (!html) return null;
  const next = nextVerseAddress(reference);
  const [nextHtml, neighbourHtml] = await Promise.all([
    next ? fetchVerseText(formatVerseAddress(next), translation) : Promise.resolve(''),
    Promise.all(
      neighbourVerseAddresses(reference, SAMPLE_NEXT_NEIGHBOURS).map((address) =>
        fetchVerseText(formatVerseAddress(address), translation),
      ),
    ),
  ]);
  return {
    html,
    text: stripHtml(html),
    nextText: nextHtml ? stripHtml(nextHtml) : null,
    neighbourTexts: neighbourHtml.filter(Boolean).map((entry) => stripHtml(entry)),
  };
}

/** Enough that "what follows" has three wrong answers from the same chapter. */
const SAMPLE_NEXT_NEIGHBOURS = 5;

/** Mark the sample against the same question the page was shown; the verse comes back with it. */
export async function gradeReviewSample(
  userId: string,
  dayKey: string,
  answer: SampleAnswer,
  translation = 'NET',
  kind: SampleExercise = DEFAULT_SAMPLE_EXERCISE,
): Promise<{ correct: boolean; reference: string; verseText: string } | null> {
  const sample = await buildReviewSample(userId, dayKey, translation, kind);
  if (!sample) return null;
  const material = await loadSampleMaterial(sample.reference, translation);
  if (!material) return null;
  return {
    // `sample.exercise.kind` rather than `kind`: a verse that could not carry the chosen
    // exercise was shown a different one, and the answer must be marked against what was asked.
    correct: gradeSampleAnswer(material, sampleSeed(userId, dayKey), sample.exercise.kind, answer),
    reference: sample.reference,
    /*
     * "What follows" is the one exercise whose truth is not this verse: the reader was asked
     * which verse comes after it, so showing this one back would answer a different question.
     */
    verseText: sample.exercise.kind === 'next' ? await nextVerseHtml(sample.reference, translation) : material.html,
  };
}

async function nextVerseHtml(reference: string, translation: string): Promise<string> {
  const next = nextVerseAddress(reference);
  if (!next) return '';
  return (await fetchVerseText(formatVerseAddress(next), translation)) || '';
}
