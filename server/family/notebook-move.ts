/**
 * Moving a child notebook into the young person's own Harvous account (they've turned 13).
 *
 * The parent makes a single-use link; the teen opens it signed in to their own account and
 * claims it. One transaction then moves the notebook in and deletes the child record, so it is
 * all or nothing: a failure leaves the notebook exactly as it was, still parent-managed.
 *
 * What moves, keeping ids so every link between them survives:
 * - notes, into the teen's My Home, numbered after their own, converted from the child app's
 *   plain text to the adult editor's paragraphs, with their verses written out at the end;
 * - folders (a note's `primaryCollection` label), tags and Threads, merged by name into any the
 *   teen already has;
 * - Scripture metadata (keyed by note id, so it moves with the note);
 * - Look back history into Review, keeping each item's schedule. Where the teen already reviews
 *   the same thing, the history joins their item instead of making a second one;
 * - My Bible highlights, as reader highlights (`StudyThreadEntries`, the same rows the adult
 *   reader writes), unless the teen already highlighted that verse;
 * - the child's own Family Bible thoughts, as one note per chapter in a "Family Bible" folder.
 *   Those rows are the child's and would otherwise be deleted with the notebook.
 *
 * What doesn't: stickers, the cover and notebook settings (kids-only, in the parent's download),
 * links to family readings, and the parent's own Family Bible thoughts (the parent's words).
 */
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db/client';
import {
  ChildNoteResources, FamilyChildBibleReadings, FamilyChildBibleThoughts, FamilyChildren, FamilyChildTransfers,
  FamilyChildVerseHighlights, FamilyInvites, FamilyVerifications, Notes, NoteTags, NoteThreads, ReviewEvents, ReviewItems,
  ScriptureMetadata, Spaces, StudyThreadEntries, Tags, Threads, UserMetadata, UserNodeStates,
} from '../db/schema';
import { generateStudyThreadEntryId } from '@/utils/ids';
import { normalizeScriptureReference } from '@/utils/scripture-detector';
import { CHILD_ACCOUNT_ID_PREFIX } from './identity';
import { readChapter } from './bible';
import { isPgUndefinedRelation } from '../utils/pg-undefined-relation';
import type { Child, FamilyTx } from './service';

export const NOTEBOOK_MOVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const notebookMoveSecret = () => `hvmove_${randomBytes(32).toString('base64url')}`;
const hashSecret = (value: string) => createHash('sha256').update(value).digest('hex');

export type NotebookMoveSummary = {
  notes: number; tags: number; threads: number; highlights: number; familyBibleNotes: number; reviewItems: number;
};

/** A new link for this notebook. Any earlier open link stops working. */
export async function createNotebookMove(tx: FamilyTx, child: Child, familyInviteId: string | null) {
  if (child.status !== 'active') throw new HTTPException(409, { message: 'Only an active notebook can be moved.' });
  if (familyInviteId) {
    const [invite] = await tx.select({ id: FamilyInvites.id }).from(FamilyInvites).where(and(
      eq(FamilyInvites.id, familyInviteId), eq(FamilyInvites.createdBy, child.parentUserId), eq(FamilyInvites.role, 'child'),
      isNull(FamilyInvites.redeemedAt), isNull(FamilyInvites.revokedAt), gt(FamilyInvites.expiresAt, new Date())));
    if (!invite) throw new HTTPException(400, { message: 'That family invite isn’t open.' });
  }
  await revokeNotebookMoves(tx, child.id);
  const token = notebookMoveSecret();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + NOTEBOOK_MOVE_TTL_MS);
  await tx.insert(FamilyChildTransfers).values({ id: `move_${crypto.randomUUID()}`, childId: child.id,
    parentUserId: child.parentUserId, tokenHash: hashSecret(token), familyInviteId, status: 'open', createdAt: now, expiresAt });
  return { token, expiresAt };
}

export async function revokeNotebookMoves(tx: Pick<FamilyTx, 'update'>, childId: string) {
  await tx.update(FamilyChildTransfers).set({ status: 'revoked' })
    .where(and(eq(FamilyChildTransfers.childId, childId), eq(FamilyChildTransfers.status, 'open')));
}

