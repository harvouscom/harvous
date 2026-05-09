/**
 * Sync routes — Hono port
 *
 * Endpoints:
 *   POST /api/sync/push
 *   GET  /api/sync/bootstrap
 *   GET  /api/sync/changes
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import {
  db,
  first,
  Spaces,
  Threads,
  Notes,
  NoteThreads,
  Tags,
  NoteTags,
  UserMetadata,
  eq,
  and,
  gt,
  or,
} from '../db';
import { nowISO } from '../db/dates';
import { getCurrentSeason } from '@/utils/season-helpers';
import { awardNewSeasonBonus } from '../utils/xp-system';
import { getEffectiveHighestSimpleNoteId } from '../utils/highest-simple-note-id';
import {
  normalizeSecondaryLabels,
  parseNoteSecondaryCollections,
  serializeNoteSecondaryCollections,
} from '../utils/note-secondary-collections';
import { handleAPIError } from '@/utils/error-handling';
import { tryConsumeNoteCreates, MAX_NOTE_CREATES_PER_SYNC_PUSH, getClientIP } from '@/utils/rate-limit';
import { generateNoteId, generateThreadId, generateSpaceId } from '@/utils/ids';
import { ensureUnorganizedThread } from '../utils/unorganized-thread';
import { detectScripture, getPrimaryReference } from '@/utils/scripture-detector';
import { fetchVerseText } from '../utils/fetch-verse-text';

const app = new Hono();

// In-memory cache for processed clientMutationIds (TTL: 5 minutes)
const processedMutations = new Map<string, { serverId: string; data?: any; timestamp: number }>();
const MUTATION_CACHE_TTL = 5 * 60 * 1000;

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of processedMutations) {
    if (now - value.timestamp > MUTATION_CACHE_TTL) {
      processedMutations.delete(key);
    }
  }
}, 60_000);

/** Persist secondaryCollections JSON text from sync clients (array or JSON string). */
function secondaryCollectionsFromSyncPayload(raw: unknown, primary: string | null): string | null {
  if (Array.isArray(raw)) {
    return serializeNoteSecondaryCollections(
      normalizeSecondaryLabels(
        raw.filter((x): x is string => typeof x === 'string'),
        primary,
      ),
    );
  }
  if (typeof raw === 'string') {
    return serializeNoteSecondaryCollections(
      normalizeSecondaryLabels(parseNoteSecondaryCollections(raw), primary),
    );
  }
  return null;
}

// ─── Mutation helpers for push endpoint ───────────────────────────────

async function processSpaceMutation(userId: string, operation: string, entityId: string, data: any) {
  if (operation === 'create') {
    const newSpace = first(await db.insert(Spaces).values({
      id: entityId.startsWith('local_') ? generateSpaceId() : entityId,
      title: data.title,
      description: data.description || null,
      color: data.color || null,
      backgroundGradient: data.backgroundGradient || null,
      isPublic: data.isPublic || false,
      isActive: data.isActive !== undefined ? data.isActive : true,
      order: data.order || 0,
      userId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    }).returning())!;
    return { success: true, entityId, serverId: newSpace.id };
  } else if (operation === 'update') {
    const existing = first(await db.select().from(Spaces).where(and(eq(Spaces.id, entityId), eq(Spaces.userId, userId))).limit(1));
    if (!existing) return { success: false, error: 'Space not found' };
    await db.update(Spaces).set({
      title: data.title,
      description: data.description,
      color: data.color,
      backgroundGradient: data.backgroundGradient,
      isPublic: data.isPublic,
      isActive: data.isActive,
      order: data.order,
      updatedAt: nowISO(),
    }).where(eq(Spaces.id, entityId));
    return { success: true, entityId, serverId: entityId };
  } else if (operation === 'delete') {
    await db.update(Spaces).set({ isActive: false, updatedAt: nowISO() }).where(and(eq(Spaces.id, entityId), eq(Spaces.userId, userId)));
    return { success: true, entityId, serverId: entityId };
  }
  return { success: false, error: `Unknown operation: ${operation}` };
}

