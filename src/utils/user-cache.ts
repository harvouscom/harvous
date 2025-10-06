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

    const userColor = userMetadata?.userColor || 'paper';
    console.log('User cache - userMetadata:', userMetadata);
    console.log('User cache - userColor from database:', userColor);
    
    // Always fetch fresh data from Clerk API to ensure we have the latest name/email
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
    
    // Extract user data from Clerk API
    const firstName = userData?.first_name || userData?.firstName || '';
    const lastName = userData?.last_name || userData?.lastName || '';
    const email = userData?.email_addresses?.[0]?.email_address || userData?.email || '';
    const profileImageUrl = userData?.profile_image_url || userData?.image_url;

    // Update database with fresh Clerk data (but preserve userColor)
    if (userMetadata) {
      await db.update(UserMetadata)
        .set({
          firstName,
          lastName,
          email,
          profileImageUrl,
          clerkDataUpdatedAt: new Date(),
          updatedAt: new Date(),
          // DO NOT update userColor - preserve existing value
        })
        .where(eq(UserMetadata.userId, userId));
    } else {
      await db.insert(UserMetadata).values({
        id: `user_metadata_${userId}`,
        userId: userId,
        firstName,
        lastName,
        email,
        profileImageUrl,
        userColor: 'paper',
        highestSimpleNoteId: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        clerkDataUpdatedAt: new Date(),
      });
    }

    const result = {
      firstName,
      lastName,
      email,
      profileImageUrl,
      initials: generateInitials(firstName, lastName),
      displayName: generateDisplayName(firstName, lastName),
      userColor, // Use the color from database, not from Clerk
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
