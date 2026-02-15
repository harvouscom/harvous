/**
 * Server-Side User Cache (user-cache.ts)
 * 
 * PURPOSE: Caches user data from Clerk API in the database (UserMetadata table)
 * for server-side rendering and API routes.
 * 
 * SCOPE: Server-side only - runs on the server during SSR and API calls
 * STORAGE: Database (UserMetadata table in Astro DB/Turso)
 * TTL: 5 minutes - data is re-fetched from Clerk API after expiration
 * 
 * USE CASES:
 * - Fetching user profile data during SSR for personalized pages
 * - Getting user info for API routes without hitting Clerk API every time
 * - Initial data population when users first authenticate
 * 
 * DIFFERENCE FROM profile-cache.ts:
 * - user-cache.ts = SERVER-SIDE database cache (UserMetadata table)
 * - profile-cache.ts = CLIENT-SIDE sessionStorage cache (browser)
 * 
 * The two work together: server fetches from user-cache, client caches
 * the result in profile-cache to avoid redundant API calls during session.
 */

import { db, UserMetadata, eq } from 'astro:db';
import { generateReferralCode } from '@/utils/referral-code';

export interface CachedUserData {
  firstName: string;
  lastName: string;
  email: string;
  profileImageUrl?: string;
  initials: string;
  displayName: string;
  userColor: string;
  createdAt?: Date;
}

/**
 * Get user data from cache or fetch from Clerk API if needed
 * This function optimizes performance by caching user data in the database
 */
export async function getCachedUserData(userId: string): Promise<CachedUserData> {
  try {
    // Get user metadata from database (including color preference)
    const userMetadata = await db.select()
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();

    // Check if cache is fresh (15 minutes - user data changes infrequently)
    const now = new Date();
    const cacheAge = userMetadata?.clerkDataUpdatedAt ? 
      now.getTime() - userMetadata.clerkDataUpdatedAt.getTime() : 
      Infinity;
    const isCacheFresh = cacheAge < 15 * 60 * 1000; // 15 minutes in milliseconds
    
    // Check if cache is explicitly stale (set to old date for invalidation)
    const isExplicitlyStale = userMetadata?.clerkDataUpdatedAt && 
      userMetadata.clerkDataUpdatedAt.getTime() < new Date('2023-01-01').getTime();
    
    if (userMetadata && isCacheFresh && !isExplicitlyStale) {
      return {
        firstName: userMetadata.firstName || '',
        lastName: userMetadata.lastName || '',
        email: userMetadata.email || '',
        profileImageUrl: userMetadata.profileImageUrl || undefined,
        initials: generateInitials(userMetadata.firstName || '', userMetadata.lastName || ''),
        displayName: generateDisplayName(userMetadata.firstName || '', userMetadata.lastName || ''),
        userColor: userMetadata.userColor || 'paper',
        createdAt: userMetadata.createdAt,
      };
    }
    
    // Cache is stale or doesn't exist - fetch from Clerk
    return await fetchAndCacheUserData(userId, userMetadata);

  } catch (error) {
    console.error('Error getting user data:', error);
    
    // Fallback to basic data if everything fails
    return {
      firstName: '',
      lastName: '',
      email: '',
      initials: 'U',
      displayName: 'User',
      userColor: 'paper',
      createdAt: undefined,
    };
  }
}


/**
 * Fetch user data from Clerk and cache it in the database
 */
