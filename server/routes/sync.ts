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
  NoteVersions,
  NoteThreads,
  NoteConnections,
  StudyThreadEntries,
  Tags,
  NoteTags,
  UserMetadata,
  SpaceNotes,
  SpaceMemberships,
  eq,
  ne,
  and,
  gt,
  or,
  inArray,
  asc,
  desc,
  sql,
  isNull,
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
import { formatNoteDefaultTitle } from '@/utils/date-formatting';
import { isTiptapBodyEmpty } from '@/utils/prototype-note-empty';
import { tryConsumeNoteCreates, MAX_NOTE_CREATES_PER_SYNC_PUSH, getClientIP } from '@/utils/rate-limit';
import { generateNoteId, generateThreadId, generateSpaceId, generateStudyThreadEntryId } from '@/utils/ids';
import { ensureUnorganizedThread } from '../utils/unorganized-thread';
import { detectScripture, getPrimaryReference, normalizeScriptureReference } from '@/utils/scripture-detector';
import {
  processScriptureReferences,
  transformCanonicalScriptureContent,
} from '../utils/process-scripture-references';
import { fetchVerseText } from '../utils/fetch-verse-text';
import { isStudyThreadEntriesTableMissing, isNoteConnectionsTableMissing } from '../utils/pg-undefined-relation';
import { deleteSingleNoteCascadeForUser } from '../utils/delete-note-cascade';
import { loadDeletedEntitiesSince, recordDeletedEntities } from '../utils/sync-deletion-log';
import { broadcastInvalidationForSyncPush } from '../utils/realtime';
import {
  requireSpaceAccess,
  canAuthorInSpace,
  isActualSpaceOwner,
  SpaceAccessError,
} from '../utils/space-access';
import { getOrCreateTag, noteHasTagWithNormalizedName, addDismissedAutoTag, parseDismissedAutoTags, serializeDismissedAutoTags } from '../utils/tag-helpers';
import {
  NOT_ONBOARDING_NOTES_THREAD,
  NOT_ONBOARDING_SYSTEM_NOTES,
  NOT_ONBOARDING_THREADS,
  NOT_ONBOARDING_JUNCTION_THREAD,
} from '../utils/purge-onboarding-content';
import { ensurePersonalHomeSpace } from '../utils/ensure-personal-home-space';
import {
  createInitialNoteVersion,
  noteVersionErrorResponse,
  resolveLockedEncryptionState,
  updateCanonicalNoteInTransaction,
} from '../utils/note-version-service';
import {
  associateAuthoredNoteWithSpace,
  authorizeNoteThreadMutationInTransaction,
  deleteThreadInTransaction,
  setSingularThreadPin,
  softDeleteSharedSpaceInTransaction,
} from '../utils/shared-space-lifecycle';
import { broadcastCanonicalNoteInvalidation } from '../utils/broadcast-shared-space-note';
import {
  hasSharedNoteOrganizationMutation,
  normalizeSharedNoteOrganizationMutation,
} from '../utils/shared-note-serializer';
import { resolveCreateThreadAttachment } from '../utils/space-note-associations';

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

// ─── Space authoring gate for sync clients ─────────────────────────────
//
// Sync push is a second full write surface for notes/threads, so a
// client-supplied spaceId must pass the same gates as the direct create
// endpoints (/api/notes/create, /api/threads/create) — otherwise any
// authenticated user could author into a shared space they were never
// invited to. Failures are per-mutation errors, never thrown.

type SyncSpaceGate =
  | { ok: true; spaceId: string | null; spaceType: string | null }
  | { ok: false; error: string };

export function resolveSyncCanonicalTarget(
  spaceType: string | null,
  requestedSpaceId: string | null,
  myHomeSpaceId: string | null,
): { canonicalSpaceId: string | null; associationSpaceId: string | null } {
  if (spaceType === 'shared' || spaceType === 'public') {
    if (!myHomeSpaceId) throw new Error('My Home is required for shared sync notes');
    return { canonicalSpaceId: myHomeSpaceId, associationSpaceId: requestedSpaceId };
  }
  return { canonicalSpaceId: requestedSpaceId, associationSpaceId: null };
}

export function resolveSyncThreadPolicy(
  spaceType: string | null,
  requested: { isPublic?: unknown; isPinned?: unknown },
): { ok: true; isPublic: boolean; singularPin: boolean } | { ok: false; error: string } {
  const shared = spaceType === 'shared' || spaceType === 'public';
  if (shared && requested.isPublic === true) {
    return { ok: false, error: 'Shared-space Threads cannot be public' };
  }
  return {
    ok: true,
    isPublic: shared ? false : requested.isPublic === true,
    singularPin: shared && requested.isPinned === true,
  };
}

export function syncStudyEntryRequiresHttp(spaceType: string | null | undefined): boolean {
  return spaceType === 'shared' || spaceType === 'public';
}

export function syncCanonicalUpdateRequiresExpectedVersion(data: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(data, 'title') ||
    Object.prototype.hasOwnProperty.call(data, 'content') ||
    Object.prototype.hasOwnProperty.call(data, 'contentEncrypted')
  );
}

export function syncSharedSpaceLifecycleUpdateError(
  spaceType: string,
  payload: Record<string, unknown>,
): string | null {
  if (
    (spaceType === 'shared' || spaceType === 'public') &&
    Object.prototype.hasOwnProperty.call(payload, 'isActive')
  ) {
    return 'SHARED_SPACE_DELETE_HTTP_REQUIRED: use the dedicated delete mutation';
  }
  return null;
}

