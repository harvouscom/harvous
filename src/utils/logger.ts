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
  return import.meta.env.DEV || import.meta.env.MODE === 'development';
}

/**
 * Core logging function
 */
function log(level: LogLevel, message: string, context?: LogContext): void {
  // Always log errors and warnings
  if (level === 'error' || level === 'warn') {
    console[level](message, context || '');
    return;
  }

  // Only log debug/info in development
  if (isDevelopment()) {
    console[level](message, context || '');
  }
  // In production, debug/info logs are silent
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

