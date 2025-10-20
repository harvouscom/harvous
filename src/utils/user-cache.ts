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
    
    // Always fetch from Clerk to ensure data consistency
    console.log('User cache - fetching from Clerk (always fresh)');
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
    
    // Extract standard fields
    const firstName = userData?.first_name || userData?.firstName || '';
    const lastName = userData?.last_name || userData?.lastName || '';
    const email = userData?.email_addresses?.[0]?.email_address || userData?.email || '';
    const profileImageUrl = userData?.profile_image_url || userData?.image_url;

    // Extract custom field from Clerk's public_metadata
    const userColor = userData?.public_metadata?.userColor || 'paper';

    // Update database with fresh Clerk data (including metadata)
    if (userMetadata) {
      await db.update(UserMetadata)
        .set({
          firstName,
          lastName,
          email,
          profileImageUrl,
          userColor,  // Cache from Clerk's public_metadata
          clerkDataUpdatedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(UserMetadata.userId, userId));
    } else {
      // Create new user record with Clerk data
      await db.insert(UserMetadata).values({
        id: `user_metadata_${userId}`,
        userId: userId,
        firstName,
        lastName,
        email,
        profileImageUrl,
        userColor,  // From Clerk's public_metadata
        highestSimpleNoteId: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        clerkDataUpdatedAt: new Date(),
      });
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
