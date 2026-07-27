/**
 * Rate Limiting Utility
 * 
 * Provides in-memory rate limiting for API endpoints.
 * For production, consider using Netlify Functions rate limits or a Redis-based solution.
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // Time window in milliseconds
}

interface RequestRecord {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting
// In production, consider using Redis or Netlify's built-in rate limiting
const rateLimitStore = new Map<string, RequestRecord>();

// Cleanup old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let cleanupTimer: NodeJS.Timeout | null = null;

function startCleanupTimer() {
  if (cleanupTimer) return;
  
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
}

// Start cleanup timer on first use
if (typeof globalThis !== 'undefined') {
  startCleanupTimer();
}

/**
 * Get rate limit key from request
 */
function getRateLimitKey(userId: string | null, endpoint: string, ip?: string): string {
  // Use userId if available, otherwise fall back to IP
  const identifier = userId || ip || 'anonymous';
  return `${identifier}:${endpoint}`;
}

/**
 * Check if request is within rate limit
 */
export function checkRateLimit(
  userId: string | null,
  endpoint: string,
  config: RateLimitConfig,
  ip?: string
): { allowed: boolean; remaining: number; resetTime: number } {
  const key = getRateLimitKey(userId, endpoint, ip);
  const now = Date.now();
  
  let record = rateLimitStore.get(key);
  
  // If no record or window has expired, create new record
  if (!record || now > record.resetTime) {
    record = {
      count: 1,
      resetTime: now + config.windowMs
    };
    rateLimitStore.set(key, record);
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: record.resetTime
    };
  }
  
  // Increment count
  record.count++;
  
  // Check if limit exceeded
  if (record.count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime
    };
  }
  
  return {
    allowed: true,
    remaining: config.maxRequests - record.count,
    resetTime: record.resetTime
  };
}

/**
 * Rate limit configurations
 */
export const RATE_LIMITS = {
  // Read operations: 100 requests per minute
  READ: {
    maxRequests: 100,
    windowMs: 60 * 1000 // 1 minute
  },
  // Write operations: 20 requests per minute
  WRITE: {
    maxRequests: 20,
    windowMs: 60 * 1000 // 1 minute
  },
  // Space invite: higher limit so owners can onboard larger spaces (e.g. 50 members)
  INVITE: {
    maxRequests: 60,
    windowMs: 60 * 1000 // 1 minute
  },
  /**
   * Note creation (POST /api/notes/create + note creates inside /api/sync/push).
   * Stricter than generic WRITE to limit scripted / batched note spam.
   */
  NOTE_CREATE_PER_MINUTE: {
    maxRequests: 30,
    windowMs: 60 * 1000
  },
  NOTE_CREATE_PER_HOUR: {
    maxRequests: 400,
    windowMs: 60 * 60 * 1000
  }
} as const;

/** Max note `create` operations accepted in a single sync push (batch bypass guard). */
export const MAX_NOTE_CREATES_PER_SYNC_PUSH = 50;

const NOTE_CREATE_MINUTE_KEY = 'note-create:window:1m';
const NOTE_CREATE_HOUR_KEY = 'note-create:window:1h';

function getRecord(key: string, now: number, windowMs: number): RequestRecord {
  let record = rateLimitStore.get(key);
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + windowMs };
    rateLimitStore.set(key, record);
  }
  return record;
}

/**
 * Atomically reserves `delta` note-creation slots against per-minute and per-hour caps.
 * All-or-nothing: neither bucket is updated unless both allow the reservation.
 */
