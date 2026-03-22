/**
 * Server-Side Structured Logger
 *
 * Outputs JSON-formatted log lines for structured log parsing in Netlify
 * function logs (and any log aggregation tools).
 *
 * Features:
 * - JSON format: each log line is a parseable JSON object
 * - Request ID correlation: pass requestId to group logs from the same request
 * - Log level gating via LOG_LEVEL env var (default: "info" in prod, "debug" in dev)
 * - Backwards compatible: can be used alongside existing console.log calls
 *
 * Usage:
 *   import { serverLog } from '../utils/logger';
 *   serverLog.info('Note created', { noteId: '123', userId: 'user_abc' });
 *   serverLog.error('Failed to process', { error: err.message, noteId: '123' });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

interface LogContext {
  requestId?: string;
  userId?: string;
  route?: string;
  [key: string]: unknown;
}

function getMinLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVEL_PRIORITY) {
    return envLevel as LogLevel;
  }
  // Default: info in production, debug in development
  return process.env.NODE_ENV === 'development' ? 'debug' : 'info';
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[getMinLevel()];
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  // Use the appropriate console method for log aggregation tools
  // that distinguish by stream (stdout vs stderr)
  switch (level) {
    case 'error':
      console.error(JSON.stringify(entry));
      break;
    case 'warn':
      console.warn(JSON.stringify(entry));
      break;
    default:
      console.log(JSON.stringify(entry));
  }
}

export const serverLog = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),
};

/**
 * Create a child logger with pre-filled context (e.g., requestId, userId).
 * Useful in route handlers where you want every log to include the request ID.
 *
 * Usage:
 *   const log = createRequestLogger({ requestId: crypto.randomUUID(), userId });
 *   log.info('Processing note');
 *   log.error('Failed', { error: err.message });
 */
export function createRequestLogger(baseContext: LogContext) {
  return {
    debug: (message: string, context?: LogContext) =>
      serverLog.debug(message, { ...baseContext, ...context }),
    info: (message: string, context?: LogContext) =>
      serverLog.info(message, { ...baseContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      serverLog.warn(message, { ...baseContext, ...context }),
    error: (message: string, context?: LogContext) =>
      serverLog.error(message, { ...baseContext, ...context }),
  };
}
