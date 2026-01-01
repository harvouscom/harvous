/**
 * Standardized API Response Helpers
 * 
 * Provides consistent response formatting across all API endpoints.
 * Ensures uniform error handling and response structure.
 */

/**
 * Create a standard JSON response
 */
export function jsonResponse(data: any, status: number = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

/**
 * Create a success response (200 OK by default)
 */
export function successResponse(data: any, status: number = 200): Response {
  return jsonResponse(data, status);
}

/**
 * Create an error response (400 Bad Request by default)
 */
export function errorResponse(message: string, code?: string, status: number = 400): Response {
  const response: { error: string; code?: string } = { error: message };
  if (code) {
    response.code = code;
  }
  return jsonResponse(response, status);
}

/**
 * Create an unauthorized response (401)
 */
export function unauthorizedResponse(message: string = 'Authentication required'): Response {
  return errorResponse(message, 'UNAUTHORIZED', 401);
}

/**
 * Create a not found response (404)
 */
export function notFoundResponse(resource?: string): Response {
  const message = resource ? `${resource} not found` : 'Resource not found';
  return errorResponse(message, 'NOT_FOUND', 404);
}

/**
 * Create a rate limited response (429)
 */
export function rateLimitedResponse(resetTime: number, message: string = 'Rate limit exceeded'): Response {
  return jsonResponse(
    { error: message, code: 'RATE_LIMIT_EXCEEDED' },
    429,
    {
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(resetTime)
    }
  );
}

/**
 * Create a server error response (500)
 */
export function serverErrorResponse(error: unknown, context?: { endpoint?: string; action?: string }): Response {
  let errorMessage = 'An unexpected error occurred';
  
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  }
  
  const response: { error: string; code?: string } = { error: errorMessage };
  
  // Include error code if available from handleAPIError
  if (error && typeof error === 'object' && 'code' in error) {
    response.code = String(error.code);
  }
  
  return jsonResponse(response, 500);
}

/**
 * Create a forbidden response (403)
 */
export function forbiddenResponse(message: string = 'Forbidden', code?: string): Response {
  return errorResponse(message, code || 'FORBIDDEN', 403);
}

