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
  first,
  InboxItems,
  InboxItemNotes,
  UserInboxItems,
  UserMetadata,
  Notes,
  Threads,
  NoteThreads,
  Spaces,
  SpaceNotes,
  SpaceMemberships,
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
import { generateNoteId, generateSpaceId, generateThreadId, generateTimestampId } from '@/utils/ids';
import { getCurrentSeason } from '@/utils/season-helpers';
import { THREAD_COLORS, getRandomThreadColor } from '@/utils/colors';
import { awardNoteCreatedXP, awardThreadCreatedXP } from '../utils/xp-system';
import { getInboxItemWithNotes } from '../utils/inbox-data';
import { ensureUnorganizedThread } from '../utils/unorganized-thread';
import { verifyInboxItemInWebflow } from '@/utils/webflow-verification';
import { createInitialNoteVersion } from '../utils/note-version-service';
import {
  SpaceNoteAssociationError,
  assertCanAssociateCanonicalNote,
  buildSpaceNoteAssociation,
  resolveCreateThreadAttachment,
} from '../utils/space-note-associations';

const app = new Hono();

const INBOX_BULK_INSERT_CHUNK = 400;
const INBOX_XP_AWARD_CONCURRENCY = 8;

class InboxTargetError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: 400 | 403 | 404 | 409,
  ) {
    super(message);
    this.name = 'InboxTargetError';
  }
}

export function assertInboxThreadBundleTarget(input: {
  actorId: string;
  space: { userId: string; type: string; deletedAt: Date | null } | null;
}): void {
  if (!input.space) return;
  if (input.space.deletedAt) {
    throw new InboxTargetError('Space not found', 'SPACE_NOT_FOUND', 404);
  }
  if (input.space.userId !== input.actorId) {
    throw new InboxTargetError(
      input.space.type === 'personal'
        ? 'Target space not found'
        : 'Only the shared space owner can add a Thread bundle',
      input.space.type === 'personal' ? 'SPACE_NOT_FOUND' : 'SHARED_SPACE_OWNER_REQUIRED',
      input.space.type === 'personal' ? 404 : 403,
    );
  }
}