async function processThreadMutation(userId: string, operation: string, entityId: string, data: any, clientMutationId?: string) {
  if (operation === 'create') {
    // Idempotency check: if this mutation was already processed, return cached result
    if (clientMutationId) {
      const cached = processedMutations.get(clientMutationId);
      if (cached) {
        return { success: true, entityId, serverId: cached.serverId, data: cached.data };
      }
    }

    const now = nowISO();
    const newThread = first(await db.insert(Threads).values({
      id: entityId.startsWith('local_') ? generateThreadId() : entityId,
      title: data.title,
      subtitle: data.subtitle || null,
      spaceId: data.spaceId || null,
      color: data.color || null,
      isPublic: data.isPublic || false,
      isPinned: data.isPinned || false,
      order: data.order || 0,
      userId,
      createdAt: now,
      updatedAt: now,
      lastVisited: data.lastVisited ? new Date(data.lastVisited) : now,
    }).returning())!;

    // Cache the result for idempotency
    if (clientMutationId) {
      processedMutations.set(clientMutationId, { serverId: newThread.id, data: { color: newThread.color }, timestamp: Date.now() });
    }

    return { success: true, entityId, serverId: newThread.id, data: { color: newThread.color } };
  } else if (operation === 'update') {
    const existing = first(await db.select().from(Threads).where(and(eq(Threads.id, entityId), eq(Threads.userId, userId))).limit(1));
    if (!existing) return { success: false, error: 'Thread not found' };
    await db.update(Threads).set({
      title: data.title,
      subtitle: data.subtitle,
      spaceId: data.spaceId,
      color: data.color,
      isPublic: data.isPublic,
      isPinned: data.isPinned,
      order: data.order,
      updatedAt: nowISO(),
      ...(data.lastVisited && { lastVisited: new Date(data.lastVisited) }),
    }).where(eq(Threads.id, entityId));
    return { success: true, entityId, serverId: entityId, data: { color: data.color } };
  } else if (operation === 'delete') {
    return { success: true, entityId, serverId: entityId };
  }
  return { success: false, error: `Unknown operation: ${operation}` };
}

