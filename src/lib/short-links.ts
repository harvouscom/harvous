/**
 * harvo.us — Harvous's short-link domain.
 *
 * harvo.us never serves the app. It answers every path with a redirect into
 * app.harvous.com (cloudflare/links/worker.ts), so Clerk's domain-locked key, CSRF, CSP,
 * the PWA and push all keep exactly one origin. This file is the one table both directions
 * read: the server and the SPA use it to *hand out* short links, the Worker uses it to
 * *resolve* them, so the two can never disagree about what `/n/` means.
 *
 * Deliberately import-free. The SPA's share popovers import `shareUrlFor`, and anything this
 * file pulls in lands in their chunk. Scripture links (`harvo.us/john3.16`) need the reference
 * parser and its chapter data, so they live in `short-link-scripture.ts`, which only the
 * Worker imports.
 *
 * Church links are token-only (`/j/<token>`), never a vanity name. The list of churches on
 * Harvous is not public, and a slug would be a directory anyone could walk — see the
 * `ChurchJoinLinks` docblock in server/db/schema.ts.
 */

export const SHORT_LINK_ORIGIN = 'https://harvo.us';

/** The only origin whose links get shortened. Every other origin links to itself. */
export const SHORT_LINK_APP_ORIGIN = 'https://app.harvous.com';

/** Where `harvo.us/` and anything harvo.us can't place go. */
export const SHORT_LINK_SITE_ORIGIN = 'https://harvous.com';

export const SHORT_KINDS = {
  note: { prefix: 'n', path: '/shared/note/' },
  thread: { prefix: 't', path: '/shared/thread/' },
  church: { prefix: 'j', path: '/churches/join/' },
} as const;

export type ShortKind = keyof typeof SHORT_KINDS;

/**
 * Single-letter prefixes held for kinds that don't shorten yet (space and family invites), so
 * a future `/s/` can never collide with something already handed out. A reserved prefix
 * resolves to the marketing site until it is wired.
 */
export const RESERVED_SHORT_PREFIXES: ReadonlySet<string> = new Set(['s', 'f']);

/**
 * Covers both token alphabets: base62 from `generateShareToken()` (src/utils/ids.ts) and the
 * church join link's look-alike-free 57 characters (server/utils/church-join-link.ts). Both
 * are 12 characters.
 */
const SHORT_TOKEN = /^[A-Za-z0-9]{12}$/;

function trimOrigin(origin: string): string {
  return origin.replace(/\/+$/, '');
}

/**
 * The link to hand someone for a shared note, Thread, or church join link.
 *
 * Short only when the page (or the request) is production's own origin. localhost and
 * new.harvous.com keep their long, same-origin links, so a link copied while testing opens
 * where it was made instead of bouncing to production.
 */
export function shareUrlFor(kind: ShortKind, token: string, appOrigin: string): string {
  const origin = trimOrigin(appOrigin);
  const { prefix, path } = SHORT_KINDS[kind];
  if (origin === SHORT_LINK_APP_ORIGIN && SHORT_TOKEN.test(token)) {
    return `${SHORT_LINK_ORIGIN}/${prefix}/${token}`;
  }
  return `${origin}${path}${token}`;
}

/** `/n/<token>` → `/shared/note/<token>`, or null when the path is not a short share link. */
export function longPathForShortLink(pathname: string): string | null {
  const match = /^\/([a-z])\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  const [, prefix, token] = match;
  if (!SHORT_TOKEN.test(token)) return null;
  const kind = (Object.keys(SHORT_KINDS) as ShortKind[]).find((k) => SHORT_KINDS[k].prefix === prefix);
  return kind ? `${SHORT_KINDS[kind].path}${token}` : null;
}

/** The first path segment is a short-link prefix (wired or reserved), never a Scripture reference. */
export function isShortLinkPrefix(segment: string): boolean {
  return (
    RESERVED_SHORT_PREFIXES.has(segment) ||
    (Object.values(SHORT_KINDS) as Array<{ prefix: string }>).some((k) => k.prefix === segment)
  );
}