async function gateSyncSpaceId(
  userId: string,
  rawSpaceId: unknown,
  opts: { structure?: boolean; contentEncrypted?: boolean } = {},
): Promise<SyncSpaceGate> {
  if (typeof rawSpaceId !== 'string' || !rawSpaceId.trim() || rawSpaceId === 'default_space') {
    return { ok: true, spaceId: null, spaceType: null };
  }
  const spaceId = rawSpaceId.trim();
  try {
    const { space, role } = await requireSpaceAccess(spaceId, userId);
    if (opts.structure) {
      if (space.type !== 'personal' && !isActualSpaceOwner(space, userId)) {
        return { ok: false, error: 'Only the space owner can create threads in a shared space' };
      }
    } else if (!canAuthorInSpace(space, role)) {
      return { ok: false, error: 'You cannot add notes to this space' };
    }
    if (opts.contentEncrypted && space.type !== 'personal') {
      return { ok: false, error: "Locked notes can't be created in shared spaces" };
    }
    return { ok: true, spaceId, spaceType: space.type };
  } catch (err) {
    if (err instanceof SpaceAccessError) return { ok: false, error: err.message };
    throw err;
  }
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
    const lifecycleError = syncSharedSpaceLifecycleUpdateError(existing.type, data);
    if (lifecycleError) return { success: false, error: lifecycleError };
    await db.update(Spaces).set({
      title: data.title,
      description: data.description,
      color: data.color,
      backgroundGradient: data.backgroundGradient,
      isPublic: data.isPublic,
      ...(existing.type === 'personal' ? { isActive: data.isActive } : {}),
      order: data.order,
      updatedAt: nowISO(),
    }).where(eq(Spaces.id, entityId));
    return { success: true, entityId, serverId: entityId };
  } else if (operation === 'delete') {
    const existing = first(
      await db.select().from(Spaces).where(and(eq(Spaces.id, entityId), eq(Spaces.userId, userId))).limit(1),
    );
    if (!existing) return { success: false, error: 'Space not found' };
    if (existing.type !== 'personal') {
      await db.transaction((tx) =>
        softDeleteSharedSpaceInTransaction(tx, {
          spaceId: entityId,
          ownerId: userId,
          now: nowISO(),
        }),
      );
    } else {
      await db.update(Spaces).set({ isActive: false, updatedAt: nowISO() }).where(and(eq(Spaces.id, entityId), eq(Spaces.userId, userId)));
    }
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

    const spaceGate = await gateSyncSpaceId(userId, data.spaceId, { structure: true });
    if (!spaceGate.ok) return { success: false, error: spaceGate.error };
    const threadPolicy = resolveSyncThreadPolicy(spaceGate.spaceType, data);
    if (!threadPolicy.ok) return { success: false, error: threadPolicy.error };

    const now = nowISO();
    const newThread = await db.transaction(async (tx) => {
      const created = first(await tx.insert(Threads).values({
        id: entityId.startsWith('local_') ? generateThreadId() : entityId,
        title: data.title,
        subtitle: data.subtitle || null,
        spaceId: spaceGate.spaceId,
        color: data.color || null,
        isPublic: threadPolicy.isPublic,
        isPinned: false,
        order: data.order || 0,
        userId,
        createdAt: now,
        updatedAt: now,
        lastVisited: data.lastVisited ? new Date(data.lastVisited) : now,
      }).returning())!;
      if (threadPolicy.singularPin && spaceGate.spaceId) {
        await setSingularThreadPin(tx, {
          spaceId: spaceGate.spaceId,
          threadId: created.id,
          isPinned: true,
          now,
        });
        created.isPinned = true;
      } else if (data.isPinned === true) {
        await tx.update(Threads).set({ isPinned: true }).where(eq(Threads.id, created.id));
        created.isPinned = true;
      }
      return created;
    });

    // Cache the result for idempotency
    if (clientMutationId) {
      processedMutations.set(clientMutationId, { serverId: newThread.id, data: { color: newThread.color }, timestamp: Date.now() });
    }

    return { success: true, entityId, serverId: newThread.id, data: { color: newThread.color } };
  } else if (operation === 'update') {
    const existing = first(await db.select().from(Threads).where(and(eq(Threads.id, entityId), eq(Threads.userId, userId))).limit(1));
    if (!existing) return { success: false, error: 'Thread not found' };
    let nextThreadSpaceId: string | null | undefined = data.spaceId;
    if (data.spaceId !== undefined && (data.spaceId ?? null) !== (existing.spaceId ?? null)) {
      const spaceGate = await gateSyncSpaceId(userId, data.spaceId, { structure: true });
      if (!spaceGate.ok) return { success: false, error: spaceGate.error };
      nextThreadSpaceId = spaceGate.spaceId;
    }
    const effectiveSpaceId = nextThreadSpaceId === undefined ? existing.spaceId : nextThreadSpaceId;
    const effectiveSpace = effectiveSpaceId
      ? first(await db.select().from(Spaces).where(eq(Spaces.id, effectiveSpaceId)).limit(1))
      : null;
    if (effectiveSpace && effectiveSpace.type !== 'personal') {
      const gate = await gateSyncSpaceId(userId, effectiveSpace.id, { structure: true });
      if (!gate.ok) return { success: false, error: gate.error };
    }
    const threadPolicy = resolveSyncThreadPolicy(effectiveSpace?.type ?? null, data);
    if (!threadPolicy.ok) return { success: false, error: threadPolicy.error };
    const isSharedThread =
      effectiveSpace?.type === 'shared' || effectiveSpace?.type === 'public';
    const updateNow = nowISO();
    await db.transaction(async (tx) => {
      await tx.update(Threads).set({
        title: data.title,
        subtitle: data.subtitle,
        spaceId: effectiveSpaceId,
        color: data.color,
        ...(isSharedThread
          ? { isPublic: false, shareToken: null, shareTokenCreatedAt: null }
          : data.isPublic !== undefined
            ? { isPublic: threadPolicy.isPublic }
            : {}),
        ...(effectiveSpace?.type === 'personal' && data.isPinned !== undefined
          ? { isPinned: Boolean(data.isPinned) }
          : {}),
        order: data.order,
        updatedAt: updateNow,
        ...(data.lastVisited && { lastVisited: new Date(data.lastVisited) }),
      }).where(eq(Threads.id, entityId));
      if (
        effectiveSpaceId &&
        effectiveSpace?.type !== 'personal' &&
        typeof data.isPinned === 'boolean'
      ) {
        await setSingularThreadPin(tx, {
          spaceId: effectiveSpaceId,
          threadId: entityId,
          isPinned: data.isPinned,
          now: updateNow,
        });
      }
    });
    return { success: true, entityId, serverId: entityId, data: { color: data.color } };
  } else if (operation === 'delete') {
    if (entityId === 'thread_unorganized') {
      return { success: false, error: 'Cannot delete unorganized thread' };
    }
    const existing = first(await db.select().from(Threads).where(and(eq(Threads.id, entityId), eq(Threads.userId, userId))).limit(1));
    if (!existing) return { success: false, error: 'Thread not found' };
    if (existing.spaceId) {
      const gate = await gateSyncSpaceId(userId, existing.spaceId, { structure: true });
      if (!gate.ok) return { success: false, error: gate.error };
    }

    await db.transaction((tx) =>
      deleteThreadInTransaction(tx, { threadId: entityId, actorId: userId }),
    );
    await recordDeletedEntities(userId, 'thread', [entityId]);
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
    let threadId = data.threadId || 'thread_unorganized';
    if (threadId.startsWith('local_')) {
      console.warn(`[processNoteMutation] Thread ${threadId} is a local ID, using unorganized`);
      threadId = 'thread_unorganized';
    }

    // Scripture detection for offline-created notes saved as 'default'
    let noteType = data.noteType || 'default';
    let noteTitle = data.title;
    let noteContent = data.content;
    if (!noteTitle?.trim() && noteContent && !isTiptapBodyEmpty(noteContent)) {
      noteTitle = formatNoteDefaultTitle(new Date());
    }
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

    const spaceGate = await gateSyncSpaceId(userId, data.spaceId, {
      contentEncrypted: Boolean(data.contentEncrypted),
    });
    if (!spaceGate.ok) return { success: false, error: spaceGate.error };

    const serverNoteId = entityId.startsWith('local_') ? generateNoteId() : entityId;
    const isSharedTarget =
      spaceGate.spaceType === 'shared' || spaceGate.spaceType === 'public';
    const myHomeSpaceId = isSharedTarget ? await ensurePersonalHomeSpace(userId) : null;
    const syncTarget = resolveSyncCanonicalTarget(
      spaceGate.spaceType,
      spaceGate.spaceId,
      myHomeSpaceId,
    );
    const canonicalSpaceId = syncTarget.canonicalSpaceId;
    if (!data.contentEncrypted && typeof noteContent === 'string') {
      noteContent = transformCanonicalScriptureContent({
        noteId: serverNoteId,
        content: noteContent,
        translation: 'NET',
        pillsOnly: noteType !== 'scripture',
      }).updatedContent;
    }
    const newNote = await db.transaction(async (tx) => {
      const lockedMetadata = first(
        await tx
          .select()
          .from(UserMetadata)
          .where(eq(UserMetadata.userId, userId))
          .for('update')
          .limit(1),
      );
      if (!lockedMetadata) throw new Error('User metadata missing during sync note create');
      if (isSharedTarget && spaceGate.spaceId) {
        const lockedTarget = first(
          await tx
            .select({ id: Spaces.id, deletedAt: Spaces.deletedAt })
            .from(Spaces)
            .where(eq(Spaces.id, spaceGate.spaceId))
            .for('update')
            .limit(1),
        );
        if (!lockedTarget || lockedTarget.deletedAt) throw new Error('Shared space not found');
      }
      const requestedRealThread =
        Boolean(threadId) &&
        threadId !== 'thread_unorganized' &&
        !threadId.startsWith('thread_onboarding_');
      const targetThread = requestedRealThread
        ? first(
            await tx
              .select({
                id: Threads.id,
                spaceId: Threads.spaceId,
                userId: Threads.userId,
                isPinned: Threads.isPinned,
              })
              .from(Threads)
              .where(eq(Threads.id, threadId))
              .for('update')
              .limit(1),
          )
        : null;
      const threadPlan = resolveCreateThreadAttachment({
        requestedThreadId: threadId,
        targetSpaceId: spaceGate.spaceId,
        targetSpaceType: spaceGate.spaceType,
        actorId: userId,
        noteAuthorId: userId,
        thread: targetThread ?? null,
      });
      const finalSimpleNoteId =
        Math.max(effectiveHighest, lockedMetadata.highestSimpleNoteId ?? 0) + 1;
      const created = first(await tx.insert(Notes).values({
        id: serverNoteId,
        title: noteTitle || null,
        content: noteContent,
        threadId: threadPlan.canonicalThreadId,
        spaceId: canonicalSpaceId,
        simpleNoteId: finalSimpleNoteId,
        noteType,
        addedBy: 'user',
        isPublic: false,
        isFeatured: false,
        order: isSharedTarget ? 0 : data.order || 0,
        userId,
        createdAt: now,
        updatedAt: now,
        lastVisited: data.lastVisited ? new Date(data.lastVisited) : now,
        contentEncrypted: data.contentEncrypted || false,
        linkedFromNoteId: resolvedLinkedFromNoteId,
        primaryCollection: isSharedTarget ? null : createPrimary,
        secondaryCollections: isSharedTarget ? null : createSecondaryStored,
        collectionPinned:
          isSharedTarget
            ? false
            : typeof data.collectionPinned === 'boolean'
              ? data.collectionPinned
              : false,
        collectionUserOverride:
          isSharedTarget
            ? false
            : typeof data.collectionUserOverride === 'boolean'
              ? data.collectionUserOverride
              : false,
        collectionLastAutoUpdatedAt: isSharedTarget ? null : collectionLastAutoCreate,
        studyThreadUserOverride:
          typeof data.studyThreadUserOverride === 'boolean' ? data.studyThreadUserOverride : false,
        studyThreadPinned: typeof data.studyThreadPinned === 'boolean' ? data.studyThreadPinned : false,
      }).returning())!;
      await createInitialNoteVersion(tx, {
        noteId: created.id,
        noteAuthorId: userId,
        content: {
          title: created.title,
          content: created.content,
          contentEncrypted: created.contentEncrypted,
        },
        createdAt: now,
        source: 'sync-create',
      });
      if (syncTarget.associationSpaceId) {
        const associated = await associateAuthoredNoteWithSpace(tx, {
          spaceId: syncTarget.associationSpaceId,
          noteId: created.id,
          actorId: userId,
          now,
        });
        if (hasSharedNoteOrganizationMutation(data)) {
          const associatedOrganization =
            associated.association as typeof SpaceNotes.$inferSelect;
          const normalized = normalizeSharedNoteOrganizationMutation(
            data,
            associatedOrganization,
          );
          await tx
            .update(SpaceNotes)
            .set({ ...normalized.patch, updatedAt: now })
            .where(eq(SpaceNotes.id, associatedOrganization.id));
        }
      }
      if (threadPlan.attachThreadId) {
        await tx
          .insert(NoteThreads)
          .values({
            id: generateNoteId(),
            noteId: created.id,
            threadId: threadPlan.attachThreadId,
            createdAt: now,
          })
          .onConflictDoNothing();
      }
      await tx.update(UserMetadata).set({ highestSimpleNoteId: finalSimpleNoteId, updatedAt: now }).where(eq(UserMetadata.userId, userId));
      return created;
    });

    // Mirror create-from-highlight link into the NoteConnections graph.
    if (resolvedLinkedFromNoteId) {
      try {
        await db.insert(NoteConnections).values({
          id: generateNoteId(),
          fromNoteId: resolvedLinkedFromNoteId,
          toNoteId: newNote.id,
          userId,
          spaceId: spaceGate.spaceId,
          createdAt: nowISO(),
        });
      } catch {
        // Duplicate — already connected, safe to ignore.
      }
    }

    // Generate + persist scripture pill markup so notes authored offline render pills once
    // synced (the direct /api/notes/create path does this; the sync push must match, or
    // offline-created scripture stays raw). Awaited — a fire-and-forget promise would be
    // killed when this serverless handler returns. Encrypted notes are never processed.
    if (!data.contentEncrypted && typeof noteContent === 'string' && noteContent.trim().length > 0) {
      try {
        await processScriptureReferences(newNote.id, userId, threadId, noteContent, 'NET', {
          pillsOnly: noteType !== 'scripture',
          persistParentContent: false,
        });
      } catch (err: any) {
        console.error('[processNoteMutation] scripture processing (create) failed (non-critical):', err?.message ?? err);
      }
    }

    // Cache the result for idempotency
    if (clientMutationId) {
      processedMutations.set(clientMutationId, { serverId: newNote.id, timestamp: Date.now() });
    }

    await broadcastCanonicalNoteInvalidation(userId, newNote.id, {
      type: 'note:created',
      id: newNote.id,
    });
    return { success: true, entityId, serverId: newNote.id, data: { currentVersion: 1 } };
  } else if (operation === 'update') {
    // Co-edited notes are HTTP-only. This path has no pen-lease awareness and no way
    // to surface a 409 to the person typing, and the offline queue must never hold a
    // write against a note someone else may have moved on. Answer before the
    // owner-scoped lookup below so a collaborator gets a legible error instead of
    // "Note not found" (which native treats as "recreate this as my own note").
    const anyOwnerNote = first(
      await db
        .select({ userId: Notes.userId, coEditEnabled: Notes.coEditEnabled })
        .from(Notes)
        .where(eq(Notes.id, entityId))
        .limit(1),
    ) as { userId: string; coEditEnabled: boolean } | undefined;
    if (anyOwnerNote?.coEditEnabled && anyOwnerNote.userId !== userId) {
      return {
        success: false,
        error: 'CO_EDIT_HTTP_REQUIRED: co-edited notes must be saved via PUT /api/notes/update',
      };
    }

    const existing = first(await db.select().from(Notes).where(and(eq(Notes.id, entityId), eq(Notes.userId, userId))).limit(1));
    if (!existing) return { success: false, error: 'Note not found' };
    if (
      syncCanonicalUpdateRequiresExpectedVersion(data) &&
      !Number.isInteger(data.expectedVersion)
    ) {
      return {
        success: false,
        error: 'NOTE_VERSION_REQUIRED: canonical sync updates require expectedVersion',
      };
    }

    let nextPrimary: string | null = existing.primaryCollection ?? null;
    if (data.primaryCollection !== undefined) {
      nextPrimary =
        typeof data.primaryCollection === 'string' && data.primaryCollection.trim()
          ? data.primaryCollection.trim()
          : null;
    }

    let updateSpaceGate: Extract<SyncSpaceGate, { ok: true }> | null = null;
    if (data.spaceId !== undefined) {
      const spaceGate = await gateSyncSpaceId(userId, data.spaceId, {
        contentEncrypted: data.contentEncrypted === true,
      });
      if (!spaceGate.ok) return { success: false, error: spaceGate.error };
      if (
        (spaceGate.spaceType === 'shared' || spaceGate.spaceType === 'public') &&
        spaceGate.spaceId === existing.spaceId
      ) {
        return {
          success: false,
          error:
            'SHARED_NOTE_ORGANIZATION_HTTP_REQUIRED: canonical shared-space placement requires repair',
        };
      }
      updateSpaceGate = spaceGate;
    }
    let explicitContextGate: Extract<SyncSpaceGate, { ok: true }> | null = null;
    if (data.contextSpaceId !== undefined) {
      const contextGate = await gateSyncSpaceId(userId, data.contextSpaceId, {
        contentEncrypted: data.contentEncrypted === true,
      });
      if (!contextGate.ok) return { success: false, error: contextGate.error };
      explicitContextGate = contextGate;
      if (
        contextGate.spaceType !== 'shared' &&
        contextGate.spaceType !== 'public'
      ) {
        return {
          success: false,
          error: 'SHARED_NOTE_ORGANIZATION_HTTP_REQUIRED: contextSpaceId must identify a shared space',
        };
      }
    }
    const sharedOrganizationGate =
      explicitContextGate ??
      (updateSpaceGate?.spaceType === 'shared' || updateSpaceGate?.spaceType === 'public'
        ? updateSpaceGate
        : null);
    const hasOrganizationMutation = hasSharedNoteOrganizationMutation(data);
    if (
      hasOrganizationMutation &&
      !explicitContextGate &&
      !updateSpaceGate &&
      existing.spaceId
    ) {
      const existingContextSpace = first(
        await db
          .select({ type: Spaces.type })
          .from(Spaces)
          .where(eq(Spaces.id, existing.spaceId))
          .limit(1),
      );
      if (
        existingContextSpace?.type === 'shared' ||
        existingContextSpace?.type === 'public'
      ) {
        return {
          success: false,
          error:
            'SHARED_NOTE_ORGANIZATION_HTTP_REQUIRED: explicit active context required',
        };
      }
    }
    const sharedOrganizationTarget =
      Boolean(sharedOrganizationGate?.spaceId) && hasOrganizationMutation;
    if (
      sharedOrganizationTarget &&
      (data.collectionUserOverride !== undefined ||
        data.collectionLastAutoUpdatedAt !== undefined)
    ) {
      return {
        success: false,
        error:
          'SHARED_NOTE_ORGANIZATION_HTTP_REQUIRED: unsupported shared organization fields',
      };
    }

    const updatePayload: Record<string, unknown> = { updatedAt: nowISO() };
    if (data.isPublic !== undefined) updatePayload.isPublic = data.isPublic;
    if (data.isFeatured !== undefined) updatePayload.isFeatured = data.isFeatured;
    if (data.order !== undefined && !sharedOrganizationTarget) updatePayload.order = data.order;
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
    if (data.primaryCollection !== undefined && !sharedOrganizationTarget) {
      updatePayload.primaryCollection = nextPrimary;
    }
    if (data.secondaryCollections !== undefined && !sharedOrganizationTarget) {
      updatePayload.secondaryCollections = secondaryCollectionsFromSyncPayload(data.secondaryCollections, nextPrimary);
    } else if (data.primaryCollection !== undefined && !sharedOrganizationTarget) {
      updatePayload.secondaryCollections = serializeNoteSecondaryCollections(
        normalizeSecondaryLabels(parseNoteSecondaryCollections(existing.secondaryCollections), nextPrimary),
      );
    }
    if (data.collectionPinned !== undefined && !sharedOrganizationTarget) {
      updatePayload.collectionPinned = Boolean(data.collectionPinned);
    }
    if (data.collectionUserOverride !== undefined && !sharedOrganizationTarget) {
      updatePayload.collectionUserOverride = Boolean(data.collectionUserOverride);
    }
    if (data.dismissedAutoTags !== undefined) {
      const arr = Array.isArray(data.dismissedAutoTags)
        ? data.dismissedAutoTags.filter((x: unknown): x is string => typeof x === 'string')
        : [];
      updatePayload.dismissedAutoTags = serializeDismissedAutoTags(arr);
    }
    if (data.collectionLastAutoUpdatedAt !== undefined && !sharedOrganizationTarget) {
      updatePayload.collectionLastAutoUpdatedAt =
        data.collectionLastAutoUpdatedAt == null || data.collectionLastAutoUpdatedAt === ''
          ? null
          : new Date(data.collectionLastAutoUpdatedAt);
    }
    if (data.studyThreadTitle !== undefined) {
      updatePayload.studyThreadTitle =
        typeof data.studyThreadTitle === 'string' && data.studyThreadTitle.trim()
          ? data.studyThreadTitle.trim()
          : null;
    }
    if (data.studyThreadUserOverride !== undefined) {
      updatePayload.studyThreadUserOverride = Boolean(data.studyThreadUserOverride);
    }
    if (data.studyThreadPinned !== undefined) {
      updatePayload.studyThreadPinned = Boolean(data.studyThreadPinned);
    }
    if (data.studyThreadLastAutoSuggestedAt !== undefined) {
      updatePayload.studyThreadLastAutoSuggestedAt =
        data.studyThreadLastAutoSuggestedAt == null || data.studyThreadLastAutoSuggestedAt === ''
          ? null
          : new Date(data.studyThreadLastAutoSuggestedAt);
    }

    const versioned = await db.transaction(async (tx) => {
      const result = await updateCanonicalNoteInTransaction(tx, {
        noteId: entityId,
        actorId: userId,
        expectedVersion: Number.isInteger(data.expectedVersion) ? data.expectedVersion : undefined,
        patch: (lockedNote) => ({
          ...updatePayload,
          ...(updateSpaceGate && updateSpaceGate.spaceType === 'personal'
            ? { spaceId: updateSpaceGate.spaceId }
            : {}),
          ...(data.primaryCollection !== undefined && !sharedOrganizationTarget
            ? {
                primaryCollection:
                  typeof data.primaryCollection === 'string' && data.primaryCollection.trim()
                    ? data.primaryCollection.trim()
                    : null,
              }
            : {}),
          ...(data.secondaryCollections !== undefined && !sharedOrganizationTarget
            ? {
                secondaryCollections: secondaryCollectionsFromSyncPayload(
                  data.secondaryCollections,
                  data.primaryCollection !== undefined
                    ? typeof data.primaryCollection === 'string' && data.primaryCollection.trim()
                      ? data.primaryCollection.trim()
                      : null
                    : lockedNote.primaryCollection,
                ),
              }
            : {}),
          ...(data.secondaryCollections === undefined &&
          data.primaryCollection !== undefined &&
          !sharedOrganizationTarget
            ? {
                secondaryCollections: serializeNoteSecondaryCollections(
                  normalizeSecondaryLabels(
                    parseNoteSecondaryCollections(lockedNote.secondaryCollections),
                    typeof data.primaryCollection === 'string' && data.primaryCollection.trim()
                      ? data.primaryCollection.trim()
                      : null,
                  ),
                ),
              }
            : {}),
        }),
        nextContent: (lockedNote) => {
          const targetEncrypted = resolveLockedEncryptionState(
            data.contentEncrypted,
            lockedNote.contentEncrypted,
          );
          const rawContent =
            typeof data.content === 'string' ? data.content : lockedNote.content;
          return {
            title: data.title !== undefined ? data.title : lockedNote.title,
            content:
              !targetEncrypted && typeof data.content === 'string'
                ? transformCanonicalScriptureContent({
                    noteId: entityId,
                    content: rawContent,
                    translation: 'NET',
                    pillsOnly: lockedNote.noteType !== 'scripture',
                  }).updatedContent
                : rawContent,
            contentEncrypted: targetEncrypted,
          };
        },
        source: 'sync-update',
        now: nowISO(),
        // Pre-transform body, for the list-preview truncation guard.
        incomingRawContent: typeof data.content === 'string' ? data.content : undefined,
      });
      if (
        updateSpaceGate?.spaceId &&
        (updateSpaceGate.spaceType === 'shared' || updateSpaceGate.spaceType === 'public')
      ) {
        if (!explicitContextGate) {
          await associateAuthoredNoteWithSpace(tx, {
            spaceId: updateSpaceGate.spaceId,
            noteId: entityId,
            actorId: userId,
            now: nowISO(),
          });
        }
      }
      if (sharedOrganizationTarget && sharedOrganizationGate?.spaceId) {
        const association = first(
          await tx
            .select()
            .from(SpaceNotes)
            .where(
              and(
                eq(SpaceNotes.spaceId, sharedOrganizationGate.spaceId),
                eq(SpaceNotes.noteId, entityId),
                isNull(SpaceNotes.removedAt),
              ),
            )
            .for('update')
            .limit(1),
        );
        if (!association) {
          throw new Error(
            'SHARED_NOTE_ORGANIZATION_HTTP_REQUIRED: active association required',
          );
        }
        const normalized = normalizeSharedNoteOrganizationMutation(data, association);
        const updatedAssociation = await tx
          .update(SpaceNotes)
          .set({ ...normalized.patch, updatedAt: nowISO() })
          .where(
            and(
              eq(SpaceNotes.id, association.id),
              isNull(SpaceNotes.removedAt),
            ),
          )
          .returning({ id: SpaceNotes.id });
        if (updatedAssociation.length !== 1) {
          throw new Error(
            'SHARED_NOTE_ORGANIZATION_HTTP_REQUIRED: association changed during sync',
          );
        }
      }
      return result;
    });

    // Reprocess scripture pills on the updated body (parity with /api/notes/update). Skip when
    // the note is/became encrypted or no content was sent. Omit threadId so every NoteThreads
    // row for this note is resolved (multi-thread), matching the direct update path.
    if (!versioned.note.contentEncrypted && typeof data.content === 'string' && data.content.trim().length > 0) {
      try {
        // Owner-scoped: a shared-space collaborator's queued edit must not fail the
        // util's ownership lookup (see PUT /api/notes/update).
        await processScriptureReferences(entityId, versioned.note.userId, undefined, versioned.note.content, 'NET', {
          pillsOnly: versioned.note.noteType !== 'scripture',
          persistParentContent: false,
        });
      } catch (err: any) {
        console.error('[processNoteMutation] scripture processing (update) failed (non-critical):', err?.message ?? err);
      }
    }

    await broadcastCanonicalNoteInvalidation(userId, entityId, {
      type: 'note:updated',
      id: entityId,
    });
    return {
      success: true,
      entityId,
      serverId: entityId,
      data: { currentVersion: versioned.currentVersion.version },
    };
  } else if (operation === 'delete') {
    const deleted = await deleteSingleNoteCascadeForUser(userId, entityId);
    if (deleted.deletedNoteIds.length === 0) {
      return { success: false, error: 'Note not found' };
    }
    await recordDeletedEntities(userId, 'note', deleted.deletedNoteIds);
    await recordDeletedEntities(userId, 'studyThread', deleted.deletedStudyThreadIds);
    return { success: true, entityId, serverId: entityId };
  }
  return { success: false, error: `Unknown operation: ${operation}` };
}

