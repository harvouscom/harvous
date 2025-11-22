/**
 * Standardized Error Handling Utility
 * Provides consistent error handling patterns across the app
 */

export interface ErrorContext {
  component?: string;
  action?: string;
  endpoint?: string;
  userId?: string;
  [key: string]: any;
}

/**
 * Standard error response format
 */
export interface StandardError {
  message: string;
  code?: string;
  context?: ErrorContext;
  timestamp: number;
}

/**
 * Create a standardized error object
 */
export function createError(
  message: string,
  code?: string,
  context?: ErrorContext
): StandardError {
  return {
    message,
    code,
    context,
    timestamp: Date.now()
  };
}

/**
 * Handle API errors consistently
 * Logs error and optionally shows user-friendly message
 */
export function handleAPIError(
  error: unknown,
  context?: ErrorContext
): StandardError {
  let errorMessage = 'An unexpected error occurred';
  let errorCode: string | undefined;

  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else if (error && typeof error === 'object' && 'message' in error) {
    errorMessage = String((error as any).message);
    errorCode = (error as any).code;
  }

  const standardError = createError(errorMessage, errorCode, context);

  // Log error for debugging
  console.error('API Error:', standardError);

  // Track error in PostHog if available
  if (typeof window !== 'undefined' && (window as any).posthog) {
    try {
      (window as any).posthog.capture('error_occurred', {
        error_message: errorMessage,
        error_code: errorCode,
        ...context
      });
    } catch (posthogError) {
      // Don't fail if PostHog tracking fails
      console.warn('Failed to track error in PostHog:', posthogError);
    }
  }

  return standardError;
}

/**
 * Show user-friendly error message
 * Uses toast notifications if available, falls back to alert
 */
export function showErrorToUser(
  error: StandardError | string,
  options?: {
    duration?: number;
    showInConsole?: boolean;
  }
): void {
  const message = typeof error === 'string' ? error : error.message;
  const { duration = 5000, showInConsole = true } = options || {};

  if (showInConsole) {
    console.error('User-facing error:', message);
  }

  // Try to use toast notification system
  if (typeof window !== 'undefined' && (window as any).toast) {
    try {
      (window as any).toast.error(message, { duration });
      return;
    } catch (toastError) {
      // Fallback if toast fails
      console.warn('Toast notification failed:', toastError);
    }
  }

  // Fallback to console error (don't use alert in production)
  if (import.meta.env.DEV) {
    console.error('Error (would show toast in production):', message);
  }
}

/**
 * Handle fetch errors consistently
 */
export async function handleFetchError(
  response: Response,
  context?: ErrorContext
): Promise<StandardError> {
  let errorMessage = `Request failed with status ${response.status}`;
  let errorCode: string | undefined;

  try {
    const errorData = await response.json();
    if (errorData.error) {
      errorMessage = errorData.error;
    }
    if (errorData.code) {
      errorCode = errorData.code;
    }
  } catch {
    // If response isn't JSON, use status text
    errorMessage = response.statusText || errorMessage;
  }

  const standardError = createError(errorMessage, errorCode, {
    ...context,
    status: response.status,
    statusText: response.statusText
  });

  console.error('Fetch Error:', standardError);

  return standardError;
}

/**
 * Safe async wrapper that handles errors consistently
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  context?: ErrorContext,
  onError?: (error: StandardError) => void
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const standardError = handleAPIError(error, context);
    if (onError) {
      onError(standardError);
    } else {
      showErrorToUser(standardError);
    }
    return null;
  }
}

