const DEDICATED_PROTOTYPE_HOSTS = new Set(['app.harvous.com', 'new.harvous.com', 'localhost']);

export function isDedicatedPrototypeHost(hostname?: string): boolean {
  const h = hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '');
  return DEDICATED_PROTOTYPE_HOSTS.has(h);
}

/** Site-inspired sign-in/up (custom form) on dedicated prototype hosts; localhost uses Clerk prebuilt. */
export function isSiteInspiredAuthHost(hostname?: string): boolean {
  return isDedicatedPrototypeHost(hostname);
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
  '/addon',
  '/api/',
];

function isNonPrototypeAppPath(logical: string): boolean {
  return NON_PROTOTYPE_PREFIXES.some((p) => logical === p || logical.startsWith(p));
}

/**
 * Single-segment shell children that are NOT notes. Notes live at the root layer
 * (`/<slug>`), so any other single non-reserved segment is treated as a note.
 */
const RESERVED_PROTOTYPE_SEGMENTS = new Set(['settings', 'space', 'search', 'admin']);

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

export function matchPrototypeNoteId(pathname: string): string | null {
  const seg = singlePrototypeSegment(pathname);
  if (seg == null || RESERVED_PROTOTYPE_SEGMENTS.has(seg)) return null;
  return seg;
}

export function matchLegacyPrototypeSpaceId(pathname: string): string | null {
  const m = prototypeLogicalPath(pathname).match(/^\/space\/([^/]+)/);
  return m?.[1] ?? null;
}

/** TanStack Router `to` for root-level note routes (typed for app.harvous.com route tree at compile time). */
export function prototypeNoteRouteTo(): '/prototype/$noteId' {
  return (isDedicatedPrototypeHost() ? '/$noteId' : '/prototype/$noteId') as '/prototype/$noteId';
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

