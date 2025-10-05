import { db, UserMetadata, eq } from 'astro:db';

// Cache duration: 24 hours (in milliseconds)
const CACHE_DURATION = 24 * 60 * 60 * 1000;

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
    // First, try to get cached data from database
    const cachedData = await db.select()
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();

    if (cachedData && isCacheValid(cachedData.clerkDataUpdatedAt)) {
      // Cache is valid, return cached data
      return {
        firstName: cachedData.firstName || '',
        lastName: cachedData.lastName || '',
        email: cachedData.email || '',
        profileImageUrl: cachedData.profileImageUrl,
        initials: generateInitials(cachedData.firstName, cachedData.lastName),
        displayName: generateDisplayName(cachedData.firstName, cachedData.lastName),
        userColor: cachedData.userColor || 'paper',
      };
    }

    // Cache is invalid or doesn't exist, fetch from Clerk API
    return await fetchAndCacheUserData(userId, cachedData);

  } catch (error) {
    console.error('Error getting cached user data:', error);
    
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
 * Check if cached data is still valid
 */
function isCacheValid(updatedAt: Date | null): boolean {
  if (!updatedAt) return false;
  
  const now = new Date();
  const cacheAge = now.getTime() - updatedAt.getTime();
  return cacheAge < CACHE_DURATION;
}

/**
 * Fetch user data from Clerk API and cache it in the database
 */
async function fetchAndCacheUserData(userId: string, existingMetadata: any): Promise<CachedUserData> {
  try {
    const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error('Clerk secret key not found');
    }

    // Fetch from Clerk API
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
    
    // Extract user data
    const firstName = userData?.first_name || userData?.firstName || '';
    const lastName = userData?.last_name || userData?.lastName || '';
    const email = userData?.email_addresses?.[0]?.email_address || userData?.email || '';
    const profileImageUrl = userData?.profile_image_url || userData?.image_url;

    // Update or create user metadata in database
    const updateData = {
      firstName,
      lastName,
      email,
      profileImageUrl,
      clerkDataUpdatedAt: new Date(),
      updatedAt: new Date(),
    };

    if (existingMetadata) {
      // Update existing record
      await db.update(UserMetadata)
        .set(updateData)
        .where(eq(UserMetadata.userId, userId));
    } else {
      // Create new record
      await db.insert(UserMetadata).values({
        id: `user_metadata_${userId}`,
        userId: userId,
        highestSimpleNoteId: 0,
        userColor: 'paper',
        createdAt: new Date(),
        ...updateData,
      });
    }

    return {
      firstName,
      lastName,
      email,
      profileImageUrl,
      initials: generateInitials(firstName, lastName),
      displayName: generateDisplayName(firstName, lastName),
      userColor: existingMetadata?.userColor || 'paper',
    };

  } catch (error) {
    console.error('Error fetching user data from Clerk:', error);
    
    // Return fallback data
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