async function processNoteMutation(userId: string, operation: string, entityId: string, data: any, clientMutationId?: string) {
  if (operation === 'create') {
    // Idempotency check: if this mutation was already processed, return cached result
    if (clientMutationId) {
      const cached = processedMutations.get(clientMutationId);
      if (cached) {
        return { success: true, entityId, serverId: cached.serverId, data: cached.data };
      }
    }

    const effectiveHighest = await getEffectiveHighestSimpleNoteId(userId);
    const nextSimpleNoteId = effectiveHighest + 1;
    const assignedSimpleNoteId = data.simpleNoteId ?? nextSimpleNoteId;
    let threadId = data.threadId || 'thread_unorganized';
    if (threadId.startsWith('local_')) {
      console.warn(`[processNoteMutation] Thread ${threadId} is a local ID, using unorganized`);
      threadId = 'thread_unorganized';
    }

    // Scripture detection for offline-created notes saved as 'default'
    let noteType = data.noteType || 'default';
    let noteTitle = data.title;
    let noteContent = data.content;
    if (noteType === 'default' && noteTitle && noteTitle.length >= 5) {
      try {
        const detection = await detectScripture(noteTitle);
        const primaryReference = getPrimaryReference(detection);
        if (detection.isScripture && detection.confidence >= 0.7 && primaryReference) {
          noteType = 'scripture';
          noteTitle = primaryReference;
          // Try to fetch verse text if content is empty/short
          if (!noteContent || noteContent.trim().length < 10 || noteContent === '<p></p>' || noteContent === '<p><br></p>') {
            try {
              const verseText = await fetchVerseText(primaryReference);
              if (verseText) {
                noteContent = verseText;
              }
            } catch {
              // Verse fetch failed — keep original content
            }
          }
        }
      } catch {
        // Scripture detection failed — keep as default type
      }
    }

    let resolvedLinkedFromNoteId: string | null = null;
    const rawLinkedFrom = typeof data.linkedFromNoteId === 'string' && data.linkedFromNoteId.trim() ? data.linkedFromNoteId.trim() : null;
    if (rawLinkedFrom) {
      if (noteType !== 'default') {
        return { success: false, error: 'linkedFromNoteId is only allowed for default notes' };
      }
      const sourceNote = first(await db.select().from(Notes).where(and(eq(Notes.id, rawLinkedFrom), eq(Notes.userId, userId))).limit(1));
      if (!sourceNote) return { success: false, error: 'Invalid linkedFromNoteId' };
      resolvedLinkedFromNoteId = rawLinkedFrom;
    }

    const now = nowISO();
    const createPrimary =
      typeof data.primaryCollection === 'string' && data.primaryCollection.trim()
        ? data.primaryCollection.trim()
        : null;
    const createSecondaryStored = secondaryCollectionsFromSyncPayload(data.secondaryCollections, createPrimary);
    let collectionLastAutoCreate: Date | null = null;
    if (data.collectionLastAutoUpdatedAt) {
      const d = new Date(data.collectionLastAutoUpdatedAt);
      if (!Number.isNaN(d.getTime())) collectionLastAutoCreate = d;
    }

    const newNote = first(await db.insert(Notes).values({
      id: entityId.startsWith('local_') ? generateNoteId() : entityId,
      title: noteTitle || null,
      content: noteContent,
      threadId,
      spaceId: data.spaceId || null,
      simpleNoteId: assignedSimpleNoteId,
      noteType,
      addedBy: data.addedBy || 'user',
      isPublic: data.isPublic || false,
      isFeatured: data.isFeatured || false,
      order: data.order || 0,
      userId,
      createdAt: now,
      updatedAt: now,
      lastVisited: data.lastVisited ? new Date(data.lastVisited) : now,
      contentEncrypted: data.contentEncrypted || false,
      linkedFromNoteId: resolvedLinkedFromNoteId,
      primaryCollection: createPrimary,
      secondaryCollections: createSecondaryStored,
      collectionPinned: typeof data.collectionPinned === 'boolean' ? data.collectionPinned : false,
      collectionUserOverride: typeof data.collectionUserOverride === 'boolean' ? data.collectionUserOverride : false,
      collectionLastAutoUpdatedAt: collectionLastAutoCreate,
    }).returning())!;

    const newHighest = Math.max(assignedSimpleNoteId, effectiveHighest);
    await db.update(UserMetadata).set({ highestSimpleNoteId: newHighest, updatedAt: nowISO() }).where(eq(UserMetadata.userId, userId));

    if (threadId && threadId !== 'thread_unorganized') {
      await db.insert(NoteThreads).values({ id: generateNoteId(), noteId: newNote.id, threadId, createdAt: nowISO() });
    }

    // Cache the result for idempotency
    if (clientMutationId) {
      processedMutations.set(clientMutationId, { serverId: newNote.id, timestamp: Date.now() });
    }

    return { success: true, entityId, serverId: newNote.id };
  } else if (operation === 'update') {
    const existing = first(await db.select().from(Notes).where(and(eq(Notes.id, entityId), eq(Notes.userId, userId))).limit(1));
    if (!existing) return { success: false, error: 'Note not found' };

    let nextPrimary: string | null = existing.primaryCollection ?? null;
    if (data.primaryCollection !== undefined) {
      nextPrimary =
        typeof data.primaryCollection === 'string' && data.primaryCollection.trim()
          ? data.primaryCollection.trim()
          : null;
    }

    const updatePayload: Record<string, unknown> = {
      title: data.title,
      content: data.content,
      spaceId: data.spaceId,
      isPublic: data.isPublic,
      isFeatured: data.isFeatured,
      order: data.order,
      updatedAt: nowISO(),
    };
    if (data.lastVisited) {
      updatePayload.lastVisited = new Date(data.lastVisited);
    }
    if (typeof data.contentEncrypted === 'boolean') {
      updatePayload.contentEncrypted = data.contentEncrypted;
      if (data.contentEncrypted === true) {
        updatePayload.isPublic = false;
        updatePayload.shareToken = null;
        updatePayload.shareTokenCreatedAt = null;
      }
    }
    if (data.primaryCollection !== undefined) {
      updatePayload.primaryCollection = nextPrimary;
    }
    if (data.secondaryCollections !== undefined) {
      updatePayload.secondaryCollections = secondaryCollectionsFromSyncPayload(data.secondaryCollections, nextPrimary);
    } else if (data.primaryCollection !== undefined) {
      updatePayload.secondaryCollections = serializeNoteSecondaryCollections(
        normalizeSecondaryLabels(parseNoteSecondaryCollections(existing.secondaryCollections), nextPrimary),
      );
    }
    if (data.collectionPinned !== undefined) {
      updatePayload.collectionPinned = Boolean(data.collectionPinned);
    }
    if (data.collectionUserOverride !== undefined) {
      updatePayload.collectionUserOverride = Boolean(data.collectionUserOverride);
    }
    if (data.collectionLastAutoUpdatedAt !== undefined) {
      updatePayload.collectionLastAutoUpdatedAt =
        data.collectionLastAutoUpdatedAt == null || data.collectionLastAutoUpdatedAt === ''
          ? null
          : new Date(data.collectionLastAutoUpdatedAt);
    }

    await db.update(Notes).set(updatePayload as any).where(eq(Notes.id, entityId));
    return { success: true, entityId, serverId: entityId };
  } else if (operation === 'delete') {
    return { success: true, entityId, serverId: entityId };
  }
  return { success: false, error: `Unknown operation: ${operation}` };
}

