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
//
// Process-local: on a multi-instance Fly deploy each machine keeps its own counters, so the
// effective per-user limit is (instances x maxRequests) and which one a request lands on
// decides whose budget it spends. Fine as an abuse ceiling, not exact. Every limit below is
// sized as a *floor* on what a legitimate client may do, never as a precise quota.
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
   * Note autosave (PUT /api/notes/update). Separate from generic WRITE because the editor
   * is the one caller that writes on a *timer* rather than on an explicit user action, and
   * the generic budget left it no room at all:
   *
   *   MIN_SAVE_INTERVAL_MS (3s, see src/utils/autosave-retry.ts) = 20 saves/minute
   *   RATE_LIMITS.WRITE                                          = 20 requests/minute
   *
   * Sustained typing therefore sat exactly on the cap, and any *other* write in the same
   * minute — a second note, an unmount flush, the keepalive PUT iOS fires on every app
   * switch — pushed it over and toasted "Too many changes at once". The bucket is keyed
   * per user per path, so all of a user's notes share this one budget.
   *
   * 60/min against a client floor of 5s (12 saves/min) leaves 5x headroom for the flushes
   * and second surfaces, while still bounding a scripted caller to one write per second.
   */
  NOTE_SAVE: {
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
  },
  /**
   * Note creation inside an import run. Separate from the interactive bucket for two
   * reasons: importing 200 notes at 30/min would take seven minutes of waiting, and
   * charging the interactive bucket would starve the user's own note-taking for the
   * rest of the hour. Abuse stays bounded by the per-session file/item caps.
   */
  IMPORT_NOTE_CREATE_PER_MINUTE: {
    maxRequests: 120,
    windowMs: 60 * 1000
  },
  IMPORT_NOTE_CREATE_PER_HOUR: {
    maxRequests: 1500,
    windowMs: 60 * 60 * 1000
  }
} as const;

/** Max note `create` operations accepted in a single sync push (batch bypass guard). */
export const MAX_NOTE_CREATES_PER_SYNC_PUSH = 50;

const NOTE_CREATE_MINUTE_KEY = 'note-create:window:1m';
const NOTE_CREATE_HOUR_KEY = 'note-create:window:1h';
const IMPORT_NOTE_CREATE_MINUTE_KEY = 'import-note-create:window:1m';
const IMPORT_NOTE_CREATE_HOUR_KEY = 'import-note-create:window:1h';

function getRecord(key: string, now: number, windowMs: number): RequestRecord {
  let record = rateLimitStore.get(key);
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + windowMs };
    rateLimitStore.set(key, record);
  }
  return record;
}

export type NoteCreateReservation =
  | { allowed: true; remainingMinute: number; remainingHour: number; resetMinute: number; resetHour: number }
  | { allowed: false; error: string; retryAfterSec: number };

interface NoteCreateBudget {
  minuteKey: string;
  hourKey: string;
  minute: RateLimitConfig;
  hour: RateLimitConfig;
  minuteError: string;
  hourError: string;
}

/**
 * Atomically reserves `delta` slots against a paired per-minute + per-hour budget.
 * All-or-nothing: neither bucket is updated unless both allow the reservation.
 */
function tryConsumeBudget(
  userId: string | null,
  ip: string | undefined,
  delta: number,
  budget: NoteCreateBudget
): NoteCreateReservation {
  const now = Date.now();
  if (delta <= 0) {
    return {
      allowed: true,
      remainingMinute: budget.minute.maxRequests,
      remainingHour: budget.hour.maxRequests,
      resetMinute: now + budget.minute.windowMs,
      resetHour: now + budget.hour.windowMs
    };
  }

  const kMin = getRateLimitKey(userId, budget.minuteKey, ip);
  const kHr = getRateLimitKey(userId, budget.hourKey, ip);

  const recMin = getRecord(kMin, now, budget.minute.windowMs);
  const recHr = getRecord(kHr, now, budget.hour.windowMs);

  const nextMin = recMin.count + delta;
  const nextHr = recHr.count + delta;

  if (nextMin > budget.minute.maxRequests) {
    return {
      allowed: false,
      error: budget.minuteError,
      retryAfterSec: Math.max(1, Math.ceil((recMin.resetTime - now) / 1000))
    };
  }
  if (nextHr > budget.hour.maxRequests) {
    return {
      allowed: false,
      error: budget.hourError,
      retryAfterSec: Math.max(1, Math.ceil((recHr.resetTime - now) / 1000))
    };
  }

  recMin.count = nextMin;
  recHr.count = nextHr;
  rateLimitStore.set(kMin, recMin);
  rateLimitStore.set(kHr, recHr);

  return {
    allowed: true,
    remainingMinute: budget.minute.maxRequests - recMin.count,
    remainingHour: budget.hour.maxRequests - recHr.count,
    resetMinute: recMin.resetTime,
    resetHour: recHr.resetTime
  };
}

