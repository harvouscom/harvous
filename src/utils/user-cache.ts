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
    console.log(`[getCachedUserData] Fetching data for userId: ${userId}`);
    
    // First, try to get cached data from database
    const cachedData = await db.select()
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();

    console.log(`[getCachedUserData] Cached data:`, {
      firstName: cachedData?.firstName,
      lastName: cachedData?.lastName,
      userColor: cachedData?.userColor,
      clerkDataUpdatedAt: cachedData?.clerkDataUpdatedAt
    });

    if (cachedData && isCacheValid(cachedData.clerkDataUpdatedAt)) {
      // Cache is valid, return cached data
      const result = {
        firstName: cachedData.firstName || '',
        lastName: cachedData.lastName || '',
        email: cachedData.email || '',
        profileImageUrl: cachedData.profileImageUrl,
        initials: generateInitials(cachedData.firstName, cachedData.lastName),
        displayName: generateDisplayName(cachedData.firstName, cachedData.lastName),
        userColor: cachedData.userColor || 'paper',
      };
      
      console.log(`[getCachedUserData] Returning cached data:`, result);
      return result;
    }

    console.log(`[getCachedUserData] Cache invalid or missing, fetching from Clerk API`);
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
  if (!updatedAt) {
    console.log(`[isCacheValid] No updatedAt date, cache invalid`);
    return false;
  }
  
  const now = new Date();
  const cacheAge = now.getTime() - updatedAt.getTime();
  const isValid = cacheAge < CACHE_DURATION;
  
  console.log(`[isCacheValid] Cache age: ${cacheAge}ms, duration: ${CACHE_DURATION}ms, valid: ${isValid}`);
  return isValid;
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
    // IMPORTANT: Don't overwrite userColor - it's stored only in our database, not in Clerk
    const updateData = {
      firstName,
      lastName,
      email,
      profileImageUrl,
      clerkDataUpdatedAt: new Date(),
      updatedAt: new Date(),
    };

    if (existingMetadata) {
      // Update existing record (preserve userColor from existing metadata)
      await db.update(UserMetadata)
        .set(updateData)
        .where(eq(UserMetadata.userId, userId));
      
      console.log(`[fetchAndCacheUserData] Updated existing metadata, preserved userColor: ${existingMetadata.userColor}`);
    } else {
      // Create new record (use default 'paper' for new users)
      await db.insert(UserMetadata).values({
        id: `user_metadata_${userId}`,
        userId: userId,
        highestSimpleNoteId: 0,
        userColor: 'paper',
        createdAt: new Date(),
        ...updateData,
      });
      
      console.log(`[fetchAndCacheUserData] Created new metadata with default userColor: paper`);
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