async function processNoteThreadMutation(userId: string, operation: string, entityId: string, data: any) {
  if (operation === 'create') {
    const note = first(await db.select().from(Notes).where(and(eq(Notes.id, data.noteId), eq(Notes.userId, userId))).limit(1));
    if (!note) return { success: false, error: 'Note not found' };
    const existing = first(await db.select().from(NoteThreads).where(and(eq(NoteThreads.noteId, data.noteId), eq(NoteThreads.threadId, data.threadId))).limit(1));
    if (existing) return { success: true, entityId, serverId: existing.id };
    const newNoteThread = first(await db.insert(NoteThreads).values({
      id: entityId.startsWith('local_') ? generateNoteId() : entityId,
      noteId: data.noteId,
      threadId: data.threadId,
      createdAt: nowISO(),
    }).returning())!;
    return { success: true, entityId, serverId: newNoteThread.id };
  } else if (operation === 'delete') {
    const note = first(await db.select().from(Notes).where(and(eq(Notes.id, data.noteId), eq(Notes.userId, userId))).limit(1));
    if (!note) return { success: false, error: 'Note not found' };
    await db.delete(NoteThreads).where(and(eq(NoteThreads.noteId, data.noteId), eq(NoteThreads.threadId, data.threadId)));
    const remaining = await db.select().from(NoteThreads).where(eq(NoteThreads.noteId, data.noteId));
    if (remaining.length === 0) {
      await ensureUnorganizedThread(userId);
      await db.update(Notes).set({ threadId: 'thread_unorganized' }).where(eq(Notes.id, data.noteId));
    }
    return { success: true, entityId, serverId: entityId };
  }
  return { success: false, error: `Unknown operation: ${operation}` };
}

async function processTagMutation(userId: string, operation: string, entityId: string, data: any) {
  if (operation === 'create') {
    const newTag = first(await db.insert(Tags).values({
      id: entityId.startsWith('local_') ? generateNoteId() : entityId,
      name: data.name,
      color: data.color || null,
      category: data.category || null,
      isSystem: data.isSystem || false,
      userId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    }).returning())!;
    return { success: true, entityId, serverId: newTag.id };
  } else if (operation === 'update') {
    const existing = first(await db.select().from(Tags).where(and(eq(Tags.id, entityId), eq(Tags.userId, userId))).limit(1));
    if (!existing) return { success: false, error: 'Tag not found' };
    await db.update(Tags).set({ name: data.name, color: data.color, category: data.category, updatedAt: nowISO() }).where(eq(Tags.id, entityId));
    return { success: true, entityId, serverId: entityId };
  } else if (operation === 'delete') {
    await db.delete(NoteTags).where(eq(NoteTags.tagId, entityId));
    await db.delete(Tags).where(and(eq(Tags.id, entityId), eq(Tags.userId, userId)));
    return { success: true, entityId, serverId: entityId };
  }
  return { success: false, error: `Unknown operation: ${operation}` };
}

