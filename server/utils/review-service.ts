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
  db,
  and,
  desc,
  eq,
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
  ReviewEvents,
  ReviewItems,
  StudyThreadEntries,
  UserNodeStates,
  sql,
  first,
  ScriptureTopics,
  BiblePeople,
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
  deferReview,
  firstDueAt,
  nextReviewAfter,
} from '@/utils/review-scheduling';
import {
  fillReviewPrompt,
  nextLadderStep,
  reviewPromptFor,
  reviewTaskFor,
  type ReviewPromptKey,
  verseRungFor,
  type VerseMaterial,
} from '@/utils/review-prompts';
import {
  buildVerseLocate,
  buildVerseNext,
  gradeVerseNext,
  type VerseNextExercise,
  buildVerseSequence,
  gradeVerseLocate,
  gradeVerseSequence,
} from '@/utils/verse-ladder-exercises';
import {
  buildVerseAltered,
  gradeVerseAltered,
  type VerseAlteredExercise,
} from '@/utils/verse-altered';
import { clozeSegments, gradeVerseRebuild, hashSeed, verseClozeRatio, buildVerseCloze, verseCue, type VerseCloze } from '@/utils/verse-cloze';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { collectStudyThreadGraph } from './study-thread-graph';
import { fetchStudyThreadNoteRows } from './study-thread-note-rows';
import { pickRepNoteIdForCluster } from './study-thread-cluster-count';
import { formatVerseAddress, lastVerseOf, neighbourVerseAddresses, nextVerseAddress } from '@/utils/verse-adjacency';
import {
  CROSSREF_MIN_VOTES,
  VERSE_THEME_MIN_RELEVANCE,
  buildVerseCrossref,
  buildVersePerson,
  buildVerseTheme,
} from '@/utils/verse-knowledge-exercises';
import { getKnowledgeForReference } from './scripture-knowledge';
import { curatedTopicLabelForDisplay } from '@/utils/prototype-home-trends';
import { gradeChoiceExercise } from '@/utils/choice-exercise';
import { reviewFraming, type ReviewFramingSpec } from '@/utils/review-framing';
import { rungIdentityIsTheAnswer } from '@/utils/review-row-subtitle';
import { nodeKey as studyNodeKey } from '@/utils/study-bible-nodes';
import { fetchVerseText } from './fetch-verse-text';
import { recordNoteRecallEngaged } from './note-recall-state';
import { countableUserNotesWhere } from './purge-onboarding-content';
import {
  noteTouch,
  touchNodes,
  verseTouches,
  type NodeTouch,
} from './study-bible-layer';
import { nodeKey, verseNodesForReference, verseReferenceLabel } from '@/utils/study-bible-nodes';
import {
  buildNoteChoice,
  labelNamesWhat,
  buildNoteRecognize,
  gradeNoteChoice,
  noteFragment,
  resolveNoteRung,
  type NoteMaterial,
  buildNoteSpan,
  buildNoteAnnotation,
  type NoteSpan,
} from '@/utils/note-ladder-exercises';
import type { ChoiceExercise } from '@/utils/choice-exercise';
import { getNotePassages } from './scripture-knowledge';
import { REVIEWED_SOURCE } from '@/utils/study-bible-source-copy';

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
): Promise<{ distinguishing: string[]; byId: Map<string, string> }> {
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
  const seen = new Set<string>();
  for (const row of rows) {
    const { label, distinguishing: names } = noteOptionLabel({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt,
      passage: resolved.get(row.id)?.passage ?? null,
    });
    byId.set(row.id, label);
    if (!names) continue;
    const key = label.toLowerCase();
    // Two rows reading the same is one option, not two.
    if (seen.has(key)) continue;
    seen.add(key);
    distinguishing.push(label);
  }
  return { distinguishing, byId };
}

/**
 * The words a reader typed on a highlight.
 *
 * `miniNoteBody` first — the note written on the highlight itself — then `notesBody`. Both the
 * probe and the builder read through here so they cannot disagree about which field is the one.
 */
function annotationTextOf(row: { miniNoteBody?: string | null; notesBody?: string | null }): string {
  return (row.miniNoteBody?.trim() || row.notesBody?.trim() || '').replace(/\s+/g, ' ');
}

