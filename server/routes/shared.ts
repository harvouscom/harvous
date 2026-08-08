/**
 * Shared / Public routes + Invitations — Hono port
 *
 * Endpoints:
 *   GET  /api/shared/note/:shareToken
 *   GET  /api/shared/thread/:shareToken
 *   GET  /api/shared/thread-plan/:shareToken   (published study plans only)
 *   POST /api/shared/add-note-to-harvous
 *   POST /api/shared/add-to-harvous
 *   GET  /api/invitations/:token          (410 — retired v1 invitations)
 *   POST /api/invitations/:token/accept   (410 — retired v1 invitations)
 *   POST /api/invitations/:token/decline  (410 — retired v1 invitations)
 */

import { Hono } from 'hono';
import { getAuth, getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import {
  db, Notes, Threads, NoteThreads, UserMetadata, ScriptureMetadata, ResourceMetadata,
  NoteScriptureReferences, Spaces, SpaceInvites,
  ChurchSeries, ChurchServicePublishedNotes, ChurchServices,
  eq, and, desc, asc, isNotNull, isNull, count, sql, inArray, lt,
  first,
} from '../db';
import { parseSequenceNoteIds } from '../utils/thread-sequence';
import { nowISO } from '../db/dates';
import { handleAPIError } from '@/utils/error-handling';
import { generateNoteId, generateThreadId, isValidShareToken } from '@/utils/ids';
import { getCurrentSeason } from '@/utils/season-helpers';
import { awardNoteCreatedXP, awardThreadCreatedXP } from '../utils/xp-system';
import {
  processScriptureReferences,
  transformCanonicalScriptureContent,
} from '../utils/process-scripture-references';
import { getEffectiveHighestSimpleNoteId } from '../utils/highest-simple-note-id';
import { rateLimit } from '@/utils/rate-limit';
import { getThreadGradientCSS } from '@/utils/colors';
import { idToUrl } from '@/utils/url-helpers';
import { getHarvousSystemUserId } from '../utils/harvous-admin';
import { ensurePersonalHomeSpace } from '../utils/ensure-personal-home-space';
import { createInitialNoteVersion } from '../utils/note-version-service';
import { buildIndependentCopyAttribution } from '../utils/note-versioning';

const app = new Hono();

/** Postgres-friendly batch size for multi-row inserts */
const SHARED_BULK_INSERT_CHUNK = 400;
const XP_AWARD_CONCURRENCY = 8;

async function awardNoteCreatedXPInBatches(
  userId: string,
  items: Array<{ noteId: string; isScripture: boolean; content: string }>,
  concurrency: number,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    await Promise.all(
      slice.map((x) => awardNoteCreatedXP(userId, x.noteId, x.isScripture, x.content).catch(() => {})),
    );
  }
}

// ─── Shared Note / Thread (public GET) ──────────────────────────────

/**
 * GET /api/shared/thread-plan/:shareToken — a published study plan's spine.
 *
 * The **spine only**: each week's title and passage, and nothing else. Never a
 * note body, never an author, never a count of who is walking it. Someone who
 * has not joined is being shown what the study covers so they can decide
 * whether to; everything past that is for the room.
 *
 * Resolves only for a Thread that a series published. That check is what keeps
 * `SHARED_THREAD_NOT_PUBLIC` meaningful: an ordinary space Thread's steps are
 * notes members wrote, and no share token should ever make those public. Titles
 * and passages here are staff-authored plan rows, read from `ChurchServices`
 * rather than from the step notes, so even a member editing a step cannot push
 * their own words onto a public page.
 */
