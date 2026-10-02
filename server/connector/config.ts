/**
 * Harvous Connector — the read-only MCP server that lets Claude, ChatGPT, Cursor and other
 * MCP clients reference a person's study. Part of Harvous Plus (feature key `connector`).
 *
 * Canonical boundaries: docs/future/CONNECTOR_BOUNDARIES.md. The short version, enforced
 * across this directory: read-only forever, query-shaped (no list-everything, no export),
 * locked notes stay locked, scripture comes back as references and never as Bible text,
 * and nothing about other people beyond "this note isn't yours".
 */

/** Largest page any list or search returns. */
export const PAGE_MAX = 25;

/** `list_spaces` is cheap and short; it may return more per page. */
export const SPACES_PAGE_MAX = 50;

/**
 * Deepest offset a cursor may reach. This is the "no export" boundary in practice: paging
 * is for finding the next few results, not for walking an entire account.
 */
export const MAX_OFFSET = 1000;

/** Tool calls per person per UTC day. */
export const DAILY_CALLS = 1000;

/** Tool calls per person per minute — stops a looping agent, never a person. */
export const CALLS_PER_MINUTE = 60;

/** Any request (including initialize / tools/list) per person per minute. */
export const REQUESTS_PER_MINUTE = 240;

/** Requests per IP per minute, checked before auth so unauthenticated floods stay cheap. */
export const IP_REQUESTS_PER_MINUTE = 120;

/** A note body longer than this is cut, with `truncated: true` on the result. */
export const MAX_BODY_CHARS = 60_000;

/** Reader highlights returned by find_by_passage (first page only). */
export const MAX_PASSAGE_HIGHLIGHTS = 50;

/** Study-thread graphs are capped at this many notes, as the app's thread view is. */
export const MAX_GRAPH_NODES = 200;

/** Served by mcp-route.ts at `/icon.png`; clients show it as the connector's tile. */
export function connectorIconUrl(resourceUrl = connectorResourceUrl()): string {
  return `${new URL(resourceUrl).origin}/icon.png`;
}

export function serverInfo() {
  return {
    name: 'harvous',
    title: 'Harvous',
    version: '1.0.0',
    icons: [{ src: connectorIconUrl(), mimeType: 'image/png', sizes: ['192x192'] }],
  };
}

export const SERVER_INSTRUCTIONS = [
  "Harvous is where this person keeps their Bible study: notes, the threads and folders",
  'they organize them into, and the connections they draw between notes.',
  'Everything here is read-only — nothing you do can change their study.',
  'Scripture appears as references (for example "Romans 8:28"), not as verse text.',
  'Locked notes return only their title and dates. When the person names a book, chapter',
  'or verse, use find_by_passage — it understands ranges and includes their Bible highlights.',
  'For words and themes, start with search_notes. Then get_note on the results that matter.',
].join(' ');

const DEFAULT_RESOURCE_URL = 'https://mcp.harvous.com/mcp';

/**
 * The URL clients connect to, and the `resource` their tokens are issued for.
 *
 * Read from the environment and never from the Host header: a request can claim any Host,
 * and this string ends up in the OAuth metadata a client trusts. Dev and tunnel testing set
 * `CONNECTOR_RESOURCE_URL` (e.g. `http://localhost:3001/mcp`).
 */
export function connectorResourceUrl(): string {
  return (process.env.CONNECTOR_RESOURCE_URL?.trim() || DEFAULT_RESOURCE_URL).replace(/\/+$/, '');
}

/**
 * RFC 9728: the metadata URL is the resource's origin + `/.well-known/oauth-protected-resource`
 * + the resource's path. Clients probe this path-suffixed form first.
 */
export function protectedResourceMetadataUrl(resourceUrl = connectorResourceUrl()): string {
  const url = new URL(resourceUrl);
  const path = url.pathname === '/' ? '' : url.pathname;
  return `${url.origin}/.well-known/oauth-protected-resource${path}`;
}

/** Where a person without Plus is sent. */
export function upgradeUrl(): string {
  const origin = process.env.PUBLIC_APP_ORIGIN?.trim() || 'https://app.harvous.com';
  return `${origin.replace(/\/+$/, '')}/upgrade`;
}

/** Clerk publishable key — the server historically read only the secret key. */
export function clerkPublishableKey(): string | null {
  return (
    process.env.CLERK_PUBLISHABLE_KEY?.trim() ||
    process.env.PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
    process.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() ||
    null
  );
}

/** Account ids allowed through while `connector` is withheld (comma-separated). */
export function previewUserIds(): Set<string> {
  return new Set(
    (process.env.CONNECTOR_PREVIEW_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}
