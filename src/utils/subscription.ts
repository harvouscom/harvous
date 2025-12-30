import { db, UserMetadata, eq } from 'astro:db';
import type { Auth } from '@clerk/astro/server';

const FREE_TIER_LIMIT = 1000;
// Clerk Billing plan ID for unlimited notes
export const UNLIMITED_PLAN_ID = 'cplan_37aJweoipC2wY2Pa94o7zMdoIyw';

/**
 * Get user's note count from UserMetadata.highestSimpleNoteId
 * Since note IDs start at 1 and increment sequentially, highestSimpleNoteId equals total count
 */
export async function getUserNoteCount(userId: string): Promise<number> {
  try {
    const userMetadata = await db
      .select({ highestSimpleNoteId: UserMetadata.highestSimpleNoteId })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();

    return userMetadata?.highestSimpleNoteId || 0;
  } catch (error) {
    console.error('Error getting user note count:', error);
    return 0; // Fail safe - return 0 if error
  }
}

/**
 * Check if user has active "unlimited" plan subscription
 * Uses Clerk's recommended has() method from auth object
 * Falls back to API call if auth object is not available
 */
export async function hasUnlimitedNotes(userId: string, auth?: Auth): Promise<boolean> {
  try {
    // Use Clerk's recommended has() method if auth object is provided
    if (auth) {
      try {
        return auth.has({ plan: UNLIMITED_PLAN_ID });
      } catch (error) {
        console.error('Error using auth.has() for plan check:', error);
        // Fall through to API fallback
      }
    }

    // Fallback: Use Clerk Billing API endpoint
    const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
    
    if (!clerkSecretKey) {
      console.error('CLERK_SECRET_KEY not found');
      return false;
    }

    // Use Clerk Billing API endpoint
    // Note: This is a fallback - prefer using auth.has() method
    const response = await fetch(`https://api.clerk.com/v1/users/${userId}/billing/subscriptions`, {
      headers: {
        'Authorization': `Bearer ${clerkSecretKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      // If API returns 404 or error, user doesn't have subscription
      if (response.status === 404) {
        return false;
      }
      console.error('Clerk Billing API error:', response.status, response.statusText);
      return false;
    }

    const subscriptions = await response.json();
    
    // Check if user has active unlimited plan
    // Clerk Billing may return array or object - adjust based on actual API response
    const activeSubscription = Array.isArray(subscriptions) 
      ? subscriptions.find((sub: any) => sub.plan_id === UNLIMITED_PLAN_ID && sub.status === 'active')
      : subscriptions?.plan_id === UNLIMITED_PLAN_ID && subscriptions?.status === 'active';

    return !!activeSubscription;
  } catch (error) {
    console.error('Error checking subscription:', error);
    return false; // Fail closed - assume free tier if check fails
  }
}

/**
 * Check if user can create a new note
 * Returns object with allowed status, reason if not allowed, and current count/limit info
 */
export async function canCreateNote(
  userId: string,
  auth?: Auth
): Promise<{ 
  allowed: boolean; 
  reason?: string; 
  currentCount?: number; 
  limit?: number;
  upgradeUrl?: string;
}> {
  try {
    // Check if user has unlimited plan
    const hasUnlimited = await hasUnlimitedNotes(userId, auth);
    
    if (hasUnlimited) {
      return { allowed: true };
    }

    // Free tier - check note count
    const noteCount = await getUserNoteCount(userId);
    
    if (noteCount >= FREE_TIER_LIMIT) {
      return {
        allowed: false,
        reason: 'Note limit reached',
        currentCount: noteCount,
        limit: FREE_TIER_LIMIT,
        upgradeUrl: '/upgrade'
      };
    }

    return { 
      allowed: true,
      currentCount: noteCount,
      limit: FREE_TIER_LIMIT
    };
  } catch (error) {
    console.error('Error checking if user can create note:', error);
    // Fail open - allow note creation if check fails
    return { allowed: true };
  }
}

/**
 * Get subscription status and note limit info for display
 */
export async function getSubscriptionInfo(userId: string, auth?: Auth): Promise<{
  hasUnlimited: boolean;
  currentCount: number;
  limit: number | null; // null means unlimited
  planId?: string;
  status?: string;
}> {
  try {
    const hasUnlimited = await hasUnlimitedNotes(userId, auth);
    const currentCount = await getUserNoteCount(userId);
    
    if (hasUnlimited) {
      // Get subscription details for display
      const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
      let planId: string | undefined;
      let status: string | undefined;

      if (clerkSecretKey) {
        try {
          const response = await fetch(`https://api.clerk.com/v1/users/${userId}/billing/subscriptions`, {
            headers: {
              'Authorization': `Bearer ${clerkSecretKey}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const subscriptions = await response.json();
            const activeSub = Array.isArray(subscriptions)
              ? subscriptions.find((sub: any) => sub.plan_id === UNLIMITED_PLAN_ID && sub.status === 'active')
              : subscriptions;
            
            planId = activeSub?.plan_id || activeSub?.planId;
            status = activeSub?.status;
          }
        } catch (error) {
          console.error('Error fetching subscription details:', error);
        }
      }

      return {
        hasUnlimited: true,
        currentCount,
        limit: null, // unlimited
        planId,
        status
      };
    }

    return {
      hasUnlimited: false,
      currentCount,
      limit: FREE_TIER_LIMIT
    };
  } catch (error) {
    console.error('Error getting subscription info:', error);
    // Return safe defaults
    return {
      hasUnlimited: false,
      currentCount: 0,
      limit: FREE_TIER_LIMIT
    };
  }
}