/** The open link, if any, for the parent's notebook page. Read in its own savepoint: before the
 *  schema script adds the table, a missing relation would otherwise abort the page's transaction. */
export async function openNotebookMove(tx: FamilyTx, childId: string) {
  try {
    return await tx.transaction(async (inner) => {
      const [move] = await inner.select({ expiresAt: FamilyChildTransfers.expiresAt, familyInviteId: FamilyChildTransfers.familyInviteId })
        .from(FamilyChildTransfers).where(and(eq(FamilyChildTransfers.childId, childId), eq(FamilyChildTransfers.status, 'open'),
          gt(FamilyChildTransfers.expiresAt, new Date())));
      return move ?? null;
    });
  } catch (error) {
    if (isPgUndefinedRelation(error, 'FamilyChildTransfers')) return null;
    throw error;
  }
}

type Claimer = { userId: string };

function refuseClaimer(claimer: Claimer, parentUserId: string) {
  if (claimer.userId.startsWith(CHILD_ACCOUNT_ID_PREFIX)) throw new HTTPException(403, { message: 'Sign in to your own Harvous account to claim this notebook.' });
  if (claimer.userId === parentUserId) {
    throw new HTTPException(403, { message: 'This link is for your child’s own account. Sign out, then open it signed in as them.' });
  }
}

async function liveMove(tx: FamilyTx, token: string, lock: boolean) {
  const query = tx.select().from(FamilyChildTransfers).where(eq(FamilyChildTransfers.tokenHash, hashSecret(token)));
  const [move] = lock ? await query.for('update') : await query;
  if (!move) throw new HTTPException(404, { message: 'This link isn’t working. Ask your parent for a new one.' });
  if (move.status === 'completed') throw new HTTPException(410, { message: 'This notebook has already been moved.' });
  if (move.status !== 'open' || move.expiresAt <= new Date()) {
    throw new HTTPException(410, { message: 'This link has expired. Ask your parent for a new one.' });
  }
  return move;
}

/** What the teen sees before agreeing: the notebook's name and how much is in it. Signed in only. */
export async function previewNotebookMove(token: string, claimer: Claimer) {
  return db.transaction(async (tx) => {
    const move = await liveMove(tx, token, false);
    refuseClaimer(claimer, move.parentUserId);
    const [child] = await tx.select().from(FamilyChildren).where(eq(FamilyChildren.id, move.childId));
    if (!child || child.status !== 'active') throw new HTTPException(410, { message: 'This notebook can’t be moved right now. Ask your parent.' });
    const [notes] = await tx.select({ count: sql<number>`count(*)::int`, first: sql<Date | null>`min(${Notes.createdAt})`,
      last: sql<Date | null>`max(${Notes.createdAt})` }).from(Notes).where(eq(Notes.userId, child.id));
    const [highlights] = await tx.select({ count: sql<number>`count(*)::int` }).from(FamilyChildVerseHighlights)
      .where(eq(FamilyChildVerseHighlights.childId, child.id));
    const [parent] = await tx.select({ firstName: UserMetadata.firstName }).from(UserMetadata)
      .where(eq(UserMetadata.userId, move.parentUserId));
    // What the page draws: their own cover, and who sent it. Never note content.
    return { displayName: child.displayName, preferences: child.notebookPreferences, parentFirstName: parent?.firstName?.trim() || null,
      notes: notes.count, highlights: highlights.count, keptFrom: notes.first, keptTo: notes.last, expiresAt: move.expiresAt };
  });
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** The child app stores plain text; the adult editor stores paragraphs. Blank lines stay blank. */
export function childTextToHtml(text: string, extras: string[] = []) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const body = lines.map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<p></p>'));
  while (body.length && body[body.length - 1] === '<p></p>') body.pop();
  return [...body, ...extras.map((line) => `<p>${escapeHtml(line)}</p>`)].join('');
}

