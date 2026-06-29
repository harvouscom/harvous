import type { DiagnosticPlatform, DiagnosticSeverity, DiagnosticSource } from '@/utils/diagnostic-sources';
import { redactDiagnosticRoute } from '@/utils/diagnostics-route';

const SESSION_STORAGE_KEY = 'harvous_diag_session';
const SESSION_ROTATE_MS = 7 * 24 * 60 * 60 * 1000;

const API_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL)
    : '';

export type DiagnosticReportPayload = {
  source: DiagnosticSource;
  severity?: DiagnosticSeverity;
  message: string;
  stack?: string | null;
  route?: string | null;
  platform?: DiagnosticPlatform;
  appVersion?: string | null;
  manualNote?: string | null;
  metadata?: Record<string, unknown> | null;
};

type StoredSession = {
  id: string;
  createdAt: number;
};

let lastCapturedError: {
  message: string;
  stack: string | null;
  route: string | null;
  capturedAt: number;
} | null = null;

let captureInitialized = false;

function shouldIgnoreError(error: Error | string): boolean {
  if (typeof error === 'string') {
    const lower = error.toLowerCase();
    return (
      lower.includes('aborterror') ||
      lower.includes('signal is aborted') ||
      lower.includes('user aborted a request')
    );
  }
  if (error.name === 'AbortError' || error.name === 'DOMException') {
    const message = error.message?.toLowerCase() ?? '';
    return (
      message.includes('aborterror') ||
      message.includes('signal is aborted') ||
      message.includes('user aborted a request')
    );
  }
  const message = error.message?.toLowerCase() ?? '';
  return (
    message.includes('aborterror') ||
    message.includes('signal is aborted') ||
    message.includes('user aborted a request')
  );
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `diag_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function getAnonymousSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredSession;
      if (parsed.id && parsed.createdAt && Date.now() - parsed.createdAt < SESSION_ROTATE_MS) {
        return parsed.id;
      }
    }
    const next: StoredSession = { id: randomId(), createdAt: Date.now() };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
    return next.id;
  } catch {
    return randomId();
  }
}

function detectPlatform(): DiagnosticPlatform {
  if (typeof window === 'undefined') return 'unknown';
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) return 'ios';
  return 'web';
}

function appVersion(): string | null {
  if (typeof window === 'undefined') return null;
  const v = (window as unknown as { __APP_VERSION__?: string }).__APP_VERSION__;
  return v ? String(v) : null;
}

function currentRoute(): string {
  if (typeof window === 'undefined') return '/';
  return redactDiagnosticRoute(window.location.pathname);
}

function userAgentFamily(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios-safari';
  if (/Android/i.test(ua)) return 'android';
  if (/Chrome/i.test(ua)) return 'chrome';
  if (/Safari/i.test(ua)) return 'safari';
  if (/Firefox/i.test(ua)) return 'firefox';
  return 'other';
}

function rememberError(message: string, stack: string | null) {
  lastCapturedError = {
    message,
    stack,
    route: currentRoute(),
    capturedAt: Date.now(),
  };
}

export function getLastCapturedDiagnosticError(): typeof lastCapturedError {
  if (!lastCapturedError) return null;
  if (Date.now() - lastCapturedError.capturedAt > 30 * 60 * 1000) {
    lastCapturedError = null;
    return null;
  }
  return lastCapturedError;
}

export function reportDiagnosticEvent(payload: DiagnosticReportPayload): void {
  if (typeof window === 'undefined') return;

  const body = {
    source: payload.source,
    severity: payload.severity ?? 'error',
    message: payload.message,
    stack: payload.stack ?? null,
    route: payload.route ?? currentRoute(),
    platform: payload.platform ?? detectPlatform(),
    appVersion: payload.appVersion ?? appVersion(),
    anonymousSessionId: getAnonymousSessionId(),
    manualNote: payload.manualNote ?? null,
    metadata: {
      ...(payload.metadata ?? {}),
      userAgentFamily: userAgentFamily(),
    },
  };

  void fetch(`${API_BASE}/api/diagnostics/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {
    // Swallow — diagnostics must never disrupt the app
  });
}

export function reportClientError(error: Error | string, source: DiagnosticSource = 'client_js'): void {
  if (shouldIgnoreError(error)) return;
  const message = typeof error === 'string' ? error : error.message || 'Unknown error';
  const stack = typeof error === 'string' ? null : error.stack ?? null;
  rememberError(message, stack);
  reportDiagnosticEvent({ source, message, stack });
}

export function reportApiDiagnostic(path: string, status: number, message: string): void {
  if (status === 401 || status === 403) return;
  if (status < 500) return;
  rememberError(message, null);
  reportDiagnosticEvent({
    source: 'client_api',
    message,
    metadata: { statusCode: status, apiPath: path },
  });
}

export function reportManualDiagnostic(manualNote: string): void {
  const last = getLastCapturedDiagnosticError();
  const message = last?.message ?? (manualNote.slice(0, 200) || 'User report');
  reportDiagnosticEvent({
    source: 'client_manual',
    message,
    stack: last?.stack ?? null,
    route: last?.route ?? currentRoute(),
    manualNote,
  });
}

const ROUTE_BOUNDARY_DEDUPE_MS = 30_000;

/** Report React route-boundary errors (not caught by window.onerror). Dedupes recent identical messages. */
export function reportRouteBoundaryError(error: unknown): void {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Route error');
  if (shouldIgnoreError(err)) return;

  const message = err.message || 'Route error';
  const stack = err.stack ?? null;
  const recent = getLastCapturedDiagnosticError();
  if (recent && recent.message === message && Date.now() - recent.capturedAt < ROUTE_BOUNDARY_DEDUPE_MS) {
    return;
  }

  rememberError(message, stack);
  reportDiagnosticEvent({
    source: 'client_js',
    message,
    stack,
    metadata: { routeErrorBoundary: true },
  });

  void import('@/utils/posthog')
    .then(({ captureException }) => {
      captureException(err, { route_error_boundary: true });
    })
    .catch(() => {
      /* ignore */
    });
}

export function initDiagnosticCapture(): void {
  if (typeof window === 'undefined' || captureInitialized) return;
  captureInitialized = true;

  window.addEventListener('error', (event) => {
    const err = event.error instanceof Error ? event.error : new Error(event.message || 'Script error');
    reportClientError(err, 'client_js');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason instanceof Error) {
      reportClientError(reason, 'client_js');
      return;
    }
    if (typeof reason === 'string') {
      reportClientError(reason, 'client_js');
      return;
    }
    reportClientError(new Error('Unhandled promise rejection'), 'client_js');
  });
}