async function processNoteTagMutation(userId: string, operation: string, entityId: string, data: any) {
  if (operation === 'create') {
    const note = first(await db.select().from(Notes).where(and(eq(Notes.id, data.noteId), eq(Notes.userId, userId))).limit(1));
    if (!note) return { success: false, error: 'Note not found' };
    const newNoteTag = first(await db.insert(NoteTags).values({
      id: entityId.startsWith('local_') ? generateNoteId() : entityId,
      noteId: data.noteId,
      tagId: data.tagId,
      isAutoGenerated: data.isAutoGenerated || false,
      confidence: data.confidence || null,
      createdAt: nowISO(),
    }).returning())!;
    return { success: true, entityId, serverId: newNoteTag.id };
  } else if (operation === 'delete') {
    const note = first(await db.select().from(Notes).where(and(eq(Notes.id, data.noteId), eq(Notes.userId, userId))).limit(1));
    if (!note) return { success: false, error: 'Note not found' };
    await db.delete(NoteTags).where(and(eq(NoteTags.noteId, data.noteId), eq(NoteTags.tagId, data.tagId)));
    return { success: true, entityId, serverId: entityId };
  }
  return { success: false, error: `Unknown operation: ${operation}` };
}

// ─── POST /api/sync/push ─────────────────────────────────────────────

