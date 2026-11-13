/**
 * Moving a child notebook into a teen's own account, against a real Postgres.
 *
 * Runs only with MOVE_TEST_DATABASE_URL pointing at a local, disposable database that has the
 * schema pushed (`SUPABASE_DIRECT_URL=<url> npx drizzle-kit push --force`). It refuses any other
 * host, so it can never touch Supabase. Every test seeds its own family and checks every table
 * the move reads or writes, before and after.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const LOCAL = vi.hoisted(() => {
  const url = process.env.MOVE_TEST_DATABASE_URL;
  const local = Boolean(url && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(url));
  if (local) {
    process.env.SUPABASE_DATABASE_URL = url;
    process.env.SUPABASE_DIRECT_URL = url;
  }
  return local;
});
const failNormalize = vi.hoisted(() => ({ on: false }));
vi.mock('@/utils/scripture-detector', async (original) => {
  const actual = await original<typeof import('@/utils/scripture-detector')>();
  return {
    ...actual,
    normalizeScriptureReference: (value: string) => {
      if (failNormalize.on) throw new Error('simulated failure part-way through the move');
      return actual.normalizeScriptureReference(value);
    },
  };
});

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  BibleTranslations, BibleVerses, ChildNoteResources, FamilyChildBibleReadings, FamilyChildBibleThoughts, FamilyChildConsents,
  FamilyChildren, FamilyChildSessions, FamilyChildTransfers, FamilyChildVerseHighlights, FamilyChildVerseStickers, FamilyVerifications,
  Notes, NoteTags, NoteThreads, ReviewEvents, ReviewItems, ScriptureMetadata, Spaces, StudyThreadEntries, Tags, Threads, UserMetadata,
  VerseStickers,
} from '../../db/schema';
import { childTextToHtml, claimNotebookMove, createNotebookMove, openNotebookMove, previewNotebookMove } from '../notebook-move';
import { sql } from 'drizzle-orm';
import { deleteChildData } from '../service';

const run = LOCAL ? describe : describe.skip;
const now = new Date('2026-11-01T12:00:00Z');
let seq = 0;
const RUN = Date.now().toString(36);

type Seeded = Awaited<ReturnType<typeof seed>>;

async function seed() {
  const n = `${RUN}_${++seq}`;
  const parent = `user_parent_${n}`;
  const teen = `user_teen_${n}`;
  const child = `child_${n}`;
  const childHome = `space_child_${n}`;
  const teenHome = `space_teen_${n}`;
  const id = (name: string) => `${name}_${n}`;
  await db.insert(BibleTranslations).values({ id: 'BSB', name: 'Berean Standard Bible', abbreviation: 'BSB', publisher: 'x', copyrightNotice: 'x', createdAt: now } as never)
    .onConflictDoNothing();
  await db.insert(BibleVerses).values({ id: id('v'), translationId: 'BSB', book: 'Psalms', chapter: 23, verse: 1, text: 'The LORD is my shepherd; I shall not want.' } as never)
    .onConflictDoNothing();

  // The teen's account already has things in it.
  await db.insert(Spaces).values({ id: teenHome, title: 'My Home', userId: teen, type: 'personal', createdAt: now });
  await db.insert(UserMetadata).values({ id: id('meta'), userId: teen, highestSimpleNoteId: 4, createdAt: now } as never);
  await db.insert(Notes).values({ id: id('teen_note'), userId: teen, spaceId: teenHome, title: 'Mine', content: '<p>mine</p>', threadId: 'unorganized', simpleNoteId: 3, createdAt: now });
  await db.insert(Tags).values({ id: id('teen_tag'), name: 'Prayer', userId: teen, createdAt: now });
  await db.insert(Threads).values({ id: id('teen_thread'), title: 'Psalms', userId: teen, spaceId: teenHome, createdAt: now } as never);
  await db.insert(ReviewItems).values({ id: id('teen_item'), userId: teen, kind: 'verse', sourceKey: 'verse:John 3:16', scriptureReference: 'John 3:16', dueAt: now, createdAt: now } as never);
  await db.insert(StudyThreadEntries).values({ id: id('teen_hl'), userId: teen, parentNoteId: null, spaceId: teenHome, entryKindRaw: 'scriptureLink',
    highlightAccentRaw: 'skyBlue', scriptureReference: 'John 3:16', scripturePassageTranslation: 'BSB', createdAt: now } as never);
  await db.insert(VerseStickers).values({ userId: teen, book: 'John', chapter: 3, verse: 16, sticker: 'heart', createdAt: now, updatedAt: now });

  // The child notebook.
  await db.insert(FamilyVerifications).values({ id: id('verification'), parentUserId: parent, parentEmailHash: 'x', environment: 'test',
    location: 'US', status: 'consumed', createdAt: now, expiresAt: now } as never);
  await db.insert(Spaces).values({ id: childHome, title: 'My Home', userId: child, type: 'personal', createdAt: now });
  await db.insert(FamilyChildren).values({ id: child, parentUserId: parent, displayName: 'Sam', ageBand: 'under-13', homeSpaceId: childHome,
    verificationId: id('verification'), noticeVersion: 'v', consentedAt: now, status: 'active', createdAt: now, lastActiveAt: now,
    bibleTranslations: ['BSB'] } as never);
  await db.insert(Notes).values([
    { id: id('note_a'), userId: child, spaceId: childHome, title: 'Sheep', content: 'Line one <b>&\n\nLine three', threadId: 'unorganized',
      primaryCollection: 'Psalms study', createdAt: new Date('2026-10-01T00:00:00Z') },
    { id: id('note_b'), userId: child, spaceId: childHome, title: 'Jesus', content: 'Loved', threadId: 'unorganized', createdAt: new Date('2026-10-02T00:00:00Z') },
  ] as never);
  await db.insert(Tags).values([
    { id: id('child_tag_prayer'), name: 'prayer', userId: child, createdAt: now },
    { id: id('child_tag_animals'), name: 'Animals', userId: child, createdAt: now },
  ]);
  await db.insert(NoteTags).values([
    { id: id('nt1'), noteId: id('note_a'), tagId: id('child_tag_prayer'), createdAt: now },
    { id: id('nt2'), noteId: id('note_a'), tagId: id('child_tag_animals'), createdAt: now },
  ] as never);
  await db.insert(Threads).values([
    { id: id('child_thread_psalms'), title: 'psalms', userId: child, spaceId: childHome, createdAt: now },
    { id: id('child_thread_jesus'), title: 'Jesus', userId: child, spaceId: childHome, createdAt: now },
  ] as never);
  await db.insert(NoteThreads).values([
    { id: id('nth1'), noteId: id('note_a'), threadId: id('child_thread_psalms'), createdAt: now },
    { id: id('nth2'), noteId: id('note_b'), threadId: id('child_thread_jesus'), createdAt: now },
  ] as never);
  await db.insert(ScriptureMetadata).values({ id: id('sm'), noteId: id('note_a'), reference: 'Psalms 23:1', book: 'Psalms', chapter: 23, verse: 1,
    translation: 'BSB', originalText: 'The LORD is my shepherd', createdAt: now } as never);
  await db.insert(ReviewItems).values([
    { id: id('child_item_shared'), userId: child, kind: 'verse', sourceKey: 'verse:John 3:16', scriptureReference: 'John 3:16', dueAt: now, createdAt: now },
    { id: id('child_item_note'), userId: child, kind: 'note', sourceKey: `note:${id('note_a')}`, noteId: id('note_a'), dueAt: now, intervalDays: 6, createdAt: now },
  ] as never);
  await db.insert(ReviewEvents).values([
    { id: id('ev1'), userId: child, reviewItemId: id('child_item_shared'), action: 'answered', createdAt: now },
    { id: id('ev2'), userId: child, reviewItemId: id('child_item_note'), action: 'answered', createdAt: now },
  ] as never);
  await db.insert(FamilyChildVerseHighlights).values([
    { childId: child, book: 'John', chapter: 3, verse: 16, color: 'warmAmber', createdAt: now },
    { childId: child, book: 'Psalms', chapter: 23, verse: 1, color: 'mintGreen', createdAt: now },
  ]);
  await db.insert(FamilyChildVerseStickers).values([
    { childId: child, book: 'Psalms', chapter: 23, verse: 1, sticker: 'star', createdAt: new Date('2026-10-03T00:00:00Z') },
    { childId: child, book: 'Psalms', chapter: 23, verse: 4, sticker: 'sailboat', createdAt: now },
    // The teen already has a heart here; theirs wins.
    { childId: child, book: 'John', chapter: 3, verse: 16, sticker: 'dove', createdAt: now },
  ]);
  await db.insert(FamilyChildBibleReadings).values({ id: id('reading'), childId: child, book: 'Psalms', chapter: 23, translation: 'BSB', sharedAt: now } as never);
  await db.insert(FamilyChildBibleThoughts).values([
    { id: id('th1'), readingId: id('reading'), verse: 1, role: 'child', text: 'Sheep are fluffy', createdAt: now },
    { id: id('th2'), readingId: id('reading'), verse: 1, role: 'parent', text: 'Parent words', createdAt: now },
  ] as never);
  await db.insert(FamilyChildSessions).values({ tokenHash: id('session'), childId: child, kind: 'session', createdAt: now, expiresAt: new Date(Date.now() + 3600_000) });
  await db.insert(FamilyChildConsents).values({ id: id('consent'), childId: child, parentUserId: parent, noticeVersion: 'v', consentedAt: now, kind: 'created' });

  const [childRow] = await db.select().from(FamilyChildren).where(eq(FamilyChildren.id, child));
  const link = await db.transaction((tx) => createNotebookMove(tx, childRow, null));
  return { n, parent, teen, child, childHome, teenHome, id, childRow, token: link.token };
}

async function childStillIntact(s: Seeded) {
  const notes = await db.select({ id: Notes.id, userId: Notes.userId, content: Notes.content, simpleNoteId: Notes.simpleNoteId })
    .from(Notes).where(inArray(Notes.id, [s.id('note_a'), s.id('note_b')]));
  expect(notes.every((note) => note.userId === s.child && note.simpleNoteId === null)).toBe(true);
  expect(notes.find((note) => note.id === s.id('note_a'))?.content).toBe('Line one <b>&\n\nLine three');
  expect(await db.select().from(FamilyChildren).where(eq(FamilyChildren.id, s.child))).toHaveLength(1);
  expect(await db.select().from(Tags).where(eq(Tags.userId, s.child))).toHaveLength(2);
  expect(await db.select().from(ReviewItems).where(eq(ReviewItems.userId, s.child))).toHaveLength(2);
  expect(await db.select().from(StudyThreadEntries).where(eq(StudyThreadEntries.userId, s.teen))).toHaveLength(1);
  expect(await db.select().from(Notes).where(eq(Notes.userId, s.teen))).toHaveLength(1);
  expect(await db.select().from(FamilyChildVerseStickers).where(eq(FamilyChildVerseStickers.childId, s.child))).toHaveLength(3);
  expect(await db.select().from(VerseStickers).where(eq(VerseStickers.userId, s.teen))).toHaveLength(1);
}

run('moving a child notebook into the teen’s own account', () => {
  let s: Seeded;
  beforeEach(async () => { failNormalize.on = false; s = await seed(); });
  afterAll(async () => { failNormalize.on = false; });

  it('converts plain text to paragraphs, escaping it', () => {
    expect(childTextToHtml('a <b>\n\nc', ['Verses: John 3:16'])).toBe('<p>a &lt;b&gt;</p><p></p><p>c</p><p>Verses: John 3:16</p>');
  });

  it('refuses the parent, and changes nothing', async () => {
    await expect(claimNotebookMove(s.token, { userId: s.parent }, s.teenHome)).rejects.toMatchObject({ status: 403 });
    await expect(previewNotebookMove(s.token, { userId: s.parent })).rejects.toMatchObject({ status: 403 });
    await childStillIntact(s);
  });

  it('refuses a home space that isn’t the claimer’s', async () => {
    await expect(claimNotebookMove(s.token, { userId: s.teen }, s.childHome)).rejects.toMatchObject({ status: 409 });
    await childStillIntact(s);
  });

  it('leaves everything as it was when the move fails part-way', async () => {
    failNormalize.on = true; // throws at the highlights, after notes, tags and Threads were rewritten
    await expect(claimNotebookMove(s.token, { userId: s.teen }, s.teenHome)).rejects.toThrow('simulated failure');
    failNormalize.on = false;
    await childStillIntact(s);
    const [move] = await db.select().from(FamilyChildTransfers).where(eq(FamilyChildTransfers.childId, s.child));
    expect(move.status).toBe('open');
    // And the same link still works afterwards.
    await expect(claimNotebookMove(s.token, { userId: s.teen }, s.teenHome)).resolves.toBeTruthy();
  });

  it('shows the teen what they are claiming', async () => {
    expect(await previewNotebookMove(s.token, { userId: s.teen })).toMatchObject({ displayName: 'Sam', notes: 2, highlights: 2, stickers: 3 });
  });

  it('moves everything, merges with what the teen has, and deletes the child record', async () => {
    const { summary } = await claimNotebookMove(s.token, { userId: s.teen }, s.teenHome);
    expect(summary).toEqual({ notes: 2, tags: 2, threads: 2, highlights: 1, stickers: 2, familyBibleNotes: 1, reviewItems: 2 });

    // Notes: same ids, the teen's, in their home, numbered after their own (highest was 4).
    const notes = await db.select().from(Notes).where(eq(Notes.userId, s.teen));
    expect(notes).toHaveLength(4);
    const a = notes.find((note) => note.id === s.id('note_a'))!;
    const b = notes.find((note) => note.id === s.id('note_b'))!;
    const family = notes.find((note) => note.primaryCollection === 'Family Bible')!;
    expect([a.simpleNoteId, b.simpleNoteId, family.simpleNoteId]).toEqual([5, 6, 7]);
    expect(notes.every((note) => note.spaceId === s.teenHome)).toBe(true);
    expect(a.title).toBe('Sheep');
    expect(a.primaryCollection).toBe('Psalms study');
    expect(a.content).toBe('<p>Line one &lt;b&gt;&amp;</p><p></p><p>Line three</p><p>Verses: Psalms 23:1 (BSB)</p>');
    expect(a.createdAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(family.title).toBe('Psalms 23');
    expect(family.content).toContain('Sheep are fluffy');
    expect(family.content).not.toContain('Parent words');
    const [meta] = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, s.teen));
    expect(meta.highestSimpleNoteId).toBe(7);

    // Tags and Threads: merged by name where the teen had one, moved otherwise.
    const tags = await db.select().from(Tags).where(eq(Tags.userId, s.teen));
    expect(tags.map((t) => t.name).sort()).toEqual(['Animals', 'Prayer']);
    const links = await db.select().from(NoteTags).where(eq(NoteTags.noteId, s.id('note_a')));
    expect(links.map((l) => l.tagId).sort()).toEqual([s.id('child_tag_animals'), s.id('teen_tag')].sort());
    const threads = await db.select().from(Threads).where(eq(Threads.userId, s.teen));
    expect(threads.map((t) => t.title).sort()).toEqual(['Jesus', 'Psalms']);
    expect(threads.every((t) => t.spaceId === s.teenHome)).toBe(true);
    const threadLinks = await db.select().from(NoteThreads).where(inArray(NoteThreads.noteId, [s.id('note_a'), s.id('note_b')]));
    expect(threadLinks.map((l) => l.threadId).sort()).toEqual([s.id('child_thread_jesus'), s.id('teen_thread')].sort());

    // Scripture stays on the note.
    expect(await db.select().from(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, s.id('note_a')))).toHaveLength(1);

    // Review: the shared verse joins the teen's item; the note item moves with its schedule.
    const items = await db.select().from(ReviewItems).where(eq(ReviewItems.userId, s.teen));
    expect(items.map((i) => i.id).sort()).toEqual([s.id('child_item_note'), s.id('teen_item')].sort());
    expect(items.find((i) => i.id === s.id('child_item_note'))?.intervalDays).toBe(6);
    const events = await db.select().from(ReviewEvents).where(inArray(ReviewEvents.id, [s.id('ev1'), s.id('ev2')]));
    expect(events.every((e) => e.userId === s.teen)).toBe(true);
    expect(events.find((e) => e.id === s.id('ev1'))?.reviewItemId).toBe(s.id('teen_item'));

    // Highlights: the teen's own John 3:16 wins; Psalm 23:1 arrives as a reader highlight.
    const highlights = await db.select().from(StudyThreadEntries).where(eq(StudyThreadEntries.userId, s.teen));
    expect(highlights).toHaveLength(2);
    const psalm = highlights.find((h) => h.scriptureReference?.startsWith('Psalm'))!;
    expect(psalm).toMatchObject({ entryKindRaw: 'scriptureLink', highlightAccentRaw: 'mintGreen', scripturePassageTranslation: 'BSB',
      parentNoteId: null, spaceId: s.teenHome, sourceSnippet: 'The LORD is my shepherd; I shall not want.' });
    expect(highlights.find((h) => h.id === s.id('teen_hl'))?.highlightAccentRaw).toBe('skyBlue');

    // Stickers: same verses in the teen's Bible, the child's date kept; the teen's own heart on John 3:16 wins.
    const stickers = await db.select().from(VerseStickers).where(eq(VerseStickers.userId, s.teen));
    expect(stickers.map((r) => `${r.book} ${r.chapter}:${r.verse} ${r.sticker}`).sort())
      .toEqual(['John 3:16 heart', 'Psalms 23:1 star', 'Psalms 23:4 sailboat']);
    expect(stickers.find((r) => r.verse === 1)?.createdAt.toISOString()).toBe('2026-10-03T00:00:00.000Z');

    // Nothing of the child is left.
    expect(await db.select().from(FamilyChildren).where(eq(FamilyChildren.id, s.child))).toHaveLength(0);
    expect(await db.select().from(Notes).where(eq(Notes.userId, s.child))).toHaveLength(0);
    expect(await db.select().from(Tags).where(eq(Tags.userId, s.child))).toHaveLength(0);
    expect(await db.select().from(Threads).where(eq(Threads.userId, s.child))).toHaveLength(0);
    expect(await db.select().from(ReviewItems).where(eq(ReviewItems.userId, s.child))).toHaveLength(0);
    expect(await db.select().from(ReviewEvents).where(eq(ReviewEvents.userId, s.child))).toHaveLength(0);
    expect(await db.select().from(Spaces).where(eq(Spaces.id, s.childHome))).toHaveLength(0);
    expect(await db.select().from(FamilyChildSessions).where(eq(FamilyChildSessions.childId, s.child))).toHaveLength(0);
    expect(await db.select().from(FamilyChildVerseStickers).where(eq(FamilyChildVerseStickers.childId, s.child))).toHaveLength(0);
    expect(await db.select().from(FamilyChildVerseHighlights).where(eq(FamilyChildVerseHighlights.childId, s.child))).toHaveLength(0);
    expect(await db.select().from(FamilyChildBibleReadings).where(eq(FamilyChildBibleReadings.childId, s.child))).toHaveLength(0);
    expect(await db.select().from(FamilyChildConsents).where(eq(FamilyChildConsents.childId, s.child))).toHaveLength(0);
    expect(await db.select().from(ChildNoteResources).where(eq(ChildNoteResources.noteId, s.id('note_a')))).toHaveLength(0);
    expect(await db.select().from(FamilyVerifications).where(eq(FamilyVerifications.id, s.id('verification')))).toHaveLength(0);

    // The record that it happened: counts, who, when — no content.
    const [move] = await db.select().from(FamilyChildTransfers).where(eq(FamilyChildTransfers.childId, s.child));
    expect(move).toMatchObject({ status: 'completed', newUserId: s.teen, parentUserId: s.parent, summary });

    // A second use is refused.
    await expect(claimNotebookMove(s.token, { userId: s.teen }, s.teenHome)).rejects.toMatchObject({ status: 410 });
  });

  it('refuses a link that was replaced, and one that expired', async () => {
    const replaced = await db.transaction((tx) => createNotebookMove(tx, s.childRow, null));
    await expect(claimNotebookMove(s.token, { userId: s.teen }, s.teenHome)).rejects.toMatchObject({ status: 410 });
    await db.update(FamilyChildTransfers).set({ expiresAt: new Date(Date.now() - 1000) })
      .where(and(eq(FamilyChildTransfers.childId, s.child), eq(FamilyChildTransfers.status, 'open')));
    await expect(claimNotebookMove(replaced.token, { userId: s.teen }, s.teenHome)).rejects.toMatchObject({ status: 410 });
    await childStillIntact(s);
  });

  it('closes the link when the parent deletes the notebook instead', async () => {
    await db.transaction((tx) => deleteChildData(tx, s.childRow));
    await expect(claimNotebookMove(s.token, { userId: s.teen }, s.teenHome)).rejects.toMatchObject({ status: 410 });
  });

  it('reads no open link, and keeps the page working, before the table exists', async () => {
    await db.execute(sql`ALTER TABLE "FamilyChildTransfers" RENAME TO "FamilyChildTransfers_hidden"`);
    try {
      const after = await db.transaction(async (tx) => {
        expect(await openNotebookMove(tx, s.child)).toBeNull();
        return tx.select().from(FamilyChildren).where(eq(FamilyChildren.id, s.child));
      });
      expect(after).toHaveLength(1);
    } finally {
      await db.execute(sql`ALTER TABLE "FamilyChildTransfers_hidden" RENAME TO "FamilyChildTransfers"`);
    }
    expect(await db.transaction((tx) => openNotebookMove(tx, s.child))).toMatchObject({ familyInviteId: null });
  });

  it('still moves the notebook before the stickers table exists, leaving the stickers behind', async () => {
    await db.execute(sql`ALTER TABLE "VerseStickers" RENAME TO "VerseStickers_hidden"`);
    try {
      const { summary } = await claimNotebookMove(s.token, { userId: s.teen }, s.teenHome);
      expect(summary).toMatchObject({ notes: 2, highlights: 1, stickers: 0 });
    } finally {
      await db.execute(sql`ALTER TABLE "VerseStickers_hidden" RENAME TO "VerseStickers"`);
    }
    expect(await db.select().from(Notes).where(eq(Notes.userId, s.teen))).toHaveLength(4);
    expect(await db.select().from(FamilyChildren).where(eq(FamilyChildren.id, s.child))).toHaveLength(0);
  });

  it('lets two claims race without moving twice', async () => {
    const results = await Promise.allSettled([
      claimNotebookMove(s.token, { userId: s.teen }, s.teenHome),
      claimNotebookMove(s.token, { userId: s.teen }, s.teenHome),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.select().from(Notes).where(eq(Notes.userId, s.teen))).toHaveLength(4);
    expect(await db.select().from(VerseStickers).where(eq(VerseStickers.userId, s.teen))).toHaveLength(3);
  });
});
