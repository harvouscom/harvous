/**
 * Audienceful API integration
 * Handles subscriber management, tags, and custom fields
 *
 * API Documentation: https://developer.audienceful.com
 */

import { fetchWithTimeout } from './fetch-helpers';

const AUDIENCEFUL_API_BASE = 'https://app.audienceful.com/api';

interface AudiencefulPersonRequest {
  email: string;
  tags?: string; // Comma-separated string of tags
  notes?: string;
  extra_data?: {
    [key: string]: any;
  };
  double_opt_in?: 'not_required' | 'required' | 'complete';
  trigger_automations?: boolean;
}

interface AudiencefulPersonResponse {
  id?: number;
  uid?: string;
  email?: string;
  tags?: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  extra_data?: {
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Get Audienceful API key from environment
 */
function getApiKey(): string {
  const apiKey = import.meta.env.AUDIENCEFUL_API_KEY;
  if (!apiKey) {
    throw new Error('AUDIENCEFUL_API_KEY environment variable is not set');
  }
  return apiKey;
}

/**
 * Make a request to Audienceful API
 */
async function audiencefulRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: any
): Promise<any> {
  const apiKey = getApiKey();
  const url = `${AUDIENCEFUL_API_BASE}${endpoint}`;

  const options: any = {
    method,
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    timeout: 10000, // 10 second timeout
    retries: 2,
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Audienceful API error (${response.status}): ${errorText}`
    );
  }

  // Handle empty responses
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  }

  return null;
}

/**
 * Find a subscriber by email
 * Returns the subscriber if found, null otherwise
 */
export async function findSubscriberByEmail(
  email: string
): Promise<AudiencefulPersonResponse | null> {
  try {
    // GET /people/ with email filter
    const response = await audiencefulRequest(
      `/people/?email=${encodeURIComponent(email)}`,
      'GET'
    );

    // API returns paginated results
    if (response && response.results && Array.isArray(response.results)) {
      return response.results.length > 0 ? response.results[0] : null;
    }

    // Handle direct result
    if (response && response.email === email) {
      return response;
    }

    return null;
  } catch (error: any) {
    // If 404, subscriber doesn't exist
    if (error.message.includes('404')) {
      return null;
    }
    throw error;
  }
}

/**
 * Create a new subscriber in Audienceful
 */
export async function createSubscriber(
  data: AudiencefulPersonRequest
): Promise<AudiencefulPersonResponse> {
  return await audiencefulRequest('/people/', 'POST', data);
}

/**
 * Update an existing subscriber
 */
export async function updateSubscriber(
  email: string,
  data: Partial<AudiencefulPersonRequest>
): Promise<AudiencefulPersonResponse> {
  // Audienceful API requires email in body and uses PATCH /people/ endpoint
  const updateData = {
    email,
    ...data,
  };
  return await audiencefulRequest('/people/', 'PATCH', updateData);
}

/**
 * Convert tag objects to comma-separated string of tag names
 */
function tagsToString(tags: Array<{ name: string }> | undefined): string {
  if (!tags || tags.length === 0) return '';
  return tags.map(t => t.name).join(', ');
}

/**
 * Merge existing tags with new tags
 */
function mergeTags(existingTags: string, newTags: string): string {
  if (!existingTags) return newTags;
  if (!newTags) return existingTags;

  const existing = existingTags.split(',').map(t => t.trim()).filter(t => t);
  const newTagsArray = newTags.split(',').map(t => t.trim()).filter(t => t);
  const merged = Array.from(new Set([...existing, ...newTagsArray]));

  return merged.join(', ');
}

/**
 * Tag a user as an app user in Audienceful
 * Adds "User" tag and stores Clerk user ID
 * Creates subscriber if they don't exist
 */
export async function tagAsAppUser(
  email: string,
  clerkUserId: string,
  firstName?: string,
  lastName?: string
): Promise<AudiencefulPersonResponse> {
  console.log('[Audienceful] Starting tagAsAppUser:', {
    email,
    clerkUserId,
    firstName: firstName || null,
    lastName: lastName || null,
    timestamp: new Date().toISOString(),
  });

  // Check if API key is configured before making any requests
  try {
    const apiKey = import.meta.env.AUDIENCEFUL_API_KEY;
    if (!apiKey) {
      throw new Error('AUDIENCEFUL_API_KEY environment variable is not set');
    }
  } catch (error: any) {
    console.error('[Audienceful] API key not configured:', {
      error: error.message,
      email,
      clerkUserId,
    });
    throw error;
  }

  // Try to find existing subscriber
  const existing = await findSubscriberByEmail(email);

  // Prepare extra_data with custom fields
  const extraData: { [key: string]: any } = {
    clerk_user_id: clerkUserId,
  };

  if (firstName) extraData.first_name = firstName;
  if (lastName) extraData.last_name = lastName;

  if (existing && existing.id) {
    // Update existing subscriber
    const existingTagsString = tagsToString(existing.tags);
    const mergedTags = mergeTags(existingTagsString, 'User');

    console.log('[Audienceful] Updating existing subscriber:', {
      email,
      existingId: existing.id,
      existingTags: existingTagsString,
      mergedTags,
    });

    // Merge extra_data
    const mergedExtraData = {
      ...existing.extra_data,
      ...extraData,
    };

    try {
      const result = await updateSubscriber(email, {
        tags: mergedTags,
        extra_data: mergedExtraData,
      });

      console.log('[Audienceful] Successfully updated subscriber:', {
        email,
        audiencefulId: result.id || result.uid,
        tags: mergedTags,
      });

      return result;
    } catch (error: any) {
      // If person doesn't exist (404), fall back to creating them
      if (error.message && error.message.includes('404')) {
        console.log('[Audienceful] Subscriber not found during update, creating new:', {
          email,
        });

        // Person was not found, create them instead
        const result = await createSubscriber({
          email,
          tags: mergedTags,
          extra_data: mergedExtraData,
          double_opt_in: 'not_required',
          trigger_automations: false,
        });

        console.log('[Audienceful] Successfully created subscriber (fallback):', {
          email,
          audiencefulId: result.id || result.uid,
        });

        return result;
      }
      // Re-throw other errors
      throw error;
    }
  } else {
    // Create new subscriber
    console.log('[Audienceful] Creating new subscriber:', {
      email,
      tags: 'User',
    });

    const result = await createSubscriber({
      email,
      tags: 'User',
      extra_data: extraData,
      double_opt_in: 'not_required',
      trigger_automations: false,
    });

    console.log('[Audienceful] Successfully created subscriber:', {
      email,
      audiencefulId: result.id || result.uid,
    });

    return result;
  }
}
