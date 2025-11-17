import { db, UserMetadata, eq } from 'astro:db';

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

    console.log('User cache - userMetadata:', userMetadata);
    
    // Check if cache is fresh (5 minutes)
    const now = new Date();
    const cacheAge = userMetadata?.clerkDataUpdatedAt ? 
      now.getTime() - userMetadata.clerkDataUpdatedAt.getTime() : 
      Infinity;
    const isCacheFresh = cacheAge < 5 * 60 * 1000; // 5 minutes in milliseconds
    
  console.log('User cache - cache analysis:', {
    hasMetadata: !!userMetadata,
    clerkDataUpdatedAt: userMetadata?.clerkDataUpdatedAt,
    cacheAge: cacheAge,
    isCacheFresh: isCacheFresh,
    cacheAgeMinutes: Math.round(cacheAge / (60 * 1000)),
    isStaleDate: userMetadata?.clerkDataUpdatedAt?.getTime() < new Date('2023-01-01').getTime(),
    currentUserColor: userMetadata?.userColor,
    currentFirstName: userMetadata?.firstName,
    currentLastName: userMetadata?.lastName
  });
    
    // Check if cache is explicitly stale (set to old date for invalidation)
    const isExplicitlyStale = userMetadata?.clerkDataUpdatedAt && 
      userMetadata.clerkDataUpdatedAt.getTime() < new Date('2023-01-01').getTime();
    
    if (userMetadata && isCacheFresh && !isExplicitlyStale) {
      console.log('User cache - using database cache (fresh)');
      console.log('📊 Database cache values:', {
        firstName: userMetadata.firstName,
        lastName: userMetadata.lastName,
        userColor: userMetadata.userColor,
        clerkDataUpdatedAt: userMetadata.clerkDataUpdatedAt
      });
      return {
        firstName: userMetadata.firstName || '',
        lastName: userMetadata.lastName || '',
        email: userMetadata.email || '',
        profileImageUrl: userMetadata.profileImageUrl,
        initials: generateInitials(userMetadata.firstName || '', userMetadata.lastName || ''),
        displayName: generateDisplayName(userMetadata.firstName || '', userMetadata.lastName || ''),
        userColor: userMetadata.userColor || 'paper',
        createdAt: userMetadata.createdAt,
      };
    }
    
    // Cache is stale or doesn't exist - fetch from Clerk
    console.log('User cache - fetching from Clerk (cache stale or missing)');
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
  
  // Production debugging - only log in production
  if (import.meta.env.PROD) {
    console.log('🔑 Clerk Secret Key Debug:', {
      hasSecretKey: !!clerkSecretKey,
      secretKeyLength: clerkSecretKey?.length,
      environment: import.meta.env.MODE,
      keyPrefix: clerkSecretKey?.substring(0, 10) + '...'
    });
  }
  
  if (!clerkSecretKey) {
    console.error('❌ CRITICAL: Clerk secret key not found in environment');
    throw new Error('Clerk secret key not found');
  }

  const response = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    headers: {
      'Authorization': `Bearer ${clerkSecretKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    console.error('❌ Clerk API failed:', {
      status: response.status,
      statusText: response.statusText,
      environment: import.meta.env.MODE,
      isProduction: import.meta.env.PROD
    });
    
    // Production fallback: Use database data if Clerk API fails
    if (import.meta.env.PROD && existingMetadata) {
      console.log('🔄 Production fallback: Using database data instead of Clerk');
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
  
  // Production debugging - only log in production
  if (import.meta.env.PROD) {
    console.log('🔍 Clerk API Response Debug:', {
      first_name: userData?.first_name,
      last_name: userData?.last_name,
      public_metadata: userData?.public_metadata,
      userColor_from_metadata: userData?.public_metadata?.userColor
    });
  }
  
  // Extract standard fields
  const firstName = userData?.first_name || userData?.firstName || '';
  const lastName = userData?.last_name || userData?.lastName || '';
  const email = userData?.email_addresses?.[0]?.email_address || userData?.email || '';
  const profileImageUrl = userData?.profile_image_url || userData?.image_url;

  // Extract custom field from Clerk's public_metadata
  const userColor = userData?.public_metadata?.userColor || 'paper';
  
  // Production debugging - only log in production
  if (import.meta.env.PROD) {
    console.log('🔍 Extracted Data:', {
      firstName,
      lastName,
      userColor,
      source: 'Clerk API'
    });
  }

  // Update database with fresh Clerk data (including metadata)
  // Preserve church fields from existing metadata - they should persist indefinitely
  let userCreatedAt: Date | undefined;
  if (existingMetadata) {
    userCreatedAt = existingMetadata.createdAt;
    await db.update(UserMetadata)
      .set({
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
        updatedAt: new Date()
      })
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
      createdAt: userCreatedAt,
      updatedAt: new Date(),
      clerkDataUpdatedAt: new Date(),
    });

    // Auto-assign inbox items for new users
    try {
      const { addInboxItemToUser } = await import('@/utils/inbox-data');
      const { db: dbImport, InboxItems, UserInboxItems, eq, and } = await import('astro:db');
      
      // Find all active inbox items targeted to new users
      const newUserInboxItems = await dbImport
        .select()
        .from(InboxItems)
        .where(
          and(
            eq(InboxItems.targetAudience, 'all_new_users'),
            eq(InboxItems.isActive, true)
          )
        );

      // Create UserInboxItems for each item
      for (const inboxItem of newUserInboxItems) {
        // Check if already exists (shouldn't, but just in case)
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
        }
      }
    } catch (error) {
      // Don't fail user creation if inbox assignment fails
      console.error('Error assigning inbox items to new user:', error);
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
  
  console.log('User cache - returning fresh Clerk data:', result);
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
    
    console.log('🔄 User cache invalidated successfully - next fetch will be from Clerk');
  } catch (error) {
    console.error('❌ Error invalidating user cache:', error);
    throw error;
  }
}