app.get('/api/shared/thread-plan/:shareToken', async (c) => {
  try {
    const shareToken = requireParam(c, 'shareToken');
    if (!isValidShareToken(shareToken)) return c.json({ error: 'Invalid share token format' }, 400);

    const notFound = () =>
      c.json({ error: 'Shared study plan not found or no longer available' }, 404);

    const thread = first(
      await db
        .select({
          id: Threads.id,
          title: Threads.title,
          subtitle: Threads.subtitle,
          color: Threads.color,
          spaceId: Threads.spaceId,
          mode: Threads.mode,
          sequenceNoteIds: Threads.sequenceNoteIds,
        })
        .from(Threads)
        .where(and(eq(Threads.shareToken, shareToken), eq(Threads.isPublic, true)))
        .limit(1),
    );
    if (!thread || !thread.spaceId || thread.mode !== 'sequence') return notFound();

    /* The gate. Not "is it in a space" — "did a series publish it". */
    const series = first(
      await db
        .select({ id: ChurchSeries.id, title: ChurchSeries.title })
        .from(ChurchSeries)
        .where(eq(ChurchSeries.publishedThreadId, thread.id))
        .limit(1),
    );
    if (!series) return notFound();

    const space = first(
      await db
        .select({ id: Spaces.id, title: Spaces.title, deletedAt: Spaces.deletedAt })
        .from(Spaces)
        .where(eq(Spaces.id, thread.spaceId))
        .limit(1),
    );
    if (!space || space.deletedAt) return notFound();

    /*
      Titles and passages come from the plan rows, joined through the published
      claim — not from the step notes. A member who renames a step is editing
      the room's copy, not this page.
    */
    const stepRows = await db
      .select({
        noteId: ChurchServicePublishedNotes.noteId,
        title: ChurchServices.title,
        reference: ChurchServices.reference,
        serviceDate: ChurchServices.serviceDate,
      })
      .from(ChurchServicePublishedNotes)
      .innerJoin(ChurchServices, eq(ChurchServices.id, ChurchServicePublishedNotes.serviceId))
      .innerJoin(NoteThreads, eq(NoteThreads.noteId, ChurchServicePublishedNotes.noteId))
      .where(eq(NoteThreads.threadId, thread.id));

    const byNoteId = new Map(stepRows.map((row) => [row.noteId, row]));
    const ordered = parseSequenceNoteIds(thread.sequenceNoteIds)
      .map((noteId) => byNoteId.get(noteId))
      .filter((row): row is (typeof stepRows)[number] => Boolean(row));

    /*
      A join link only when the room already has an active one. Minting an
      invite because a stranger loaded a page would be the page deciding who
      may join, which is the room's decision.
    */
    const invite = first(
      await db
        .select({ token: SpaceInvites.token })
        .from(SpaceInvites)
        .where(
          and(
            eq(SpaceInvites.spaceId, space.id),
            eq(SpaceInvites.kind, 'link'),
            isNull(SpaceInvites.revokedAt),
          ),
        )
        .limit(1),
    );

    return c.json({
      plan: {
        title: thread.title,
        subtitle: thread.subtitle,
        color: thread.color,
        seriesTitle: series.title,
      },
      space: { title: space.title },
      steps: ordered.map((row, index) => ({
        step: index + 1,
        title: row.title,
        reference: row.reference,
        serviceDate: row.serviceDate,
      })),
      joinToken: invite?.token ?? null,
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/shared/thread-plan/[shareToken]',
      action: 'get_shared_thread_plan',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** GET /api/shared/note/:shareToken */
app.get('/api/shared/note/:shareToken', async (c) => {
  try {
    const shareToken = requireParam(c, 'shareToken');
    if (!isValidShareToken(shareToken)) return c.json({ error: 'Invalid share token format' }, 400);

    const note = first(await db
      .select({
        id: Notes.id, title: Notes.title, content: Notes.content,
        noteType: Notes.noteType, isPublic: Notes.isPublic, shareToken: Notes.shareToken,
        createdAt: Notes.createdAt, updatedAt: Notes.updatedAt, userId: Notes.userId,
      })
      .from(Notes)
      .where(and(eq(Notes.shareToken, shareToken), eq(Notes.isPublic, true), eq(Notes.contentEncrypted, false)))
      .limit(1));

    if (!note) return c.json({ error: 'Shared note not found or no longer available' }, 404);

    let scriptureMetadata = null;
    if (note.noteType === 'scripture') {
      scriptureMetadata = first(await db
        .select({
          reference: ScriptureMetadata.reference, book: ScriptureMetadata.book,
          chapter: ScriptureMetadata.chapter, verse: ScriptureMetadata.verse,
          verseEnd: ScriptureMetadata.verseEnd, translation: ScriptureMetadata.translation,
          originalText: ScriptureMetadata.originalText,
        })
        .from(ScriptureMetadata)
        .where(eq(ScriptureMetadata.noteId, note.id))
        .limit(1)) ?? null;
    }

    let resourceMetadata = null;
    if (note.noteType === 'resource') {
      resourceMetadata = first(await db
        .select({
          sourceUrl: ResourceMetadata.sourceUrl, sourceDomain: ResourceMetadata.sourceDomain,
          sourceName: ResourceMetadata.sourceName, sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage,
        })
        .from(ResourceMetadata)
        .where(eq(ResourceMetadata.noteId, note.id))
        .limit(1)) ?? null;
    }

    const creator = first(await db
      .select({
        firstName: UserMetadata.firstName, lastName: UserMetadata.lastName,
        userColor: UserMetadata.userColor, profileImageUrl: UserMetadata.profileImageUrl,
      })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, note.userId))
      .limit(1));

    let noteIsHarvousOwned = false;
    try { noteIsHarvousOwned = note.userId === getHarvousSystemUserId(); } catch { /* env not set */ }

    const firstName = noteIsHarvousOwned ? 'Harvous' : (creator?.firstName || '');
    const lastName = noteIsHarvousOwned ? '' : (creator?.lastName || '');
    const firstInitial = firstName.charAt(0).toUpperCase();
    const lastInitial = lastName.charAt(0).toUpperCase();
    const initials = noteIsHarvousOwned ? 'H' : ((firstInitial + lastInitial) || 'U');
    const displayName = noteIsHarvousOwned
      ? 'Harvous'
      : (firstName ? (lastName ? `${firstName} ${lastInitial}.` : firstName) : 'A Harvous User');

    return c.json({
      note: { id: note.id, title: note.title, content: note.content, noteType: note.noteType, createdAt: note.createdAt, updatedAt: note.updatedAt },
      scriptureMetadata,
      resourceMetadata,
      creator: { firstName, displayName, isHarvousOwned: noteIsHarvousOwned, initials, userColor: creator?.userColor || 'blue', profileImageUrl: creator?.profileImageUrl || null },
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/shared/note/[shareToken]', action: 'get_shared_note' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** GET /api/shared/thread/:shareToken */
app.get('/api/shared/thread/:shareToken', async (c) => {
  try {
    const shareToken = requireParam(c, 'shareToken');
    if (!isValidShareToken(shareToken)) return c.json({ error: 'Invalid share token format' }, 400);

    const thread = first(await db
      .select({
        id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, color: Threads.color,
        isPublic: Threads.isPublic, shareToken: Threads.shareToken, createdAt: Threads.createdAt,
        userId: Threads.userId, spaceId: Threads.spaceId,
      })
      .from(Threads)
      .where(and(eq(Threads.shareToken, shareToken), eq(Threads.isPublic, true)))
      .limit(1));

    if (!thread) return c.json({ error: 'Shared thread not found or no longer available' }, 404);
    if (thread.spaceId) {
      const contextSpace = first(
        await db.select({ type: Spaces.type, deletedAt: Spaces.deletedAt })
          .from(Spaces)
          .where(eq(Spaces.id, thread.spaceId))
          .limit(1),
      );
      if (!contextSpace || contextSpace.deletedAt || contextSpace.type !== 'personal') {
        return c.json({ error: 'Shared thread not found or no longer available' }, 404);
      }
    }

    const notes = await db
      .select({
        id: Notes.id, title: Notes.title, content: Notes.content, noteType: Notes.noteType,
        createdAt: Notes.createdAt, updatedAt: Notes.updatedAt, lastVisited: Notes.lastVisited,
      })
      .from(Notes)
      .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(eq(NoteThreads.threadId, thread.id), eq(Notes.contentEncrypted, false)))
      .orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited),
        desc(Notes.updatedAt),
        desc(Notes.createdAt),
        asc(Notes.id)
      )
      ;

    // Resolve referenced scripture notes (same pattern as getNotesForThread in dashboard-data.ts)
    const threadNoteIds = notes.map(n => n.id).filter(Boolean);
    let referencedScriptureNotes: typeof notes = [];
    if (threadNoteIds.length > 0) {
      const refs = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
        .from(NoteScriptureReferences)
        .innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
        .where(and(
          inArray(NoteScriptureReferences.noteId, threadNoteIds),
          eq(Notes.userId, thread.userId),
          eq(Notes.noteType, 'scripture'),
          eq(Notes.contentEncrypted, false)
        ));
      const uniqueIds = [...new Set(refs.map(r => r.scriptureNoteId))];
      const alreadyIds = new Set(notes.filter(n => n.noteType === 'scripture').map(n => n.id));
      const additionalIds = uniqueIds.filter(id => !alreadyIds.has(id));
      if (additionalIds.length > 0) {
        referencedScriptureNotes = await db.select({
          id: Notes.id, title: Notes.title, content: Notes.content, noteType: Notes.noteType,
          createdAt: Notes.createdAt, updatedAt: Notes.updatedAt, lastVisited: Notes.lastVisited,
        }).from(Notes).where(and(
          inArray(Notes.id, additionalIds),
          eq(Notes.userId, thread.userId),
          eq(Notes.noteType, 'scripture'),
          eq(Notes.contentEncrypted, false)
        ));
      }
    }
    // Merge and deduplicate
    const notesMap = new Map<string, (typeof notes)[0]>();
    [...notes, ...referencedScriptureNotes].forEach(n => { if (n.id && !notesMap.has(n.id)) notesMap.set(n.id, n); });
    const allNotes = Array.from(notesMap.values());

    const SCRIPTURE_TRANSLATION_ATTR_RE = /data-scripture-translation\s*=\s*["']([^"']+)["']/i;
    const extractScriptureTranslation = (content: string | null | undefined) => {
      const m = content?.match(SCRIPTURE_TRANSLATION_ATTR_RE);
      const v = m?.[1]?.trim();
      return v ? v.toUpperCase() : undefined;
    };

    // Enrich scripture note previews with translation abbreviation for CondensedNoteItem.
    const scriptureNoteIds = allNotes
      .filter(n => n.noteType === 'scripture')
      .map(n => n.id)
      .filter(Boolean);

    let scriptureVersionMap: Record<string, string> = {};
    if (scriptureNoteIds.length > 0) {
      try {
        const rows = await db.select({ noteId: ScriptureMetadata.noteId, translation: ScriptureMetadata.translation })
          .from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, scriptureNoteIds));
        scriptureVersionMap = rows.reduce((acc, row) => {
          if (row.noteId && row.translation) acc[row.noteId] = row.translation;
          return acc;
        }, {} as Record<string, string>);
      } catch (_) { /* ignore */ }
    }

    const creator = first(await db
      .select({
        firstName: UserMetadata.firstName, lastName: UserMetadata.lastName,
        userColor: UserMetadata.userColor, profileImageUrl: UserMetadata.profileImageUrl,
      })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, thread.userId))
      .limit(1));

    let threadIsHarvousOwned = false;
    try { threadIsHarvousOwned = thread.userId === getHarvousSystemUserId(); } catch { /* env not set */ }

    const firstName = threadIsHarvousOwned ? 'Harvous' : (creator?.firstName || '');
    const lastName = threadIsHarvousOwned ? '' : (creator?.lastName || '');
    const firstInitial = firstName.charAt(0).toUpperCase();
    const lastInitial = lastName.charAt(0).toUpperCase();
    const initials = threadIsHarvousOwned ? 'H' : ((firstInitial + lastInitial) || 'U');
    const displayName = threadIsHarvousOwned
      ? 'Harvous'
      : (firstName ? (lastName ? `${firstName} ${lastInitial}.` : firstName) : 'A Harvous User');

    return c.json({
      thread: { id: thread.id, title: thread.title, subtitle: thread.subtitle, color: thread.color, createdAt: thread.createdAt },
      notes: allNotes.map((n) => {
        if (n.noteType !== 'scripture') {
          return { id: n.id, title: n.title, content: n.content, noteType: n.noteType, createdAt: n.createdAt };
        }
        const scriptureTranslation = scriptureVersionMap[n.id] ?? extractScriptureTranslation(n.content) ?? 'NET';
        return {
          id: n.id,
          title: n.title,
          content: n.content,
          noteType: n.noteType,
          createdAt: n.createdAt,
          version: scriptureTranslation,
          scriptureTranslation,
        };
      }),
      creator: { firstName, displayName, isHarvousOwned: threadIsHarvousOwned, initials, userColor: creator?.userColor || 'blue', profileImageUrl: creator?.profileImageUrl || null },
      meta: { noteCount: allNotes.length },
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/shared/thread/[shareToken]', action: 'get_shared_thread' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── Add Shared Content to Harvous (auth required) ─────────────────

/** POST /api/shared/add-note-to-harvous */
app.post('/api/shared/add-note-to-harvous', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const { shareToken } = await c.req.json();
    if (!shareToken) return c.json({ error: 'Share token is required' }, 400);
    if (!isValidShareToken(shareToken)) return c.json({ error: 'Invalid share token format' }, 400);

    const sourceNote = first(await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        noteType: Notes.noteType,
        isPublic: Notes.isPublic,
        userId: Notes.userId,
        contentEncrypted: Notes.contentEncrypted,
        currentVersionId: Notes.currentVersionId,
      })
      .from(Notes)
      .where(and(eq(Notes.shareToken, shareToken), eq(Notes.isPublic, true)))
      .limit(1));

    if (!sourceNote) return c.json({ error: 'Shared note not found or no longer available' }, 404);
    if (sourceNote.contentEncrypted) return c.json({ error: 'Shared note not found or no longer available' }, 404);

    if (sourceNote.userId === auth.userId) {
      return c.json({ error: 'Already in your Harvous' }, 400);
    }
    const existingCopy = first(
      await db
        .select({ id: Notes.id })
        .from(Notes)
        .where(
          and(
            eq(Notes.userId, auth.userId),
            eq(Notes.copiedFromNoteId, sourceNote.id),
          ),
        )
        .limit(1),
    );
    if (existingCopy) {
      return c.json({
        success: true,
        alreadyImported: true,
        message: 'Note already added to your Harvous',
        createdIds: { noteId: existingCopy.id },
        warnings: [],
      });
    }

    let userMetadata = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));

    if (!userMetadata) {
      const existingNotes = await db
        .select({ simpleNoteId: Notes.simpleNoteId })
        .from(Notes)
        .where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId)))
        .orderBy(desc(Notes.simpleNoteId))
        .limit(1);

      const highestExistingId = existingNotes.length > 0 ? (existingNotes[0].simpleNoteId || 0) : 0;
      const season = getCurrentSeason();
      await db.insert(UserMetadata).values({
        id: `user_metadata_${auth.userId}`, userId: auth.userId,
        highestSimpleNoteId: highestExistingId, currentSeason: season, createdAt: nowISO(),
      });
      userMetadata = { id: `user_metadata_${auth.userId}`, userId: auth.userId, highestSimpleNoteId: highestExistingId, userColor: 'blue', firstName: null, lastName: null, email: null, profileImageUrl: null, clerkDataUpdatedAt: null, churchName: null, churchCity: null, churchState: null, currentSeason: season, lastMonthlyVisit: null, churchAddedAt: null, createdAt: nowISO(), updatedAt: null, referralCode: null, lockPinHash: null } as any;
    }

    const effectiveHighest = await getEffectiveHighestSimpleNoteId(auth.userId);
    const newNoteId = generateNoteId();
    let newSimpleNoteId = effectiveHighest + 1;
    const ts = nowISO();
    const myHomeSpaceId = await ensurePersonalHomeSpace(auth.userId);
    const transformedContent = transformCanonicalScriptureContent({
      noteId: newNoteId,
      content: sourceNote.content,
      translation: 'NET',
      pillsOnly: sourceNote.noteType !== 'scripture',
    }).updatedContent;
    const attribution = buildIndependentCopyAttribution({
      sourceNoteId: sourceNote.id,
      sourceVersionId: sourceNote.currentVersionId,
      sourceAuthorId: sourceNote.userId,
      sourceAuthorDisplayName: null,
    });
    const [sourceScriptureMeta, sourceResourceMeta] = await Promise.all([
      sourceNote.noteType === 'scripture'
        ? db.select().from(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, sourceNote.id)).limit(1).then(first)
        : Promise.resolve(undefined),
      sourceNote.noteType === 'resource'
        ? db.select().from(ResourceMetadata).where(eq(ResourceMetadata.noteId, sourceNote.id)).limit(1).then(first)
        : Promise.resolve(undefined),
    ]);
    await db.transaction(async (tx) => {
      const lockedMetadata = first(
        await tx
          .select()
          .from(UserMetadata)
          .where(eq(UserMetadata.userId, auth.userId))
          .for('update')
          .limit(1),
      );
      if (!lockedMetadata) throw new Error('User metadata missing during shared note import');
      newSimpleNoteId =
        Math.max(effectiveHighest, lockedMetadata.highestSimpleNoteId ?? 0) + 1;
      await tx.insert(Notes).values({
        id: newNoteId, title: sourceNote.title || null, content: transformedContent,
        threadId: 'thread_unorganized', spaceId: myHomeSpaceId, simpleNoteId: newSimpleNoteId,
        noteType: sourceNote.noteType || 'default', userId: auth.userId,
        isPublic: false, addedBy: 'shared', createdAt: ts, updatedAt: ts, lastVisited: ts,
        contentEncrypted: false,
        ...attribution,
      });
      await createInitialNoteVersion(tx, {
        noteId: newNoteId,
        noteAuthorId: auth.userId,
        content: {
          title: sourceNote.title || null,
          content: transformedContent,
          contentEncrypted: false,
        },
        createdAt: ts,
        source: 'shared-import',
      });
      if (sourceScriptureMeta) {
        await tx.insert(ScriptureMetadata).values({
          id: `scripture_${newNoteId}_${crypto.randomUUID()}`, noteId: newNoteId,
          reference: sourceScriptureMeta.reference, book: sourceScriptureMeta.book,
          chapter: sourceScriptureMeta.chapter, verse: sourceScriptureMeta.verse,
          verseEnd: sourceScriptureMeta.verseEnd || null, translation: sourceScriptureMeta.translation,
          originalText: sourceScriptureMeta.originalText, createdAt: ts,
        });
      }
      if (sourceResourceMeta) {
        await tx.insert(ResourceMetadata).values({
          id: `resource_${newNoteId}_${crypto.randomUUID()}`, noteId: newNoteId,
          sourceUrl: sourceResourceMeta.sourceUrl, sourceDomain: sourceResourceMeta.sourceDomain || null,
          sourceName: sourceResourceMeta.sourceName || null, sourceTitle: sourceResourceMeta.sourceTitle || null,
          sourceDescription: sourceResourceMeta.sourceDescription || null, sourceImage: sourceResourceMeta.sourceImage || null,
          createdAt: ts,
        });
      }
      await tx.update(UserMetadata).set({ highestSimpleNoteId: newSimpleNoteId, updatedAt: ts }).where(eq(UserMetadata.userId, auth.userId));
    });

    const warnings: string[] = [];
    try {
      await processScriptureReferences(newNoteId, auth.userId, 'thread_unorganized', transformedContent, 'NET', {
        pillsOnly: sourceNote.noteType !== 'scripture',
        persistParentContent: false,
      });
    } catch (error) {
      console.warn('[shared-import] durable note imported; scripture postprocessing failed', error);
      warnings.push('Scripture references will finish processing later.');
    }
    awardNoteCreatedXP(auth.userId, newNoteId, sourceNote.noteType === 'scripture', sourceNote.content || '').catch(() => {});

    return c.json({ success: true, message: 'Note added to your Harvous!', createdIds: { noteId: newNoteId }, warnings });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/shared/add-note-to-harvous', action: 'add_shared_note' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** POST /api/shared/add-to-harvous */
