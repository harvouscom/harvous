/**
 * Logger Utility
 * 
 * Provides environment-aware logging that respects development vs production.
 * In development: logs to console
 * In production: only logs errors and warnings, suppresses debug/info logs
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

/**
 * Check if we're in development mode
 */
function isDevelopment(): boolean {
  try {
    // Check if import.meta is available (works in both client and server contexts)
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env.DEV || import.meta.env.MODE === 'development';
    }
  } catch {
    // If import.meta is not available, fall back to checking window
  }
  
  // Fallback: check window location (client-side only)
  if (typeof window !== 'undefined' && window.location) {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  }
  
  // Default to production mode if we can't determine
  return false;
}

/**
 * Core logging function
 */
function log(level: LogLevel, message: string, context?: LogContext): void {
  try {
    // Always log errors and warnings
    if (level === 'error' || level === 'warn') {
      if (typeof console !== 'undefined' && console[level]) {
        console[level](message, context || '');
      }
      return;
    }

    // Only log debug/info in development
    if (isDevelopment() && typeof console !== 'undefined' && console[level]) {
      console[level](message, context || '');
    }
    // In production, debug/info logs are silent
  } catch {
    // Silently fail if logging is not available (should never happen, but be safe)
  }
}

/**
 * Debug logging - only in development
 */
export function debug(message: string, context?: LogContext): void {
  log('debug', message, context);
}

/**
 * Info logging - only in development
 */
export function info(message: string, context?: LogContext): void {
  log('info', message, context);
}

/**
 * Warning logging - always logged
 */
export function warn(message: string, context?: LogContext): void {
  log('warn', message, context);
}

/**
 * Error logging - always logged
 */
export function error(message: string, context?: LogContext): void {
  log('error', message, context);
}

/**
 * Legacy console.log replacement
 * Use this to replace console.log statements
 * In production, these will be silent unless they're actual errors
 */
export function logMessage(message: string, ...args: unknown[]): void {
  if (isDevelopment()) {
    console.log(message, ...args);
  }
  // Silent in production
}

