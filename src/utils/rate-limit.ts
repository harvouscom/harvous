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
  // Space invite: higher limit so owners can onboard larger spaces (e.g. 100 members)
  INVITE: {
    maxRequests: 60,
    windowMs: 60 * 1000 // 1 minute
  }
} as const;

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