async function assertSyncNoteThreadPolicy(
  executor: any,
  userId: string,
  noteId: string,
  threadId: string,
  requireCurrent: boolean,
): Promise<{ shared: boolean }> {
  return authorizeNoteThreadMutationInTransaction(executor, {
    actorId: userId,
    noteId,
    threadId,
    requireCurrent,
  });
}

async function processNoteThreadMutation(userId: string, operation: string, entityId: string, data: any) {
  if (operation === 'create') {
    if (typeof data.noteId !== 'string' || typeof data.threadId !== 'string') {
      return { success: false, error: 'noteId and threadId are required' };
    }
    const newNoteThread = await db.transaction(async (tx) => {
      await assertSyncNoteThreadPolicy(tx, userId, data.noteId, data.threadId, true);
      const existing = first(
        await tx
          .select()
          .from(NoteThreads)
          .where(and(eq(NoteThreads.noteId, data.noteId), eq(NoteThreads.threadId, data.threadId)))
          .for('update')
          .limit(1),
      );
      if (existing) return existing;
      return first(
        await tx
          .insert(NoteThreads)
          .values({
            id: entityId.startsWith('local_') ? generateNoteId() : entityId,
            noteId: data.noteId,
            threadId: data.threadId,
            createdAt: nowISO(),
          })
          .returning(),
      )!;
    });
    return { success: true, entityId, serverId: newNoteThread.id };
  } else if (operation === 'update') {
    const updated = await db.transaction(async (tx) => {
      const existing = first(
        await tx.select().from(NoteThreads).where(eq(NoteThreads.id, entityId)).for('update').limit(1),
      );
      if (!existing) throw new Error('Note Thread link not found');
      await assertSyncNoteThreadPolicy(tx, userId, existing.noteId, existing.threadId, false);
      const noteId = typeof data.noteId === 'string' ? data.noteId : existing.noteId;
      const threadId = typeof data.threadId === 'string' ? data.threadId : existing.threadId;
      await assertSyncNoteThreadPolicy(tx, userId, noteId, threadId, true);
      return first(
        await tx
          .update(NoteThreads)
          .set({ noteId, threadId })
          .where(eq(NoteThreads.id, entityId))
          .returning(),
      )!;
    });
    return { success: true, entityId, serverId: updated.id };
  } else if (operation === 'delete') {
    const deletion = await db.transaction(async (tx) => {
      const existing =
        first(await tx.select().from(NoteThreads).where(eq(NoteThreads.id, entityId)).for('update').limit(1)) ??
        (typeof data.noteId === 'string' && typeof data.threadId === 'string'
          ? first(
              await tx
                .select()
                .from(NoteThreads)
                .where(and(eq(NoteThreads.noteId, data.noteId), eq(NoteThreads.threadId, data.threadId)))
                .for('update')
                .limit(1),
            )
          : null);
      if (!existing) throw new Error('Note Thread link not found');
      const policy = await assertSyncNoteThreadPolicy(
        tx,
        userId,
        existing.noteId,
        existing.threadId,
        false,
      );
      await tx.delete(NoteThreads).where(eq(NoteThreads.id, existing.id));
      const remaining = await tx.select().from(NoteThreads).where(eq(NoteThreads.noteId, existing.noteId));
      return { noteId: existing.noteId, remaining: remaining.length, shared: policy.shared };
    });
    if (!deletion.shared && deletion.remaining === 0) {
      await ensureUnorganizedThread(userId);
      await db.update(Notes).set({ threadId: 'thread_unorganized' }).where(eq(Notes.id, deletion.noteId));
    }
    return { success: true, entityId, serverId: entityId };
  }
  return { success: false, error: `Unknown operation: ${operation}` };
}