/** The whole move is one transaction, so a failure part-way leaves nothing half-moved. */
export async function claimNotebookMove(token: string, claimer: Claimer, teenHomeSpaceId: string) {
  return db.transaction(async (tx) => {
    const move = await liveMove(tx, token, true);
    refuseClaimer(claimer, move.parentUserId);
    // The teen's own writes during the move would race the numbering below.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${claimer.userId}))`);
    const [child] = await tx.select().from(FamilyChildren).where(eq(FamilyChildren.id, move.childId)).for('update');
    if (!child || child.status !== 'active' || child.parentUserId !== move.parentUserId) {
      throw new HTTPException(410, { message: 'This notebook can’t be moved right now. Ask your parent.' });
    }
    const [home] = await tx.select({ id: Spaces.id }).from(Spaces)
      .where(and(eq(Spaces.id, teenHomeSpaceId), eq(Spaces.userId, claimer.userId)));
    if (!home) throw new HTTPException(409, { message: 'Your account isn’t ready yet. Try again in a moment.' });
    const summary = await moveNotebookRows(tx, child, claimer.userId, teenHomeSpaceId);
    await deleteMovedChild(tx, child);
    await tx.update(FamilyChildTransfers).set({ status: 'completed', completedAt: new Date(), newUserId: claimer.userId, summary })
      .where(eq(FamilyChildTransfers.id, move.id));
    let familyInviteToken: string | null = null;
    if (move.familyInviteId) {
      const [invite] = await tx.select({ token: FamilyInvites.token }).from(FamilyInvites).where(and(
        eq(FamilyInvites.id, move.familyInviteId), isNull(FamilyInvites.redeemedAt), isNull(FamilyInvites.revokedAt),
        gt(FamilyInvites.expiresAt, new Date())));
      familyInviteToken = invite?.token ?? null;
    }
    return { summary, familyInviteToken };
  });
}

async function nextNoteNumber(tx: FamilyTx, userId: string) {
  const [fromNotes] = await tx.select({ max: sql<number>`coalesce(max(${Notes.simpleNoteId}), 0)::int` }).from(Notes)
    .where(eq(Notes.userId, userId));
  const [meta] = await tx.select({ highest: UserMetadata.highestSimpleNoteId }).from(UserMetadata).where(eq(UserMetadata.userId, userId));
  return Math.max(fromNotes.max, meta?.highest ?? 0) + 1;
}

