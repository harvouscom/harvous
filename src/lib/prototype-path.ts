import { isStatusHost } from './status-page-host';

const DEDICATED_PROTOTYPE_HOSTS = new Set(['app.harvous.com', 'new.harvous.com', 'localhost']);

export function isDedicatedPrototypeHost(hostname?: string): boolean {
  const h = hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '');
  return DEDICATED_PROTOTYPE_HOSTS.has(h);
}

/** Site-inspired sign-in/up (custom form) on dedicated prototype hosts; localhost uses Clerk prebuilt. */
export function isSiteInspiredAuthHost(hostname?: string): boolean {
  return isDedicatedPrototypeHost(hostname);
}

/** `/prototype` on non-dedicated hosts; empty on localhost/new/app. */
export function getPrototypeBasePath(hostname?: string): string {
  return isDedicatedPrototypeHost(hostname) ? '' : '/prototype';
}

/** href for in-app navigation (e.g. a note slug or `settings/account`). */
export function prototypeHref(subpath = '', hostname?: string): string {
  const base = getPrototypeBasePath(hostname);
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
  '/addon',
  '/upgrade',
  '/status',
  '/api/',
];

function isNonPrototypeAppPath(logical: string): boolean {
  return NON_PROTOTYPE_PREFIXES.some((p) => logical === p || logical.startsWith(p));
}

/** Join, shared note/thread, invitation, and add-on pages (public marketing-style shell). */
export function isPublicAppPath(pathname: string): boolean {
  const logical = prototypeLogicalPath(pathname);
  return (
    (logical.startsWith('/spaces/join') ||
      logical.startsWith('/shared/') ||
      logical.startsWith('/invitations/') ||
      logical === '/upgrade' ||
      logical.startsWith('/upgrade/') ||
      logical === '/addon' ||
      logical.startsWith('/addon/')) &&
    isNonPrototypeAppPath(logical)
  );
}

export const PUBLIC_ROUTE_HTML_CLASS = 'harvous-public-route';

/** Keep public-page CSS scoped correctly across client-side TanStack navigation. */
export function syncPublicRouteHtmlClass(
  pathname: string,
  classList: Pick<DOMTokenList, 'toggle'> | null = typeof document !== 'undefined'
    ? document.documentElement.classList
    : null,
): boolean {
  const isPublic = isPublicAppPath(pathname);
  classList?.toggle(PUBLIC_ROUTE_HTML_CLASS, isPublic);
  return isPublic;
}

/**
 * Single-segment shell children that are NOT note slugs.
 * Notes own the bare first path segment; product surfaces use nested namespaces.
 * `n` stays reserved forever so `/n/{id}` can redirect to `/{id}`.
 */
export const RESERVED_PROTOTYPE_SEGMENTS = new Set([
  'settings',
  'space',
  'search',
  'admin',
  'n',
  'new',
  'compose',
  'church',
  'challenges',
  'compete',
  'learn',
  'org',
]);

export function isReservedPrototypeSegment(segment: string): boolean {
  return RESERVED_PROTOTYPE_SEGMENTS.has(segment);
}

/**
 * The lone path segment of a prototype-shell URL, or null when the path is the
 * home index, a multi-segment route, or a non-prototype app path.
 */
function singlePrototypeSegment(pathname: string): string | null {
  const logical = prototypeLogicalPath(pathname);
  if (isNonPrototypeAppPath(logical)) return null;
  const trimmed = logical.replace(/^\/+/, '').replace(/\/+$/, '');
  if (trimmed === '' || trimmed.includes('/')) return null;
  return trimmed;
}

export function isPrototypeShellPath(pathname: string): boolean {
  if (isStatusHost()) return false;
  if (pathname.startsWith('/prototype')) return true;
  if (!isDedicatedPrototypeHost()) return false;
  // On the dedicated host every path that isn't an explicit non-prototype app
  // path (auth, sharing, api, …) belongs to the prototype shell.
  return !isNonPrototypeAppPath(prototypeLogicalPath(pathname));
}

export function isPrototypeHomePath(pathname: string): boolean {
  const logical = prototypeLogicalPath(pathname);
  return logical === '/' || logical === '';
}

export function isPrototypeNotePath(pathname: string): boolean {
  const logical = prototypeLogicalPath(pathname);
  // Legacy `/n/{id}` still counts as a note path (redirects to flat).
  if (/^\/n\/[^/]+\/?$/.test(logical)) return true;
  const seg = singlePrototypeSegment(pathname);
  return seg != null && !RESERVED_PROTOTYPE_SEGMENTS.has(seg);
}