async function awardNoteCreatedXPInBatchesInbox(
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

    const userInboxItem = first(await db
      .select({ userInboxItem: UserInboxItems, inboxItem: InboxItems })
      .from(UserInboxItems)
      .innerJoin(InboxItems, eq(UserInboxItems.inboxItemId, InboxItems.id))
      .where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId)))
      .limit(1));

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

    const userInboxItem = first(await db
      .select({ userInboxItem: UserInboxItems, inboxItem: InboxItems })
      .from(UserInboxItems)
      .innerJoin(InboxItems, eq(UserInboxItems.inboxItemId, InboxItems.id))
      .where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId)))
      .limit(1));

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

    const userInboxItem = first(await db
      .select()
      .from(UserInboxItems)
      .where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId)))
      .limit(1));

    const userStatus = userInboxItem?.status || null;

    // Overrides app.ts's blanket cache default (see GET /api/user/get-profile's comment) —
    // `userStatus` changes on dismiss/archive/add-to-Harvous, and this preview is what a
    // reopened inbox item reads back.
    return c.json(
      { success: true, item: { ...inboxItem, userStatus } },
      200,
      { 'Cache-Control': 'private, max-age=0, no-store' },
    );
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

    const userInboxItem = first(await db
      .select()
      .from(UserInboxItems)
      .where(and(eq(UserInboxItems.userId, auth.userId), eq(UserInboxItems.inboxItemId, inboxItemId)))
      .limit(1));
    if (!userInboxItem) return c.json({ error: 'Inbox item not found in your inbox' }, 404);

    await ensureUnorganizedThread(auth.userId);

    const createdIds: { threadId?: string; noteIds: string[] } = { noteIds: [] };

    if (inboxItem.contentType === 'note') {
      // Get or create user metadata for simpleNoteId
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

      const now = nowISO();

      const newNote = await db.transaction(async (tx) => {
        const lockedMetadata = first(
          await tx
            .select()
            .from(UserMetadata)
            .where(eq(UserMetadata.userId, auth.userId))
            .for('update')
            .limit(1),
        );
        const highestExisting = first(
          await tx
            .select({ simpleNoteId: Notes.simpleNoteId })
            .from(Notes)
            .where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId)))
            .orderBy(desc(Notes.simpleNoteId))
            .limit(1),
        )?.simpleNoteId ?? 0;
        const nextSimpleNoteId =
          Math.max(lockedMetadata?.highestSimpleNoteId ?? 0, highestExisting) + 1;
        const requestedThreadId =
          typeof targetThreadId === 'string' ? targetThreadId.trim() : '';
        const requestedRealThread =
          Boolean(requestedThreadId) &&
          requestedThreadId !== 'thread_unorganized' &&
          !requestedThreadId.startsWith('thread_onboarding_');
        const targetThread = requestedRealThread
          ? first(
              await tx
                .select()
                .from(Threads)
                .where(eq(Threads.id, requestedThreadId))
                .for('update')
                .limit(1),
            ) ?? null
          : null;
        if (requestedRealThread && !targetThread) {
          throw new InboxTargetError('Target Thread not found', 'THREAD_NOT_FOUND', 404);
        }

        const effectiveTargetSpaceId =
          typeof targetSpaceId === 'string' && targetSpaceId.trim()
            ? targetSpaceId.trim()
            : targetThread?.spaceId ?? null;
        const targetSpace = effectiveTargetSpaceId
          ? first(
              await tx
                .select()
                .from(Spaces)
                .where(eq(Spaces.id, effectiveTargetSpaceId))
                .for('update')
                .limit(1),
            ) ?? null
          : null;
        if (effectiveTargetSpaceId && (!targetSpace || targetSpace.deletedAt)) {
          throw new InboxTargetError('Target space not found', 'SPACE_NOT_FOUND', 404);
        }
        if (
          targetThread &&
          targetThread.spaceId !== (targetSpace?.id ?? null)
        ) {
          throw new InboxTargetError(
            'Target Thread is not in the target space',
            'THREAD_NOT_IN_TARGET_SPACE',
            409,
          );
        }

        const collaborativeTarget =
          targetSpace && targetSpace.type !== 'personal' ? targetSpace : null;
        let membership: typeof SpaceMemberships.$inferSelect | null = null;
        let canonicalSpaceId = targetSpace?.id ?? null;
        if (collaborativeTarget) {
          membership =
            first(
              await tx
                .select()
                .from(SpaceMemberships)
                .where(
                  and(
                    eq(SpaceMemberships.spaceId, collaborativeTarget.id),
                    eq(SpaceMemberships.userId, auth.userId),
                  ),
                )
                .for('update')
                .limit(1),
            ) ?? null;
          assertCanAssociateCanonicalNote({
            note: {
              id: 'pending-inbox-note',
              userId: auth.userId,
              contentEncrypted: false,
            },
            space: collaborativeTarget,
            membership,
            actorId: auth.userId,
          });
          const personalSpaces = await tx
            .select({ id: Spaces.id, title: Spaces.title })
            .from(Spaces)
            .where(and(eq(Spaces.userId, auth.userId), eq(Spaces.type, 'personal')));
          canonicalSpaceId =
            personalSpaces.find(
              (row: { title: string }) => row.title.trim().toLowerCase() === 'my home',
            )?.id ?? null;
          if (!canonicalSpaceId) {
            canonicalSpaceId = generateSpaceId();
            await tx.insert(Spaces).values({
              id: canonicalSpaceId,
              title: 'My Home',
              color: 'paper',
              userId: auth.userId,
              type: 'personal',
              isPublic: false,
              isActive: true,
              order: 0,
              createdAt: now,
              updatedAt: now,
            });
          }
        } else if (targetSpace && targetSpace.userId !== auth.userId) {
          throw new InboxTargetError('Target space not found', 'SPACE_NOT_FOUND', 404);
        }

        const threadPlan = resolveCreateThreadAttachment({
          requestedThreadId,
          targetSpaceId: targetSpace?.id ?? canonicalSpaceId,
          targetSpaceType: targetSpace?.type ?? null,
          actorId: auth.userId,
          noteAuthorId: auth.userId,
          thread: targetThread,
        });
        const created = first(await tx.insert(Notes).values({
          id: generateNoteId(),
          title: inboxItem.title || null,
          content: inboxItem.content || '',
          threadId: threadPlan.canonicalThreadId,
          spaceId: canonicalSpaceId,
          simpleNoteId: nextSimpleNoteId,
          userId: auth.userId,
          isPublic: false,
          contentEncrypted: false,
          addedBy: 'harvous',
          createdAt: now,
          lastVisited: now,
        }).returning())!;
        await createInitialNoteVersion(tx, {
          noteId: created.id,
          noteAuthorId: auth.userId,
          content: {
            title: created.title,
            content: created.content,
            contentEncrypted: created.contentEncrypted,
          },
          createdAt: now,
          source: 'inbox-add',
        });
        if (collaborativeTarget) {
          await tx.insert(SpaceNotes).values(
            buildSpaceNoteAssociation({
              id: generateTimestampId('snote'),
              spaceId: collaborativeTarget.id,
              noteId: created.id,
              actorId: auth.userId,
              now,
            }),
          );
        }
        if (threadPlan.attachThreadId) {
          await tx.insert(NoteThreads).values({
            id: generateTimestampId('nthread'),
            noteId: created.id,
            threadId: threadPlan.attachThreadId,
            createdAt: now,
          });
          await tx
            .update(Threads)
            .set({ updatedAt: now })
            .where(eq(Threads.id, threadPlan.attachThreadId));
        }
        await tx.update(UserMetadata)
          .set({ highestSimpleNoteId: nextSimpleNoteId, updatedAt: now })
          .where(eq(UserMetadata.userId, auth.userId));
        return created;
      });

      const isScriptureNote = newNote.noteType === 'scripture';
      awardNoteCreatedXP(auth.userId, newNote.id, isScriptureNote, newNote.content || '').catch(() => {});

      createdIds.noteIds.push(newNote.id);
    } else if (inboxItem.contentType === 'thread') {
      const newThreadId = generateThreadId();
      const threadColor = convertInboxColorToThreadColor(inboxItem.color) || getRandomThreadColor();
      const threadNow = nowISO();
      createdIds.threadId = newThreadId;

      // Get or create user metadata
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

      const notes = inboxItem.notes || [];
      let currentSimpleNoteId = 0;
      const baseTimestamp = Date.now();
      const junctionTs = new Date();

      type NoteInsert = typeof Notes.$inferInsert;
      const noteRows: NoteInsert[] = [];
      const junctionRows: { id: string; noteId: string; threadId: string; createdAt: Date }[] = [];
      const xpItems: Array<{ noteId: string; isScripture: boolean; content: string }> = [];

      for (let noteIndex = 0; noteIndex < notes.length; noteIndex++) {
        const note = notes[noteIndex];
        const noteTimestamp = new Date(baseTimestamp + noteIndex);
        const newNoteId = generateNoteId();

        noteRows.push({
          id: newNoteId,
          title: note.title || null,
          content: note.content,
          threadId: 'thread_unorganized',
          spaceId: null,
          simpleNoteId: currentSimpleNoteId,
          userId: auth.userId,
          isPublic: false,
          addedBy: 'harvous',
          createdAt: noteTimestamp,
          lastVisited: noteTimestamp,
        });

        junctionRows.push({
          id: `note-thread-${newNoteId}-${baseTimestamp + noteIndex}-${Math.random().toString(36).substr(2, 9)}`,
          noteId: newNoteId,
          threadId: newThreadId,
          createdAt: junctionTs,
        });

        xpItems.push({
          noteId: newNoteId,
          isScripture: false,
          content: note.content || '',
        });
        createdIds.noteIds.push(newNoteId);
        currentSimpleNoteId++;
      }

      const newThread = await db.transaction(async (tx) => {
        const requestedSpaceId =
          typeof targetSpaceId === 'string' && targetSpaceId.trim()
            ? targetSpaceId.trim()
            : null;
        const targetSpace = requestedSpaceId
          ? first(
              await tx
                .select()
                .from(Spaces)
                .where(eq(Spaces.id, requestedSpaceId))
                .for('update')
                .limit(1),
            ) ?? null
          : null;
        if (requestedSpaceId && !targetSpace) {
          throw new InboxTargetError('Target space not found', 'SPACE_NOT_FOUND', 404);
        }
        assertInboxThreadBundleTarget({ actorId: auth.userId, space: targetSpace });
        const collaborativeTarget =
          targetSpace && targetSpace.type !== 'personal' ? targetSpace : null;
        let canonicalSpaceId = targetSpace?.id ?? null;
        if (collaborativeTarget) {
          const personalSpaces = await tx
            .select({ id: Spaces.id, title: Spaces.title })
            .from(Spaces)
            .where(and(eq(Spaces.userId, auth.userId), eq(Spaces.type, 'personal')));
          canonicalSpaceId =
            personalSpaces.find(
              (row: { title: string }) => row.title.trim().toLowerCase() === 'my home',
            )?.id ?? null;
          if (!canonicalSpaceId) {
            canonicalSpaceId = generateSpaceId();
            await tx.insert(Spaces).values({
              id: canonicalSpaceId,
              title: 'My Home',
              color: 'paper',
              userId: auth.userId,
              type: 'personal',
              isPublic: false,
              isActive: true,
              order: 0,
              createdAt: threadNow,
              updatedAt: threadNow,
            });
          }
          await tx
            .update(Threads)
            .set({ isPinned: false, updatedAt: threadNow })
            .where(eq(Threads.spaceId, collaborativeTarget.id));
        }
        const createdThread = first(
          await tx
            .insert(Threads)
            .values({
              id: newThreadId,
              title: inboxItem.title,
              subtitle: inboxItem.subtitle || null,
              spaceId: targetSpace?.id ?? null,
              userId: auth.userId,
              isPublic: false,
              isPinned: Boolean(collaborativeTarget),
              color: threadColor,
              createdAt: threadNow,
              updatedAt: threadNow,
              lastVisited: threadNow,
            })
            .returning(),
        )!;
        const lockedMetadata = first(
          await tx
            .select()
            .from(UserMetadata)
            .where(eq(UserMetadata.userId, auth.userId))
            .for('update')
            .limit(1),
        );
        const highestExisting = first(
          await tx
            .select({ simpleNoteId: Notes.simpleNoteId })
            .from(Notes)
            .where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId)))
            .orderBy(desc(Notes.simpleNoteId))
            .limit(1),
        )?.simpleNoteId ?? 0;
        currentSimpleNoteId =
          Math.max(lockedMetadata?.highestSimpleNoteId ?? 0, highestExisting) + 1;
        for (let index = 0; index < noteRows.length; index++) {
          noteRows[index].simpleNoteId = currentSimpleNoteId + index;
          noteRows[index].spaceId = canonicalSpaceId;
          noteRows[index].threadId = collaborativeTarget
            ? 'thread_unorganized'
            : newThreadId;
          noteRows[index].contentEncrypted = false;
        }
        currentSimpleNoteId += noteRows.length;
        for (let i = 0; i < noteRows.length; i += INBOX_BULK_INSERT_CHUNK) {
          const chunk = noteRows.slice(i, i + INBOX_BULK_INSERT_CHUNK);
          await tx.insert(Notes).values(chunk);
          for (const noteRow of chunk) {
            await createInitialNoteVersion(tx, {
              noteId: noteRow.id,
              noteAuthorId: auth.userId,
              content: {
                title: noteRow.title ?? null,
                content: noteRow.content,
                contentEncrypted: noteRow.contentEncrypted ?? false,
              },
              createdAt: noteRow.createdAt as Date,
              source: 'inbox-thread-add',
            });
            if (collaborativeTarget) {
              assertCanAssociateCanonicalNote({
                note: {
                  id: noteRow.id,
                  userId: auth.userId,
                  contentEncrypted: false,
                },
                space: collaborativeTarget,
                membership: null,
                actorId: auth.userId,
              });
              await tx.insert(SpaceNotes).values(
                buildSpaceNoteAssociation({
                  id: generateTimestampId('snote'),
                  spaceId: collaborativeTarget.id,
                  noteId: noteRow.id,
                  actorId: auth.userId,
                  now: noteRow.createdAt as Date,
                }),
              );
            }
          }
        }
        for (let i = 0; i < junctionRows.length; i += INBOX_BULK_INSERT_CHUNK) {
          await tx.insert(NoteThreads).values(junctionRows.slice(i, i + INBOX_BULK_INSERT_CHUNK));
        }
        await tx.update(UserMetadata)
          .set({ highestSimpleNoteId: currentSimpleNoteId - 1, updatedAt: nowISO() })
          .where(eq(UserMetadata.userId, auth.userId));
        await tx.update(Threads)
          .set({ updatedAt: nowISO() })
          .where(and(eq(Threads.id, newThreadId), eq(Threads.userId, auth.userId)));
        return createdThread;
      });

      await awardThreadCreatedXP(
        auth.userId,
        newThreadId,
        newThread.title,
        newThread.subtitle || null,
      ).catch(() => {});
      await awardNoteCreatedXPInBatchesInbox(auth.userId, xpItems, INBOX_XP_AWARD_CONCURRENCY);

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
    if (error instanceof InboxTargetError) {
      return c.json({ error: error.message, code: error.code }, error.status);
    }
    if (error instanceof SpaceNoteAssociationError) {
      const status =
        error.code === 'NOT_SPACE_MEMBER' || error.code === 'ROLE_CANNOT_ASSOCIATE'
          ? 403
          : error.code === 'SPACE_DELETED'
            ? 404
            : 409;
      return c.json({ error: error.message, code: error.code }, status);
    }
    console.error('Error adding inbox item to Harvous:', error);
    return c.json({ error: 'Failed to add inbox item to Harvous', details: error.message }, 500);
  }
});

