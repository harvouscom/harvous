import type {
  DiagnosticPlatform,
  DiagnosticSeverity,
  DiagnosticSource,
  DiagnosticSourceEnv,
} from '@/utils/diagnostic-sources';
import {
  isChunkLoadFailureMessage,
  isExtensionOriginated,
  isNoiseDiagnosticMessage,
  redactDiagnosticRoute,
  scrubDiagnosticText,
} from '@/utils/diagnostics-route';

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
  sourceEnv?: DiagnosticSourceEnv;
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

function isBenignErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('aborterror') ||
    lower.includes('signal is aborted') ||
    lower.includes('user aborted a request') ||
    lower.includes('resizeobserver loop')
  );
}

function isBareCrossOriginScriptError(message: string, eventError: unknown, filename?: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (normalized !== 'script error.' && normalized !== 'script error') return false;
  if (eventError instanceof Error && eventError.stack) return false;
  if (filename && filename.length > 0) return false;
  return true;
}

function isClerkLoadFailure(message: string): boolean {
  return message.includes('failed_to_load_clerk_js') || message.includes('Failed to load Clerk');
}

/**
 * Clerk lazily loads its own UI chunks from its CDN. The service worker skips cross-origin
 * requests entirely (public/sw.js), so these failures are Clerk-side or network-side and
 * there is nothing in this codebase to fix — they were pure noise in the issue list.
 * Our own chunk failures (app.harvous.com/assets/*) are still reported.
 */
function isThirdPartyChunkFailure(message: string): boolean {
  if (!/Loading chunk\s|dynamically imported module/i.test(message)) return false;
  return /https?:\/\/[^\s)]*clerk\.[^\s)]*/i.test(message);
}

function buildClientErrorMetadata(message: string): Record<string, unknown> | null {
  if (!isClerkLoadFailure(message)) return null;
  return {
    clerkLoadFailure: true,
    navigatorOnLine: typeof navigator !== 'undefined' ? navigator.onLine : null,
  };
}

/**
 * Where the `vite:preloadError` handler in spa/src/main.tsx has got to.
 *
 * Vite dispatches that event synchronously and only then rethrows, so by the time the same
 * failure reaches the `unhandledrejection` listener or a route boundary, this already says
 * whether a reload is on its way. A chunk failure during `reloading` is being recovered, not a
 * bug — each one used to land in the admin list as well as reloading the page. One during
 * `exhausted` means the reload did not fix it, which is worth an issue.
 */
let chunkRecovery: 'idle' | 'reloading' | 'exhausted' = 'idle';

export function markChunkReloadInFlight(): void {
  chunkRecovery = 'reloading';
}

export function markChunkReloadExhausted(): void {
  chunkRecovery = 'exhausted';
}

function chunkRecoveryMetadata(message: string): Record<string, unknown> | null {
  if (chunkRecovery !== 'exhausted' || !isChunkLoadFailureMessage(message)) return null;
  return { chunkLoadAfterReload: true };
}

function shouldIgnoreError(error: Error | string): boolean {
  const message = typeof error === 'string' ? error : error.message ?? '';
  if (isNoiseDiagnosticMessage(message)) return true;
  if (chunkRecovery === 'reloading' && isChunkLoadFailureMessage(message)) return true;
  if (isThirdPartyChunkFailure(message)) return true;
  return isBenignErrorMessage(message);
}

/**
 * Collapse repeats of the same failure into one event.
 *
 * React Query retries queries up to 3 attempts (spa/src/App.tsx), and every attempt runs
 * through the same reporting path — so one failed load used to store three events and the
 * admin counts read ~3x high. The window comfortably covers the retry backoff while still
 * recording a genuinely recurring failure later in the session.
 */
const REPEAT_DEDUPE_MS = 15_000;
const recentReports = new Map<string, number>();

