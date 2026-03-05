/**
 * Inbox routes — Hono port
 *
 * Endpoints:
 *   POST /api/inbox/archive
 *   POST /api/inbox/unarchive
 *   GET  /api/inbox/preview
 *   POST /api/inbox/add-to-harvous
 *   POST /api/inbox/auto-archive
 *   GET  /api/inbox/auto-archive
 *   POST /api/inbox/auto-delete
 *   GET  /api/inbox/auto-delete
 *   POST /api/inbox/assign-to-users
 *   POST /api/inbox/reset-all-users
 *   GET  /api/inbox/reset-all-users
 */

import { Hono } from 'hono';
import { getAuth, getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import {
  db,
  InboxItems,
  InboxItemNotes,
  UserInboxItems,
  UserMetadata,
  Notes,
  Threads,
  NoteThreads,
  eq,
  and,
  lt,
  or,
  isNull,
  isNotNull,
  desc,
} from '../db';
import { nowISO } from '../db/dates';
import { rateLimit } from '@/utils/rate-limit';
import { generateNoteId, generateThreadId } from '@/utils/ids';
import { getCurrentSeason } from '@/utils/season-helpers';
import { THREAD_COLORS, getRandomThreadColor } from '@/utils/colors';
import { awardNoteCreatedXP, awardThreadCreatedXP } from '../utils/xp-system';
import { getInboxItemWithNotes } from '../utils/inbox-data';
import { ensureUnorganizedThread } from '../utils/unorganized-thread';
import { getEffectiveHighestSimpleNoteId } from '../utils/highest-simple-note-id';
import { verifyInboxItemInWebflow } from '@/utils/webflow-verification';

const app = new Hono();

// ─── Helpers ──────────────────────────────────────────────────────────

// Reverse color mapping: convert long color names (from Webflow) to short names (for Threads)
const REVERSE_COLOR_MAP: Record<string, string> = {
  'blessed-blue': 'blue',
  'graceful-gold': 'yellow',
  'mindful-mint': 'green',
  'pleasant-peach': 'orange',
  'peaceful-pink': 'pink',
  'lovely-lavender': 'purple',
  'paper': 'paper',
  'blue': 'blue',
  'yellow': 'yellow',
  'green': 'green',
  'orange': 'orange',
  'pink': 'pink',
  'purple': 'purple',
};

function convertInboxColorToThreadColor(inboxColor: string | null | undefined): string | null {
  if (!inboxColor) return null;
  if (THREAD_COLORS.includes(inboxColor as any)) return inboxColor;
  const mappedColor = REVERSE_COLOR_MAP[inboxColor.toLowerCase()];
  if (mappedColor && THREAD_COLORS.includes(mappedColor as any)) return mappedColor;
  return null;
}

// ─── POST /api/inbox/archive ──────────────────────────────────────────

app.post('/api/inbox/archive', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const { inboxItemId } = await c.req.json();
    if (!inboxItemId) return c.json({ error: 'inboxItemId is required' }, 400);

    const userInboxItem = await db
      .select({ userInboxItem: UserInboxItems, inboxItem: InboxItems })
      .from(UserInboxItems)
      .innerJoin(InboxItems, eq(UserInboxItems.inboxItemId, InboxItems.id))
      .where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId)))
      .get();

    if (!userInboxItem) return c.json({ error: 'Inbox item not found in your inbox' }, 404);

    await db.update(UserInboxItems)
      .set({ status: 'archived', archivedAt: nowISO() })
      .where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId)));

    return c.json({ success: true, message: 'Item archived', contentType: userInboxItem.inboxItem.contentType });
  } catch (error: any) {
    console.error('Error archiving inbox item:', error);
    return c.json({ error: 'Failed to archive inbox item', details: error.message }, 500);
  }
});

// ─── POST /api/inbox/unarchive ────────────────────────────────────────