async function loadNoteMaterial(
  userId: string,
  noteIds: readonly string[],
): Promise<Map<string, NoteMaterial>> {
  const unique = [...new Set(noteIds.filter(Boolean))];
  const out = new Map<string, NoteMaterial>();
  if (!unique.length) return out;

  const [bodies, viaPill, ownPassage, links, quotes, annotated, pool, labels] = await Promise.all([
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
    // quote that is no longer anywhere in the note.
    db
      .select({ parentNoteId: StudyThreadEntries.parentNoteId })
      .from(StudyThreadEntries)
      .where(
        and(
          eq(StudyThreadEntries.userId, userId),
          inArray(StudyThreadEntries.parentNoteId, unique),
          eq(StudyThreadEntries.anchorStatus, 'resolved'),
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
  const withQuote = new Set(
    quotes.map((row) => row.parentNoteId).filter((id): id is string => Boolean(id)),
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
  const nodeKeys = rows
    .map((row) => {
      if (row.kind === 'note' && row.noteId) return studyNodeKey.note(row.noteId);
      if (row.kind === 'verse' && row.scriptureReference) {
        const at = lastVerseOf(row.scriptureReference);
        return at ? studyNodeKey.verse(at) : null;
      }
      return null;
    })
    .filter((key): key is string => Boolean(key));
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
          })
          .from(UserNodeStates)
          .where(and(eq(UserNodeStates.userId, userId), inArray(UserNodeStates.nodeKey, nodeKeys)))
      : Promise.resolve([]),
    references.length
      ? db
          .select({ reference: StudyThreadEntries.scriptureReference })
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

    // The recognize rung shows a fragment of the verse, so it needs the text. Every other
    // prompt is built from titles and references alone.
    let cue: string | null = null;
    if (kind === 'verse' && row.ladderStep === 0 && row.scriptureReference) {
      const text = await fetchVerseText(row.scriptureReference, row.translation ?? 'NET');
      cue = text ? verseCue(stripHtml(text)) : null;
    }

    /*
     * A note is asked the rung it can answer, not the rung it has climbed to. The stored step
     * is nominal; a note with no links skips past "what did you link this to?" rather than
     * showing a question with no possible answer.
     */
    const noteRung =
      kind === 'note' && row.noteId
        ? resolveNoteRung(row.ladderStep, material.get(row.noteId) ?? EMPTY_NOTE_MATERIAL)
        : null;

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
    const { key, prompt } = reviewPromptFor(
      {
        kind,
        reviewCount: row.reviewCount,
        ladderStep: row.ladderStep,
        id: row.id,
        material: verseMaterial,
      },
      {
        reference: row.scriptureReference,
        noteTitle,
        secondaryNoteTitle,
        threadTitle,
        cue,
      },
    );

    const resolvedKey = noteRung ?? key;
    const framingNodeKey =
      kind === 'note' && row.noteId
        ? studyNodeKey.note(row.noteId)
        : kind === 'verse' && row.scriptureReference
          ? (() => {
              const at = lastVerseOf(row.scriptureReference);
              return at ? studyNodeKey.verse(at) : null;
            })()
          : null;
    const node = framingNodeKey ? nodeByKey.get(framingNodeKey) : undefined;
    const framing = reviewFraming(
      {
        kind: kind === 'note' ? 'note' : 'verse',
        rungKey: resolvedKey,
        identityIsAnswer: rungIdentityIsTheAnswer({ kind, ladderStep: row.ladderStep, promptKey: resolvedKey }),
        pass: kind === 'verse' ? verseRungFor(row.ladderStep, `${row.id}:${row.ladderStep}`, verseMaterial).pass : 0,
        recallState: row.recallState as RecallState,
        revisitCount: node?.revisitCount ?? 0,
        citedInNotes: verseMaterial?.citedInNotes ?? 0,
        firstStudiedAt: node?.firstStudiedAt?.toISOString() ?? null,
        topTheme: verseMaterial?.themes[0] ?? null,
        person: verseMaterial?.people[0] ?? null,
        crossRefCount: verseMaterial?.crossRefTotal ?? 0,
        readerMarked: Boolean(row.scriptureReference && markedReferences.has(row.scriptureReference.trim().toLowerCase())),
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
    });
  }
  return views;
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
    return { error: 'Review asks about notes and passages; Threads and links are on Home now' };
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
        dueAt: firstDueAt(now, input.origin ?? 'user'),
        successStreak: 0,
        reviewCount: 0,
        ladderStep: 0,
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
  extra: { attempt?: string | null; previousIntervalDays?: number; nextIntervalDays?: number } = {},
  now: Date = new Date(),
): Promise<void> {
  await db.insert(ReviewEvents).values({
    id: generateTimestampId('revev'),
    userId,
    reviewItemId: item.id,
    noteId: item.noteId,
    action,
    attempt: extra.attempt?.trim() || null,
    previousIntervalDays: extra.previousIntervalDays ?? null,
    nextIntervalDays: extra.nextIntervalDays ?? null,
    createdAt: now,
  });
}

export interface ReviewOutcomeResult {
  item: ReviewItemRow;
  nextReturnDays: number;
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
): Promise<ReviewOutcomeResult> {
  const next = nextReviewAfter(
    outcome,
    {
      intervalDays: item.intervalDays,
      successStreak: item.successStreak,
      reviewCount: item.reviewCount,
      lastOutcome: (item.lastOutcome as ReviewOutcome | null) ?? null,
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
        updatedAt: now,
      })
      .where(and(eq(ReviewItems.id, item.id), eq(ReviewItems.userId, userId)))
      .returning(),
  ) as ReviewItemRow;

  await recordReviewEvent(userId, item, outcome, {
    attempt,
    previousIntervalDays: item.intervalDays,
    nextIntervalDays: next.intervalDays,
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

  return { item: updated, nextReturnDays: next.intervalDays };
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

  if (item.scriptureReference) {
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
async function listUserVerseReferences(userId: string, exclude: string): Promise<string[]> {
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
  /** Cross-reference targets above the vote floor whose text could be fetched. */
  crossRefs: { reference: string; text: string }[];
  /** How many targets clear the vote floor at all, for the framing line. Capped by the query. */
  crossRefTotal: number;
  /** Distinguishing labels of the reader's notes that cite this verse. */
  citingNoteLabels: string[];
}

const EMPTY_VERSE_MATERIAL: VerseKnowledgeMaterial = {
  reference: '',
  citedInNotes: 0,
  themeCount: 0,
  personCount: 0,
  crossRefCount: 0,
  themes: [],
  allThemeLabels: [],
  people: [],
  crossRefs: [],
  crossRefTotal: 0,
  citingNoteLabels: [],
};

const CROSSREF_TEXT_FETCHES = 3;

async function loadVerseMaterial(
  userId: string,
  reference: string | null,
  translation: string,
): Promise<VerseKnowledgeMaterial> {
  const ref = reference?.trim();
  if (!ref) return EMPTY_VERSE_MATERIAL;
  const at = lastVerseOf(ref);
  if (!at) return { ...EMPTY_VERSE_MATERIAL, reference: ref };

  const [knowledge, citing] = await Promise.all([
    getKnowledgeForReference(at.book, at.chapter, at.verse, {
      minRelevance: 0,
      minVotes: CROSSREF_MIN_VOTES,
      // Wide enough that "cross-referenced N times" is a count and not a cap.
      crossRefLimit: 40,
      themeLimit: 16,
    }).catch(() => null),
    loadNotesCitingVerse(userId, at),
  ]);

  const themesAbove = (knowledge?.themes ?? []).filter(
    (t) => t.relevance >= VERSE_THEME_MIN_RELEVANCE,
  );
  const label = (t: { label: string }) => curatedTopicLabelForDisplay(t.label);

  // Single-verse targets first: a whole-chapter cross-reference has no one opening to show.
  const targets = (knowledge?.crossReferences ?? [])
    .filter((c) => c.chapterStart === c.chapterEnd)
    .slice(0, CROSSREF_TEXT_FETCHES);
  const crossRefs: { reference: string; text: string }[] = [];
  for (const c of targets) {
    const targetRef = `${c.book} ${c.chapterStart}:${c.verseStart}`;
    const html = await fetchVerseText(targetRef, translation);
    if (html) crossRefs.push({ reference: targetRef, text: stripHtml(html) });
  }

  return {
    reference: ref,
    citedInNotes: citing.length,
    themeCount: themesAbove.length,
    personCount: knowledge?.people.length ?? 0,
    crossRefCount: crossRefs.length,
    themes: themesAbove.map(label),
    allThemeLabels: (knowledge?.themes ?? []).map(label),
    people: (knowledge?.people ?? []).map((p) => p.name),
    crossRefs,
    crossRefTotal: knowledge?.crossReferences.length ?? 0,
    citingNoteLabels: citing,
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
      return k ? { ref, themes: k.themes.map((t) => curatedTopicLabelForDisplay(t.label)), people: k.people.map((p) => p.name) } : null;
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

  if (rungKey === 'verse.crossref') {
    if (!material.crossRefs.length) return null;
    const answer = material.crossRefs[hashSeed(seed) % material.crossRefs.length];
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

const VERSE_CONTEXT_KEYS = new Set<ReviewPromptKey>([
  'verse.connect',
  'verse.theme',
  'verse.person',
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
    seed: `${item.id}:${item.ladderStep}`,
  });
}

/** A wide net, because most candidate words are barred by one list or another. */
const VERSE_ALTERED_NEIGHBOURS = 8;

export async function verseTruthFor(item: ReviewItemRow, userId?: string): Promise<string | null> {
  if (item.kind !== 'verse' || !item.scriptureReference) return null;
  const material = userId
    ? await loadVerseMaterial(userId, item.scriptureReference, item.translation ?? 'NET')
    : undefined;
  const rung = verseRungFor(item.ladderStep, `${item.id}:${item.ladderStep}`, material);
  // `verse.altered` most of all: leaving someone with a falsified line and no correction is the
  // one ending this rung must never have.
  if (
    rung.key !== 'verse.sequence' &&
    rung.key !== 'verse.locate' &&
    rung.key !== 'verse.altered' &&
    rung.key !== 'verse.rebuild'
  )
    return null;
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
    seed: `${item.id}:${item.ladderStep}`,
  });
}

/** Five asked for, three needed — see `buildVerseNextFor`. */
const VERSE_NEXT_NEIGHBOURS = 5;

export async function gradeVerseAnswer(
  userId: string,
  item: ReviewItemRow,
  answer: { order?: number[]; option?: string; wordIndex?: number; words?: string[] },
): Promise<GradedAnswer | null> {
  if (item.kind !== 'verse' || !item.scriptureReference) return null;
  const seedForRung = `${item.id}:${item.ladderStep}`;
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

  const isSequence = rung.key === 'verse.sequence' && Array.isArray(answer.order);
  const isLocate = rung.key === 'verse.locate' && typeof answer.option === 'string';
  const isNext = rung.key === 'verse.next' && typeof answer.option === 'string';
  const isAltered = rung.key === 'verse.altered' && Number.isInteger(answer.wordIndex);
  const isRebuild = rung.key === 'verse.rebuild' && Array.isArray(answer.words);
  if (!isSequence && !isLocate && !isNext && !isAltered && !isRebuild) return null;

  if (isRebuild) {
    const html = await fetchVerseText(item.scriptureReference, item.translation ?? 'NET');
    if (!html) return null;
    const cloze = buildVerseCloze(
      stripHtml(html),
      `${item.id}:${item.ladderStep}`,
      verseClozeRatio(rung.pass),
    );
    return { correct: gradeVerseRebuild(cloze, answer.words!), correctAnswer: null };
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
  const seed = `${item.id}:${item.ladderStep}`;

  if (isSequence) {
    const exercise = buildVerseSequence(text, seed);
    if (!exercise) return null;
    return { correct: gradeVerseSequence(exercise, answer.order!), correctAnswer: null };
  }

  const pool = await listUserVerseReferences(userId, item.scriptureReference);
  const exercise = buildVerseLocate(item.scriptureReference, text, pool, seed);
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
): Promise<{ own: string; ownDistinguishing: boolean; others: string[] }> {
  const [pool, subject] = await Promise.all([
    loadNoteLabelPool(userId),
    loadNoteSubjectLabels(userId, [noteId]),
  ]);
  const ownLabel = subject.get(noteId) ?? { label: 'A note', distinguishing: false };
  const own = ownLabel.label.toLowerCase();
  return {
    own: ownLabel.label,
    ownDistinguishing: ownLabel.distinguishing,
    // A distractor reading the same as the answer makes the question unanswerable, not just dull.
    others: pool.distinguishing.filter((label) => label.toLowerCase() !== own),
  };
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
  acceptable: string[];
} | null> {
  if (item.kind !== 'note' || !item.noteId) return null;

  const material = (await loadNoteMaterial(userId, [item.noteId])).get(item.noteId);
  if (!material) return null;
  const rung = resolveNoteRung(item.ladderStep, material);
  if (!rung) return null;

  const seed = `${item.id}:${item.ladderStep}`;
  const labels = await loadNoteOptionLabels(userId, item.noteId);

  if (rung === 'note.recognize') {
    const [note] = await db
      .select({ content: Notes.content, contentEncrypted: Notes.contentEncrypted })
      .from(Notes)
      .where(and(eq(Notes.id, item.noteId), eq(Notes.userId, userId)))
      .limit(1);
    if (!note || note.contentEncrypted) return null;

    /*
     * A span the reader marked beats a fragment the app chose, and it comes with the words
     * either side: a quote that starts mid-clause is a puzzle about grammar before it is one
     * about study.
     *
     * Ordered and picked by seed. This was `limit(1)` with no `orderBy`, so a note with several
     * highlights could hand the reveal one row and the grader another — the same seed, a
     * different question.
     */
    const quoted = await db
      .select({
        quote: StudyThreadEntries.anchorQuote,
        prefix: StudyThreadEntries.anchorPrefixContext,
        suffix: StudyThreadEntries.anchorSuffixContext,
      })
      .from(StudyThreadEntries)
      .where(
        and(
          eq(StudyThreadEntries.userId, userId),
          eq(StudyThreadEntries.parentNoteId, item.noteId),
          eq(StudyThreadEntries.anchorStatus, 'resolved'),
          isNotNull(StudyThreadEntries.anchorQuote),
        ),
      )
      .orderBy(StudyThreadEntries.createdAt, StudyThreadEntries.id);

    const marked = quoted.length ? quoted[hashSeed(seed) % quoted.length] : null;
    const span = marked?.quote
      ? buildNoteSpan({ quote: marked.quote, prefix: marked.prefix, suffix: marked.suffix })
      : null;

    const fragment = span?.quote || noteFragment(stripHtml(note.content ?? ''), seed);
    if (!fragment) return null;

    // An answer nobody could name is not an answer. Falls through to the passage rung.
    if (!labels.ownDistinguishing) return null;

    const exercise = buildNoteRecognize({
      fragment,
      span,
      answerLabel: labels.own,
      poolLabels: labels.others,
      seed,
    });
    return exercise
      ? { rung, exercise, fragment: exercise.fragment, span: span ?? null, acceptable: [labels.own] }
      : null;
  }

  if (rung === 'note.passage') {
    const passages = await getNotePassages(item.noteId);
    const acceptable = passages.map((p) => verseReferenceLabel(p));
    if (!acceptable.length) return null;
    // Generous pool: every acceptable answer is also barred as a distractor.
    const pool = await listUserVerseReferences(userId, '');
    const exercise = buildNoteChoice({ acceptable, poolLabels: pool, seed });
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
    const exercise = buildNoteAnnotation({
      annotation: annotationTextOf(chosen),
      reference,
      poolReferences: await listUserVerseReferences(userId, reference),
      seed,
    });
    return exercise
      ? { rung, exercise, fragment: exercise.fragment, span: null, acceptable: [reference] }
      : null;
  }

  const neighbours: string[] = await loadConnectedNoteLabels(userId, item.noteId);
  if (!neighbours.length) return null;
  const exercise = buildNoteChoice({
    acceptable: neighbours,
    poolLabels: labels.others.filter((label) => !neighbours.includes(label)),
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
        const seed = `${item.id}:${item.ladderStep}`;
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
        if (rung.key === 'verse.rebuild') {
          // A later pass hides more, and the seed carries the step, so it hides a different set.
          const cloze = buildVerseCloze(text, seed, verseClozeRatio(rung.pass));
          // The pieces either side of each gap, so the page can put an input where the gap is
          // rather than a picture of one. `display` is never sent: it is unfillable.
          payload.cloze = cloze.blanks.length > 0 ? clozeSegments(cloze) : null;
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
        if (rung.key === 'verse.locate') {
          const pool = await listUserVerseReferences(userId, item.scriptureReference);
          const exercise = buildVerseLocate(item.scriptureReference, text, pool, seed);
          payload.locate = exercise ? { phrase: exercise.phrase, options: exercise.options } : null;
          // The verse text itself would give the answer away on this rung.
          payload.verseText = null;
        }
      }
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

  return payload;
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
