/**
 * Input Validation Utilities
 * Provides consistent validation for API endpoints and forms
 */

import { THREAD_COLORS, type ThreadColor } from './colors';

/**
 * Normalize a URL by adding https:// protocol if missing
 * Handles common URL patterns like "example.com" or "www.example.com"
 */
export function normalizeUrl(url: string): string {
  if (!url || !url.trim()) {
    return url;
  }

  const trimmed = url.trim();

  // If it already has a protocol, return as-is
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // If it starts with //, add https:
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  // Otherwise, prepend https://
  return `https://${trimmed}`;
}

/**
 * Extract the domain from a URL (without www. prefix)
 * Returns null if the URL is invalid
 * Examples:
 *   "https://www.youtube.com/watch?v=123" -> "youtube.com"
 *   "https://thegospelcoalition.org/article" -> "thegospelcoalition.org"
 */
export function extractDomain(url: string): string | null {
  if (!url || !url.trim()) {
    return null;
  }

  try {
    const normalizedUrl = normalizeUrl(url);
    const urlObj = new URL(normalizedUrl);
    // Remove 'www.' prefix if present
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Map of common domains to friendly display names
 */
const DOMAIN_FRIENDLY_NAMES: Record<string, string> = {
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'vimeo.com': 'Vimeo',
  'thegospelcoalition.org': 'The Gospel Coalition',
  'desiringgod.org': 'Desiring God',
  'ligonier.org': 'Ligonier Ministries',
  'christianitytoday.com': 'Christianity Today',
  'biblegateway.com': 'Bible Gateway',
  'blueletterbible.org': 'Blue Letter Bible',
  'gotquestions.org': 'Got Questions',
  'ccel.org': 'Christian Classics Ethereal Library',
  'crossway.org': 'Crossway',
  'logos.com': 'Logos',
  'bible.com': 'YouVersion',
  'faithlife.com': 'Faithlife',
  'spurgeon.org': 'Spurgeon',
  'monergism.com': 'Monergism',
  'reformedwiki.com': 'Reformed Wiki',
  'thirdmill.org': 'Third Millennium',
  'biblia.com': 'Biblia',
  'bibleproject.com': 'BibleProject',
  'medium.com': 'Medium',
  'substack.com': 'Substack',
  'spotify.com': 'Spotify',
  'podcasts.apple.com': 'Apple Podcasts',
  'anchor.fm': 'Anchor',
  'soundcloud.com': 'SoundCloud',
  'twitter.com': 'Twitter',
  'x.com': 'X',
  'instagram.com': 'Instagram',
  'facebook.com': 'Facebook',
  'tiktok.com': 'TikTok',
  'reddit.com': 'Reddit',
  'linkedin.com': 'LinkedIn',
  'notion.so': 'Notion',
  'docs.google.com': 'Google Docs',
  'drive.google.com': 'Google Drive',
  'dropbox.com': 'Dropbox',
  'github.com': 'GitHub',
  'amazon.com': 'Amazon',
};

/**
 * Get a friendly display name for a domain (fallback mapping)
 * Returns the friendly name if known, otherwise returns the domain as-is
 * Examples:
 *   "youtube.com" -> "YouTube"
 *   "thegospelcoalition.org" -> "The Gospel Coalition"
 *   "someunknownsite.com" -> "someunknownsite.com"
 */
export function getDomainFriendlyName(domain: string | null | undefined): string | null {
  if (!domain) {
    return null;
  }
  
  return DOMAIN_FRIENDLY_NAMES[domain.toLowerCase()] || domain;
}

/**
 * Get the best display name for a resource source
 * Priority: sourceName (from og:site_name) > friendly domain name > raw domain
 * Examples:
 *   ("YouTube", "youtube.com") -> "YouTube" (from sourceName)
 *   (null, "youtube.com") -> "YouTube" (from hardcoded mapping)
 *   (null, "someunknownsite.com") -> "someunknownsite.com" (raw domain)
 */
export function getSourceDisplayName(sourceName: string | null | undefined, sourceDomain: string | null | undefined): string | null {
  // Primary: use sourceName from og:site_name if available
  if (sourceName && sourceName.trim()) {
    return sourceName.trim();
  }
  
  // Fallback: use hardcoded friendly name mapping or raw domain
  return getDomainFriendlyName(sourceDomain);
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  code?: string;
}

export interface UrlValidationResult extends ValidationResult {
  normalizedUrl?: string;
  isPDF?: boolean;
  domain?: string;
}

export type NoteType = 'default' | 'scripture' | 'resource';

/**
 * Validate title input
 * Rules: 1-200 characters, required
 */
export function validateTitle(title: string | null | undefined, required: boolean = true): ValidationResult {
  if (!title || !title.trim()) {
    if (required) {
      return {
        isValid: false,
        error: 'Title is required',
        code: 'TITLE_REQUIRED'
      };
    }
    return { isValid: true };
  }

  const trimmed = title.trim();
  if (trimmed.length < 1) {
    if (required) {
      return {
        isValid: false,
        error: 'Title cannot be empty',
        code: 'TITLE_EMPTY'
      };
    }
    return { isValid: true };
  }

  if (trimmed.length > 200) {
    return {
      isValid: false,
      error: 'Title must be 200 characters or less',
      code: 'TITLE_TOO_LONG'
    };
  }

  return { isValid: true };
}

/**
 * Validate content input
 * Rules: 1-500,000 characters, required
 *
 * Note: this cap is measured on the stored HTML, not the user's plain text.
 * Rich notes (scripture pills, links, formatting) inflate the HTML well beyond
 * the visible writing, so the limit is intentionally generous. The DB column is
 * Postgres `text` (unbounded), so this is purely a sanity guard against runaway
 * payloads, not a storage constraint.
 */
export function validateContent(content: string | null | undefined, required: boolean = true): ValidationResult {
  if (!content || !content.trim()) {
    if (required) {
      return {
        isValid: false,
        error: 'Content is required',
        code: 'CONTENT_REQUIRED'
      };
    }
    return { isValid: true };
  }

  const trimmed = content.trim();
  if (trimmed.length < 1) {
    if (required) {
      return {
        isValid: false,
        error: 'Content cannot be empty',
        code: 'CONTENT_EMPTY'
      };
    }
    return { isValid: true };
  }

  if (trimmed.length > 500000) {
    return {
      isValid: false,
      error: 'Content must be 500,000 characters or less',
      code: 'CONTENT_TOO_LONG'
    };
  }

  return { isValid: true };
}

/**
 * Validate color value
 * Rules: Must be in THREAD_COLORS array
 */
export function validateColor(color: string | null | undefined): ValidationResult {
  if (!color) {
    return { isValid: true }; // Color is optional
  }

  if (!THREAD_COLORS.includes(color as ThreadColor)) {
    return {
      isValid: false,
      error: `Invalid color. Must be one of: ${THREAD_COLORS.join(', ')}`,
      code: 'INVALID_COLOR'
    };
  }

  return { isValid: true };
}

/**
 * Validate note type
 * Rules: Must be 'default' | 'scripture' | 'resource'
 */
export function validateNoteType(noteType: string | null | undefined): ValidationResult {
  if (!noteType) {
    return { isValid: true }; // Defaults to 'default'
  }

  const validTypes: NoteType[] = ['default', 'scripture', 'resource'];
  if (!validTypes.includes(noteType as NoteType)) {
    return {
      isValid: false,
      error: `Invalid note type. Must be one of: ${validTypes.join(', ')}`,
      code: 'INVALID_NOTE_TYPE'
    };
  }

  return { isValid: true };
}

/**
 * Validate user ID matches authenticated user
 * Rules: userId must match the authenticated userId
 */
export function validateUserId(userId: string | null | undefined, authenticatedUserId: string | null | undefined): ValidationResult {
  if (!authenticatedUserId) {
    return {
      isValid: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    };
  }

  if (userId && userId !== authenticatedUserId) {
    return {
      isValid: false,
      error: 'User ID mismatch',
      code: 'USER_ID_MISMATCH'
    };
  }

  return { isValid: true };
}

/**
 * Validate space ID format
 * Rules: Must be a valid string format (if provided)
 */
export function validateSpaceId(spaceId: string | null | undefined): ValidationResult {
  if (!spaceId) {
    return { isValid: true }; // Space ID is optional
  }

  const trimmed = spaceId.trim();
  if (trimmed.length === 0) {
    return { isValid: true }; // Empty string is treated as no space
  }

  // Basic format validation - should start with 'space_'
  if (!trimmed.startsWith('space_')) {
    return {
      isValid: false,
      error: 'Invalid space ID format',
      code: 'INVALID_SPACE_ID'
    };
  }

  return { isValid: true };
}

/**
 * Validate thread ID format
 * Rules: Must be a valid string format (if provided)
 */
export function validateThreadId(threadId: string | null | undefined): ValidationResult {
  if (!threadId) {
    return { isValid: true }; // Thread ID is optional
  }

  const trimmed = threadId.trim();
  if (trimmed.length === 0) {
    return { isValid: true }; // Empty string is treated as unorganized
  }

  // Basic format validation - should start with 'thread_' or be 'thread_unorganized'
  if (trimmed !== 'thread_unorganized' && !trimmed.startsWith('thread_')) {
    return {
      isValid: false,
      error: 'Invalid thread ID format',
      code: 'INVALID_THREAD_ID'
    };
  }

  return { isValid: true };
}

/**
 * Validate name input (first name or last name)
 * Rules: 1-100 characters, required
 */
export function validateName(name: string | null | undefined, fieldName: string = 'Name', required: boolean = true): ValidationResult {
  if (!name || !name.trim()) {
    if (required) {
      return {
        isValid: false,
        error: `${fieldName} is required`,
        code: `${fieldName.toUpperCase().replace(/\s+/g, '_')}_REQUIRED`
      };
    }
    return { isValid: true };
  }

  const trimmed = name.trim();
  if (trimmed.length < 1) {
    if (required) {
      return {
        isValid: false,
        error: `${fieldName} cannot be empty`,
        code: `${fieldName.toUpperCase().replace(/\s+/g, '_')}_EMPTY`
      };
    }
    return { isValid: true };
  }

  if (trimmed.length > 100) {
    return {
      isValid: false,
      error: `${fieldName} must be 100 characters or less`,
      code: `${fieldName.toUpperCase().replace(/\s+/g, '_')}_TOO_LONG`
    };
  }

  return { isValid: true };
}

/**
 * Sanitize string input (basic)
 * Removes leading/trailing whitespace and nullifies empty strings
 */
export function sanitizeString(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Validate and sanitize title
 */
export function validateAndSanitizeTitle(title: string | null | undefined, required: boolean = true): { result: ValidationResult; sanitized: string | null } {
  const sanitized = sanitizeString(title);
  const result = validateTitle(sanitized || '', required);
  return { result, sanitized };
}

/**
 * Validate and sanitize content
 */
export function validateAndSanitizeContent(content: string | null | undefined, required: boolean = true): { result: ValidationResult; sanitized: string | null } {
  const sanitized = sanitizeString(content);
  const result = validateContent(sanitized || '', required);
  return { result, sanitized };
}

/**
 * Validate resource URL with comprehensive security checks
 * Blocks dangerous protocols, localhost, private IPs, and validates format
 * Also detects PDF URLs
 */
export function validateResourceUrl(url: string | null | undefined): UrlValidationResult {
  // Empty check
  if (!url || !url.trim()) {
    return {
      isValid: false,
      error: 'URL is required',
      code: 'URL_REQUIRED'
    };
  }

  const trimmed = url.trim();
  
  // Max length check (browsers typically support ~2000 chars, but let's be reasonable)
  if (trimmed.length > 2048) {
    return {
      isValid: false,
      error: 'URL is too long',
      code: 'URL_TOO_LONG'
    };
  }

  // Block dangerous protocols (XSS, data URI attacks, file access)
  const lowerUrl = trimmed.toLowerCase();
  const dangerousProtocols = ['javascript:', 'data:', 'file:', 'vbscript:', 'about:'];
  if (dangerousProtocols.some(proto => lowerUrl.startsWith(proto))) {
    return {
      isValid: false,
      error: 'Invalid URL protocol',
      code: 'INVALID_PROTOCOL'
    };
  }

  // Normalize URL (add https:// if missing)
  const normalizedUrl = normalizeUrl(trimmed);
  
  // Only allow http/https protocols
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    return {
      isValid: false,
      error: 'Only web URLs are supported',
      code: 'UNSUPPORTED_PROTOCOL'
    };
  }

  // Parse and validate URL structure
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    return {
      isValid: false,
      error: 'Invalid URL format',
      code: 'INVALID_FORMAT'
    };
  }

  // Block localhost/internal hosts (SSRF protection)
  const hostname = parsedUrl.hostname.toLowerCase();
  const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
  if (blockedHosts.includes(hostname) || hostname.endsWith('.local')) {
    return {
      isValid: false,
      error: 'Local URLs are not supported',
      code: 'LOCAL_URL'
    };
  }

  // Block private IP ranges (SSRF protection)
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      return {
        isValid: false,
        error: 'Private network URLs are not supported',
        code: 'PRIVATE_IP'
      };
    }
  }

  // Must have valid TLD (at least one dot in hostname, unless it's an IP)
  if (!hostname.includes('.') && !ipv4Match) {
    return {
      isValid: false,
      error: 'Invalid domain name',
      code: 'INVALID_DOMAIN'
    };
  }

  // Detect PDF URLs
  const isPDF = normalizedUrl.toLowerCase().endsWith('.pdf') ||
                normalizedUrl.toLowerCase().includes('.pdf?') ||
                normalizedUrl.toLowerCase().includes('.pdf#');

  return {
    isValid: true,
    normalizedUrl,
    isPDF,
    domain: hostname.replace(/^www\./, '')
  };
}