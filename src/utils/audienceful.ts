/**
 * Audienceful API integration
 * Handles subscriber management, tags, and custom fields
 *
 * API Documentation: https://developer.audienceful.com
 */

import { fetchWithTimeout } from './fetch-helpers';

const AUDIENCEFUL_API_BASE = 'https://app.audienceful.com/api';

/** Segment marker for actual app users (must match Audienceful tag spelling). */
export const APP_USER_TAG = 'User';

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
  const apiKey = process.env?.AUDIENCEFUL_API_KEY;
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

  let response = await fetchWithTimeout(url, options);

  // Audienceful rate-limits aggressively; one short wait covers most 429s.
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    response = await fetchWithTimeout(url, options);
  }

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
 *
 * Note: Audienceful's `?email=` query is ignored (returns an unfiltered page).
 * Use `?search=` and require an exact email match on the result.
 */
export async function findSubscriberByEmail(
  email: string
): Promise<AudiencefulPersonResponse | null> {
  const normalized = email.trim().toLowerCase();

  try {
    const response = await audiencefulRequest(
      `/people/?search=${encodeURIComponent(email)}`,
      'GET'
    );

    const results: AudiencefulPersonResponse[] = Array.isArray(response?.results)
      ? response.results
      : response?.email
        ? [response]
        : [];

    const match = results.find((person) => person.email?.trim().toLowerCase() === normalized);
    return match ?? null;
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
  return tags.map((t) => t.name).join(', ');
}

/**
 * Merge tag strings (case-insensitive). When a tag already exists under a
 * different casing, keep the existing spelling; new tags use the requested name.
 */
function mergeTags(existingTags: string, newTags: string): string {
  if (!existingTags) return newTags;
  if (!newTags) return existingTags;

  const byLower = new Map<string, string>();
  for (const tag of existingTags.split(',').map((t) => t.trim()).filter(Boolean)) {
    byLower.set(tag.toLowerCase(), tag);
  }
  for (const tag of newTags.split(',').map((t) => t.trim()).filter(Boolean)) {
    const key = tag.toLowerCase();
    if (!byLower.has(key)) byLower.set(key, tag);
  }

  return Array.from(byLower.values()).join(', ');
}

function hasAudiencefulIdentity(person: AudiencefulPersonResponse | null): boolean {
  return Boolean(person && (person.id != null || person.uid));
}

/**
 * Tag a user as an app user in Audienceful
 * Ensures "User" tag is present (merges with existing tags) and stores Clerk user ID.
 * Creates subscriber if they don't exist.
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
    const apiKey = process.env?.AUDIENCEFUL_API_KEY;
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

  if (hasAudiencefulIdentity(existing)) {
    const existingTagsString = tagsToString(existing!.tags);
    const mergedTags = mergeTags(existingTagsString, APP_USER_TAG);

    console.log('[Audienceful] Updating existing subscriber:', {
      email,
      existingId: existing!.id ?? existing!.uid,
      existingTags: existingTagsString,
      mergedTags,
    });

    const mergedExtraData = {
      ...existing!.extra_data,
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

        const result = await createSubscriber({
          email,
          tags: APP_USER_TAG,
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
      throw error;
    }
  } else {
    console.log('[Audienceful] Creating new subscriber:', {
      email,
      tags: APP_USER_TAG,
    });

    const result = await createSubscriber({
      email,
      tags: APP_USER_TAG,
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
