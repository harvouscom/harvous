/** Production 2.0 shell — prototype routes at `/` (not `/prototype`). */
export const DEDICATED_PROTOTYPE_HOST = 'new.harvous.com';

export function isDedicatedPrototypeHost(hostname?: string): boolean {
  const h = hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '');
  return h === DEDICATED_PROTOTYPE_HOST;
}

/** `/prototype` on app.harvous.com; empty on new.harvous.com. */
export function getPrototypeBasePath(): string {
  return isDedicatedPrototypeHost() ? '' : '/prototype';
}

/** href for in-app navigation (e.g. `n/42`, `settings/account`). */
export function prototypeHref(subpath = ''): string {
  const base = getPrototypeBasePath();
  const normalized = subpath.replace(/^\//, '');
  if (!normalized) return base || '/';
  return base ? `${base}/${normalized}` : `/${normalized}`;
}

export function prototypeHomePath(): string {
  return getPrototypeBasePath() || '/';
}

/** Path inside the prototype shell (strips optional `/prototype` prefix). */
export function prototypeLogicalPath(pathname: string): string {
  if (pathname.startsWith('/prototype')) {
    const rest = pathname.slice('/prototype'.length);
    return rest || '/';
  }
  return pathname;
}

const NON_PROTOTYPE_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/spaces/join',
  '/shared/',
  '/invitations/',
  '/upgrade',
  '/api/',
];

function isNonPrototypeAppPath(logical: string): boolean {
  return NON_PROTOTYPE_PREFIXES.some((p) => logical === p || logical.startsWith(p));
}

export function isPrototypeShellPath(pathname: string): boolean {
  if (pathname.startsWith('/prototype')) return true;
  if (!isDedicatedPrototypeHost()) return false;
  const logical = prototypeLogicalPath(pathname);
  if (isNonPrototypeAppPath(logical)) return false;
  if (logical === '/' || logical === '') return true;
  return (
    logical.startsWith('/n/') ||
    logical.startsWith('/search') ||
    logical.startsWith('/settings') ||
    logical.startsWith('/space/')
  );
}

export function isPrototypeHomePath(pathname: string): boolean {
  const logical = prototypeLogicalPath(pathname);
  return logical === '/' || logical === '';
}

export function isPrototypeNotePath(pathname: string): boolean {
  return prototypeLogicalPath(pathname).startsWith('/n/');
}

export function isPrototypeSearchPath(pathname: string): boolean {
  const logical = prototypeLogicalPath(pathname);
  return logical === '/search' || logical.startsWith('/search/');
}

export function isPrototypeSettingsPath(pathname: string): boolean {
  return prototypeLogicalPath(pathname).startsWith('/settings');
}

export function matchPrototypeNoteId(pathname: string): string | null {
  const m = prototypeLogicalPath(pathname).match(/^\/n\/([^/]+)/);
  return m?.[1] ?? null;
}

export function matchLegacyPrototypeSpaceId(pathname: string): string | null {
  const m = prototypeLogicalPath(pathname).match(/^\/space\/([^/]+)/);
  return m?.[1] ?? null;
}

/** TanStack Router `to` for flat note routes. */
export function prototypeNoteRouteTo(): '/n/$noteId' | '/prototype/n/$noteId' {
  return isDedicatedPrototypeHost() ? '/n/$noteId' : '/prototype/n/$noteId';
}

export function prototypeSettingsRouteTo(): '/settings' | '/prototype/settings' {
  return isDedicatedPrototypeHost() ? '/settings' : '/prototype/settings';
}

export function prototypeSettingsAccountRouteTo(): '/settings/account' | '/prototype/settings/account' {
  return isDedicatedPrototypeHost() ? '/settings/account' : '/prototype/settings/account';
}

export function prototypeSearchRouteTo(): '/search' | '/prototype/search' {
  return isDedicatedPrototypeHost() ? '/search' : '/prototype/search';
}

export function prototypeHomeRouteTo(): '/' | '/prototype/' {
  return isDedicatedPrototypeHost() ? '/' : '/prototype/';
}