app.post('/api/sync/push', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const { mutations } = await c.req.json();
    if (!Array.isArray(mutations) || mutations.length === 0) {
      return c.json({ error: 'mutations array is required', code: 'INVALID_REQUEST' }, 400);
    }

    const noteCreatesInBatch = mutations.filter(
      (m: { entityType?: string; operation?: string }) => m.entityType === 'note' && m.operation === 'create'
    ).length;

    if (noteCreatesInBatch > MAX_NOTE_CREATES_PER_SYNC_PUSH) {
      return c.json(
        {
          error: `Too many note creations in one sync (max ${MAX_NOTE_CREATES_PER_SYNC_PUSH}). Split into smaller batches.`,
          code: 'SYNC_NOTE_BATCH_TOO_LARGE'
        },
        400
      );
    }

    if (noteCreatesInBatch > 0) {
      const ip = getClientIP(c.req.raw);
      const reserved = tryConsumeNoteCreates(auth.userId, ip, noteCreatesInBatch);
      if (!reserved.allowed) {
        return c.json(
          { error: reserved.error, code: 'NOTE_CREATE_RATE_LIMIT_EXCEEDED' },
          429,
          { 'Retry-After': String(reserved.retryAfterSec) }
        );
      }
    }

    const results: Array<{ success: boolean; operationId?: number; entityId?: string; serverId?: string; error?: string; data?: any }> = [];

    for (const mutation of mutations) {
      try {
        const { operation, entityType, entityId, data, operationId, clientMutationId } = mutation;
        let result: any = { success: false, operationId };

        switch (entityType) {
          case 'space': result = await processSpaceMutation(auth.userId, operation, entityId, data); break;
          case 'thread': result = await processThreadMutation(auth.userId, operation, entityId, data, clientMutationId); break;
          case 'note': result = await processNoteMutation(auth.userId, operation, entityId, data, clientMutationId); break;
          case 'noteThread': result = await processNoteThreadMutation(auth.userId, operation, entityId, data); break;
          case 'tag': result = await processTagMutation(auth.userId, operation, entityId, data); break;
          case 'noteTag': result = await processNoteTagMutation(auth.userId, operation, entityId, data); break;
          default: result = { success: false, error: `Unknown entity type: ${entityType}` };
        }
        results.push({ ...result, operationId });
      } catch (error) {
        results.push({ success: false, operationId: mutation.operationId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return c.json({ results }, 200, { 'Cache-Control': 'private, no-cache' });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/sync/push', action: 'push_sync' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/sync/bootstrap ──────────────────────────────────────────

app.get('/api/sync/bootstrap', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const [spaces, threads, notes, noteThreads, tags, noteTags, userMetadataRows] = await Promise.all([
      db.select({
        id: Spaces.id, title: Spaces.title, description: Spaces.description, color: Spaces.color,
        backgroundGradient: Spaces.backgroundGradient, isPublic: Spaces.isPublic, isActive: Spaces.isActive,
        order: Spaces.order, createdAt: Spaces.createdAt, updatedAt: Spaces.updatedAt,
      }).from(Spaces).where(eq(Spaces.userId, auth.userId)),

      db.select({
        id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, spaceId: Threads.spaceId,
        color: Threads.color, isPublic: Threads.isPublic, isPinned: Threads.isPinned, order: Threads.order,
        lastVisited: Threads.lastVisited, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt,
      }).from(Threads).where(eq(Threads.userId, auth.userId)),

      db.select({
        id: Notes.id, title: Notes.title, content: Notes.content, threadId: Notes.threadId,
        spaceId: Notes.spaceId, simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType,
        addedBy: Notes.addedBy, isPublic: Notes.isPublic, isFeatured: Notes.isFeatured,
        order: Notes.order, lastVisited: Notes.lastVisited, createdAt: Notes.createdAt,
        updatedAt: Notes.updatedAt, contentEncrypted: Notes.contentEncrypted,
        linkedFromNoteId: Notes.linkedFromNoteId,
        primaryCollection: Notes.primaryCollection,
        secondaryCollections: Notes.secondaryCollections,
        collectionPinned: Notes.collectionPinned,
        collectionUserOverride: Notes.collectionUserOverride,
        collectionLastAutoUpdatedAt: Notes.collectionLastAutoUpdatedAt,
      }).from(Notes).where(eq(Notes.userId, auth.userId)).limit(1000),

      db.select({
        id: NoteThreads.id, noteId: NoteThreads.noteId, threadId: NoteThreads.threadId,
        createdAt: NoteThreads.createdAt,
      }).from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
        .where(eq(Notes.userId, auth.userId)),

      db.select({
        id: Tags.id, name: Tags.name, color: Tags.color, category: Tags.category,
        isSystem: Tags.isSystem, createdAt: Tags.createdAt, updatedAt: Tags.updatedAt,
      }).from(Tags).where(eq(Tags.userId, auth.userId)),

      db.select({
        id: NoteTags.id, noteId: NoteTags.noteId, tagId: NoteTags.tagId,
        isAutoGenerated: NoteTags.isAutoGenerated, confidence: NoteTags.confidence,
        createdAt: NoteTags.createdAt,
      }).from(NoteTags).innerJoin(Notes, eq(Notes.id, NoteTags.noteId))
        .where(eq(Notes.userId, auth.userId)),

      db.select({
        id: UserMetadata.id, userId: UserMetadata.userId, highestSimpleNoteId: UserMetadata.highestSimpleNoteId,
        userColor: UserMetadata.userColor, firstName: UserMetadata.firstName, lastName: UserMetadata.lastName,
        email: UserMetadata.email, profileImageUrl: UserMetadata.profileImageUrl,
        clerkDataUpdatedAt: UserMetadata.clerkDataUpdatedAt, churchName: UserMetadata.churchName,
        churchCity: UserMetadata.churchCity, churchState: UserMetadata.churchState,
        churchCountry: UserMetadata.churchCountry, currentSeason: UserMetadata.currentSeason,
        lastMonthlyVisit: UserMetadata.lastMonthlyVisit, churchAddedAt: UserMetadata.churchAddedAt,
        createdAt: UserMetadata.createdAt, updatedAt: UserMetadata.updatedAt,
        lockPinHash: UserMetadata.lockPinHash,
      }).from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1),
    ]);

    const userMetadata = first(userMetadataRows);

    const effectiveHighest = await getEffectiveHighestSimpleNoteId(auth.userId);
    const highestSimpleNoteId = effectiveHighest;
    const reservedRange = { start: highestSimpleNoteId + 1, end: highestSimpleNoteId + 200 };

    // Backfill currentSeason if null
    let userMetaForResponse = userMetadata;
    if (userMetadata && userMetadata.currentSeason == null) {
      const season = getCurrentSeason();
      await db.update(UserMetadata).set({ currentSeason: season, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
      userMetaForResponse = { ...userMetadata, currentSeason: season };
    }
    // Detect season transition (user returned in a new season) and award bonus
    if (userMetaForResponse?.currentSeason && userMetaForResponse.currentSeason !== getCurrentSeason()) {
      const season = getCurrentSeason();
      await db.update(UserMetadata).set({ currentSeason: season, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
      userMetaForResponse = { ...userMetaForResponse, currentSeason: season };
      awardNewSeasonBonus(auth.userId).catch(() => {});
    }

    // In Drizzle with text() columns, dates are already ISO strings — pass through
    const bootstrapData = {
      timestamp: new Date().toISOString(),
      cursor: `bootstrap_${Date.now()}`,
      spaces,
      threads,
      notes: notes.map((n) => ({ ...n, secondaryCollections: parseNoteSecondaryCollections(n.secondaryCollections) })),
      noteThreads,
      tags,
      noteTags,
      userMetadata: userMetaForResponse ? (() => {
        const { lockPinHash, ...rest } = userMetaForResponse;
        return {
          ...rest,
          highestSimpleNoteId: highestSimpleNoteId,
          hasLockPinSet: !!lockPinHash,
          reservedSimpleNoteIdRange: reservedRange,
        };
      })() : null,
    };

    return c.json(bootstrapData, 200, { 'Cache-Control': 'private, no-cache' });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/sync/bootstrap', action: 'bootstrap_sync' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/sync/changes ────────────────────────────────────────────

app.get('/api/sync/changes', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const sinceParam = c.req.query('since');
    if (!sinceParam) return c.json({ error: 'since parameter is required', code: 'MISSING_PARAMETER' }, 400);

    let sinceTimestamp: number;
    if (sinceParam.startsWith('bootstrap_') || sinceParam.startsWith('timestamp_')) {
      sinceTimestamp = parseInt(sinceParam.split('_')[1], 10);
    } else {
      sinceTimestamp = parseInt(sinceParam, 10);
      if (isNaN(sinceTimestamp)) return c.json({ error: 'Invalid since parameter format', code: 'INVALID_PARAMETER' }, 400);
    }

    const sinceDate = new Date(sinceTimestamp);

    const [changedSpaces, changedThreads, changedNotes, changedNoteThreads, changedTags, changedNoteTags, changedUserMetadataRows] = await Promise.all([
      db.select({
        id: Spaces.id, title: Spaces.title, description: Spaces.description, color: Spaces.color,
        backgroundGradient: Spaces.backgroundGradient, isPublic: Spaces.isPublic, isActive: Spaces.isActive,
        order: Spaces.order, createdAt: Spaces.createdAt, updatedAt: Spaces.updatedAt,
      }).from(Spaces).where(and(eq(Spaces.userId, auth.userId), or(gt(Spaces.updatedAt, sinceDate), gt(Spaces.createdAt, sinceDate)))),

      db.select({
        id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, spaceId: Threads.spaceId,
        color: Threads.color, isPublic: Threads.isPublic, isPinned: Threads.isPinned, order: Threads.order,
        lastVisited: Threads.lastVisited, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt,
      }).from(Threads).where(and(eq(Threads.userId, auth.userId), or(gt(Threads.updatedAt, sinceDate), gt(Threads.createdAt, sinceDate), gt(Threads.lastVisited, sinceDate)))),

      db.select({
        id: Notes.id, title: Notes.title, content: Notes.content, threadId: Notes.threadId,
        spaceId: Notes.spaceId, simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType,
        addedBy: Notes.addedBy, isPublic: Notes.isPublic, isFeatured: Notes.isFeatured,
        order: Notes.order, lastVisited: Notes.lastVisited, createdAt: Notes.createdAt,
        updatedAt: Notes.updatedAt, contentEncrypted: Notes.contentEncrypted,
        linkedFromNoteId: Notes.linkedFromNoteId,
        primaryCollection: Notes.primaryCollection,
        secondaryCollections: Notes.secondaryCollections,
        collectionPinned: Notes.collectionPinned,
        collectionUserOverride: Notes.collectionUserOverride,
        collectionLastAutoUpdatedAt: Notes.collectionLastAutoUpdatedAt,
      }).from(Notes).where(and(eq(Notes.userId, auth.userId), or(gt(Notes.updatedAt, sinceDate), gt(Notes.createdAt, sinceDate), gt(Notes.lastVisited, sinceDate)))),

      db.select({
        id: NoteThreads.id, noteId: NoteThreads.noteId, threadId: NoteThreads.threadId, createdAt: NoteThreads.createdAt,
      }).from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
        .where(and(eq(Notes.userId, auth.userId), gt(NoteThreads.createdAt, sinceDate))),

      db.select({
        id: Tags.id, name: Tags.name, color: Tags.color, category: Tags.category,
        isSystem: Tags.isSystem, createdAt: Tags.createdAt, updatedAt: Tags.updatedAt,
      }).from(Tags).where(and(eq(Tags.userId, auth.userId), or(gt(Tags.updatedAt, sinceDate), gt(Tags.createdAt, sinceDate)))),

      db.select({
        id: NoteTags.id, noteId: NoteTags.noteId, tagId: NoteTags.tagId,
        isAutoGenerated: NoteTags.isAutoGenerated, confidence: NoteTags.confidence, createdAt: NoteTags.createdAt,
      }).from(NoteTags).innerJoin(Notes, eq(Notes.id, NoteTags.noteId))
        .where(and(eq(Notes.userId, auth.userId), gt(NoteTags.createdAt, sinceDate))),

      db.select({
        id: UserMetadata.id, userId: UserMetadata.userId, highestSimpleNoteId: UserMetadata.highestSimpleNoteId,
        userColor: UserMetadata.userColor, firstName: UserMetadata.firstName, lastName: UserMetadata.lastName,
        email: UserMetadata.email, profileImageUrl: UserMetadata.profileImageUrl,
        clerkDataUpdatedAt: UserMetadata.clerkDataUpdatedAt, churchName: UserMetadata.churchName,
        churchCity: UserMetadata.churchCity, churchState: UserMetadata.churchState,
        churchCountry: UserMetadata.churchCountry, currentSeason: UserMetadata.currentSeason,
        lastMonthlyVisit: UserMetadata.lastMonthlyVisit, churchAddedAt: UserMetadata.churchAddedAt,
        createdAt: UserMetadata.createdAt, updatedAt: UserMetadata.updatedAt,
        lockPinHash: UserMetadata.lockPinHash,
      }).from(UserMetadata).where(and(eq(UserMetadata.userId, auth.userId), or(gt(UserMetadata.updatedAt, sinceDate), gt(UserMetadata.createdAt, sinceDate)))).limit(1),
    ]);

    const changedUserMetadata = first(changedUserMetadataRows);

    // Backfill currentSeason if null
    let userMetaForResponse = changedUserMetadata;
    if (changedUserMetadata?.currentSeason == null && changedUserMetadata?.userId) {
      const season = getCurrentSeason();
      await db.update(UserMetadata).set({ currentSeason: season, updatedAt: nowISO() }).where(eq(UserMetadata.userId, changedUserMetadata.userId));
      userMetaForResponse = { ...changedUserMetadata, currentSeason: season };
    }
    // Detect season transition and award new-season bonus
    if (userMetaForResponse?.currentSeason && userMetaForResponse.currentSeason !== getCurrentSeason() && userMetaForResponse?.userId) {
      const season = getCurrentSeason();
      await db.update(UserMetadata).set({ currentSeason: season, updatedAt: nowISO() }).where(eq(UserMetadata.userId, userMetaForResponse.userId));
      userMetaForResponse = { ...userMetaForResponse, currentSeason: season };
      awardNewSeasonBonus(userMetaForResponse.userId).catch(() => {});
    }

    // Reconcile highestSimpleNoteId when returning userMetadata so client gets correct value
    const effectiveHighestForChanges = userMetaForResponse
      ? await getEffectiveHighestSimpleNoteId(auth.userId)
      : 0;

    const changes = {
      timestamp: new Date().toISOString(),
      cursor: `timestamp_${Date.now()}`,
      hasChanges: changedSpaces.length > 0 || changedThreads.length > 0 || changedNotes.length > 0 ||
                  changedNoteThreads.length > 0 || changedTags.length > 0 || changedNoteTags.length > 0 ||
                  changedUserMetadata !== null && changedUserMetadata !== undefined,
      spaces: changedSpaces,
      threads: changedThreads,
      notes: changedNotes.map((n) => ({ ...n, secondaryCollections: parseNoteSecondaryCollections(n.secondaryCollections) })),
      noteThreads: changedNoteThreads,
      tags: changedTags,
      noteTags: changedNoteTags,
      userMetadata: userMetaForResponse ? (() => {
        const { lockPinHash, ...rest } = userMetaForResponse;
        return { ...rest, highestSimpleNoteId: effectiveHighestForChanges, hasLockPinSet: !!lockPinHash };
      })() : null,
    };

    return c.json(changes, 200, { 'Cache-Control': 'private, no-cache' });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/sync/changes', action: 'incremental_sync' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