app.post('/api/inbox/unarchive', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const { inboxItemId } = await c.req.json();
    if (!inboxItemId) return c.json({ error: 'inboxItemId is required' }, 400);

    const userInboxItem = await db
      .select({ userInboxItem: UserInboxItems, inboxItem: InboxItems })
      .from(UserInboxItems)
      .innerJoin(InboxItems, eq(UserInboxItems.inboxItemId, InboxItems.id))
      .where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId)))
      .get();

    if (!userInboxItem) return c.json({ error: 'Inbox item not found in your inbox' }, 404);
    if (userInboxItem.userInboxItem.status !== 'archived') {
      return c.json({ error: 'Item is not archived' }, 400);
    }

    await db.update(UserInboxItems)
      .set({ status: 'inbox', archivedAt: null })
      .where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId)));

    await db.update(InboxItems)
      .set({ isActive: true, updatedAt: nowISO() })
      .where(eq(InboxItems.id, inboxItemId));

    return c.json({ success: true, message: 'Item unarchived', contentType: userInboxItem.inboxItem.contentType });
  } catch (error: any) {
    console.error('Error unarchiving inbox item:', error);
    return c.json({ error: 'Failed to unarchive inbox item', details: error.message }, 500);
  }
});

// ─── GET /api/inbox/preview ───────────────────────────────────────────

app.get('/api/inbox/preview', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const inboxItemId = c.req.query('inboxItemId');
    if (!inboxItemId) return c.json({ error: 'inboxItemId is required' }, 400);

    const inboxItem = await getInboxItemWithNotes(inboxItemId);
    if (!inboxItem) return c.json({ error: 'Inbox item not found' }, 404);

    const userInboxItem = await db
      .select()
      .from(UserInboxItems)
      .where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId)))
      .get();

    const userStatus = userInboxItem?.status || null;

    return c.json({ success: true, item: { ...inboxItem, userStatus } });
  } catch (error: any) {
    console.error('Error fetching inbox item preview:', error);
    return c.json({ error: 'Failed to fetch inbox item preview', details: error.message }, 500);
  }
});

// ─── POST /api/inbox/add-to-harvous ──────────────────────────────────

