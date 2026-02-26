/**
 * Server-Side User Cache — Drizzle port of src/utils/user-cache.ts
 *
 * Caches user data from Clerk API in the database (UserMetadata table).
 * Dates stored as ISO text strings.
 */

import { db, UserMetadata, InboxItems, UserInboxItems, Threads, Notes, NoteThreads, eq, and } from '../db';
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

/**
 * Get user data from cache or fetch from Clerk API if needed
 */
export async function getCachedUserData(userId: string): Promise<CachedUserData> {
  try {
    const userMetadata = await db.select()
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();

    const now = new Date();
    const cacheAge = userMetadata?.clerkDataUpdatedAt
      ? now.getTime() - new Date(userMetadata.clerkDataUpdatedAt).getTime()
      : Infinity;
    const isCacheFresh = cacheAge < 15 * 60 * 1000; // 15 minutes

    const isExplicitlyStale = userMetadata?.clerkDataUpdatedAt &&
      new Date(userMetadata.clerkDataUpdatedAt).getTime() < new Date('2023-01-01').getTime();

    if (userMetadata && isCacheFresh && !isExplicitlyStale) {
      return {
        firstName: userMetadata.firstName || '',
        lastName: userMetadata.lastName || '',
        email: userMetadata.email || '',
        profileImageUrl: userMetadata.profileImageUrl || undefined,
        initials: generateInitials(userMetadata.firstName || '', userMetadata.lastName || ''),
        displayName: generateDisplayName(userMetadata.firstName || '', userMetadata.lastName || ''),
        userColor: userMetadata.userColor || 'paper',
        createdAt: userMetadata.createdAt || undefined,
      };
    }

    return await fetchAndCacheUserData(userId, userMetadata);
  } catch (error) {
    console.error('Error getting user data:', error);
    return {
      firstName: '', lastName: '', email: '',
      initials: 'U', displayName: 'User', userColor: 'paper', createdAt: undefined,
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
        userColor: existingMetadata.userColor || 'paper',
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
  const userColor = userData?.public_metadata?.userColor || 'paper';

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

      for (const inboxItem of allUserInboxItems) {
        if (!inboxItem.webflowItemId) continue;

        const existing = await db
          .select()
          .from(UserInboxItems)
          .where(
            and(
              eq(UserInboxItems.userId, userId),
              eq(UserInboxItems.inboxItemId, inboxItem.id)
            )
          )
          .get();

        if (!existing) {
          await db.insert(UserInboxItems).values({
            id: `user_inbox_${userId}_${inboxItem.id}_${Date.now()}`,
            userId: userId,
            inboxItemId: inboxItem.id,
            status: 'inbox',
            createdAt: nowISO(),
          });
        }
      }
    } catch (error) {
      console.error('Error assigning inbox items to new user:', error);
    }

    // Create onboarding thread with sample notes for new users
    try {
      const { generateThreadId, generateNoteId } = await import('@/utils/ids');
      const { ensureUnorganizedThread } = await import('./unorganized-thread');
      const { loadOnboardingNotes } = await import('@/utils/load-onboarding-notes');

      await ensureUnorganizedThread(userId);

      const onboardingNotes = loadOnboardingNotes();

      if (onboardingNotes.length > 0) {
        const onboardingThreadId = `thread_onboarding_${userId}`;
        const capitalizedThreadTitle = "Welcome to Harvous";
        const ts = nowISO();
        await db.insert(Threads).values({
          id: onboardingThreadId,
          title: capitalizedThreadTitle,
          subtitle: `${onboardingNotes.length} notes to get you started`,
          color: 'blue',
          spaceId: null,
          userId: userId,
          isPublic: false,
          isPinned: false,
          createdAt: ts,
          updatedAt: ts,
          lastVisited: ts,
        });

        let currentSimpleNoteId = 1;
        for (const noteData of onboardingNotes) {
          const noteId = generateNoteId();
          const capitalizedNoteTitle = noteData.title.charAt(0).toUpperCase() + noteData.title.slice(1);

          await db.insert(Notes).values({
            id: noteId,
            title: capitalizedNoteTitle,
            content: noteData.content,
            threadId: onboardingThreadId,
            spaceId: null,
            simpleNoteId: currentSimpleNoteId,
            userId: userId,
            isPublic: false,
            addedBy: 'system',
            createdAt: ts,
            lastVisited: ts,
          });

          const junctionId = `note-thread-${noteId}-${Date.now()}`;
          await db.insert(NoteThreads).values({
            id: junctionId,
            noteId: noteId,
            threadId: onboardingThreadId,
            createdAt: nowISO()
          });

          try {
            await processScriptureReferences(noteId, userId, onboardingThreadId, noteData.content);
          } catch (e) {
            console.error('Error processing scripture for onboarding note', noteId, e);
          }

          currentSimpleNoteId++;
        }

        await db.update(UserMetadata)
          .set({
            highestSimpleNoteId: currentSimpleNoteId - 1,
            updatedAt: nowISO()
          })
          .where(eq(UserMetadata.userId, userId));

        console.log(`Created onboarding thread with ${onboardingNotes.length} notes for user ${userId}`);
      }
    } catch (error) {
      console.error('Error creating onboarding thread:', error);
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
