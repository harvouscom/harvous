/** Note types supported by Harvous */
export type NoteType = 'default' | 'scripture' | 'resource';

/** Thread color options */
export type ThreadColor =
  | 'paper'
  | 'blue'
  | 'yellow'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'green';

/** Standard error codes returned by the Harvous API */
export type HarvousErrorCode =
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'RATE_LIMIT_EXCEEDED'
  | 'NOTE_LIMIT_EXCEEDED'
  | 'INVALID_REQUEST'
  | 'TITLE_REQUIRED'
  | 'TITLE_TOO_LONG'
  | 'CONTENT_REQUIRED'
  | 'CONTENT_TOO_LONG'
  | 'INVALID_COLOR'
  | 'INVALID_NOTE_TYPE'
  | 'INVALID_THREAD_ID'
  | 'INVALID_SPACE_ID'
  | 'URL_REQUIRED'
  | 'INVALID_URL'
  | 'FORBIDDEN'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | (string & {});

/** Configuration for the HarvousClient */
export interface HarvousClientConfig {
  /** Base URL of the Harvous API (default: 'https://harvous.com') */
  baseUrl?: string;
  /** Clerk session token for authentication */
  token?: string;
  /** Function that returns a fresh token (for auto-refresh) */
  getToken?: () => Promise<string | null>;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Number of retry attempts for 5xx errors (default: 2) */
  retries?: number;
}
