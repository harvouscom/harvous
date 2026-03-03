/**
 * Server-Side User Cache — Drizzle port of src/utils/user-cache.ts
 *
 * Caches user data from Clerk API in the database (UserMetadata table).
 * Dates stored as ISO text strings.
 */

import { db, UserMetadata, InboxItems, UserInboxItems, Threads, Notes, NoteThreads, eq, and, inArray } from '../db';
import { nowISO } from '../db/dates';
import { generateReferralCode } from './referral-code';
import { getCurrentSeason } from '@/utils/season-helpers';
import { processScriptureReferences } from './process-scripture-references';

export interface CachedUserData {
  firstName: string;
  lastName: string;
  email: string;
  profileImageUrl?: string;
  initials: string;
  displayName: string;
  userColor: string;
  createdAt?: string;
}

// In-memory lock: when a new user is being initialized (metadata + onboarding thread),
// concurrent requests wait for it to finish instead of seeing half-created state.
const pendingInit = new Map<string, Promise<CachedUserData>>();

/**
 * If the user has no onboarding thread yet, create it (and notes + scripture).
 * Idempotent: no-op if thread_onboarding_${userId} already exists.
 * Exported so content route can run it before first page load to ensure scripture refs exist.
 */
export async function ensureOnboardingThreadIfMissing(userId: string): Promise<void> {
  const onboardingThreadId = `thread_onboarding_${userId}`;
  const existing = await db.select({ id: Threads.id }).from(Threads).where(eq(Threads.id, onboardingThreadId)).get();
  if (existing) return;

  const { generateNoteId } = await import('@/utils/ids');
  const { ensureUnorganizedThread } = await import('./unorganized-thread');
  const { loadOnboardingNotes } = await import('@/utils/load-onboarding-notes');

  await ensureUnorganizedThread(userId);
  const onboardingNotes = loadOnboardingNotes();
  if (onboardingNotes.length === 0) {
    console.warn('[onboarding] loadOnboardingNotes returned no notes');
    return;
  }
  const firstContent = onboardingNotes[0]?.content ?? '';
  if (!firstContent.includes('Proverbs')) {
    console.warn('[onboarding] first note content missing "Proverbs" (len=%d)', firstContent.length);
  }

  const ts = nowISO();
  try {
    await db.insert(Threads).values({
      id: onboardingThreadId,
      title: 'Welcome to Harvous',
      subtitle: `${onboardingNotes.length} notes to get you started`,
      color: 'blue',
      spaceId: null,
      userId,
      isPublic: false,
      isPinned: false,
      createdAt: ts,
      updatedAt: ts,
      lastVisited: ts,
    });
  } catch (insertError: unknown) {
    // Another request already created the onboarding thread (e.g. parallel get-profile + nav).
    // Treat as idempotent and return so we don't throw UNIQUE constraint to the caller.
    const isUnique =
      (insertError as { code?: string })?.code === 'SQLITE_CONSTRAINT' ||
      (insertError as { cause?: { code?: string } })?.cause?.code === 'SQLITE_CONSTRAINT' ||
      (insertError as Error)?.message?.includes('UNIQUE constraint failed');
    if (isUnique) {
      console.log('[onboarding] thread already created by concurrent request, skipping', { userId });
      return;
    }
    throw insertError;
  }

  const noteRecords = onboardingNotes.map((noteData, idx) => {
    const noteId = generateNoteId();
    return {
      id: noteId,
      title: noteData.title.charAt(0).toUpperCase() + noteData.title.slice(1),
      content: noteData.content,
      threadId: onboardingThreadId,
      spaceId: null,
      simpleNoteId: idx + 1,
      userId,
      isPublic: false,
      addedBy: 'system' as const,
      createdAt: ts,
      lastVisited: ts,
    };
  });
  const junctionRecords = noteRecords.map((note) => ({
    id: `note-thread-${note.id}-${Date.now()}`,
    noteId: note.id,
    threadId: onboardingThreadId,
    createdAt: nowISO(),
  }));

  await db.insert(Notes).values(noteRecords);
  await db.insert(NoteThreads).values(junctionRecords);

  await Promise.all(
    noteRecords.map(async (note, idx) => {
      try {
        const { results } = await processScriptureReferences(note.id, userId, onboardingThreadId, onboardingNotes[idx].content);
        if (results.length > 0) {
          console.log('[onboarding] scripture processed', { noteId: note.id, detectedCount: results.length, refs: results.map((r) => r.reference) });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Error processing scripture for onboarding note', note.id, msg, e);
      }
    })
  );

  await db.update(UserMetadata)
    .set({ highestSimpleNoteId: onboardingNotes.length, updatedAt: nowISO() })
    .where(eq(UserMetadata.userId, userId));

  console.log(`[onboarding] created thread with ${onboardingNotes.length} notes for user ${userId}`);
}

/**
 * Get user data from cache or fetch from Clerk API if needed
 */
export async function getCachedUserData(userId: string): Promise<CachedUserData> {
  // If another request is currently initializing this user, wait for it
  const pending = pendingInit.get(userId);
  if (pending) return pending;

  let hadMetadata = false;
  try {
    const userMetadata = await db.select()
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();
    hadMetadata = !!userMetadata;

    const now = new Date();
    const cacheAge = userMetadata?.clerkDataUpdatedAt
      ? now.getTime() - new Date(userMetadata.clerkDataUpdatedAt).getTime()
      : Infinity;
    const isCacheFresh = cacheAge < 15 * 60 * 1000; // 15 minutes

    const isExplicitlyStale = userMetadata?.clerkDataUpdatedAt &&
      new Date(userMetadata.clerkDataUpdatedAt).getTime() < new Date('2023-01-01').getTime();

    if (userMetadata && isCacheFresh && !isExplicitlyStale) {
      // Repair: if user was created recently but onboarding thread is missing, create it now
      const createdMs = userMetadata.createdAt ? new Date(userMetadata.createdAt).getTime() : 0;
      const fiveMinAgo = now.getTime() - 5 * 60 * 1000;
      if (createdMs >= fiveMinAgo) {
        try {
          await ensureOnboardingThreadIfMissing(userId);
        } catch (repairErr) {
          console.error('[user-cache] Onboarding repair failed:', repairErr);
        }
      }
      return {
        firstName: userMetadata.firstName || '',
        lastName: userMetadata.lastName || '',
        email: userMetadata.email || '',
        profileImageUrl: userMetadata.profileImageUrl || undefined,
        initials: generateInitials(userMetadata.firstName || '', userMetadata.lastName || ''),
        displayName: generateDisplayName(userMetadata.firstName || '', userMetadata.lastName || ''),
        userColor: userMetadata.userColor || 'blue',
        createdAt: userMetadata.createdAt || undefined,
      };
    }

    const isNewUser = !userMetadata;
    const promise = fetchAndCacheUserData(userId, userMetadata);
    if (isNewUser) {
      pendingInit.set(userId, promise);
    }
    try {
      return await promise;
    } finally {
      if (isNewUser) pendingInit.delete(userId);
    }
  } catch (error) {
    pendingInit.delete(userId);
    console.error('Error getting user data:', error);
    // Do not swallow errors for new-user init: caller should get 500 and can retry
    if (!hadMetadata) {
      throw error;
    }
    return {
      firstName: '', lastName: '', email: '',
      initials: 'U', displayName: 'User', userColor: 'blue', createdAt: undefined,
    };
  }
}

async function fetchAndCacheUserData(userId: string, existingMetadata: any): Promise<CachedUserData> {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;

  if (!clerkSecretKey) {
    console.error('CRITICAL: Clerk secret key not found in environment');
    throw new Error('Clerk secret key not found');
  }

  const response = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    headers: {
      'Authorization': `Bearer ${clerkSecretKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    console.error('Clerk API failed:', {
      status: response.status,
      statusText: response.statusText,
      isProduction: process.env.NODE_ENV === 'production'
    });

    if (process.env.NODE_ENV === 'production' && existingMetadata) {
      return {
        firstName: existingMetadata.firstName || '',
        lastName: existingMetadata.lastName || '',
        email: existingMetadata.email || '',
        profileImageUrl: existingMetadata.profileImageUrl,
        initials: generateInitials(existingMetadata.firstName || '', existingMetadata.lastName || ''),
        displayName: generateDisplayName(existingMetadata.firstName || '', existingMetadata.lastName || ''),
        userColor: existingMetadata.userColor || 'blue',
        createdAt: existingMetadata.createdAt,
      };
    }

    throw new Error(`Clerk API error: ${response.status}`);
  }

  const userData = await response.json();

  const firstName = userData?.first_name || userData?.firstName || '';
  const lastName = userData?.last_name || userData?.lastName || '';
  const email = userData?.email_addresses?.[0]?.email_address || userData?.email || '';
  const profileImageUrl = userData?.profile_image_url || userData?.image_url;
  const userColor = userData?.public_metadata?.userColor || 'blue';

  let userCreatedAt: string | undefined;
  if (existingMetadata) {
    userCreatedAt = existingMetadata.createdAt;
    const setPayload: Record<string, any> = {
      firstName,
      lastName,
      email,
      profileImageUrl,
      userColor,
      churchName: existingMetadata.churchName ?? null,
      churchCity: existingMetadata.churchCity ?? null,
      churchState: existingMetadata.churchState ?? null,
      clerkDataUpdatedAt: nowISO(),
      updatedAt: nowISO(),
    };
    if (existingMetadata.referralCode == null) {
      setPayload.referralCode = generateReferralCode(firstName || null, userId);
    }
    await db.update(UserMetadata)
      .set(setPayload)
      .where(eq(UserMetadata.userId, userId));
  } else {
    userCreatedAt = nowISO();
    let insertSucceeded = true;
    try {
      await db.insert(UserMetadata).values({
        id: `user_metadata_${userId}`,
        userId: userId,
        firstName,
        lastName,
        email,
        profileImageUrl,
        userColor,
        highestSimpleNoteId: 0,
        currentSeason: getCurrentSeason(),
        churchName: null,
        churchCity: null,
        churchState: null,
        referralCode: generateReferralCode(firstName || null, userId),
        createdAt: userCreatedAt,
        updatedAt: nowISO(),
        clerkDataUpdatedAt: nowISO(),
      });
    } catch (insertErr: unknown) {
      const isUnique =
        (insertErr as { code?: string })?.code === 'SQLITE_CONSTRAINT' ||
        (insertErr as { cause?: { code?: string } })?.cause?.code === 'SQLITE_CONSTRAINT' ||
        (insertErr as Error)?.message?.includes('UNIQUE constraint failed');
      if (isUnique) {
        insertSucceeded = false;
        console.log('[user-cache] UserMetadata already created by concurrent request', { userId });
      } else {
        throw insertErr;
      }
    }

    if (insertSucceeded) {
      // Auto-assign inbox items for new users
      try {
        const allUserInboxItems = await db
          .select()
          .from(InboxItems)
          .where(
            and(
              eq(InboxItems.targetAudience, 'all_users'),
              eq(InboxItems.isActive, true)
            )
          );

        const validItems = allUserInboxItems.filter(item => item.webflowItemId);
        if (validItems.length > 0) {
          // Batch check existing assignments in one query
          const existingAssignments = await db
            .select({ inboxItemId: UserInboxItems.inboxItemId })
            .from(UserInboxItems)
            .where(
              and(
                eq(UserInboxItems.userId, userId),
                inArray(UserInboxItems.inboxItemId, validItems.map(i => i.id))
              )
            );
          const existingIds = new Set(existingAssignments.map(e => e.inboxItemId));

          const newItems = validItems
            .filter(item => !existingIds.has(item.id))
            .map((item, idx) => ({
              id: `user_inbox_${userId}_${item.id}_${Date.now() + idx}`,
              userId: userId,
              inboxItemId: item.id,
              status: 'inbox' as const,
              createdAt: nowISO(),
            }));

          if (newItems.length > 0) {
            await db.insert(UserInboxItems).values(newItems);
          }
        }
      } catch (error) {
        console.error('Error assigning inbox items to new user:', error);
      }
    }

    // Create onboarding thread (idempotent; safe if we or another request already created user)
    try {
      await ensureOnboardingThreadIfMissing(userId);
    } catch (error) {
      console.error('Error creating onboarding thread (non-fatal, user can still load):', error);
    }
  }

  return {
    firstName, lastName, email, profileImageUrl,
    initials: generateInitials(firstName, lastName),
    displayName: generateDisplayName(firstName, lastName),
    userColor,
    createdAt: userCreatedAt,
  };
}

function generateInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0) || ''}${lastName.charAt(0) || ''}`.toUpperCase() || 'U';
}

function generateDisplayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName.charAt(0)}`.trim() || 'User';
}

/**
 * Force refresh user data from Clerk API
 */
export async function refreshUserData(userId: string): Promise<CachedUserData> {
  try {
    const existingMetadata = await db.select()
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();

    return await fetchAndCacheUserData(userId, existingMetadata);
  } catch (error) {
    console.error('Error refreshing user data:', error);
    throw error;
  }
}

/**
 * Invalidate user cache by setting clerkDataUpdatedAt to epoch
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  try {
    await db.update(UserMetadata)
      .set({
        clerkDataUpdatedAt: new Date(0).toISOString()
      })
      .where(eq(UserMetadata.userId, userId));
  } catch (error) {
    console.error('Error invalidating user cache:', error);
    throw error;
  }
}