async function processTagMutation(userId: string, operation: string, entityId: string, data: any) {
  if (operation === 'create') {
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) return { success: false, error: 'Tag name is required' };
    const { tagId } = await getOrCreateTag(userId, name, {
      color: data.color || null,
      category: data.category || null,
      isSystem: data.isSystem || false,
    });
    return { success: true, entityId, serverId: tagId };
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

    const tagRow = first(await db.select().from(Tags).where(and(eq(Tags.id, data.tagId), eq(Tags.userId, userId))).limit(1));
    if (!tagRow) return { success: false, error: 'Tag not found' };

    const { tagId: canonicalTagId } = await getOrCreateTag(userId, tagRow.name, {
      color: tagRow.color,
      category: tagRow.category,
      isSystem: tagRow.isSystem,
    });

    const existingRelation = first(
      await db.select().from(NoteTags).where(and(eq(NoteTags.noteId, data.noteId), eq(NoteTags.tagId, canonicalTagId))).limit(1),
    );
    if (existingRelation) return { success: true, entityId, serverId: existingRelation.id };

    if (await noteHasTagWithNormalizedName(data.noteId, tagRow.name, userId)) {
      return { success: true, entityId, serverId: entityId };
    }

    const newNoteTag = first(await db.insert(NoteTags).values({
      id: entityId.startsWith('local_') ? generateNoteId() : entityId,
      noteId: data.noteId,
      tagId: canonicalTagId,
      isAutoGenerated: data.isAutoGenerated || false,
      confidence: data.confidence || null,
      createdAt: nowISO(),
    }).returning())!;
    return { success: true, entityId, serverId: newNoteTag.id };
  } else if (operation === 'delete') {
    const note = first(await db.select().from(Notes).where(and(eq(Notes.id, data.noteId), eq(Notes.userId, userId))).limit(1));
    if (!note) return { success: false, error: 'Note not found' };

    const link = first(
      await db
        .select({
          isAutoGenerated: NoteTags.isAutoGenerated,
          name: Tags.name,
        })
        .from(NoteTags)
        .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
        .where(and(eq(NoteTags.noteId, data.noteId), eq(NoteTags.tagId, data.tagId)))
        .limit(1),
    );

    await db.delete(NoteTags).where(and(eq(NoteTags.noteId, data.noteId), eq(NoteTags.tagId, data.tagId)));

    if (link?.isAutoGenerated === true && link.name) {
      await addDismissedAutoTag(data.noteId, link.name);
    }

    return { success: true, entityId, serverId: entityId };
  }
  return { success: false, error: `Unknown operation: ${operation}` };
}