function isDuplicateReport(key: string): boolean {
  const now = Date.now();
  for (const [k, at] of recentReports) {
    if (now - at > REPEAT_DEDUPE_MS) recentReports.delete(k);
  }
  const last = recentReports.get(key);
  if (last != null && now - last < REPEAT_DEDUPE_MS) return true;
  recentReports.set(key, now);
  return false;
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

function detectSourceEnv(): DiagnosticSourceEnv {
  return import.meta.env?.DEV ? 'dev' : 'prod';
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

/**
 * Engine and major version, e.g. `chrome 89`. `userAgentFamily` lumps every Chromium together,
 * and the one thing it cannot answer is whether a crash came from an engine too old to run
 * the bundle properly — "Cannot read property 'includes' of undefined" is pre-Chrome-91
 * wording, and nothing else in the stored event said so.
 */
const BROWSER_VERSION_PATTERNS: Array<[string, RegExp]> = [
  ['edge', /\bEdg(?:e|A|iOS)?\/(\d+)/],
  ['samsung', /\bSamsungBrowser\/(\d+)/],
  ['firefox', /\b(?:Firefox|FxiOS)\/(\d+)/],
  ['chrome', /\b(?:Chrome|CriOS)\/(\d+)/],
  ['safari', /\bVersion\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari\//],
];

export function browserMajorFromUserAgent(ua: string): string | null {
  for (const [name, re] of BROWSER_VERSION_PATTERNS) {
    const match = re.exec(ua);
    if (!match) continue;
    // Android WebView reports Chrome/NN plus `; wv)` — an in-app browser, not Chrome.
    const label = name === 'chrome' && /; wv\)/.test(ua) ? 'webview' : name;
    return `${label} ${match[1]}`;
  }
  return null;
}

function browserMajor(): string | null {
  if (typeof navigator === 'undefined') return null;
  return browserMajorFromUserAgent(navigator.userAgent);
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

type DiagnosticEventBody = Record<string, unknown> & {
  source: DiagnosticSource;
  message: string;
  metadata: Record<string, unknown>;
};

/**
 * Events that could not be sent, kept until there is a connection to send them on.
 *
 * A save failure is most likely exactly when the network is not there, and a report posted
 * into no network was simply lost — which is how no save failure ever reached the admin
 * Maintenance log. Held in localStorage so a reload or a closed tab does not lose them either.
 *
 * Capped and deduped: offline, the same failure repeats on every retry, and a queue that grew
 * with each one would be a storage leak with a flood of identical rows behind it. A repeat
 * bumps the held event's count instead of adding another.
 */
const PENDING_STORAGE_KEY = 'harvous_diag_pending';
const PENDING_MAX = 20;
/** Older than this, a held event says more about a device left in a drawer than about a bug. */
const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type PendingDiagnostic = { key: string; queuedAt: number; body: DiagnosticEventBody };

function readPending(): PendingDiagnostic[] {
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingDiagnostic[]) : [];
  } catch {
    return [];
  }
}

function writePending(items: PendingDiagnostic[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(PENDING_STORAGE_KEY);
    else localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked — the event is lost, which is what happened before this existed.
  }
}

function holdForLater(body: DiagnosticEventBody): void {
  const key = `${body.source}|${body.message}`;
  const items = readPending();
  const existing = items.find((item) => item.key === key);
  if (existing) {
    const count = Number(existing.body.metadata.repeatCount ?? 1);
    existing.body.metadata.repeatCount = count + 1;
  } else {
    items.push({ key, queuedAt: Date.now(), body });
  }
  writePending(items.slice(-PENDING_MAX));
}

function isOfflineNow(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function sendDiagnosticBody(body: DiagnosticEventBody): void {
  if (isOfflineNow()) {
    holdForLater(body);
    return;
  }
  try {
    void fetch(`${API_BASE}/api/diagnostics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((res) => {
        // The service worker answers an unreachable API with a synthetic 503 rather than
        // rejecting, so that is a "no network" too.
        if (res.status === 503) holdForLater(body);
      })
      .catch(() => holdForLater(body));
  } catch {
    // Swallow — diagnostics must never disrupt the app
  }
}

let flushingPending = false;

/** Send whatever was held while offline. Runs at boot and on every reconnect. */
export function flushPendingDiagnostics(): void {
  if (typeof window === 'undefined' || flushingPending || isOfflineNow()) return;
  const items = readPending();
  if (items.length === 0) return;
  flushingPending = true;
  // Cleared before sending: anything that fails again is re-held by the send itself.
  writePending([]);
  const now = Date.now();
  for (const item of items) {
    if (now - item.queuedAt > PENDING_MAX_AGE_MS) continue;
    sendDiagnosticBody({
      ...item.body,
      metadata: { ...item.body.metadata, heldOffline: true, heldMs: now - item.queuedAt },
    });
  }
  flushingPending = false;
}

export function reportDiagnosticEvent(payload: DiagnosticReportPayload): void {
  if (typeof window === 'undefined') return;

  const body: DiagnosticEventBody = {
    source: payload.source,
    severity: payload.severity ?? 'error',
    message: payload.message,
    stack: payload.stack ?? null,
    route: payload.route ?? currentRoute(),
    platform: payload.platform ?? detectPlatform(),
    appVersion: payload.appVersion ?? appVersion(),
    anonymousSessionId: getAnonymousSessionId(),
    manualNote: payload.manualNote ?? null,
    sourceEnv: payload.sourceEnv ?? detectSourceEnv(),
    metadata: {
      ...(payload.metadata ?? {}),
      userAgentFamily: userAgentFamily(),
      browserMajor: browserMajor(),
    },
  };

  sendDiagnosticBody(body);
}

/**
 * Work someone wrote that did not get saved — the failures the admin log exists for.
 *
 * Kept apart from `reportApiDiagnostic`, which deliberately drops 4xx: for a save, a 404 or a
 * 409 is not noise, it is the note that did not land. Deduped over a longer window than the
 * generic repeat guard because saves retry on a backoff measured in minutes, and each retry
 * of the same failure is not a new finding. The first report says it happened; the metadata
 * says how far it got.
 */
const SAVE_FAILURE_DEDUPE_MS = 5 * 60 * 1000;
const recentSaveFailures = new Map<string, number>();

export type SaveFailureKind = 'autosave' | 'sync_exhausted' | 'sync_error' | 'offline_store';

export function reportSaveFailure(
  kind: SaveFailureKind,
  message: string,
  metadata: Record<string, unknown> = {},
  dedupeKey: string = message,
): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  for (const [k, at] of recentSaveFailures) {
    if (now - at > SAVE_FAILURE_DEDUPE_MS) recentSaveFailures.delete(k);
  }
  const key = `${kind}|${dedupeKey}`;
  if (recentSaveFailures.has(key)) return;
  recentSaveFailures.set(key, now);
  rememberError(message, null);
  reportDiagnosticEvent({
    source: kind === 'autosave' ? 'client_api' : 'client_js',
    message,
    metadata: {
      saveFailure: kind,
      navigatorOnLine: typeof navigator !== 'undefined' ? navigator.onLine : null,
      ...metadata,
    },
  });
}

export function reportClientError(
  error: Error | string,
  source: DiagnosticSource = 'client_js',
  metadata?: Record<string, unknown> | null,
): void {
  if (shouldIgnoreError(error)) return;
  const message = typeof error === 'string' ? error : error.message || 'Unknown error';
  const stack = typeof error === 'string' ? null : error.stack ?? null;
  /*
   * Extension code throwing inside our document. Returning before `rememberError` matters:
   * otherwise Settings -> Support would offer someone else's wallet extension as the last
   * thing that went wrong in Harvous.
   */
  const scriptFilename = typeof metadata?.scriptFilename === 'string' ? metadata.scriptFilename : null;
  if (isExtensionOriginated(scriptFilename, stack)) return;
  // A failed dynamic import can surface as both an unhandledrejection and a window error.
  if (isDuplicateReport(`client|${source}|${message}`)) return;
  rememberError(message, stack);
  reportDiagnosticEvent({
    source,
    message,
    stack,
    metadata: {
      ...(buildClientErrorMetadata(message) ?? {}),
      ...(chunkRecoveryMetadata(message) ?? {}),
      ...(metadata ?? {}),
    },
  });
}

export function reportApiDiagnostic(path: string, status: number, message: string): void {
  if (status === 401 || status === 403) return;
  if (status < 500) return;
  // Service worker offline fallback (public/sw.js) returns synthetic 503 with this exact message.
  if (status === 503 && message === 'Network error') return;
  const pathOnly = path.split('?')[0] ?? path;
  const labeled = `${message} (${redactDiagnosticRoute(pathOnly)})`;
  if (isNoiseDiagnosticMessage(labeled) || isNoiseDiagnosticMessage(message)) return;
  // One event per logical failure — not one per React Query retry attempt.
  if (isDuplicateReport(`api|${path}|${status}|${message}`)) return;
  rememberError(labeled, null);
  reportDiagnosticEvent({
    source: 'client_api',
    message: labeled,
    metadata: { statusCode: status, apiPath: pathOnly },
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
export function reportRouteBoundaryError(
  error: unknown,
  metadata?: Record<string, unknown> | null,
): void {
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
    metadata: { routeErrorBoundary: true, ...(chunkRecoveryMetadata(message) ?? {}), ...(metadata ?? {}) },
  });

  void import('@/utils/posthog')
    .then(({ captureException }) => {
      captureException(err, { route_error_boundary: true });
    })
    .catch(() => {
      /* ignore */
    });
}

const REJECTION_PREFIX = 'Unhandled promise rejection';

export type RejectionDescription = {
  message: string;
  stack: string | null;
  kind: 'error' | 'string' | 'null' | 'undefined' | 'event' | 'response' | 'object' | 'primitive';
  /** Where an `Event` reason's target was loading from, for the admin panel's script line. */
  targetSrc?: string | null;
};

function shortLabel(value: unknown): string {
  return scrubDiagnosticText(String(value)).slice(0, 40);
}

function pathOf(url: string): string {
  try {
    const base = typeof window !== 'undefined' ? window.location.href : 'https://app.harvous.com/';
    const parsed = new URL(url, base);
    const sameOrigin = typeof window !== 'undefined' && parsed.origin === window.location.origin;
    const path = redactDiagnosticRoute(parsed.pathname);
    return sameOrigin ? path : `${parsed.origin}${path}`;
  } catch {
    return '';
  }
}

/**
 * Turn whatever a promise was rejected with into something the admin list can tell apart.
 *
 * The listener used to report every non-Error, non-string reason as the same bare
 * "Unhandled promise rejection", with a stack that was its own `new Error()` — one frame,
 * pointing at this file. That row could never be attributed. The reason itself almost always
 * says what it was: an `Event` from an element that failed to load, a `Response` someone
 * threw, a null from an aborted IndexedDB transaction, a plain `{ code, message }` object.
 *
 * Error-likes are recognised by shape, not `instanceof Error`: an error from another realm
 * (an iframe — Clerk runs some) fails `instanceof` while being an ordinary error.
 */
export function describeRejectionReason(reason: unknown): RejectionDescription {
  if (typeof reason === 'string') return { message: reason, stack: null, kind: 'string' };
  if (reason === null) return { message: `${REJECTION_PREFIX} (null)`, stack: null, kind: 'null' };
  if (reason === undefined) {
    return { message: `${REJECTION_PREFIX} (undefined)`, stack: null, kind: 'undefined' };
  }
  if (typeof reason !== 'object' && typeof reason !== 'function') {
    return {
      message: `${REJECTION_PREFIX} (${typeof reason} ${shortLabel(reason)})`,
      stack: null,
      kind: 'primitive',
    };
  }

  const obj = reason as Record<string, unknown>;
  if (typeof obj.message === 'string') {
    const name = typeof obj.name === 'string' && obj.name ? obj.name : 'Error';
    return {
      message: obj.message || `${REJECTION_PREFIX} (${shortLabel(name)} with no message)`,
      stack: typeof obj.stack === 'string' && obj.stack ? obj.stack : null,
      kind: 'error',
    };
  }

  if (typeof Event !== 'undefined' && reason instanceof Event) {
    const target = reason.target as (EventTarget & { tagName?: unknown; src?: unknown; href?: unknown }) | null;
    const tag = target && typeof target.tagName === 'string' ? target.tagName : null;
    const rawSrc =
      target && typeof target.src === 'string' && target.src
        ? target.src
        : target && typeof target.href === 'string'
          ? target.href
          : null;
    return {
      message: `${REJECTION_PREFIX} (Event ${shortLabel(reason.type)}${tag ? ` on ${tag}` : ''})`,
      stack: null,
      kind: 'event',
      targetSrc: rawSrc ? pathOf(rawSrc) || null : null,
    };
  }

  if (typeof obj.status === 'number' && typeof obj.url === 'string') {
    const path = obj.url ? pathOf(obj.url) : '';
    return {
      message: `${REJECTION_PREFIX} (Response ${obj.status}${path ? ` ${path}` : ''})`,
      stack: null,
      kind: 'response',
    };
  }

  const ctor = (reason as { constructor?: { name?: unknown } }).constructor?.name;
  const typeName = typeof ctor === 'string' && ctor && ctor !== 'Object' ? ctor : 'Object';
  const code =
    typeof obj.code === 'string' || typeof obj.code === 'number'
      ? ` ${shortLabel(obj.code)}`
      : typeof obj.name === 'string' && obj.name
        ? ` ${shortLabel(obj.name)}`
        : '';
  const keys = Object.keys(obj).sort().slice(0, 5);
  return {
    message: `${REJECTION_PREFIX} (${typeName}${code}: ${keys.length ? keys.join(', ') : 'no keys'})`,
    stack: null,
    kind: 'object',
  };
}

export function initDiagnosticCapture(): void {
  if (typeof window === 'undefined' || captureInitialized) return;
  captureInitialized = true;

  // Anything held from a session that ended offline goes now, and again on every reconnect.
  flushPendingDiagnostics();
  window.addEventListener('online', flushPendingDiagnostics);

  window.addEventListener('error', (event) => {
    const message = event.message || 'Script error';
    if (isBareCrossOriginScriptError(message, event.error, event.filename)) return;
    const err = event.error instanceof Error ? event.error : new Error(message);
    reportClientError(err, 'client_js', {
      scriptFilename: event.filename || null,
      scriptLineno: event.lineno || null,
      scriptColno: event.colno || null,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const described = describeRejectionReason(event.reason);
    if (described.kind === 'string') {
      reportClientError(described.message, 'client_js', { rejectionKind: described.kind });
      return;
    }
    // No synthetic stack: a `new Error()` made here records this listener, not the rejection.
    const err = new Error(described.message);
    err.stack = described.stack ?? undefined;
    reportClientError(err, 'client_js', {
      rejectionKind: described.kind,
      ...(described.targetSrc ? { scriptFilename: described.targetSrc } : {}),
    });
  });
}
