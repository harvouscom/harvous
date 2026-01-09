/**
 * Audienceful API integration
 * Handles subscriber management, tags, and custom fields
 */

import { fetchWithTimeout } from './fetch-helpers';

const AUDIENCEFUL_API_BASE = 'https://app.audienceful.com/api';

interface AudiencefulPerson {
  email: string;
  first_name?: string;
  last_name?: string;
  tags?: string[];
  [key: string]: any; // For custom fields
}

interface AudiencefulAPIResponse {
  id?: string;
  email?: string;
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
): Promise<AudiencefulAPIResponse | null> {
  try {
    // GET /people/ with email filter (assuming query param support)
    // If the API doesn't support filtering, we'll need to get all and filter client-side
    const response = await audiencefulRequest(
      `/people/?email=${encodeURIComponent(email)}`,
      'GET'
    );

    // Handle different response formats
    if (Array.isArray(response)) {
      return response.length > 0 ? response[0] : null;
    }

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
  data: AudiencefulPerson
): Promise<AudiencefulAPIResponse> {
  return await audiencefulRequest('/people/', 'POST', data);
}

/**
 * Update an existing subscriber
 * Note: May need subscriber ID depending on API requirements
 */
export async function updateSubscriber(
  email: string,
  data: Partial<AudiencefulPerson>
): Promise<AudiencefulAPIResponse> {
  // First find the subscriber to get their ID
  const subscriber = await findSubscriberByEmail(email);

  if (!subscriber || !subscriber.id) {
    throw new Error(`Subscriber not found: ${email}`);
  }

  // Update using PATCH with subscriber ID
  return await audiencefulRequest(
    `/people/${subscriber.id}`,
    'PATCH',
    data
  );
}

/**
 * Add tags to a subscriber (creates subscriber if doesn't exist)
 */
export async function addTagsToSubscriber(
  email: string,
  tags: string[]
): Promise<AudiencefulAPIResponse> {
  const existing = await findSubscriberByEmail(email);

  if (existing) {
    // Merge tags - combine existing tags with new ones
    const currentTags = existing.tags || [];
    const mergedTags = Array.from(new Set([...currentTags, ...tags]));

    return await updateSubscriber(email, { tags: mergedTags });
  } else {
    // Create new subscriber with tags
    return await createSubscriber({ email, tags });
  }
}

/**
 * Update subscriber with custom fields and tags
 * Creates subscriber if they don't exist
 */
export async function upsertSubscriber(
  email: string,
  data: Partial<AudiencefulPerson>
): Promise<AudiencefulAPIResponse> {
  const existing = await findSubscriberByEmail(email);

  if (existing) {
    // If tags are provided, merge them with existing tags
    if (data.tags && existing.tags) {
      data.tags = Array.from(new Set([...existing.tags, ...data.tags]));
    }

    return await updateSubscriber(email, data);
  } else {
    // Create new subscriber
    return await createSubscriber({ email, ...data });
  }
}

/**
 * Tag a user as an app user in Audienceful
 * Adds "app_user" tag and stores Clerk user ID
 */
export async function tagAsAppUser(
  email: string,
  clerkUserId: string,
  firstName?: string,
  lastName?: string
): Promise<AudiencefulAPIResponse> {
  const data: Partial<AudiencefulPerson> = {
    tags: ['app_user'],
    clerk_user_id: clerkUserId,
  };

  if (firstName) data.first_name = firstName;
  if (lastName) data.last_name = lastName;

  return await upsertSubscriber(email, data);
}