/** Interactive note creation (POST /api/notes/create + note creates inside /api/sync/push). */
export function tryConsumeNoteCreates(
  userId: string | null,
  ip: string | undefined,
  delta: number
): NoteCreateReservation {
  return tryConsumeBudget(userId, ip, delta, {
    minuteKey: NOTE_CREATE_MINUTE_KEY,
    hourKey: NOTE_CREATE_HOUR_KEY,
    minute: RATE_LIMITS.NOTE_CREATE_PER_MINUTE,
    hour: RATE_LIMITS.NOTE_CREATE_PER_HOUR,
    minuteError: `Too many notes created too quickly. Maximum ${RATE_LIMITS.NOTE_CREATE_PER_MINUTE.maxRequests} new notes per minute.`,
    hourError: `Note creation hourly limit reached (${RATE_LIMITS.NOTE_CREATE_PER_HOUR.maxRequests} per hour). Try again later.`
  });
}

/** Note creation inside an import run — its own budget, so imports and typing don't compete. */
export function tryConsumeImportNoteCreates(
  userId: string | null,
  ip: string | undefined,
  delta: number
): NoteCreateReservation {
  return tryConsumeBudget(userId, ip, delta, {
    minuteKey: IMPORT_NOTE_CREATE_MINUTE_KEY,
    hourKey: IMPORT_NOTE_CREATE_HOUR_KEY,
    minute: RATE_LIMITS.IMPORT_NOTE_CREATE_PER_MINUTE,
    hour: RATE_LIMITS.IMPORT_NOTE_CREATE_PER_HOUR,
    minuteError: `Importing faster than we can keep up. Maximum ${RATE_LIMITS.IMPORT_NOTE_CREATE_PER_MINUTE.maxRequests} imported notes per minute.`,
    hourError: `Import hourly limit reached (${RATE_LIMITS.IMPORT_NOTE_CREATE_PER_HOUR.maxRequests} notes per hour). Try again later.`
  });
}

/**
 * Which budget a route draws from. `'note-save'` is `'write'` with its own, larger bucket —
 * see RATE_LIMITS.NOTE_SAVE for why the editor's timer-driven writes cannot share WRITE.
 */
export type RateLimitType = 'read' | 'write' | 'note-save';

/**
 * Middleware function for rate limiting API endpoints
 */
export function rateLimitMiddleware(
  userId: string | null,
  endpoint: string,
  type: RateLimitType,
  ip?: string
): { allowed: boolean; error?: string; remaining?: number; resetTime?: number } {
  const isInviteEndpoint = endpoint.includes('members/invite');
  const config = isInviteEndpoint
    ? RATE_LIMITS.INVITE
    : type === 'read'
      ? RATE_LIMITS.READ
      : type === 'note-save'
        ? RATE_LIMITS.NOTE_SAVE
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

/** Whole seconds until `resetTime`, floored at 1 so `Retry-After: 0` never invites an instant retry. */
export function retryAfterSecondsFrom(resetTime: number | undefined, now: number = Date.now()): number {
  if (typeof resetTime !== 'number' || !Number.isFinite(resetTime)) return 1;
  return Math.max(1, Math.ceil((resetTime - now) / 1000));
}

/**
 * Hono middleware factory for rate limiting.
 * Use as route-level middleware:
 *
 *   route.post('/api/notes/create', requireAuth, rateLimit('write'), async (c) => { ... });
 *
 * Automatically extracts userId from auth context and IP from request headers.
 */
export function rateLimit(type: RateLimitType): (c: any, next: any) => Promise<any> {
  return async (c, next) => {
    const auth = c.get('auth') as { userId: string | null };
    const ip = getClientIP(c.req.raw);
    const endpoint = c.req.path;
    const result = rateLimitMiddleware(auth?.userId ?? null, endpoint, type, ip);
    if (!result.allowed) {
      // Tell the client when it may try again, so it can back off to the window
      // edge instead of guessing (or hammering). Matches rateLimitNoteCreate below.
      return c.json(
        { error: result.error || 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' },
        429,
        { 'Retry-After': String(retryAfterSecondsFrom(result.resetTime)) },
      );
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

