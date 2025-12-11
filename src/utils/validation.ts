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

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  code?: string;
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
 * Rules: 1-50,000 characters, required
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

  if (trimmed.length > 50000) {
    return {
      isValid: false,
      error: 'Content must be 50,000 characters or less',
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