app.post('/api/shared/add-to-harvous', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const { shareToken } = await c.req.json();
    if (!shareToken) return c.json({ error: 'Share token is required' }, 400);
    if (!isValidShareToken(shareToken)) return c.json({ error: 'Invalid share token format' }, 400);

    const sourceThread = first(await db
      .select({
        id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, color: Threads.color,
        isPublic: Threads.isPublic, userId: Threads.userId, spaceId: Threads.spaceId,
      })
      .from(Threads)
      .where(and(eq(Threads.shareToken, shareToken), eq(Threads.isPublic, true)))
      .limit(1));

    if (!sourceThread) return c.json({ error: 'Shared thread not found or no longer available' }, 404);
    if (sourceThread.spaceId) {
      const contextSpace = first(
        await db.select({ type: Spaces.type, deletedAt: Spaces.deletedAt })
          .from(Spaces)
          .where(eq(Spaces.id, sourceThread.spaceId))
          .limit(1),
      );
      if (!contextSpace || contextSpace.deletedAt || contextSpace.type !== 'personal') {
        return c.json({ error: 'Shared thread not found or no longer available' }, 404);
      }
    }

    if (sourceThread.userId === auth.userId) {
      return c.json({ error: 'Already in your Harvous' }, 400);
    }

    // Fetch source notes (junction + referenced scripture notes)
    const junctionNotes = await db
      .select({
        id: Notes.id, title: Notes.title, content: Notes.content, noteType: Notes.noteType,
        createdAt: Notes.createdAt, userId: Notes.userId, currentVersionId: Notes.currentVersionId,
      })
      .from(Notes)
      .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(eq(NoteThreads.threadId, sourceThread.id), eq(Notes.contentEncrypted, false)))
      .orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited),
        desc(Notes.updatedAt),
        desc(Notes.createdAt),
        asc(Notes.id)
      );

    // Also include referenced scripture notes
    const junctionNoteIds = junctionNotes.map(n => n.id).filter(Boolean);
    let referencedScripture: typeof junctionNotes = [];
    if (junctionNoteIds.length > 0) {
      const refs = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
        .from(NoteScriptureReferences)
        .innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
        .where(and(
          inArray(NoteScriptureReferences.noteId, junctionNoteIds),
          eq(Notes.userId, sourceThread.userId),
          eq(Notes.noteType, 'scripture')
        ));
      const uniqueIds = [...new Set(refs.map(r => r.scriptureNoteId))];
      const alreadyIds = new Set(junctionNotes.filter(n => n.noteType === 'scripture').map(n => n.id));
      const additionalIds = uniqueIds.filter(id => !alreadyIds.has(id));
      if (additionalIds.length > 0) {
        referencedScripture = await db.select({
          id: Notes.id, title: Notes.title, content: Notes.content, noteType: Notes.noteType,
          createdAt: Notes.createdAt, userId: Notes.userId, currentVersionId: Notes.currentVersionId,
        })
          .from(Notes).where(and(inArray(Notes.id, additionalIds), eq(Notes.userId, sourceThread.userId), eq(Notes.noteType, 'scripture'), eq(Notes.contentEncrypted, false)));
      }
    }
    const srcMap = new Map<string, (typeof junctionNotes)[0]>();
    [...junctionNotes, ...referencedScripture].forEach(n => { if (n.id && !srcMap.has(n.id)) srcMap.set(n.id, n); });
    const sourceNotes = Array.from(srcMap.values());

    const sourceNoteIdsForMeta = sourceNotes.map((n) => n.id).filter(Boolean) as string[];
    const [sourceScriptureMetaRows, sourceResourceMetaRows, sourceReferenceRows] = await Promise.all([
      sourceNoteIdsForMeta.length > 0
        ? db.select().from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, sourceNoteIdsForMeta))
        : Promise.resolve([] as (typeof ScriptureMetadata.$inferSelect)[]),
      sourceNoteIdsForMeta.length > 0
        ? db.select().from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, sourceNoteIdsForMeta))
        : Promise.resolve([] as (typeof ResourceMetadata.$inferSelect)[]),
      sourceNoteIdsForMeta.length > 0
        ? db
            .select({
              noteId: NoteScriptureReferences.noteId,
              scriptureNoteId: NoteScriptureReferences.scriptureNoteId,
            })
            .from(NoteScriptureReferences)
            .where(inArray(NoteScriptureReferences.noteId, sourceNoteIdsForMeta))
        : Promise.resolve([] as Array<{ noteId: string; scriptureNoteId: string }>),
    ]);
    const scriptureMetaBySourceNoteId = new Map(sourceScriptureMetaRows.map((m) => [m.noteId, m]));
    const resourceMetaBySourceNoteId = new Map(sourceResourceMetaRows.map((m) => [m.noteId, m]));

    // Create new thread
    const newThreadId = generateThreadId();
    const ts = nowISO();

    // Get user metadata for simpleNoteId tracking
    let userMetadata = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));

    if (!userMetadata) {
      const existingNotes = await db
        .select({ simpleNoteId: Notes.simpleNoteId })
        .from(Notes)
        .where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId)))
        .orderBy(desc(Notes.simpleNoteId))
        .limit(1);

      const highestExistingId = existingNotes.length > 0 ? (existingNotes[0].simpleNoteId || 0) : 0;
      const season = getCurrentSeason();
      await db.insert(UserMetadata).values({
        id: `user_metadata_${auth.userId}`, userId: auth.userId,
        highestSimpleNoteId: highestExistingId, currentSeason: season, createdAt: nowISO(),
      });
      userMetadata = { id: `user_metadata_${auth.userId}`, userId: auth.userId, highestSimpleNoteId: highestExistingId } as any;
    }

    const effectiveHighest = await getEffectiveHighestSimpleNoteId(auth.userId);
    const myHomeSpaceId = await ensurePersonalHomeSpace(auth.userId);
    const createdNoteIds: string[] = [];
    const sourceToNewNoteId = new Map<string, string>();
    let currentSimpleNoteId = effectiveHighest + 1;
    const baseTimestamp = Date.now();

    type NoteInsert = typeof Notes.$inferInsert;
    const noteRows: NoteInsert[] = [];
    const junctionRows: { id: string; noteId: string; threadId: string; createdAt: Date }[] = [];
    const scriptureRows: (typeof ScriptureMetadata.$inferInsert)[] = [];
    const resourceRows: (typeof ResourceMetadata.$inferInsert)[] = [];
    const xpItems: Array<{ noteId: string; isScripture: boolean; content: string }> = [];

    for (let noteIndex = 0; noteIndex < sourceNotes.length; noteIndex++) {
      const note = sourceNotes[noteIndex];
      const noteTimestamp = new Date(baseTimestamp + noteIndex);
      const newNoteId = generateNoteId();
      if (note.id) sourceToNewNoteId.set(note.id, newNoteId);
      const copiedContent = transformCanonicalScriptureContent({
        noteId: newNoteId,
        content: note.content ?? '',
        translation: 'NET',
        pillsOnly: note.noteType !== 'scripture',
      }).updatedContent;

      noteRows.push({
        id: newNoteId,
        title: note.title || null,
        content: copiedContent,
        threadId: newThreadId,
        spaceId: myHomeSpaceId,
        simpleNoteId: currentSimpleNoteId,
        noteType: note.noteType || 'default',
        userId: auth.userId,
        isPublic: false,
        addedBy: 'shared',
        createdAt: noteTimestamp,
        lastVisited: note.noteType === 'scripture' ? null : noteTimestamp,
        contentEncrypted: false,
        ...buildIndependentCopyAttribution({
          sourceNoteId: note.id,
          sourceVersionId: note.currentVersionId,
          sourceAuthorId: note.userId,
          sourceAuthorDisplayName: null,
        }),
      });

      junctionRows.push({
        id: `note-thread-${newNoteId}-${baseTimestamp + noteIndex}-${Math.random().toString(36).substr(2, 9)}`,
        noteId: newNoteId,
        threadId: newThreadId,
        createdAt: ts,
      });

      if (note.noteType === 'scripture' && note.id) {
        const sourceScriptureMeta = scriptureMetaBySourceNoteId.get(note.id);
        if (sourceScriptureMeta) {
          scriptureRows.push({
            id: `scripture_${newNoteId}_${baseTimestamp + noteIndex}_${Math.random().toString(36).slice(2, 11)}`,
            noteId: newNoteId,
            reference: sourceScriptureMeta.reference,
            book: sourceScriptureMeta.book,
            chapter: sourceScriptureMeta.chapter,
            verse: sourceScriptureMeta.verse,
            verseEnd: sourceScriptureMeta.verseEnd || null,
            translation: sourceScriptureMeta.translation,
            originalText: sourceScriptureMeta.originalText,
            createdAt: ts,
          });
        }
      }

      if (note.noteType === 'resource' && note.id) {
        const sourceResourceMeta = resourceMetaBySourceNoteId.get(note.id);
        if (sourceResourceMeta) {
          resourceRows.push({
            id: `resource_${newNoteId}_${baseTimestamp + noteIndex}_${Math.random().toString(36).slice(2, 11)}`,
            noteId: newNoteId,
            sourceUrl: sourceResourceMeta.sourceUrl,
            sourceDomain: sourceResourceMeta.sourceDomain || null,
            sourceName: sourceResourceMeta.sourceName || null,
            sourceTitle: sourceResourceMeta.sourceTitle || null,
            sourceDescription: sourceResourceMeta.sourceDescription || null,
            sourceImage: sourceResourceMeta.sourceImage || null,
            createdAt: ts,
          });
        }
      }

      xpItems.push({
        noteId: newNoteId,
        isScripture: note.noteType === 'scripture',
        content: note.content || '',
      });
      createdNoteIds.push(newNoteId);
      currentSimpleNoteId++;
    }
    const copiedReferenceRows: (typeof NoteScriptureReferences.$inferInsert)[] = [];
    const seenCopiedReferencePairs = new Set<string>();
    for (const sourceReference of sourceReferenceRows) {
      const newParentId = sourceToNewNoteId.get(sourceReference.noteId);
      const newScriptureId = sourceToNewNoteId.get(sourceReference.scriptureNoteId);
      if (!newParentId || !newScriptureId) continue;
      const pairKey = `${newParentId}:${newScriptureId}`;
      if (seenCopiedReferencePairs.has(pairKey)) continue;
      seenCopiedReferencePairs.add(pairKey);
      copiedReferenceRows.push({
        id: `note-scripture-${newParentId}-${newScriptureId}-${crypto.randomUUID()}`,
        noteId: newParentId,
        scriptureNoteId: newScriptureId,
        createdAt: ts,
      });
    }

    await db.transaction(async (tx) => {
      const lockedMetadata = first(
        await tx
          .select()
          .from(UserMetadata)
          .where(eq(UserMetadata.userId, auth.userId))
          .for('update')
          .limit(1),
      );
      if (!lockedMetadata) throw new Error('User metadata missing during shared thread import');
      await tx.insert(Threads).values({
        id: newThreadId, title: sourceThread.title, subtitle: sourceThread.subtitle || null,
        spaceId: null, userId: auth.userId, isPublic: false,
        color: sourceThread.color || 'paper', createdAt: ts, updatedAt: ts, lastVisited: ts,
      });
      const firstSimpleNoteId =
        Math.max(effectiveHighest, lockedMetadata.highestSimpleNoteId ?? 0) + 1;
      noteRows.forEach((row, index) => {
        row.simpleNoteId = firstSimpleNoteId + index;
      });
      currentSimpleNoteId = firstSimpleNoteId + noteRows.length;
      for (let i = 0; i < noteRows.length; i += SHARED_BULK_INSERT_CHUNK) {
        await tx.insert(Notes).values(noteRows.slice(i, i + SHARED_BULK_INSERT_CHUNK));
      }
      for (const row of noteRows) {
        await createInitialNoteVersion(tx, {
          noteId: row.id,
          noteAuthorId: auth.userId,
          content: {
            title: row.title ?? null,
            content: row.content ?? '',
            contentEncrypted: false,
          },
          createdAt: row.createdAt,
          source: 'shared-thread-import',
        });
      }
      for (let i = 0; i < junctionRows.length; i += SHARED_BULK_INSERT_CHUNK) {
        await tx.insert(NoteThreads).values(junctionRows.slice(i, i + SHARED_BULK_INSERT_CHUNK));
      }
      for (let i = 0; i < scriptureRows.length; i += SHARED_BULK_INSERT_CHUNK) {
        await tx.insert(ScriptureMetadata).values(scriptureRows.slice(i, i + SHARED_BULK_INSERT_CHUNK));
      }
      for (let i = 0; i < resourceRows.length; i += SHARED_BULK_INSERT_CHUNK) {
        await tx.insert(ResourceMetadata).values(resourceRows.slice(i, i + SHARED_BULK_INSERT_CHUNK));
      }
      for (let i = 0; i < copiedReferenceRows.length; i += SHARED_BULK_INSERT_CHUNK) {
        await tx
          .insert(NoteScriptureReferences)
          .values(copiedReferenceRows.slice(i, i + SHARED_BULK_INSERT_CHUNK));
      }
      if (sourceNotes.length > 0) {
        await tx.update(UserMetadata).set({ highestSimpleNoteId: currentSimpleNoteId - 1, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
      }
    });

    const warnings: string[] = [];
    for (const row of noteRows) {
      if (!row.contentEncrypted && row.content) {
        try {
          await processScriptureReferences(
            row.id,
            auth.userId,
            newThreadId,
            row.content,
            'NET',
            {
              pillsOnly: row.noteType !== 'scripture',
              persistParentContent: false,
            },
          );
        } catch (error) {
          console.warn('[shared-thread-import] durable import succeeded; scripture postprocessing failed', {
            noteId: row.id,
            error,
          });
          warnings.push(`Scripture references for ${row.id} will finish processing later.`);
        }
      }
    }

    try {
      await awardNoteCreatedXPInBatches(auth.userId, xpItems, XP_AWARD_CONCURRENCY);
      await awardThreadCreatedXP(auth.userId, newThreadId, sourceThread.title, sourceThread.subtitle || null);
    } catch (error) {
      console.warn('[shared-thread-import] XP postprocessing failed', error);
    }

    const threadColor = sourceThread.color || 'paper';
    return c.json({
      success: true,
      message: 'Thread added to your Harvous!',
      createdIds: { threadId: newThreadId, noteIds: createdNoteIds },
      warnings,
      thread: {
        id: newThreadId,
        title: sourceThread.title,
        color: threadColor,
        backgroundGradient: getThreadGradientCSS(threadColor),
        noteCount: createdNoteIds.length,
        spaceId: null,
        isPublic: false,
      },
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/shared/add-to-harvous', action: 'add_shared_thread' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── Invitations ────────────────────────────────────────────────────

// ─── Legacy v1 email-invitation routes (SpaceInvitations) — retired ─────────
// Superseded by GET /api/spaces/invite-preview/:token + POST /api/spaces/invites/:token/redeem.
const invitationGone = (c: any) =>
  c.json({ error: 'This invitation link is no longer active. Ask the space owner for a new one.', code: 'GONE' }, 410);
app.get('/api/invitations/:token', invitationGone);
app.post('/api/invitations/:token/accept', invitationGone);
app.post('/api/invitations/:token/decline', invitationGone);

export default app;