async function fetchAndCacheUserData(userId: string, existingMetadata: any): Promise<CachedUserData> {
  const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
  
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
      environment: import.meta.env.MODE,
      isProduction: import.meta.env.PROD
    });
    
    // Production fallback: Use database data if Clerk API fails
    if (import.meta.env.PROD && existingMetadata) {
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
  
  // Extract standard fields
  const firstName = userData?.first_name || userData?.firstName || '';
  const lastName = userData?.last_name || userData?.lastName || '';
  const email = userData?.email_addresses?.[0]?.email_address || userData?.email || '';
  const profileImageUrl = userData?.profile_image_url || userData?.image_url;

  // Extract custom field from Clerk's public_metadata
  const userColor = userData?.public_metadata?.userColor || 'paper';

  // Update database with fresh Clerk data (including metadata)
  // Preserve church fields from existing metadata - they should persist indefinitely
  let userCreatedAt: Date | undefined;
  if (existingMetadata) {
    userCreatedAt = existingMetadata.createdAt;
    const setPayload = {
      firstName,
      lastName,
      email,
      profileImageUrl,
      userColor,  // Cache from Clerk's public_metadata
      // Preserve church fields - they are stored in database and should never be lost
      churchName: existingMetadata.churchName ?? null,
      churchCity: existingMetadata.churchCity ?? null,
      churchState: existingMetadata.churchState ?? null,
      clerkDataUpdatedAt: new Date(),
      updatedAt: new Date(),
      // Backfill referralCode for existing users who don't have one
      ...(existingMetadata.referralCode == null && {
        referralCode: generateReferralCode(firstName || null, userId)
      })
    };
    await db.update(UserMetadata)
      .set(setPayload)
      .where(eq(UserMetadata.userId, userId));
  } else {
    // Create new user record with Clerk data
    // Church fields default to null for new users
    userCreatedAt = new Date();
    await db.insert(UserMetadata).values({
      id: `user_metadata_${userId}`,
      userId: userId,
      firstName,
      lastName,
      email,
      profileImageUrl,
      userColor,  // From Clerk's public_metadata
      highestSimpleNoteId: 0,
      // Church fields default to null for new users
      churchName: null,
      churchCity: null,
      churchState: null,
      referralCode: generateReferralCode(firstName || null, userId),
      createdAt: userCreatedAt,
      updatedAt: new Date(),
      clerkDataUpdatedAt: new Date(),
    });

    // Auto-assign inbox items for new users
    // Only assign items that currently exist in Webflow with "Send to Harvous Inbox?" enabled
    try {
      const { addInboxItemToUser } = await import('@/utils/inbox-data');
      const { verifyInboxItemInWebflow } = await import('@/utils/webflow-verification');
      const { db: dbImport, InboxItems, UserInboxItems, eq, and } = await import('astro:db');
      
      // Find all active inbox items targeted to all users
      const allUserInboxItems = await dbImport
        .select()
        .from(InboxItems)
        .where(
          and(
            eq(InboxItems.targetAudience, 'all_users'),
            eq(InboxItems.isActive, true)
          )
        );

      let assignedCount = 0;
      let skippedCount = 0;
      let markedInactiveCount = 0;

      // Verify and assign each item
      for (const inboxItem of allUserInboxItems) {
        // Skip items without webflowItemId (shouldn't happen, but safety check)
        if (!inboxItem.webflowItemId) {
          skippedCount++;
          continue;
        }

        // Verify item exists in Webflow and has toggle enabled
        const verification = await verifyInboxItemInWebflow(inboxItem.webflowItemId);
        
        if (!verification.isValid) {
          // Item no longer exists or toggle is disabled - mark as inactive
          try {
            await dbImport
              .update(InboxItems)
              .set({ isActive: false, updatedAt: new Date() })
              .where(eq(InboxItems.id, inboxItem.id));
            markedInactiveCount++;
          } catch (updateError) {
            console.error(`Error marking item ${inboxItem.id} as inactive:`, updateError);
          }
          skippedCount++;
          continue;
        }

        // Item is valid - check if already assigned (shouldn't, but just in case)
        const existing = await dbImport
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
          await dbImport.insert(UserInboxItems).values({
            id: `user_inbox_${userId}_${inboxItem.id}_${Date.now()}`,
            userId: userId,
            inboxItemId: inboxItem.id,
            status: 'inbox',
            createdAt: new Date(),
          });
          assignedCount++;
        }
      }
    } catch (error) {
      // Don't fail user creation if inbox assignment fails
      console.error('Error assigning inbox items to new user:', error);
    }

    // Create onboarding thread with sample notes for new users
    try {
      const { generateThreadId, generateNoteId } = await import('@/utils/ids');
      const { ensureUnorganizedThread } = await import('@/utils/unorganized-thread');
      const { loadOnboardingNotes } = await import('@/utils/load-onboarding-notes');
      const { db: dbImport, Threads, Notes, NoteThreads, eq } = await import('astro:db');
      
      // Ensure unorganized thread exists first
      await ensureUnorganizedThread(userId);
      
      // Load onboarding notes from markdown files
      const onboardingNotes = loadOnboardingNotes();
      
      if (onboardingNotes.length === 0) {
        console.warn('No onboarding notes found, skipping onboarding thread creation');
      } else {
        // Create onboarding thread
        const onboardingThreadId = `thread_onboarding_${userId}`;
        const onboardingThreadTitle = "Welcome to Harvous";
        const capitalizedThreadTitle = onboardingThreadTitle.charAt(0).toUpperCase() + onboardingThreadTitle.slice(1);
        const now = new Date();
        await dbImport.insert(Threads).values({
          id: onboardingThreadId,
          title: capitalizedThreadTitle,
          subtitle: `${onboardingNotes.length} notes to get you started`,
          color: 'blue',
          spaceId: null,
          userId: userId,
          isPublic: false,
          isPinned: false,
          createdAt: now,
          updatedAt: now,
          lastVisited: now, // Set lastVisited so thread appears in "All" tab and sorts correctly
        });
        
        // Create notes from loaded markdown content
        let currentSimpleNoteId = 1;
        for (const noteData of onboardingNotes) {
          const noteId = generateNoteId();
          
          // Capitalize note title to match pattern used elsewhere
          const capitalizedNoteTitle = noteData.title.charAt(0).toUpperCase() + noteData.title.slice(1);
          
          // Create the note with HTML content from markdown
          await dbImport.insert(Notes).values({
            id: noteId,
            title: capitalizedNoteTitle,
            content: noteData.content, // Already converted to HTML
            threadId: onboardingThreadId,
            spaceId: null,
            simpleNoteId: currentSimpleNoteId,
            userId: userId,
            isPublic: false,
            addedBy: 'system',
            createdAt: now,
            lastVisited: now, // Match account-creation time so section breaks show "Recent" not "More than a year ago"
          });
          
          // Link note to thread via junction table
          const junctionId = `note-thread-${noteId}-${Date.now()}`;
          await dbImport.insert(NoteThreads).values({
            id: junctionId,
            noteId: noteId,
            threadId: onboardingThreadId,
            createdAt: new Date()
          });
          
          // Process scripture references in the note content
          // This will detect references like "John 3:16" and create scripture pills
          try {
            const { processScriptureReferences } = await import('@/utils/process-scripture-references');
            await processScriptureReferences(noteId, userId, onboardingThreadId, noteData.content);
          } catch (scriptureError: any) {
            // Don't fail note creation if scripture processing fails
            console.error(`Error processing scripture references for note ${noteId}:`, scriptureError);
          }
          
          currentSimpleNoteId++;
        }
        
        // Update user metadata with highest simpleNoteId
        await dbImport.update(UserMetadata)
          .set({ 
            highestSimpleNoteId: currentSimpleNoteId - 1,
            updatedAt: new Date()
          })
          .where(eq(UserMetadata.userId, userId));
        
        console.log(`✅ Created onboarding thread with ${onboardingNotes.length} notes for user ${userId}`);
      }
    } catch (error) {
      // Don't fail user creation if onboarding thread creation fails
      console.error('Error creating onboarding thread:', error);
    }
  }

  // Return the Clerk values (our source of truth)
  const result = {
    firstName,
    lastName,
    email,
    profileImageUrl,
    initials: generateInitials(firstName, lastName),
    displayName: generateDisplayName(firstName, lastName),
    userColor, // Use the color from Clerk's public_metadata
    createdAt: userCreatedAt,
  };
  
  return result;
}

/**
 * Generate initials from first and last name
 */
function generateInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0) || ''}${lastName.charAt(0) || ''}`.toUpperCase() || 'U';
}

/**
 * Generate display name from first and last name
 */
function generateDisplayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName.charAt(0)}`.trim() || 'User';
}

/**
 * Force refresh user data from Clerk API (useful for profile updates)
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
 * Invalidate user cache by setting clerkDataUpdatedAt to a very old date
 * This forces the cache to be considered invalid and triggers a refresh
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  try {
    await db.update(UserMetadata)
      .set({ 
        clerkDataUpdatedAt: new Date(0) // Set to epoch to force cache invalidation
      })
      .where(eq(UserMetadata.userId, userId));
  } catch (error) {
    console.error('Error invalidating user cache:', error);
    throw error;
  }
}
