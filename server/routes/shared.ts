/**
 * Shared / Public routes + Invitations — Hono port
 *
 * Endpoints:
 *   GET  /api/shared/note/:shareToken
 *   GET  /api/shared/thread/:shareToken
 *   POST /api/shared/add-note-to-harvous
 *   POST /api/shared/add-to-harvous
 *   GET  /api/invitations/:token
 *   POST /api/invitations/:token/accept
 *   POST /api/invitations/:token/decline
 */

import { Hono } from 'hono';
import { getAuth, getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import {
  db, Notes, Threads, NoteThreads, UserMetadata, ScriptureMetadata, ResourceMetadata,
  SpaceInvitations, Spaces, Members,
  eq, and, desc, asc, isNotNull, count, sql,
  first,
} from '../db';
import { nowISO } from '../db/dates';
import { handleAPIError } from '@/utils/error-handling';
import { generateNoteId, generateThreadId, isValidShareToken } from '@/utils/ids';
import { getCurrentSeason } from '@/utils/season-helpers';
import { awardNoteCreatedXP, awardThreadCreatedXP } from '../utils/xp-system';
import { processScriptureReferences } from '../utils/process-scripture-references';
import { canJoinSpace, canOwnerAddOneMoreSharedSpace } from '../utils/tier-limits';
import { getEffectiveHighestSimpleNoteId } from '../utils/highest-simple-note-id';
import { rateLimit } from '@/utils/rate-limit';
import { idToUrl } from '@/utils/url-helpers';

const app = new Hono();

// ─── Shared Note / Thread (public GET) ──────────────────────────────

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
      .where(and(eq(Notes.shareToken, shareToken), eq(Notes.isPublic, true)))
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

    const firstName = creator?.firstName || '';
    const lastName = creator?.lastName || '';
    const firstInitial = firstName.charAt(0).toUpperCase();
    const lastInitial = lastName.charAt(0).toUpperCase();
    const initials = (firstInitial + lastInitial) || 'U';
    const displayName = firstName ? (lastName ? `${firstName} ${lastInitial}.` : firstName) : 'A Harvous User';

    return c.json({
      note: { id: note.id, title: note.title, content: note.content, noteType: note.noteType, createdAt: note.createdAt, updatedAt: note.updatedAt },
      scriptureMetadata,
      resourceMetadata,
      creator: { firstName, displayName, initials, userColor: creator?.userColor || 'blue', profileImageUrl: creator?.profileImageUrl || null },
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
        isPublic: Threads.isPublic, shareToken: Threads.shareToken, createdAt: Threads.createdAt, userId: Threads.userId,
      })
      .from(Threads)
      .where(and(eq(Threads.shareToken, shareToken), eq(Threads.isPublic, true)))
      .limit(1));

    if (!thread) return c.json({ error: 'Shared thread not found or no longer available' }, 404);

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

    const creator = first(await db
      .select({
        firstName: UserMetadata.firstName, lastName: UserMetadata.lastName,
        userColor: UserMetadata.userColor, profileImageUrl: UserMetadata.profileImageUrl,
      })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, thread.userId))
      .limit(1));

    const firstName = creator?.firstName || '';
    const lastName = creator?.lastName || '';
    const firstInitial = firstName.charAt(0).toUpperCase();
    const lastInitial = lastName.charAt(0).toUpperCase();
    const initials = (firstInitial + lastInitial) || 'U';
    const displayName = firstName ? (lastName ? `${firstName} ${lastInitial}.` : firstName) : 'A Harvous User';

    return c.json({
      thread: { id: thread.id, title: thread.title, subtitle: thread.subtitle, color: thread.color, createdAt: thread.createdAt },
      notes: notes.map((n) => ({ id: n.id, title: n.title, content: n.content, noteType: n.noteType, createdAt: n.createdAt })),
      creator: { firstName, displayName, initials, userColor: creator?.userColor || 'blue', profileImageUrl: creator?.profileImageUrl || null },
      meta: { noteCount: notes.length },
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
      .select({ id: Notes.id, title: Notes.title, content: Notes.content, noteType: Notes.noteType, isPublic: Notes.isPublic, userId: Notes.userId })
      .from(Notes)
      .where(and(eq(Notes.shareToken, shareToken), eq(Notes.isPublic, true)))
      .limit(1));

    if (!sourceNote) return c.json({ error: 'Shared note not found or no longer available' }, 404);

    if (process.env.NODE_ENV === 'production' && sourceNote.userId === auth.userId) {
      return c.json({ error: 'Already in your Harvous' }, 400);
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
    const newSimpleNoteId = effectiveHighest + 1;
    const ts = nowISO();

    await db.insert(Notes).values({
      id: newNoteId, title: sourceNote.title || null, content: sourceNote.content,
      threadId: 'thread_unorganized', spaceId: null, simpleNoteId: newSimpleNoteId,
      noteType: sourceNote.noteType || 'default', userId: auth.userId,
      isPublic: false, addedBy: 'shared', createdAt: ts, lastVisited: ts,
    });

    // Copy scripture metadata
    if (sourceNote.noteType === 'scripture') {
      const sourceScriptureMeta = first(await db.select().from(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, sourceNote.id)).limit(1));
      if (sourceScriptureMeta) {
        await db.insert(ScriptureMetadata).values({
          id: `scripture_${newNoteId}_${Date.now()}`, noteId: newNoteId,
          reference: sourceScriptureMeta.reference, book: sourceScriptureMeta.book,
          chapter: sourceScriptureMeta.chapter, verse: sourceScriptureMeta.verse,
          verseEnd: sourceScriptureMeta.verseEnd || null, translation: sourceScriptureMeta.translation,
          originalText: sourceScriptureMeta.originalText, createdAt: ts,
        });
      }
    }

    // Copy resource metadata
    if (sourceNote.noteType === 'resource') {
      const sourceResourceMeta = first(await db.select().from(ResourceMetadata).where(eq(ResourceMetadata.noteId, sourceNote.id)).limit(1));
      if (sourceResourceMeta) {
        await db.insert(ResourceMetadata).values({
          id: `resource_${newNoteId}_${Date.now()}`, noteId: newNoteId,
          sourceUrl: sourceResourceMeta.sourceUrl, sourceDomain: sourceResourceMeta.sourceDomain || null,
          sourceName: sourceResourceMeta.sourceName || null, sourceTitle: sourceResourceMeta.sourceTitle || null,
          sourceDescription: sourceResourceMeta.sourceDescription || null, sourceImage: sourceResourceMeta.sourceImage || null,
          createdAt: ts,
        });
      }
    }

    await db.update(UserMetadata).set({ highestSimpleNoteId: newSimpleNoteId, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));

    // Fire-and-forget: process scripture references + award XP
    processScriptureReferences(newNoteId, auth.userId, 'thread_unorganized', sourceNote.content).catch(() => {});
    awardNoteCreatedXP(auth.userId, newNoteId, sourceNote.noteType === 'scripture', sourceNote.content || '').catch(() => {});

    return c.json({ success: true, message: 'Note added to your Harvous!', createdIds: { noteId: newNoteId } });
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
      .select({ id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, color: Threads.color, isPublic: Threads.isPublic, userId: Threads.userId })
      .from(Threads)
      .where(and(eq(Threads.shareToken, shareToken), eq(Threads.isPublic, true)))
      .limit(1));

    if (!sourceThread) return c.json({ error: 'Shared thread not found or no longer available' }, 404);

    if (process.env.NODE_ENV === 'production' && sourceThread.userId === auth.userId) {
      return c.json({ error: 'Already in your Harvous' }, 400);
    }

    // Fetch source notes
    const sourceNotes = await db
      .select({ id: Notes.id, title: Notes.title, content: Notes.content, noteType: Notes.noteType, createdAt: Notes.createdAt })
      .from(Notes)
      .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(eq(NoteThreads.threadId, sourceThread.id))
      .orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited),
        desc(Notes.updatedAt),
        desc(Notes.createdAt),
        asc(Notes.id)
      )
      ;

    // Create new thread
    const newThreadId = generateThreadId();
    const ts = nowISO();

    await db.insert(Threads).values({
      id: newThreadId, title: sourceThread.title, subtitle: sourceThread.subtitle || null,
      spaceId: null, userId: auth.userId, isPublic: false,
      color: sourceThread.color || 'paper', createdAt: ts, updatedAt: ts, lastVisited: ts,
    });

    awardThreadCreatedXP(auth.userId, newThreadId, sourceThread.title, sourceThread.subtitle || null).catch(() => {});

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
    const createdNoteIds: string[] = [];
    let currentSimpleNoteId = effectiveHighest + 1;
    const baseTimestamp = Date.now();

    for (let noteIndex = 0; noteIndex < sourceNotes.length; noteIndex++) {
      const note = sourceNotes[noteIndex];
      const noteTimestamp = new Date(baseTimestamp + noteIndex);

      const newNoteId = generateNoteId();

      await db.insert(Notes).values({
        id: newNoteId, title: note.title || null, content: note.content,
        threadId: newThreadId, spaceId: null, simpleNoteId: currentSimpleNoteId,
        noteType: note.noteType || 'default', userId: auth.userId,
        isPublic: false, addedBy: 'shared', createdAt: noteTimestamp, lastVisited: noteTimestamp,
      });

      const junctionId = `note-thread-${newNoteId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await db.insert(NoteThreads).values({ id: junctionId, noteId: newNoteId, threadId: newThreadId, createdAt: nowISO() });

      awardNoteCreatedXP(auth.userId, newNoteId, note.noteType === 'scripture', note.content || '').catch(() => {});

      createdNoteIds.push(newNoteId);
      currentSimpleNoteId++;
    }

    if (sourceNotes.length > 0) {
      await db.update(UserMetadata).set({ highestSimpleNoteId: currentSimpleNoteId - 1, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
    }

    return c.json({ success: true, message: 'Thread added to your Harvous!', createdIds: { threadId: newThreadId, noteIds: createdNoteIds } });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/shared/add-to-harvous', action: 'add_shared_thread' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── Invitations ────────────────────────────────────────────────────

/** GET /api/invitations/:token */
app.get('/api/invitations/:token', async (c) => {
  try {
    const token = requireParam(c, 'token');

    const invitation = first(await db.select().from(SpaceInvitations).where(eq(SpaceInvitations.inviteToken, token)).limit(1));
    if (!invitation) return c.json({ error: 'Invitation not found', code: 'NOT_FOUND' }, 404);

    const isExpired = invitation.expiresAt && new Date() > new Date(invitation.expiresAt);

    if (invitation.status !== 'pending') {
      return c.json({ error: `This invitation has been ${invitation.status}`, code: 'INVITATION_NOT_PENDING' }, 410);
    }

    const space = first(await db.select().from(Spaces).where(eq(Spaces.id, invitation.spaceId)).limit(1));
    if (!space) return c.json({ error: 'Space not found', code: 'NOT_FOUND' }, 404);

    const inviter = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, invitation.invitedBy)).limit(1));
    const inviterFirst = inviter?.firstName || '';
    const inviterLastInitial = inviter?.lastName ? inviter.lastName.charAt(0).toUpperCase() : '';
    const inviterDisplayName = inviterFirst
      ? (inviterLastInitial ? `${inviterFirst} ${inviterLastInitial}.` : inviterFirst)
      : 'A Harvous User';

    const auth = getAuth(c);
    let alreadyMember = false;
    let canAccept = !isExpired;

    if (auth.userId) {
      if (space.userId === auth.userId) {
        alreadyMember = true;
        canAccept = false;
      } else {
        const existingMember = first(await db.select().from(Members).where(and(eq(Members.spaceId, invitation.spaceId), eq(Members.userId, auth.userId))).limit(1));
        if (existingMember) { alreadyMember = true; canAccept = false; }
      }
    }

    return c.json({
      success: true,
      data: {
        invitation: {
          spaceTitle: space.title, spaceColor: space.color || 'paper',
          invitedBy: { displayName: inviterDisplayName },
          message: invitation.message, expiresAt: invitation.expiresAt, isExpired, status: invitation.status,
        },
        canAccept, alreadyMember, requiresAuth: !auth.userId,
      },
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/invitations/[token]', action: 'view_invitation' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** POST /api/invitations/:token/accept */
app.post('/api/invitations/:token/accept', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const token = requireParam(c, 'token');

    const invitation = first(await db.select().from(SpaceInvitations).where(eq(SpaceInvitations.inviteToken, token)).limit(1));
    if (!invitation) return c.json({ error: 'Invitation not found', code: 'NOT_FOUND' }, 404);

    if (invitation.status !== 'pending') {
      return c.json({ error: `This invitation has already been ${invitation.status}`, code: 'INVITATION_NOT_PENDING' }, 410);
    }

    if (invitation.expiresAt && new Date() > new Date(invitation.expiresAt)) {
      await db.update(SpaceInvitations).set({ status: 'expired' }).where(eq(SpaceInvitations.id, invitation.id));
      return c.json({ error: 'This invitation has expired', code: 'INVITATION_EXPIRED' }, 410);
    }

    const space = first(await db.select().from(Spaces).where(eq(Spaces.id, invitation.spaceId)).limit(1));
    if (!space) return c.json({ error: 'Space not found', code: 'NOT_FOUND' }, 404);

    if (space.userId === auth.userId) {
      return c.json({ error: 'You are already the owner of this space', code: 'ALREADY_OWNER' }, 400);
    }

    const existingMember = first(await db.select().from(Members).where(and(eq(Members.spaceId, invitation.spaceId), eq(Members.userId, auth.userId))).limit(1));
    if (existingMember) {
      await db.update(SpaceInvitations).set({ status: 'accepted', acceptedAt: nowISO() }).where(eq(SpaceInvitations.id, invitation.id));
      return c.json({ error: 'You are already a member of this space', code: 'ALREADY_MEMBER' }, 400);
    }

    const canJoin = await canJoinSpace(auth.userId, auth);
    if (!canJoin.allowed) {
      return c.json({ error: canJoin.reason || 'Cannot join more spaces', code: 'FORBIDDEN' }, 403);
    }

    const canAddShared = await canOwnerAddOneMoreSharedSpace(space.userId, invitation.spaceId);
    if (!canAddShared.allowed) {
      return c.json({ error: canAddShared.reason || "You've used all your shared spaces. Upgrade for unlimited.", code: 'FORBIDDEN' }, 403);
    }

    const member = first(await db.insert(Members).values({
      id: `member_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId: auth.userId, spaceId: invitation.spaceId,
      role: invitation.role || 'member', createdAt: nowISO(),
    }).returning())!;

    await db.update(SpaceInvitations).set({ status: 'accepted', acceptedAt: nowISO() }).where(eq(SpaceInvitations.id, invitation.id));

    return c.json({
      success: true,
      data: { success: true, space: { id: space.id, title: space.title, color: space.color }, redirectUrl: idToUrl(space.id), member },
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/invitations/[token]/accept', action: 'accept_invitation' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** POST /api/invitations/:token/decline */
app.post('/api/invitations/:token/decline', async (c) => {
  try {
    const token = requireParam(c, 'token');

    const invitation = first(await db.select().from(SpaceInvitations).where(eq(SpaceInvitations.inviteToken, token)).limit(1));
    if (!invitation) return c.json({ error: 'Invitation not found', code: 'NOT_FOUND' }, 404);

    if (invitation.status !== 'pending') {
      return c.json({ error: `This invitation has already been ${invitation.status}`, code: 'INVITATION_NOT_PENDING' }, 410);
    }

    await db.update(SpaceInvitations).set({ status: 'declined' }).where(eq(SpaceInvitations.id, invitation.id));

    return c.json({ success: true, data: { success: true, message: 'Invitation declined' } });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/invitations/[token]/decline', action: 'decline_invitation' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