async function processStudyThreadEntryMutation(userId: string, operation: string, entityId: string, data: any) {
  const ENTRY_KINDS = new Set(['workspace', 'miniNote', 'linkedNote', 'scriptureLink']);
  if (operation === 'create') {
    const parentNoteId = data?.parentNoteId as string | undefined;
    if (!parentNoteId) return { success: false, error: 'parentNoteId required' };
    const note = first(await db.select().from(Notes).where(and(eq(Notes.id, parentNoteId), eq(Notes.userId, userId))).limit(1));
    if (!note) return { success: false, error: 'Note not found' };
    const requestedContextSpaceId =
      typeof data.contextSpaceId === 'string'
        ? data.contextSpaceId
        : typeof data.spaceId === 'string'
          ? data.spaceId
          : null;
    if (requestedContextSpaceId) {
      const contextSpace = first(
        await db.select({ type: Spaces.type }).from(Spaces).where(eq(Spaces.id, requestedContextSpaceId)).limit(1),
      );
      if (syncStudyEntryRequiresHttp(contextSpace?.type)) {
        return {
          success: false,
          error: 'SHARED_STUDY_THREAD_HTTP_REQUIRED: use the authoritative study-thread endpoint',
        };
      }
    }
    const id = entityId.startsWith('local_') ? generateStudyThreadEntryId() : entityId;
    const entryKind =
      typeof data.entryKind === 'string' && ENTRY_KINDS.has(data.entryKind) ? data.entryKind : 'miniNote';
    const now = nowISO();
    const spaceId = typeof note.spaceId === 'string' && note.spaceId ? note.spaceId : null;
    await db.insert(StudyThreadEntries).values({
      id,
      userId,
      parentNoteId,
      spaceId,
      entryKindRaw: entryKind,
      highlightAccentRaw: typeof data.highlightAccentRaw === 'string' ? data.highlightAccentRaw : 'warmAmber',
      sourceSnippet: typeof data.sourceSnippet === 'string' ? data.sourceSnippet : '',
      focusTitle: typeof data.focusTitle === 'string' ? data.focusTitle : '',
      notesBody: typeof data.notesBody === 'string' ? data.notesBody : '',
      miniNoteBody: typeof data.miniNoteBody === 'string' ? data.miniNoteBody : '',
      linkedNoteId: typeof data.linkedNoteId === 'string' ? data.linkedNoteId : null,
      linkedNoteTitle: typeof data.linkedNoteTitle === 'string' ? data.linkedNoteTitle : null,
      anchorLocation: typeof data.anchorLocation === 'number' ? data.anchorLocation : null,
      anchorLength: typeof data.anchorLength === 'number' ? data.anchorLength : null,
      anchorTextSnapshot: typeof data.anchorTextSnapshot === 'string' ? data.anchorTextSnapshot : null,
      scriptureReference:
        typeof data.scriptureReference === 'string'
          ? normalizeScriptureReference(data.scriptureReference.trim()) ?? data.scriptureReference
          : null,
      scripturePassageTranslation: typeof data.scripturePassageTranslation === 'string' ? data.scripturePassageTranslation : null,
      scripturePassageExcerpt: typeof data.scripturePassageExcerpt === 'string' ? data.scripturePassageExcerpt : null,
      isArchived: false,
      highlightListEditedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await db
      .update(Notes)
      .set({ updatedAt: nowISO() })
      .where(and(eq(Notes.id, parentNoteId), eq(Notes.userId, userId)));
    return { success: true, entityId, serverId: id };
  }
  if (operation === 'update') {
    const existing = first(
      await db.select().from(StudyThreadEntries).where(and(eq(StudyThreadEntries.id, entityId), eq(StudyThreadEntries.userId, userId))).limit(1),
    );
    if (!existing) return { success: false, error: 'Response not found' };
    if (existing.spaceId) {
      const contextSpace = first(
        await db.select({ type: Spaces.type }).from(Spaces).where(eq(Spaces.id, existing.spaceId)).limit(1),
      );
      if (syncStudyEntryRequiresHttp(contextSpace?.type)) {
        return {
          success: false,
          error: 'SHARED_STUDY_THREAD_HTTP_REQUIRED: use the authoritative study-thread endpoint',
        };
      }
    }
    const patch: Record<string, unknown> = { updatedAt: nowISO() };
    if (typeof data.highlightAccentRaw === 'string') {
      patch.highlightAccentRaw = data.highlightAccentRaw;
      patch.highlightListEditedAt = nowISO();
    }
    if (typeof data.sourceSnippet === 'string') patch.sourceSnippet = data.sourceSnippet;
    if (typeof data.focusTitle === 'string') patch.focusTitle = data.focusTitle;
    if (typeof data.notesBody === 'string') patch.notesBody = data.notesBody;
    if (typeof data.miniNoteBody === 'string') patch.miniNoteBody = data.miniNoteBody;
    if (typeof data.linkedNoteId === 'string' || data.linkedNoteId === null) patch.linkedNoteId = data.linkedNoteId;
    if (typeof data.linkedNoteTitle === 'string') patch.linkedNoteTitle = data.linkedNoteTitle;
    if (typeof data.anchorLocation === 'number' || data.anchorLocation === null) patch.anchorLocation = data.anchorLocation;
    if (typeof data.anchorLength === 'number' || data.anchorLength === null) patch.anchorLength = data.anchorLength;
    if (typeof data.anchorTextSnapshot === 'string' || data.anchorTextSnapshot === null) patch.anchorTextSnapshot = data.anchorTextSnapshot;
    if (typeof data.scriptureReference === 'string') {
      patch.scriptureReference = normalizeScriptureReference(data.scriptureReference.trim()) ?? data.scriptureReference;
    }
    if (typeof data.scripturePassageTranslation === 'string') patch.scripturePassageTranslation = data.scripturePassageTranslation;
    if (typeof data.scripturePassageExcerpt === 'string') patch.scripturePassageExcerpt = data.scripturePassageExcerpt;
    if (typeof data.isArchived === 'boolean') patch.isArchived = data.isArchived;
    if (typeof data.entryKind === 'string' && ENTRY_KINDS.has(data.entryKind)) patch.entryKindRaw = data.entryKind;
    await db.update(StudyThreadEntries).set(patch as any).where(and(eq(StudyThreadEntries.id, entityId), eq(StudyThreadEntries.userId, userId)));
    await db
      .update(Notes)
      .set({ updatedAt: nowISO() })
      .where(and(eq(Notes.id, existing.parentNoteId), eq(Notes.userId, userId)));
    return { success: true, entityId, serverId: entityId };
  }
  if (operation === 'delete') {
    const existing = first(
      await db.select().from(StudyThreadEntries).where(and(eq(StudyThreadEntries.id, entityId), eq(StudyThreadEntries.userId, userId))).limit(1),
    );
    if (!existing) return { success: false, error: 'Response not found' };
    if (existing.spaceId) {
      const contextSpace = first(
        await db.select({ type: Spaces.type }).from(Spaces).where(eq(Spaces.id, existing.spaceId)).limit(1),
      );
      if (syncStudyEntryRequiresHttp(contextSpace?.type)) {
        return {
          success: false,
          error: 'SHARED_STUDY_THREAD_HTTP_REQUIRED: use the authoritative study-thread endpoint',
        };
      }
    }
    await db.delete(StudyThreadEntries).where(and(eq(StudyThreadEntries.id, entityId), eq(StudyThreadEntries.userId, userId)));
    await db
      .update(Notes)
      .set({ updatedAt: nowISO() })
      .where(and(eq(Notes.id, existing.parentNoteId), eq(Notes.userId, userId)));
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
          case 'studyThreadEntry': result = await processStudyThreadEntryMutation(auth.userId, operation, entityId, data); break;
          default: result = { success: false, error: `Unknown entity type: ${entityType}` };
        }
        results.push({ ...result, operationId });
      } catch (error) {
        const versionError = noteVersionErrorResponse(error);
        results.push({
          success: false,
          operationId: mutation.operationId,
          error: versionError?.message ?? (error instanceof Error ? error.message : String(error)),
          ...(versionError ? { code: versionError.code, status: versionError.status } : {}),
        });
      }
    }

    broadcastInvalidationForSyncPush(auth.userId, mutations, results);

    return c.json({ results }, 200, { 'Cache-Control': 'private, no-cache' });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/sync/push', action: 'push_sync' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * Max non-scripture notes returned in a single bootstrap / changes page. Bounds
 * worst-case payload (e.g. a huge backlog after long offline). The changes
 * endpoint resumes from the last returned note via the cursor, so a capped page
 * is not data loss — subsequent syncs catch up. Set high enough that typical
 * deltas are never capped.
 */
const SYNC_NOTE_PAGE_LIMIT = 1000;

// ─── GET /api/sync/bootstrap ──────────────────────────────────────────

app.get('/api/sync/bootstrap', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const [spaces, threads, notes, noteThreads, noteConnections, tags, noteTags, studyThreadEntries, userMetadataRows] = await Promise.all([
      db.select({
        id: Spaces.id, title: Spaces.title, description: Spaces.description, color: Spaces.color,
        backgroundGradient: Spaces.backgroundGradient, isPublic: Spaces.isPublic, isActive: Spaces.isActive,
        order: Spaces.order, createdAt: Spaces.createdAt, updatedAt: Spaces.updatedAt,
      }).from(Spaces).where(eq(Spaces.userId, auth.userId)),

      db.select({
        id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, spaceId: Threads.spaceId,
        color: Threads.color, isPublic: Threads.isPublic, isPinned: Threads.isPinned, order: Threads.order,
        lastVisited: Threads.lastVisited, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt,
      }).from(Threads).where(and(eq(Threads.userId, auth.userId), NOT_ONBOARDING_THREADS)),

      db.select({
        id: Notes.id, title: Notes.title, content: Notes.content, threadId: Notes.threadId,
        spaceId: Notes.spaceId, simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType,
        addedBy: Notes.addedBy, isPublic: Notes.isPublic, isPinned: Notes.isPinned, isFeatured: Notes.isFeatured,
        order: Notes.order, lastVisited: Notes.lastVisited, createdAt: Notes.createdAt,
        updatedAt: Notes.updatedAt, contentEncrypted: Notes.contentEncrypted,
        linkedFromNoteId: Notes.linkedFromNoteId,
        primaryCollection: Notes.primaryCollection,
        secondaryCollections: Notes.secondaryCollections,
        collectionPinned: Notes.collectionPinned,
        collectionUserOverride: Notes.collectionUserOverride,
        collectionLastAutoUpdatedAt: Notes.collectionLastAutoUpdatedAt,
        dismissedAutoTags: Notes.dismissedAutoTags,
        studyThreadTitle: Notes.studyThreadTitle,
        studyThreadUserOverride: Notes.studyThreadUserOverride,
        studyThreadPinned: Notes.studyThreadPinned,
        studyThreadLastAutoSuggestedAt: Notes.studyThreadLastAutoSuggestedAt,
        currentVersion: sql<number | null>`(
          SELECT ${NoteVersions.version}
          FROM ${NoteVersions}
          WHERE ${NoteVersions.id} = ${Notes.currentVersionId}
          LIMIT 1
        )`,
      }).from(Notes).where(and(
        eq(Notes.userId, auth.userId),
        ne(Notes.noteType, 'scripture'),
        NOT_ONBOARDING_NOTES_THREAD,
        NOT_ONBOARDING_SYSTEM_NOTES,
      ))
        // Newest-first so the most relevant notes are included when a user has more
        // than the cap; fetch one extra to detect truncation.
        .orderBy(desc(sql`coalesce(${Notes.updatedAt}, ${Notes.createdAt})`))
        .limit(SYNC_NOTE_PAGE_LIMIT + 1),

      db.select({
        id: NoteThreads.id, noteId: NoteThreads.noteId, threadId: NoteThreads.threadId,
        createdAt: NoteThreads.createdAt,
      }).from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
        .where(and(
          eq(Notes.userId, auth.userId),
          NOT_ONBOARDING_NOTES_THREAD,
          NOT_ONBOARDING_JUNCTION_THREAD,
        )),

      (async () => {
        try {
          return await db
            .select({
              id: NoteConnections.id,
              fromNoteId: NoteConnections.fromNoteId,
              toNoteId: NoteConnections.toNoteId,
              spaceId: NoteConnections.spaceId,
              createdAt: NoteConnections.createdAt,
            })
            .from(NoteConnections)
            .where(eq(NoteConnections.userId, auth.userId));
        } catch (e) {
          if (isNoteConnectionsTableMissing(e)) {
            console.warn(
              '[sync/bootstrap] NoteConnections table missing; returning empty connections. Run `npm run db:push`.',
            );
            return [];
          }
          throw e;
        }
      })(),

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

      (async () => {
        try {
          return await db.select().from(StudyThreadEntries).where(eq(StudyThreadEntries.userId, auth.userId));
        } catch (e) {
          if (isStudyThreadEntriesTableMissing(e)) {
            console.warn(
              '[sync/bootstrap] StudyThreadEntries table missing; returning empty study threads. Run `npm run db:push` or apply server/db/manual/create-study-thread-entries.sql.',
            );
            return [];
          }
          throw e;
        }
      })(),

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
        appearanceSettings: UserMetadata.appearanceSettings,
      }).from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1),
    ]);

    const userMetadata = first(userMetadataRows);

    // Cap the notes page and signal truncation so clients can later page if needed.
    const notesTruncated = notes.length > SYNC_NOTE_PAGE_LIMIT;
    const notesPage = notesTruncated ? notes.slice(0, SYNC_NOTE_PAGE_LIMIT) : notes;

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
      notesTruncated,
      spaces,
      threads,
      notes: notesPage.map((n) => ({
        ...n,
        secondaryCollections: parseNoteSecondaryCollections(n.secondaryCollections),
        dismissedAutoTags: parseDismissedAutoTags(n.dismissedAutoTags),
      })),
      noteThreads,
      noteConnections,
      tags,
      noteTags,
      studyThreadEntries,
      deletedNoteConnectionIds: [],
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

    const [changedSpaces, changedThreads, changedNotes, changedNoteThreads, changedNoteConnections, changedTags, changedNoteTags, changedStudyThreadEntries, changedUserMetadataRows, deletedFeed] = await Promise.all([
      db.select({
        id: Spaces.id, title: Spaces.title, description: Spaces.description, color: Spaces.color,
        backgroundGradient: Spaces.backgroundGradient, isPublic: Spaces.isPublic, isActive: Spaces.isActive,
        order: Spaces.order, createdAt: Spaces.createdAt, updatedAt: Spaces.updatedAt,
      }).from(Spaces).where(and(eq(Spaces.userId, auth.userId), or(gt(Spaces.updatedAt, sinceDate), gt(Spaces.createdAt, sinceDate)))),

      db.select({
        id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, spaceId: Threads.spaceId,
        color: Threads.color, isPublic: Threads.isPublic, isPinned: Threads.isPinned, order: Threads.order,
        lastVisited: Threads.lastVisited, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt,
      }).from(Threads).where(and(
        eq(Threads.userId, auth.userId),
        NOT_ONBOARDING_THREADS,
        or(gt(Threads.updatedAt, sinceDate), gt(Threads.createdAt, sinceDate), gt(Threads.lastVisited, sinceDate)),
      )),

      db.select({
        id: Notes.id, title: Notes.title, content: Notes.content, threadId: Notes.threadId,
        spaceId: Notes.spaceId, simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType,
        addedBy: Notes.addedBy, isPublic: Notes.isPublic, isPinned: Notes.isPinned, isFeatured: Notes.isFeatured,
        order: Notes.order, lastVisited: Notes.lastVisited, createdAt: Notes.createdAt,
        updatedAt: Notes.updatedAt, contentEncrypted: Notes.contentEncrypted,
        linkedFromNoteId: Notes.linkedFromNoteId,
        primaryCollection: Notes.primaryCollection,
        secondaryCollections: Notes.secondaryCollections,
        collectionPinned: Notes.collectionPinned,
        collectionUserOverride: Notes.collectionUserOverride,
        collectionLastAutoUpdatedAt: Notes.collectionLastAutoUpdatedAt,
        dismissedAutoTags: Notes.dismissedAutoTags,
        studyThreadTitle: Notes.studyThreadTitle,
        studyThreadUserOverride: Notes.studyThreadUserOverride,
        studyThreadPinned: Notes.studyThreadPinned,
        studyThreadLastAutoSuggestedAt: Notes.studyThreadLastAutoSuggestedAt,
        currentVersion: sql<number | null>`(
          SELECT ${NoteVersions.version}
          FROM ${NoteVersions}
          WHERE ${NoteVersions.id} = ${Notes.currentVersionId}
          LIMIT 1
        )`,
      }).from(Notes).where(and(
        eq(Notes.userId, auth.userId),
        ne(Notes.noteType, 'scripture'),
        NOT_ONBOARDING_NOTES_THREAD,
        NOT_ONBOARDING_SYSTEM_NOTES,
        or(gt(Notes.updatedAt, sinceDate), gt(Notes.createdAt, sinceDate), gt(Notes.lastVisited, sinceDate)),
      ))
        // Oldest-first + cap so a large backlog is paged: the cursor below resumes
        // from the last returned note's timestamp (no data loss; next sync catches up).
        .orderBy(asc(sql`coalesce(${Notes.updatedAt}, ${Notes.createdAt})`))
        .limit(SYNC_NOTE_PAGE_LIMIT + 1),

      db.select({
        id: NoteThreads.id, noteId: NoteThreads.noteId, threadId: NoteThreads.threadId, createdAt: NoteThreads.createdAt,
      }).from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
        .where(and(
          eq(Notes.userId, auth.userId),
          NOT_ONBOARDING_NOTES_THREAD,
          NOT_ONBOARDING_JUNCTION_THREAD,
          gt(NoteThreads.createdAt, sinceDate),
        )),

      (async () => {
        try {
          return await db
            .select({
              id: NoteConnections.id,
              fromNoteId: NoteConnections.fromNoteId,
              toNoteId: NoteConnections.toNoteId,
              spaceId: NoteConnections.spaceId,
              createdAt: NoteConnections.createdAt,
            })
            .from(NoteConnections)
            .where(and(eq(NoteConnections.userId, auth.userId), gt(NoteConnections.createdAt, sinceDate)));
        } catch (e) {
          if (isNoteConnectionsTableMissing(e)) {
            console.warn('[sync/changes] NoteConnections table missing; returning empty connection delta.');
            return [];
          }
          throw e;
        }
      })(),

      db.select({
        id: Tags.id, name: Tags.name, color: Tags.color, category: Tags.category,
        isSystem: Tags.isSystem, createdAt: Tags.createdAt, updatedAt: Tags.updatedAt,
      }).from(Tags).where(and(eq(Tags.userId, auth.userId), or(gt(Tags.updatedAt, sinceDate), gt(Tags.createdAt, sinceDate)))),

      db.select({
        id: NoteTags.id, noteId: NoteTags.noteId, tagId: NoteTags.tagId,
        isAutoGenerated: NoteTags.isAutoGenerated, confidence: NoteTags.confidence, createdAt: NoteTags.createdAt,
      }).from(NoteTags).innerJoin(Notes, eq(Notes.id, NoteTags.noteId))
        .where(and(eq(Notes.userId, auth.userId), gt(NoteTags.createdAt, sinceDate))),

      (async () => {
        try {
          return await db
            .select()
            .from(StudyThreadEntries)
            .where(
              and(
                eq(StudyThreadEntries.userId, auth.userId),
                or(gt(StudyThreadEntries.updatedAt, sinceDate), gt(StudyThreadEntries.createdAt, sinceDate)),
              ),
            );
        } catch (e) {
          if (isStudyThreadEntriesTableMissing(e)) {
            console.warn('[sync/changes] StudyThreadEntries table missing; returning empty study-thread delta.');
            return [];
          }
          throw e;
        }
      })(),

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
        appearanceSettings: UserMetadata.appearanceSettings,
      }).from(UserMetadata).where(and(eq(UserMetadata.userId, auth.userId), or(gt(UserMetadata.updatedAt, sinceDate), gt(UserMetadata.createdAt, sinceDate)))).limit(1),

      loadDeletedEntitiesSince(auth.userId, sinceDate),
    ]);

    const changedUserMetadata = first(changedUserMetadataRows);

    // Cap the notes page. When capped, resume the cursor from the last returned
    // note's timestamp (oldest-first ordering) so the next sync continues from there
    // instead of skipping the remainder. Other entity types are small and returned
    // in full; re-applying them next round is idempotent (upsert).
    const notesPageTruncated = changedNotes.length > SYNC_NOTE_PAGE_LIMIT;
    const changedNotesPage = notesPageTruncated ? changedNotes.slice(0, SYNC_NOTE_PAGE_LIMIT) : changedNotes;
    let nextCursor = `timestamp_${Date.now()}`;
    if (notesPageTruncated && changedNotesPage.length > 0) {
      const lastNote = changedNotesPage[changedNotesPage.length - 1];
      const lastTs = lastNote.updatedAt ?? lastNote.createdAt;
      const lastMs = lastTs instanceof Date ? lastTs.getTime() : new Date(lastTs as unknown as string).getTime();
      if (Number.isFinite(lastMs)) nextCursor = `timestamp_${lastMs}`;
    }

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
      cursor: nextCursor,
      hasMore: notesPageTruncated,
      hasChanges: changedSpaces.length > 0 || changedThreads.length > 0 || changedNotesPage.length > 0 ||
                  changedNoteThreads.length > 0 || changedNoteConnections.length > 0 || changedTags.length > 0 || changedNoteTags.length > 0 ||
                  changedStudyThreadEntries.length > 0 ||
                  deletedFeed.deletedNoteIds.length > 0 ||
                  deletedFeed.deletedStudyThreadIds.length > 0 ||
                  deletedFeed.deletedThreadIds.length > 0 ||
                  deletedFeed.deletedNoteConnectionIds.length > 0 ||
                  changedUserMetadata !== null && changedUserMetadata !== undefined,
      spaces: changedSpaces,
      threads: changedThreads,
      notes: changedNotesPage.map((n) => ({
        ...n,
        secondaryCollections: parseNoteSecondaryCollections(n.secondaryCollections),
        dismissedAutoTags: parseDismissedAutoTags(n.dismissedAutoTags),
      })),
      noteThreads: changedNoteThreads,
      noteConnections: changedNoteConnections,
      tags: changedTags,
      noteTags: changedNoteTags,
      studyThreadEntries: changedStudyThreadEntries,
      deletedNoteIds: deletedFeed.deletedNoteIds,
      deletedStudyThreadIds: deletedFeed.deletedStudyThreadIds,
      deletedThreadIds: deletedFeed.deletedThreadIds,
      deletedNoteConnectionIds: deletedFeed.deletedNoteConnectionIds,
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
