import type { HarvousErrorCode } from './types/common.js';

/** Base error class for all Harvous SDK errors */
export class HarvousError extends Error {
  public readonly code: HarvousErrorCode | undefined;
  public readonly status: number;
  public readonly response: unknown;

  constructor(
    message: string,
    status: number,
    code?: HarvousErrorCode,
    response?: unknown,
  ) {
    super(message);
    this.name = 'HarvousError';
    this.status = status;
    this.code = code;
    this.response = response;
  }
}

/** Thrown when the request is not authenticated (401) */
export class HarvousAuthError extends HarvousError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'HarvousAuthError';
  }
}

/** Thrown when a resource is not found (404) */
export class HarvousNotFoundError extends HarvousError {
  constructor(resource?: string) {
    super(
      resource ? `${resource} not found` : 'Resource not found',
      404,
      'NOT_FOUND',
    );
    this.name = 'HarvousNotFoundError';
  }
}

/** Thrown when the API rate limit is exceeded (429) */
export class HarvousRateLimitError extends HarvousError {
  public readonly resetTime: number | undefined;

  constructor(message = 'Rate limit exceeded', resetTime?: number) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'HarvousRateLimitError';
    this.resetTime = resetTime;
  }
}

/** Thrown when request validation fails (400) */
export class HarvousValidationError extends HarvousError {
  constructor(message: string, code?: HarvousErrorCode) {
    super(message, 400, code || 'INVALID_REQUEST');
    this.name = 'HarvousValidationError';
  }
}

/** Thrown on network failures (timeout, connection refused, etc.) */
export class HarvousNetworkError extends HarvousError {
  constructor(message = 'Network error', cause?: unknown) {
    super(message, 0, 'NETWORK_ERROR');
    this.name = 'HarvousNetworkError';
    if (cause) this.cause = cause;
  }
}