app.post('/api/inbox/add-to-harvous', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const { inboxItemId, targetThreadId, targetSpaceId } = await c.req.json();
    if (!inboxItemId) return c.json({ error: 'inboxItemId is required' }, 400);

    const inboxItem = await getInboxItemWithNotes(inboxItemId);
    if (!inboxItem) return c.json({ error: 'Inbox item not found' }, 404);

    const userInboxItem = await db
      .select()
      .from(UserInboxItems)
      .where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId)))
      .get();
    if (!userInboxItem) return c.json({ error: 'Inbox item not found in your inbox' }, 404);

    await ensureUnorganizedThread(auth.userId);

    const createdIds: { threadId?: string; noteIds: string[] } = { noteIds: [] };

    if (inboxItem.contentType === 'note') {
      // Get or create user metadata for simpleNoteId
      let userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();

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
          id: `user_metadata_${auth.userId}`,
          userId: auth.userId,
          highestSimpleNoteId: highestExistingId,
          currentSeason: season,
          createdAt: nowISO(),
        });
        userMetadata = {
          id: `user_metadata_${auth.userId}`,
          userId: auth.userId,
          highestSimpleNoteId: highestExistingId,
          userColor: 'blue',
          firstName: null,
          lastName: null,
          email: null,
          profileImageUrl: null,
          clerkDataUpdatedAt: null,
          churchName: null,
          churchCity: null,
          churchState: null,
          churchCountry: null,
          currentSeason: season,
          lastMonthlyVisit: null,
          churchAddedAt: null,
          createdAt: nowISO(),
          updatedAt: null,
        } as any;
      }

      const effectiveHighest = await getEffectiveHighestSimpleNoteId(auth.userId);
      const nextSimpleNoteId: number = effectiveHighest + 1;
      const finalThreadId = targetThreadId || 'thread_unorganized';
      const now = nowISO();

      const newNote = await db.insert(Notes)
        .values({
          id: generateNoteId(),
          title: inboxItem.title || null,
          content: inboxItem.content || '',
          threadId: finalThreadId,
          spaceId: targetSpaceId || null,
          simpleNoteId: nextSimpleNoteId,
          userId: auth.userId,
          isPublic: false,
          addedBy: 'harvous',
          createdAt: now,
          lastVisited: now,
        })
        .returning()
        .get();

      await db.update(UserMetadata)
        .set({ highestSimpleNoteId: nextSimpleNoteId, updatedAt: nowISO() })
        .where(eq(UserMetadata.userId, auth.userId));

      const isScriptureNote = newNote.noteType === 'scripture';
      awardNoteCreatedXP(auth.userId, newNote.id, isScriptureNote, newNote.content || '').catch(() => {});

      createdIds.noteIds.push(newNote.id);
    } else if (inboxItem.contentType === 'thread') {
      const newThreadId = generateThreadId();
      const threadColor = convertInboxColorToThreadColor(inboxItem.color) || getRandomThreadColor();
      const threadNow = nowISO();

      const newThread = await db.insert(Threads)
        .values({
          id: newThreadId,
          title: inboxItem.title,
          subtitle: inboxItem.subtitle || null,
          spaceId: targetSpaceId || null,
          userId: auth.userId,
          isPublic: false,
          color: threadColor,
          createdAt: threadNow,
          updatedAt: threadNow,
          lastVisited: threadNow,
        })
        .returning()
        .get();

      awardThreadCreatedXP(auth.userId, newThreadId, newThread.title, newThread.subtitle || null).catch(() => {});
      createdIds.threadId = newThreadId;

      // Get or create user metadata
      let userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();

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
          id: `user_metadata_${auth.userId}`,
          userId: auth.userId,
          highestSimpleNoteId: highestExistingId,
          currentSeason: season,
          createdAt: nowISO(),
        });
        userMetadata = {
          id: `user_metadata_${auth.userId}`,
          userId: auth.userId,
          highestSimpleNoteId: highestExistingId,
          userColor: 'blue',
          firstName: null,
          lastName: null,
          email: null,
          profileImageUrl: null,
          clerkDataUpdatedAt: null,
          churchName: null,
          churchCity: null,
          churchState: null,
          churchCountry: null,
          currentSeason: season,
          lastMonthlyVisit: null,
          churchAddedAt: null,
          createdAt: nowISO(),
          updatedAt: null,
        } as any;
      }

      const effectiveHighest = await getEffectiveHighestSimpleNoteId(auth.userId);
      const notes = inboxItem.notes || [];
      let currentSimpleNoteId: number = effectiveHighest + 1;
      const baseTimestamp = Date.now();

      for (let noteIndex = 0; noteIndex < notes.length; noteIndex++) {
        const note = notes[noteIndex];
        const noteTimestamp = new Date(baseTimestamp + noteIndex).toISOString();

        const newNote = await db.insert(Notes)
          .values({
            id: generateNoteId(),
            title: note.title || null,
            content: note.content,
            threadId: newThreadId,
            spaceId: targetSpaceId || null,
            simpleNoteId: currentSimpleNoteId,
            userId: auth.userId,
            isPublic: false,
            addedBy: 'harvous',
            createdAt: noteTimestamp,
            lastVisited: noteTimestamp,
          })
          .returning()
          .get();

        const junctionId = `note-thread-${newNote.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        try {
          await db.insert(NoteThreads).values({
            id: junctionId,
            noteId: newNote.id,
            threadId: newThreadId,
            createdAt: nowISO(),
          });

          const verifyJunction = await db.select().from(NoteThreads)
            .where(and(eq(NoteThreads.noteId, newNote.id), eq(NoteThreads.threadId, newThreadId)))
            .get();
          if (!verifyJunction) {
            console.error(`Junction entry verification failed: note ${newNote.id} -> thread ${newThreadId}`);
          }
        } catch (junctionError: any) {
          console.error(`Error creating junction entry for note ${newNote.id}:`, junctionError);
          throw new Error(`Failed to link note to thread: ${junctionError.message}`);
        }

        const isScriptureNote = newNote.noteType === 'scripture';
        awardNoteCreatedXP(auth.userId, newNote.id, isScriptureNote, newNote.content || '').catch(() => {});
        createdIds.noteIds.push(newNote.id);
        currentSimpleNoteId++;
      }

      await db.update(UserMetadata)
        .set({ highestSimpleNoteId: currentSimpleNoteId - 1, updatedAt: nowISO() })
        .where(eq(UserMetadata.userId, auth.userId));

      await db.update(Threads)
        .set({ updatedAt: nowISO() })
        .where(and(eq(Threads.id, newThreadId), eq(Threads.userId, auth.userId)));
    }

    // Update UserInboxItems status to 'added'
    await db.update(UserInboxItems)
      .set({ status: 'added', addedAt: nowISO() })
      .where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId)));

    return c.json({
      success: true,
      message: inboxItem.contentType === 'thread'
        ? 'Thread added to your Harvous!'
        : 'Note added to your Harvous!',
      createdIds,
    });
  } catch (error: any) {
    console.error('Error adding inbox item to Harvous:', error);
    return c.json({ error: 'Failed to add inbox item to Harvous', details: error.message }, 500);
  }
});

// ─── POST/GET /api/inbox/auto-archive ─────────────────────────────────

async function handleAutoArchive(c: any) {
  try {
    const authHeader = c.req.header('authorization');
    const expectedToken = process.env.AUTO_ARCHIVE_SECRET_TOKEN;
    const auth = getAuth(c);
    const isAuthenticated = !!auth?.userId;
    const hasValidToken = expectedToken && authHeader === `Bearer ${expectedToken}`;

    if (expectedToken && !hasValidToken && !isAuthenticated) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    fourteenDaysAgo.setHours(0, 0, 0, 0);
    const fourteenDaysAgoISO = fourteenDaysAgo.toISOString();

    const conditions: any[] = [
      eq(UserInboxItems.status, 'inbox'),
      eq(InboxItems.isActive, true),
      lt(UserInboxItems.createdAt, fourteenDaysAgoISO),
    ];

    if (isAuthenticated && !hasValidToken) {
      conditions.push(eq(UserInboxItems.userId, auth.userId!));
    }

    const itemsToArchive = await db
      .select({ userInboxItem: UserInboxItems, inboxItem: InboxItems })
      .from(UserInboxItems)
      .innerJoin(InboxItems, eq(UserInboxItems.inboxItemId, InboxItems.id))
      .where(and(...conditions));

    let archivedCount = 0;
    const errors: string[] = [];

    for (const { userInboxItem } of itemsToArchive) {
      try {
        await db.update(UserInboxItems)
          .set({ status: 'archived', archivedAt: nowISO() })
          .where(eq(UserInboxItems.id, userInboxItem.id));
        archivedCount++;
      } catch (error: any) {
        console.error(`Error archiving item ${userInboxItem.id}:`, error);
        errors.push(`Failed to archive ${userInboxItem.id}: ${error.message}`);
      }
    }

    return c.json({
      success: true,
      message: `Auto-archived ${archivedCount} item(s)`,
      archivedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Error in auto-archive:', error);
    return c.json({ error: 'Failed to auto-archive items', details: error.message }, 500);
  }
}

app.post('/api/inbox/auto-archive', handleAutoArchive);
app.get('/api/inbox/auto-archive', handleAutoArchive);

// ─── POST/GET /api/inbox/auto-delete ──────────────────────────────────

async function handleAutoDelete(c: any) {
  try {
    const authHeader = c.req.header('authorization');
    const expectedToken = process.env.AUTO_ARCHIVE_SECRET_TOKEN;
    const auth = getAuth(c);
    const isAuthenticated = !!auth?.userId;
    const hasValidToken = expectedToken && authHeader === `Bearer ${expectedToken}`;

    if (expectedToken && !hasValidToken && !isAuthenticated) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

    const fortyFourDaysAgo = new Date();
    fortyFourDaysAgo.setDate(fortyFourDaysAgo.getDate() - 44);
    fortyFourDaysAgo.setHours(0, 0, 0, 0);
    const fortyFourDaysAgoISO = fortyFourDaysAgo.toISOString();

    // Backfill missing archivedAt timestamps
    const backfillConditions: any[] = [
      eq(UserInboxItems.status, 'archived'),
      isNull(UserInboxItems.archivedAt),
    ];
    if (isAuthenticated && !hasValidToken) {
      backfillConditions.push(eq(UserInboxItems.userId, auth.userId!));
    }

    const itemsToBackfill = await db.select().from(UserInboxItems).where(and(...backfillConditions)).all();

    let backfilledCount = 0;
    for (const item of itemsToBackfill) {
      try {
        await db.update(UserInboxItems)
          .set({ archivedAt: item.createdAt })
          .where(eq(UserInboxItems.id, item.id));
        backfilledCount++;
      } catch (error: any) {
        console.error(`Error backfilling archivedAt for item ${item.id}:`, error);
      }
    }

    // Build query conditions for deletion
    const deleteConditions: any[] = [
      eq(UserInboxItems.status, 'archived'),
      or(
        lt(UserInboxItems.archivedAt, thirtyDaysAgoISO),
        and(isNull(UserInboxItems.archivedAt), lt(UserInboxItems.createdAt, fortyFourDaysAgoISO))
      ),
    ];
    if (isAuthenticated && !hasValidToken) {
      deleteConditions.push(eq(UserInboxItems.userId, auth.userId!));
    }

    const itemsToDelete = await db.select().from(UserInboxItems).where(and(...deleteConditions)).all();

    let deletedCount = 0;
    const errors: string[] = [];

    for (const userInboxItem of itemsToDelete) {
      try {
        await db.delete(UserInboxItems).where(eq(UserInboxItems.id, userInboxItem.id));
        deletedCount++;
      } catch (error: any) {
        console.error(`Error deleting archived item ${userInboxItem.id}:`, error);
        errors.push(`Failed to delete ${userInboxItem.id}: ${error.message}`);
      }
    }

    return c.json({
      success: true,
      message: `Auto-deleted ${deletedCount} archived item(s)`,
      deletedCount,
      backfilledCount: backfilledCount > 0 ? backfilledCount : undefined,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Error in auto-delete:', error);
    return c.json({ error: 'Failed to auto-delete archived items', details: error.message }, 500);
  }
}

app.post('/api/inbox/auto-delete', handleAutoDelete);
app.get('/api/inbox/auto-delete', handleAutoDelete);

// ─── POST /api/inbox/assign-to-users ──────────────────────────────────

app.post('/api/inbox/assign-to-users', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const allInboxItems = await db.select().from(InboxItems).where(eq(InboxItems.isActive, true)).all();
    const allUsers = await db.select().from(UserMetadata).all();

    let totalAssigned = 0;
    const results: string[] = [];

    for (const inboxItem of allInboxItems) {
      if (inboxItem.targetAudience !== 'all_users') continue;

      let assignedCount = 0;
      for (const user of allUsers) {
        const existing = await db.select().from(UserInboxItems)
          .where(and(eq(UserInboxItems.userId, user.userId), eq(UserInboxItems.inboxItemId, inboxItem.id)))
          .get();

        if (!existing) {
          await db.insert(UserInboxItems).values({
            id: `user_inbox_${user.userId}_${inboxItem.id}_${Date.now()}`,
            userId: user.userId,
            inboxItemId: inboxItem.id,
            status: 'inbox',
            createdAt: nowISO(),
          });
          assignedCount++;
        }
      }

      if (assignedCount > 0) {
        results.push(`${inboxItem.title}: assigned to ${assignedCount} user(s)`);
        totalAssigned += assignedCount;
      }
    }

    return c.json({
      success: true,
      message: 'Assigned inbox items to users',
      totalAssigned,
      itemsProcessed: allInboxItems.length,
      usersProcessed: allUsers.length,
      results,
    });
  } catch (error: any) {
    console.error('Error assigning inbox items:', error);
    return c.json({ error: 'Failed to assign inbox items', details: error.message }, 500);
  }
});

// ─── POST/GET /api/inbox/reset-all-users ──────────────────────────────

app.post('/api/inbox/reset-all-users', async (c) => {
  try {
    const authHeader = c.req.header('authorization');
    const expectedToken = process.env.INBOX_RESET_SECRET_TOKEN;

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Step 1: Clear all UserInboxItems
    const allUserInboxItems = await db.select().from(UserInboxItems).all();
    let clearedCount = 0;
    for (const userInboxItem of allUserInboxItems) {
      try {
        await db.delete(UserInboxItems).where(eq(UserInboxItems.id, userInboxItem.id));
        clearedCount++;
      } catch (error) {
        console.error(`Error deleting UserInboxItem ${userInboxItem.id}:`, error);
      }
    }

    // Step 2: Verify all InboxItems against Webflow
    const allInboxItems = await db.select().from(InboxItems).all();
    let verifiedCount = 0;
    let markedInactiveCount = 0;
    const validItems: string[] = [];
    const invalidItems: Array<{ id: string; reason: string }> = [];

    for (const inboxItem of allInboxItems) {
      if (!inboxItem.webflowItemId) {
        try {
          await db.update(InboxItems).set({ isActive: false, updatedAt: nowISO() }).where(eq(InboxItems.id, inboxItem.id));
          markedInactiveCount++;
          invalidItems.push({ id: inboxItem.id, reason: 'No webflowItemId' });
        } catch (error) {
          console.error(`Error marking item ${inboxItem.id} as inactive:`, error);
        }
        continue;
      }

      const verification = await verifyInboxItemInWebflow(inboxItem.webflowItemId);
      verifiedCount++;

      if (!verification.isValid) {
        try {
          await db.update(InboxItems).set({ isActive: false, updatedAt: nowISO() }).where(eq(InboxItems.id, inboxItem.id));
          markedInactiveCount++;
          invalidItems.push({ id: inboxItem.id, reason: verification.reason || 'Invalid' });
        } catch (error) {
          console.error(`Error marking item ${inboxItem.id} as inactive:`, error);
        }
      } else {
        if (!inboxItem.isActive) {
          await db.update(InboxItems).set({ isActive: true, updatedAt: nowISO() }).where(eq(InboxItems.id, inboxItem.id));
        }
        validItems.push(inboxItem.id);
      }
    }

    // Step 3: Reassign valid items to all users
    const allUsers = await db.select().from(UserMetadata).all();
    let totalAssigned = 0;
    const assignmentResults: string[] = [];

    for (const inboxItemId of validItems) {
      const inboxItem = await db.select().from(InboxItems).where(eq(InboxItems.id, inboxItemId)).get();
      if (!inboxItem || inboxItem.targetAudience !== 'all_users') continue;

      let assignedCount = 0;
      for (const user of allUsers) {
        try {
          await db.insert(UserInboxItems).values({
            id: `user_inbox_${user.userId}_${inboxItemId}_${Date.now()}`,
            userId: user.userId,
            inboxItemId: inboxItemId,
            status: 'inbox',
            createdAt: nowISO(),
          });
          assignedCount++;
          totalAssigned++;
        } catch (_error) {
          // Ignore duplicate key errors
        }
      }

      if (assignedCount > 0) {
        assignmentResults.push(`${inboxItem.title || inboxItemId}: assigned to ${assignedCount} user(s)`);
      }
    }

    return c.json({
      success: true,
      message: 'Clean reset completed',
      summary: {
        clearedUserInboxItems: clearedCount,
        verifiedItems: verifiedCount,
        validItems: validItems.length,
        markedInactive: markedInactiveCount,
        totalUsers: allUsers.length,
        totalAssigned: totalAssigned,
      },
      invalidItems: invalidItems.slice(0, 20),
      assignmentResults: assignmentResults.slice(0, 20),
    });
  } catch (error: any) {
    console.error('Error during clean reset:', error);
    return c.json({ error: 'Failed to reset inbox items', details: error.message }, 500);
  }
});

app.get('/api/inbox/reset-all-users', async (c) => {
  return c.json({
    message: 'Use POST method to reset inbox items',
    endpoint: '/api/inbox/reset-all-users',
    method: 'POST',
    note: 'Optional: Set INBOX_RESET_SECRET_TOKEN environment variable for authentication',
  });
});

export default app;
