import { describe, it, expect } from 'vitest';
import {
  HarvousError,
  HarvousAuthError,
  HarvousNotFoundError,
  HarvousRateLimitError,
  HarvousValidationError,
  HarvousNetworkError,
} from '../src/errors.js';

describe('HarvousError', () => {
  it('stores message, status, code, and response', () => {
    const err = new HarvousError('Something broke', 500, 'SERVER_ERROR', {
      detail: 'x',
    });
    expect(err.message).toBe('Something broke');
    expect(err.status).toBe(500);
    expect(err.code).toBe('SERVER_ERROR');
    expect(err.response).toEqual({ detail: 'x' });
    expect(err.name).toBe('HarvousError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('HarvousAuthError', () => {
  it('defaults to 401 UNAUTHORIZED', () => {
    const err = new HarvousAuthError();
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('Authentication required');
    expect(err.name).toBe('HarvousAuthError');
    expect(err).toBeInstanceOf(HarvousError);
  });

  it('accepts a custom message', () => {
    const err = new HarvousAuthError('Token expired');
    expect(err.message).toBe('Token expired');
  });
});

describe('HarvousNotFoundError', () => {
  it('defaults to generic not found', () => {
    const err = new HarvousNotFoundError();
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Resource not found');
    expect(err.name).toBe('HarvousNotFoundError');
  });

  it('includes resource name in message', () => {
    const err = new HarvousNotFoundError('Note');
    expect(err.message).toBe('Note not found');
  });
});

describe('HarvousRateLimitError', () => {
  it('includes resetTime', () => {
    const err = new HarvousRateLimitError('Slow down', 1700000000);
    expect(err.status).toBe(429);
    expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(err.resetTime).toBe(1700000000);
    expect(err.name).toBe('HarvousRateLimitError');
  });

  it('has undefined resetTime by default', () => {
    const err = new HarvousRateLimitError();
    expect(err.resetTime).toBeUndefined();
  });
});

describe('HarvousValidationError', () => {
  it('uses provided code', () => {
    const err = new HarvousValidationError('Title too long', 'TITLE_TOO_LONG');
    expect(err.status).toBe(400);
    expect(err.code).toBe('TITLE_TOO_LONG');
    expect(err.name).toBe('HarvousValidationError');
  });

  it('defaults code to INVALID_REQUEST', () => {
    const err = new HarvousValidationError('Bad input');
    expect(err.code).toBe('INVALID_REQUEST');
  });
});

describe('HarvousNetworkError', () => {
  it('has status 0 and NETWORK_ERROR code', () => {
    const err = new HarvousNetworkError('Connection refused');
    expect(err.status).toBe(0);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.name).toBe('HarvousNetworkError');
  });

  it('stores the cause', () => {
    const cause = new TypeError('fetch failed');
    const err = new HarvousNetworkError('Network error', cause);
    expect(err.cause).toBe(cause);
  });
});
