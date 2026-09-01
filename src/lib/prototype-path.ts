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

/** Join, shared note/thread, invitation, add-on, and status pages (public marketing-style shell). */
export function isPublicAppPath(pathname: string): boolean {
  const logical = prototypeLogicalPath(pathname);
  // status.harvous.com serves the status UI at `/` (and `/status`).
  if (isStatusHost() && (logical === '/' || logical === '')) return true;
  return (
    (logical.startsWith('/spaces/join') ||
      logical.startsWith('/shared/') ||
      logical.startsWith('/invitations/') ||
      logical === '/upgrade' ||
      logical.startsWith('/upgrade/') ||
      logical === '/addon' ||
      logical.startsWith('/addon/') ||
      logical === '/status' ||
      logical.startsWith('/status/')) &&
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
  'review',
  'challenges',
  'compete',
  'learn',
  'org',
  // Bible reader — `/read/{book}/{chapter}`. Without this, `/read` is a note id.
  'read',
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

/*
 * ─── `*RouteTo()` helpers and the cast they all share ────────────────────────
 *
 * The prototype shell is mounted twice over, and which one exists is decided at
 * runtime: `buildPrototypeRouteBranch()` (spa/src/router.tsx) gives it a *pathless*
 * layout on a dedicated host — so its children resolve to `/`, `/$noteId`,
 * `/admin/usage` — and `path: '/prototype'` everywhere else, resolving to
 * `/prototype/$noteId` and friends. Only one branch is ever built per page load.
 *
 * TypeScript can't see that. It infers a single route tree from the ternary, and it
 * picks the `/prototype`-prefixed shape. So these helpers used to declare the honest
 * runtime union — `'/$noteId' | '/prototype/$noteId'` — which could never be assignable
 * to a `to` prop whose type contains only the prefixed half. That was 56 of the repo's
 * type errors across 24 files, and the reason `as any` had started appearing at call
 * sites (see the history of PrototypeInspectorPane).
 *
 * So each helper declares the prefixed literal — the one the generated route tree
 * actually exposes — and casts. The runtime value is still whichever path really exists
 * on this host; the cast only bridges the gap TypeScript can't model. Call sites keep
 * full checking against real route names, so a typo in a path here still fails to
 * compile.
 *
 * If the route tree ever registers both shapes unconditionally, delete the casts and
 * restore the unions — they are the truthful types.
 */

export function prototypeAdminRouteTo(): '/prototype/admin' {
  return (isDedicatedPrototypeHost() ? '/admin' : '/prototype/admin') as '/prototype/admin';
}

export function prototypeAdminUsageRouteTo(): '/prototype/admin/usage' {
  return (isDedicatedPrototypeHost() ? '/admin/usage' : '/prototype/admin/usage') as '/prototype/admin/usage';
}

export function prototypeAdminPulseRouteTo(): '/prototype/admin/pulse' {
  return (isDedicatedPrototypeHost() ? '/admin/pulse' : '/prototype/admin/pulse') as '/prototype/admin/pulse';
}

export function prototypeAdminReportsRouteTo(): '/prototype/admin/reports' {
  return (isDedicatedPrototypeHost() ? '/admin/reports' : '/prototype/admin/reports') as '/prototype/admin/reports';
}

export function prototypeAdminVotdRouteTo(): '/prototype/admin/votd' {
  return (isDedicatedPrototypeHost() ? '/admin/votd' : '/prototype/admin/votd') as '/prototype/admin/votd';
}

export function prototypeAdminPublishRouteTo(): '/prototype/admin/publish' {
  return (isDedicatedPrototypeHost() ? '/admin/publish' : '/prototype/admin/publish') as '/prototype/admin/publish';
}

export function prototypeAdminMaintenanceRouteTo(): '/prototype/admin/maintenance' {
  return (isDedicatedPrototypeHost() ? '/admin/maintenance' : '/prototype/admin/maintenance') as '/prototype/admin/maintenance';
}

export function prototypeAdminSupportRouteTo(): '/prototype/admin/support' {
  return (isDedicatedPrototypeHost() ? '/admin/support' : '/prototype/admin/support') as '/prototype/admin/support';
}

export function prototypeAdminChurchesRouteTo(): '/prototype/admin/churches' {
  return (isDedicatedPrototypeHost() ? '/admin/churches' : '/prototype/admin/churches') as '/prototype/admin/churches';
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
export function prototypeNoteRouteTo(hostname?: string): '/prototype/$noteId' {
  return (isDedicatedPrototypeHost(hostname) ? '/$noteId' : '/prototype/$noteId') as '/prototype/$noteId';
}

export function prototypeReadRouteTo(): '/prototype/read/$book/$chapter' {
  return (isDedicatedPrototypeHost()
    ? '/read/$book/$chapter'
    : '/prototype/read/$book/$chapter') as '/prototype/read/$book/$chapter';
}

/**
 * TanStack Router `to` for `/read/today` — the reader on whatever today's passage is.
 *
 * Separate from `prototypeReadRouteTo` because it takes no params: this is the URL for
 * "somewhere real to land" (the marketing handoff, a guest's checklist), where the caller
 * knows it wants today and not a particular chapter.
 */
export function prototypeReadTodayRouteTo(): '/prototype/read/today' {
  return (isDedicatedPrototypeHost()
    ? '/read/today'
    : '/prototype/read/today') as '/prototype/read/today';
}

/** True for `/read/{book}/{chapter}` — the reader hosts in the shell like the note editor. */
export function isPrototypeReadPath(pathname: string): boolean {
  return /^\/read\/[^/]+\/[^/]+\/?$/.test(prototypeLogicalPath(pathname));
}

/**
 * The book/chapter a reader path names, for callers that need the subject rather than
 * just the shape — the toolbar chip labelling itself "Romans", and the Library panel
 * deciding which book to open to.
 *
 * Returns the raw slug; resolving it to a book title is `bookFromSlug`'s job, and lives
 * in the caller so this module stays free of canon data.
 */
export function matchPrototypeReadParams(
  pathname: string,
): { bookSlug: string; chapter: string } | null {
  const match = /^\/read\/([^/]+)\/([^/]+)\/?$/.exec(prototypeLogicalPath(pathname));
  if (!match) return null;
  return { bookSlug: decodeURIComponent(match[1]!), chapter: decodeURIComponent(match[2]!) };
}

export function prototypeSettingsRouteTo(): '/prototype/settings' {
  return (isDedicatedPrototypeHost() ? '/settings' : '/prototype/settings') as '/prototype/settings';
}

export function prototypeSettingsAccountRouteTo(): '/prototype/settings/account' {
  return (isDedicatedPrototypeHost() ? '/settings/account' : '/prototype/settings/account') as '/prototype/settings/account';
}

export function prototypeSettingsSupportRouteTo(): '/prototype/settings/support' {
  return (isDedicatedPrototypeHost() ? '/settings/support' : '/prototype/settings/support') as '/prototype/settings/support';
}

/**
 * Review's two URLs, and Challenges' two.
 *
 * Shaped like `prototypeReadTodayRouteTo` rather than the note route: these take no params,
 * except the one challenge id, and both live under segments reserved in
 * `RESERVED_PROTOTYPE_SEGMENTS` so the single-segment note catch-all cannot swallow them.
 */
export function prototypeReviewRouteTo(): '/prototype/review' {
  return (isDedicatedPrototypeHost() ? '/review' : '/prototype/review') as '/prototype/review';
}

export function prototypeReviewSessionRouteTo(): '/prototype/review/session' {
  return (isDedicatedPrototypeHost()
    ? '/review/session'
    : '/prototype/review/session') as '/prototype/review/session';
}

export function prototypeChallengesRouteTo(): '/prototype/challenges' {
  return (isDedicatedPrototypeHost()
    ? '/challenges'
    : '/prototype/challenges') as '/prototype/challenges';
}

export function prototypeChallengeRouteTo(): '/prototype/challenges/$challengeId' {
  return (isDedicatedPrototypeHost()
    ? '/challenges/$challengeId'
    : '/prototype/challenges/$challengeId') as '/prototype/challenges/$challengeId';
}

export function prototypeHomeRouteTo(): '/prototype' {
  // No trailing slash: the shell registers `path: '/prototype'`, and the router (default
  // trailingSlash: 'never') normalizes '/prototype/' to it anyway. The trailing form was
  // never a route the type system accepted.
  return (isDedicatedPrototypeHost() ? '/' : '/prototype') as '/prototype';
}