export function isPrototypeSettingsPath(pathname: string): boolean {
  return prototypeLogicalPath(pathname).startsWith('/settings');
}

export function isPrototypeAdminPath(pathname: string): boolean {
  return prototypeLogicalPath(pathname).startsWith('/admin');
}

export function isPrototypeAdminHomePath(pathname: string): boolean {
  const logical = prototypeLogicalPath(pathname).replace(/\/+$/, '') || '/';
  return logical === '/admin';
}

export function prototypeAdminRouteTo(): '/admin' | '/prototype/admin' {
  return isDedicatedPrototypeHost() ? '/admin' : '/prototype/admin';
}

export function prototypeAdminUsageRouteTo(): '/admin/usage' | '/prototype/admin/usage' {
  return isDedicatedPrototypeHost() ? '/admin/usage' : '/prototype/admin/usage';
}

export function prototypeAdminPulseRouteTo(): '/admin/pulse' | '/prototype/admin/pulse' {
  return isDedicatedPrototypeHost() ? '/admin/pulse' : '/prototype/admin/pulse';
}

export function prototypeAdminReportsRouteTo(): '/admin/reports' | '/prototype/admin/reports' {
  return isDedicatedPrototypeHost() ? '/admin/reports' : '/prototype/admin/reports';
}

export function prototypeAdminVotdRouteTo(): '/admin/votd' | '/prototype/admin/votd' {
  return isDedicatedPrototypeHost() ? '/admin/votd' : '/prototype/admin/votd';
}

export function prototypeAdminPublishRouteTo(): '/admin/publish' | '/prototype/admin/publish' {
  return isDedicatedPrototypeHost() ? '/admin/publish' : '/prototype/admin/publish';
}

export function prototypeAdminMaintenanceRouteTo(): '/admin/maintenance' | '/prototype/admin/maintenance' {
  return isDedicatedPrototypeHost() ? '/admin/maintenance' : '/prototype/admin/maintenance';
}

export function prototypeAdminSupportRouteTo(): '/admin/support' | '/prototype/admin/support' {
  return isDedicatedPrototypeHost() ? '/admin/support' : '/prototype/admin/support';
}

export function prototypeAdminChurchesRouteTo(): '/admin/churches' | '/prototype/admin/churches' {
  return isDedicatedPrototypeHost() ? '/admin/churches' : '/prototype/admin/churches';
}

export function matchPrototypeNoteId(pathname: string): string | null {
  const logical = prototypeLogicalPath(pathname);
  // Prefer flat `/{id}`; still recognize legacy `/n/{id}` while redirects exist.
  const legacy = logical.match(/^\/n\/([^/]+)\/?$/);
  if (legacy?.[1]) return legacy[1];
  const seg = singlePrototypeSegment(pathname);
  if (seg == null || RESERVED_PROTOTYPE_SEGMENTS.has(seg)) return null;
  return seg;
}

export function matchLegacyPrototypeSpaceId(pathname: string): string | null {
  const m = prototypeLogicalPath(pathname).match(/^\/space\/([^/]+)/);
  return m?.[1] ?? null;
}

export function prototypeNoteRoutePaths(hostname?: string): {
  canonicalChildPath: '$noteId' | 'n/$noteId';
  compatibilityChildPath: 'n/$noteId' | '$noteId';
} {
  return isDedicatedPrototypeHost(hostname)
    ? { canonicalChildPath: '$noteId', compatibilityChildPath: 'n/$noteId' }
    : { canonicalChildPath: '$noteId', compatibilityChildPath: 'n/$noteId' };
}

/** TanStack Router `to` for the canonical note route on the current host. */
export function prototypeNoteRouteTo(hostname?: string): '/$noteId' | '/prototype/$noteId' {
  return isDedicatedPrototypeHost(hostname) ? '/$noteId' : '/prototype/$noteId';
}

export function prototypeSettingsRouteTo(): '/settings' | '/prototype/settings' {
  return isDedicatedPrototypeHost() ? '/settings' : '/prototype/settings';
}

export function prototypeSettingsAccountRouteTo(): '/settings/account' | '/prototype/settings/account' {
  return isDedicatedPrototypeHost() ? '/settings/account' : '/prototype/settings/account';
}

export function prototypeSettingsSupportRouteTo(): '/settings/support' | '/prototype/settings/support' {
  return isDedicatedPrototypeHost() ? '/settings/support' : '/prototype/settings/support';
}

export function prototypeHomeRouteTo(): '/' | '/prototype/' {
  return isDedicatedPrototypeHost() ? '/' : '/prototype/';
}

