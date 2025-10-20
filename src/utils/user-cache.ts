import { db, UserMetadata, eq } from 'astro:db';

export interface CachedUserData {
  firstName: string;
  lastName: string;
  email: string;
  profileImageUrl?: string;
  initials: string;
  displayName: string;
  userColor: string;
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
    
    // Use database as source of truth if we have recent data
    if (userMetadata) {
      console.log('User cache - using database as source of truth');
      return {
        firstName: userMetadata.firstName || '',
        lastName: userMetadata.lastName || '',
        email: userMetadata.email || '',
        profileImageUrl: userMetadata.profileImageUrl,
        initials: generateInitials(userMetadata.firstName || '', userMetadata.lastName || ''),
        displayName: generateDisplayName(userMetadata.firstName || '', userMetadata.lastName || ''),
        userColor: userMetadata.userColor || 'paper',
      };
    }

    // No database record - fetch from Clerk for initial setup
    console.log('User cache - no database record, fetching from Clerk for initial setup');
    const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error('Clerk secret key not found');
    }

    const response = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: {
        'Authorization': `Bearer ${clerkSecretKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Clerk API error: ${response.status}`);
    }

    const userData = await response.json();
    
    // Only extract email from Clerk (we manage name and color in our database)
    const email = userData?.email_addresses?.[0]?.email_address || userData?.email || '';
    const profileImageUrl = userData?.profile_image_url || userData?.image_url;

    // Update database with only email and profile image from Clerk
    if (userMetadata) {
      await db.update(UserMetadata)
        .set({
          email,  // Only update email from Clerk
          profileImageUrl,
          clerkDataUpdatedAt: new Date(),
          updatedAt: new Date()
          // DO NOT update firstName, lastName, or userColor - database is source of truth
        })
        .where(eq(UserMetadata.userId, userId));
    } else {
      // Create new user record with default values
      await db.insert(UserMetadata).values({
        id: `user_metadata_${userId}`,
        userId: userId,
        firstName: '',  // Will be set when user updates profile
        lastName: '',   // Will be set when user updates profile
        email,
        profileImageUrl,
        userColor: 'paper',  // Default color
        highestSimpleNoteId: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        clerkDataUpdatedAt: new Date(),
      });
    }

    // Return the database values (our source of truth)
    const result = {
      firstName: userMetadata?.firstName || '',
      lastName: userMetadata?.lastName || '',
      email,
      profileImageUrl,
      initials: generateInitials(userMetadata?.firstName || '', userMetadata?.lastName || ''),
      displayName: generateDisplayName(userMetadata?.firstName || '', userMetadata?.lastName || ''),
      userColor: userMetadata?.userColor || 'paper',
    };
    
    console.log('User cache - returning result:', result);
    return result;

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
    };
  }
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
    
    console.log('User cache invalidated successfully');
  } catch (error) {
    console.error('Error invalidating user cache:', error);
    throw error;
  }
}