// ─── POST/GET /api/inbox/auto-archive ─────────────────────────────────

async function handleAutoArchive(c: any) {
  try {
    // Netlify's proxy can duplicate the Authorization header → "Bearer <tok>, Bearer <tok>"
    const authHeader = (c.req.header('authorization') ?? c.req.header('Authorization') ?? '').split(',')[0].trim();
    const expectedToken = process.env.AUTO_ARCHIVE_SECRET_TOKEN;
    const auth = getAuth(c);
    const isAuthenticated = !!auth?.userId;
    const hasValidToken = !!expectedToken && authHeader === `Bearer ${expectedToken}`;

    // Cron/global scope requires a configured secret. Authenticated users may scope to self.
    if (!hasValidToken && !isAuthenticated) {
      if (!expectedToken) {
        return c.json({ error: 'Service Unavailable', message: 'AUTO_ARCHIVE_SECRET_TOKEN is not configured.' }, 503);
      }
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    fourteenDaysAgo.setHours(0, 0, 0, 0);
    const conditions: any[] = [
      eq(UserInboxItems.status, 'inbox'),
      eq(InboxItems.isActive, true),
      lt(UserInboxItems.createdAt, fourteenDaysAgo),
    ];

    if (!hasValidToken) {
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
    // Netlify's proxy can duplicate the Authorization header → "Bearer <tok>, Bearer <tok>"
    const authHeader = (c.req.header('authorization') ?? c.req.header('Authorization') ?? '').split(',')[0].trim();
    const expectedToken = process.env.AUTO_ARCHIVE_SECRET_TOKEN;
    const auth = getAuth(c);
    const isAuthenticated = !!auth?.userId;
    const hasValidToken = !!expectedToken && authHeader === `Bearer ${expectedToken}`;

    // Cron/global scope requires a configured secret. Authenticated users may scope to self.
    if (!hasValidToken && !isAuthenticated) {
      if (!expectedToken) {
        return c.json({ error: 'Service Unavailable', message: 'AUTO_ARCHIVE_SECRET_TOKEN is not configured.' }, 503);
      }
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    const fortyFourDaysAgo = new Date();
    fortyFourDaysAgo.setDate(fortyFourDaysAgo.getDate() - 44);
    fortyFourDaysAgo.setHours(0, 0, 0, 0);

    // Backfill missing archivedAt timestamps
    const backfillConditions: any[] = [
      eq(UserInboxItems.status, 'archived'),
      isNull(UserInboxItems.archivedAt),
    ];
    if (!hasValidToken) {
      backfillConditions.push(eq(UserInboxItems.userId, auth.userId!));
    }

    const itemsToBackfill = await db.select().from(UserInboxItems).where(and(...backfillConditions));

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
        lt(UserInboxItems.archivedAt, thirtyDaysAgo),
        and(isNull(UserInboxItems.archivedAt), lt(UserInboxItems.createdAt, fortyFourDaysAgo))
      ),
    ];
    if (!hasValidToken) {
      deleteConditions.push(eq(UserInboxItems.userId, auth.userId!));
    }

    const itemsToDelete = await db.select().from(UserInboxItems).where(and(...deleteConditions));

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
// Retired with Webflow inbox; Featured Items is the notification path.

app.post('/api/inbox/assign-to-users', async (c) => {
  return c.json(
    {
      error: 'Gone',
      message: 'Webflow inbox assignment is retired. Use the Featured Item system instead.',
    },
    410
  );
});

// ─── POST/GET /api/inbox/reset-all-users ──────────────────────────────

app.post('/api/inbox/reset-all-users', async (c) => {
  try {
    // Netlify's proxy can duplicate the Authorization header → "Bearer <tok>, Bearer <tok>"
    const authHeader = (c.req.header('authorization') ?? c.req.header('Authorization') ?? '').split(',')[0].trim();
    const expectedToken = process.env.INBOX_RESET_SECRET_TOKEN;

    if (!expectedToken) {
      return c.json({ error: 'Service Unavailable', message: 'INBOX_RESET_SECRET_TOKEN is not configured.' }, 503);
    }
    if (authHeader !== `Bearer ${expectedToken}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Step 1: Clear all UserInboxItems
    const allUserInboxItems = await db.select().from(UserInboxItems);
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
    const allInboxItems = await db.select().from(InboxItems);
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
    const allUsers = await db.select().from(UserMetadata);
    let totalAssigned = 0;
    const assignmentResults: string[] = [];

    for (const inboxItemId of validItems) {
      const inboxItem = first(await db.select().from(InboxItems).where(eq(InboxItems.id, inboxItemId)).limit(1));
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
    note: 'Requires Authorization: Bearer <INBOX_RESET_SECRET_TOKEN>',
  });
});

export default app;