export function tryConsumeNoteCreates(
  userId: string | null,
  ip: string | undefined,
  delta: number
): { allowed: true; remainingMinute: number; remainingHour: number; resetMinute: number; resetHour: number } | { allowed: false; error: string; retryAfterSec: number } {
  if (delta <= 0) {
    const now = Date.now();
    return {
      allowed: true,
      remainingMinute: RATE_LIMITS.NOTE_CREATE_PER_MINUTE.maxRequests,
      remainingHour: RATE_LIMITS.NOTE_CREATE_PER_HOUR.maxRequests,
      resetMinute: now + RATE_LIMITS.NOTE_CREATE_PER_MINUTE.windowMs,
      resetHour: now + RATE_LIMITS.NOTE_CREATE_PER_HOUR.windowMs
    };
  }

  const now = Date.now();
  const kMin = getRateLimitKey(userId, NOTE_CREATE_MINUTE_KEY, ip);
  const kHr = getRateLimitKey(userId, NOTE_CREATE_HOUR_KEY, ip);

  const recMin = getRecord(kMin, now, RATE_LIMITS.NOTE_CREATE_PER_MINUTE.windowMs);
  const recHr = getRecord(kHr, now, RATE_LIMITS.NOTE_CREATE_PER_HOUR.windowMs);

  const nextMin = recMin.count + delta;
  const nextHr = recHr.count + delta;

  if (nextMin > RATE_LIMITS.NOTE_CREATE_PER_MINUTE.maxRequests) {
    return {
      allowed: false,
      error: `Too many notes created too quickly. Maximum ${RATE_LIMITS.NOTE_CREATE_PER_MINUTE.maxRequests} new notes per minute.`,
      retryAfterSec: Math.max(1, Math.ceil((recMin.resetTime - now) / 1000))
    };
  }
  if (nextHr > RATE_LIMITS.NOTE_CREATE_PER_HOUR.maxRequests) {
    return {
      allowed: false,
      error: `Note creation hourly limit reached (${RATE_LIMITS.NOTE_CREATE_PER_HOUR.maxRequests} per hour). Try again later.`,
      retryAfterSec: Math.max(1, Math.ceil((recHr.resetTime - now) / 1000))
    };
  }

  recMin.count = nextMin;
  recHr.count = nextHr;
  rateLimitStore.set(kMin, recMin);
  rateLimitStore.set(kHr, recHr);

  return {
    allowed: true,
    remainingMinute: RATE_LIMITS.NOTE_CREATE_PER_MINUTE.maxRequests - recMin.count,
    remainingHour: RATE_LIMITS.NOTE_CREATE_PER_HOUR.maxRequests - recHr.count,
    resetMinute: recMin.resetTime,
    resetHour: recHr.resetTime
  };
}

/**
 * Middleware function for rate limiting API endpoints
 */
export function rateLimitMiddleware(
  userId: string | null,
  endpoint: string,
  type: 'read' | 'write',
  ip?: string
): { allowed: boolean; error?: string; remaining?: number; resetTime?: number } {
  const isInviteEndpoint = endpoint.includes('members/invite');
  const config = isInviteEndpoint
    ? RATE_LIMITS.INVITE
    : type === 'read'
      ? RATE_LIMITS.READ
      : RATE_LIMITS.WRITE;
  const result = checkRateLimit(userId, endpoint, config, ip);

  if (!result.allowed) {
    const message = isInviteEndpoint
      ? `Rate limit exceeded. Maximum ${config.maxRequests} invites per minute.`
      : `Rate limit exceeded. Maximum ${config.maxRequests} requests per minute.`;
    return {
      allowed: false,
      error: message,
      remaining: result.remaining,
      resetTime: result.resetTime
    };
  }

  return {
    allowed: true,
    remaining: result.remaining,
    resetTime: result.resetTime
  };
}

/**
 * Hono middleware factory for rate limiting.
 * Use as route-level middleware:
 *
 *   route.post('/api/notes/create', requireAuth, rateLimit('write'), async (c) => { ... });
 *
 * Automatically extracts userId from auth context and IP from request headers.
 */
export function rateLimit(type: 'read' | 'write'): (c: any, next: any) => Promise<any> {
  return async (c, next) => {
    const auth = c.get('auth') as { userId: string | null };
    const ip = getClientIP(c.req.raw);
    const endpoint = c.req.path;
    const result = rateLimitMiddleware(auth?.userId ?? null, endpoint, type, ip);
    if (!result.allowed) {
      return c.json({ error: result.error || 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' }, 429);
    }
    return next();
  };
}

/** Hono middleware: per-user note-creation caps (minute + hour), shared with sync push. */
export function rateLimitNoteCreate(): (c: any, next: any) => Promise<any> {
  return async (c, next) => {
    const auth = c.get('auth') as { userId: string | null };
    const ip = getClientIP(c.req.raw);
    const reserved = tryConsumeNoteCreates(auth?.userId ?? null, ip, 1);
    if (!reserved.allowed) {
      return c.json(
        { error: reserved.error, code: 'NOTE_CREATE_RATE_LIMIT_EXCEEDED' },
        429,
        { 'Retry-After': String(reserved.retryAfterSec) }
      );
    }
    return next();
  };
}

/**
 * Get client IP from request
 */
export function getClientIP(request: Request): string | undefined {
  // Try to get IP from headers (Netlify provides this)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  return undefined;
}