export async function moveNotebookRows(tx: FamilyTx, child: Child, teenId: string, teenHome: string): Promise<NotebookMoveSummary> {
  const now = new Date();
  const notes = await tx.select({ id: Notes.id, content: Notes.content, threadId: Notes.threadId }).from(Notes)
    .where(eq(Notes.userId, child.id)).orderBy(asc(Notes.createdAt), asc(Notes.id));
  const noteIds = notes.map((note) => note.id);
  let number = await nextNoteNumber(tx, teenId);

  // Folders, tags and Threads first, so a note's links point at the teen's rows.
  const childTags = await tx.select({ id: Tags.id, name: Tags.name }).from(Tags).where(eq(Tags.userId, child.id));
  const teenTags = await tx.select({ id: Tags.id, name: Tags.name }).from(Tags).where(eq(Tags.userId, teenId));
  for (const tag of childTags) {
    const same = teenTags.find((t) => t.name.trim().toLowerCase() === tag.name.trim().toLowerCase());
    if (same) {
      await tx.update(NoteTags).set({ tagId: same.id }).where(eq(NoteTags.tagId, tag.id));
      await tx.delete(Tags).where(eq(Tags.id, tag.id));
    } else {
      await tx.update(Tags).set({ userId: teenId, updatedAt: now }).where(eq(Tags.id, tag.id));
    }
  }
  const childThreads = await tx.select({ id: Threads.id, title: Threads.title }).from(Threads).where(eq(Threads.userId, child.id));
  const teenThreads = await tx.select({ id: Threads.id, title: Threads.title }).from(Threads).where(eq(Threads.userId, teenId));
  const threadMap = new Map<string, string>();
  for (const thread of childThreads) {
    const same = teenThreads.find((t) => t.title.trim().toLowerCase() === thread.title.trim().toLowerCase());
    if (same) {
      await tx.update(NoteThreads).set({ threadId: same.id }).where(eq(NoteThreads.threadId, thread.id));
      await tx.delete(Threads).where(eq(Threads.id, thread.id));
      threadMap.set(thread.id, same.id);
    } else {
      await tx.update(Threads).set({ userId: teenId, spaceId: teenHome, updatedAt: now }).where(eq(Threads.id, thread.id));
    }
  }

  // Verses and family readings a note pointed at, written out so nothing silently disappears.
  const scripture = noteIds.length ? await tx.select({ noteId: ScriptureMetadata.noteId, reference: ScriptureMetadata.reference,
    translation: ScriptureMetadata.translation }).from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, noteIds)) : [];
  const resources = noteIds.length ? await tx.select({ noteId: ChildNoteResources.noteId, title: Notes.title })
    .from(ChildNoteResources).innerJoin(Notes, eq(Notes.id, ChildNoteResources.resourceNoteId))
    .where(inArray(ChildNoteResources.noteId, noteIds)) : [];
  for (const note of notes) {
    const verses = scripture.filter((s) => s.noteId === note.id).map((s) => (s.translation ? `${s.reference} (${s.translation})` : s.reference));
    const readings = resources.filter((r) => r.noteId === note.id && r.title).map((r) => r.title!);
    const extras = [
      ...(verses.length ? [`Verses: ${[...new Set(verses)].join(', ')}`] : []),
      ...(readings.length ? [`Family reading: ${[...new Set(readings)].join(', ')}`] : []),
    ];
    await tx.update(Notes).set({
      userId: teenId, spaceId: teenHome, simpleNoteId: number++, content: childTextToHtml(note.content ?? '', extras),
      threadId: threadMap.get(note.threadId ?? '') ?? note.threadId,
      // A fresh stamp, so the teen's other devices sync these in. Their old dates stay in createdAt.
      updatedAt: now,
    }).where(eq(Notes.id, note.id));
  }
  if (noteIds.length) await tx.delete(ChildNoteResources).where(inArray(ChildNoteResources.noteId, noteIds));

  // The child's own Family Bible thoughts, one note per chapter.
  const readings = await tx.select().from(FamilyChildBibleReadings).where(eq(FamilyChildBibleReadings.childId, child.id))
    .orderBy(asc(FamilyChildBibleReadings.sharedAt));
  let familyBibleNotes = 0;
  for (const reading of readings) {
    const thoughts = await tx.select().from(FamilyChildBibleThoughts).where(and(
      eq(FamilyChildBibleThoughts.readingId, reading.id), eq(FamilyChildBibleThoughts.role, 'child')))
      .orderBy(asc(FamilyChildBibleThoughts.verse), asc(FamilyChildBibleThoughts.createdAt));
    if (!thoughts.length) continue;
    await tx.insert(Notes).values({
      id: `note_${crypto.randomUUID()}`, userId: teenId, spaceId: teenHome, simpleNoteId: number++, threadId: 'unorganized',
      title: `${reading.book} ${reading.chapter}`, primaryCollection: 'Family Bible',
      content: childTextToHtml(thoughts.map((t) => `${reading.book} ${reading.chapter}:${t.verse} — ${t.text}`).join('\n')),
      createdAt: thoughts[0].createdAt, updatedAt: now,
    });
    familyBibleNotes++;
  }
  const highestNumber = number - 1;
  await tx.update(UserMetadata).set({ highestSimpleNoteId: sql`greatest(${UserMetadata.highestSimpleNoteId}, ${highestNumber})` })
    .where(eq(UserMetadata.userId, teenId));

  // My Bible highlights become reader highlights, in the translation the child reads.
  const translation = child.bibleTranslations?.[0] ?? 'BSB';
  const highlights = await tx.select().from(FamilyChildVerseHighlights).where(eq(FamilyChildVerseHighlights.childId, child.id));
  const chapterText = new Map<string, Map<number, string>>();
  let movedHighlights = 0;
  for (const highlight of highlights) {
    const reference = normalizeScriptureReference(`${highlight.book} ${highlight.chapter}:${highlight.verse}`)
      ?? `${highlight.book} ${highlight.chapter}:${highlight.verse}`;
    const [existing] = await tx.select({ id: StudyThreadEntries.id }).from(StudyThreadEntries).where(and(
      eq(StudyThreadEntries.userId, teenId), isNull(StudyThreadEntries.parentNoteId), eq(StudyThreadEntries.entryKindRaw, 'scriptureLink'),
      eq(StudyThreadEntries.scriptureReference, reference), eq(StudyThreadEntries.scripturePassageTranslation, translation),
      isNull(StudyThreadEntries.scriptureSpanKey)));
    if (existing) continue; // The teen's own highlight on that verse wins.
    const key = `${highlight.book}|${highlight.chapter}`;
    if (!chapterText.has(key)) {
      const verses = await readChapter(tx, { book: highlight.book, chapter: highlight.chapter, translation } as never)
        .then((r) => r.verses).catch(() => []);
      chapterText.set(key, new Map(verses.map((v) => [v.verse, v.text])));
    }
    const excerpt = chapterText.get(key)!.get(highlight.verse) ?? '';
    await tx.insert(StudyThreadEntries).values({
      id: generateStudyThreadEntryId(), userId: teenId, parentNoteId: null, spaceId: teenHome, entryKindRaw: 'scriptureLink',
      highlightAccentRaw: highlight.color, scriptureReference: reference, scripturePassageTranslation: translation,
      scripturePassageExcerpt: excerpt, sourceSnippet: excerpt, scriptureSpanKey: null, createdAt: highlight.createdAt, updatedAt: now,
    } as never);
    movedHighlights++;
  }

  // Look back → Review. Same source on both sides: the history joins the teen's item.
  const childItems = await tx.select({ id: ReviewItems.id, sourceKey: ReviewItems.sourceKey }).from(ReviewItems)
    .where(eq(ReviewItems.userId, child.id));
  const teenItems = childItems.length ? await tx.select({ id: ReviewItems.id, sourceKey: ReviewItems.sourceKey }).from(ReviewItems)
    .where(and(eq(ReviewItems.userId, teenId), inArray(ReviewItems.sourceKey, childItems.map((i) => i.sourceKey)))) : [];
  for (const item of childItems) {
    const same = teenItems.find((t) => t.sourceKey === item.sourceKey);
    if (same) {
      await tx.update(ReviewEvents).set({ reviewItemId: same.id }).where(eq(ReviewEvents.reviewItemId, item.id));
      await tx.delete(ReviewItems).where(eq(ReviewItems.id, item.id));
    } else {
      await tx.update(ReviewItems).set({ userId: teenId, updatedAt: now }).where(eq(ReviewItems.id, item.id));
    }
  }
  await tx.update(ReviewEvents).set({ userId: teenId }).where(eq(ReviewEvents.userId, child.id));
  await tx.delete(UserNodeStates).where(eq(UserNodeStates.userId, child.id));

  return { notes: notes.length, tags: childTags.length, threads: childThreads.length, highlights: movedHighlights,
    familyBibleNotes, reviewItems: childItems.length };
}

/** Everything left is kids-only. The child record's cascades take sessions, stickers, consents and readings. */
async function deleteMovedChild(tx: FamilyTx, child: Child) {
  const [left] = await tx.select({ count: sql<number>`count(*)::int` }).from(Notes).where(eq(Notes.userId, child.id));
  if (left.count > 0) throw new Error('Notebook move left notes behind.');
  await tx.delete(FamilyChildren).where(eq(FamilyChildren.id, child.id));
  await tx.delete(Spaces).where(and(eq(Spaces.id, child.homeSpaceId), eq(Spaces.userId, child.id)));
  await tx.delete(FamilyVerifications).where(eq(FamilyVerifications.id, child.verificationId));
}
