export const PENDING_AUTH_REDIRECT_KEY = 'harvous_pending_redirect';
export const PENDING_AUTH_REDIRECT_MAX_AGE_MS = 10 * 60 * 1000;

type PendingAuthRedirectRecord = {
  path: string;
  timestamp: number;
};

type StorageReader = Pick<Storage, 'getItem' | 'removeItem'>;
type StorageWriter = Pick<Storage, 'setItem'>;

const ALLOWED_PENDING_PATHS = [
  /^\/spaces\/join\/[A-Za-z0-9_-]+\/?$/,
  /^\/invitations\/[A-Za-z0-9_-]+\/?$/,
  /^\/shared\/note\/[A-Za-z0-9_-]+\/?$/,
  /^\/shared\/thread\/[A-Za-z0-9_-]+\/?$/,
] as const;

function browserOrigin(): string | null {
  return typeof window === 'undefined' ? null : window.location.origin;
}

function browserSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function sameOriginPath(destination: string, origin: string): string | null {
  try {
    const url = new URL(destination, origin);
    if (url.origin !== origin || url.username || url.password) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function validatePendingAuthDestination(destination: string, origin: string): string | null {
  const path = sameOriginPath(destination, origin);
  if (!path) return null;
  const pathname = new URL(path, origin).pathname;
  return ALLOWED_PENDING_PATHS.some((pattern) => pattern.test(pathname)) ? path : null;
}

export function writePendingAuthRedirect(
  destination: string,
  options: { storage?: StorageWriter | null; origin?: string | null; now?: number } = {},
): boolean {
  const storage = options.storage === undefined ? browserSessionStorage() : options.storage;
  const origin = options.origin === undefined ? browserOrigin() : options.origin;
  if (!storage || !origin) return false;

  const path = validatePendingAuthDestination(destination, origin);
  if (!path) return false;
  const record: PendingAuthRedirectRecord = {
    path,
    timestamp: options.now ?? Date.now(),
  };
  try {
    storage.setItem(PENDING_AUTH_REDIRECT_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

function parsePendingAuthRedirect(
  raw: string | null,
  origin: string,
  now: number,
  maxAgeMs: number,
): string | null {
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as Partial<PendingAuthRedirectRecord>;
    if (
      typeof record.path !== 'string' ||
      typeof record.timestamp !== 'number' ||
      !Number.isFinite(record.timestamp) ||
      record.timestamp > now ||
      now - record.timestamp > maxAgeMs
    ) {
      return null;
    }
    return validatePendingAuthDestination(record.path, origin);
  } catch {
    return null;
  }
}

export function peekPendingAuthRedirect(
  options: {
    storage?: StorageReader | null;
    origin?: string | null;
    now?: number;
    maxAgeMs?: number;
  } = {},
): string | null {
  const storage = options.storage === undefined ? browserSessionStorage() : options.storage;
  const origin = options.origin === undefined ? browserOrigin() : options.origin;
  if (!storage || !origin) return null;
  try {
    return parsePendingAuthRedirect(
      storage.getItem(PENDING_AUTH_REDIRECT_KEY),
      origin,
      options.now ?? Date.now(),
      options.maxAgeMs ?? PENDING_AUTH_REDIRECT_MAX_AGE_MS,
    );
  } catch {
    return null;
  }
}

export function clearPendingAuthRedirect(storage: Pick<Storage, 'removeItem'> | null = browserSessionStorage()) {
  try {
    storage?.removeItem(PENDING_AUTH_REDIRECT_KEY);
  } catch {
    // Session storage can be unavailable in restricted browser contexts.
  }
}

export function consumePendingAuthRedirect(
  options: {
    storage?: StorageReader | null;
    origin?: string | null;
    now?: number;
    maxAgeMs?: number;
  } = {},
): string | null {
  const storage = options.storage === undefined ? browserSessionStorage() : options.storage;
  if (!storage) return null;
  const path = peekPendingAuthRedirect({ ...options, storage });
  clearPendingAuthRedirect(storage);
  return path;
}

export type PendingAuthRedirectDecision = 'wait' | 'explicit' | 'none' | 'at-target' | 'navigate';

export function pendingAuthRedirectDecision(input: {
  isLoaded: boolean;
  isSignedIn: boolean;
  hasExplicitRedirect: boolean;
  currentDestination: string;
  pendingDestination: string | null;
  origin: string;
}): PendingAuthRedirectDecision {
  if (!input.isLoaded || !input.isSignedIn) return 'wait';
  if (input.hasExplicitRedirect) return 'explicit';
  if (!input.pendingDestination) return 'none';
  const currentPath = sameOriginPath(input.currentDestination, input.origin);
  if (currentPath === input.pendingDestination) return 'at-target';
  return 'navigate';
}
