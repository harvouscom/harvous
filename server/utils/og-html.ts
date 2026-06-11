/**
 * Server-rendered Open Graph HTML for share links.
 *
 * The SPA serves `/shared/note/:token` and `/shared/thread/:token` as a client-
 * rendered page, so crawlers (iMessage, Slack, X) see only the generic index.html
 * meta. These helpers render a tiny HTML document with proper `og:`/`twitter:` tags
 * for a shared item, and bounce human browsers on to the canonical SPA URL.
 *
 * Rollout: route crawler user-agents that hit the canonical share pathnames to the
 * `/api/og/share/...` routes (Netlify edge / bot detection) — see server/routes/og.ts.
 */

const SITE_NAME = 'Harvous';
const DEFAULT_DESCRIPTION = 'A shared Bible study note on Harvous.';

/** Escape a string for safe interpolation into HTML attribute/text contexts. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ShareOgInput {
  /** Display title (already plain text). */
  title: string;
  /** Plain-text description/excerpt (already HTML-stripped). */
  description?: string;
  /** Canonical SPA URL humans should land on (e.g. https://host/shared/note/<token>). */
  canonicalUrl: string;
  /** Absolute OG image URL, if any. */
  imageUrl?: string;
}

/**
 * Render an OG meta document. Crawlers read the meta tags; human browsers are
 * redirected to `canonicalUrl` (meta refresh + script + noscript fallback link).
 */
export function renderShareOgHtml(input: ShareOgInput): string {
  const title = escapeHtml(input.title?.trim() || SITE_NAME);
  const description = escapeHtml((input.description?.trim() || DEFAULT_DESCRIPTION).slice(0, 200));
  const url = escapeHtml(input.canonicalUrl);
  const image = input.imageUrl ? escapeHtml(input.imageUrl) : null;

  const imageTags = image
    ? `<meta property="og:image" content="${image}" />\n    <meta name="twitter:image" content="${image}" />\n    <meta name="twitter:card" content="summary_large_image" />`
    : `<meta name="twitter:card" content="summary" />`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} · ${SITE_NAME}</title>
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    ${imageTags}
    <meta http-equiv="refresh" content="0; url=${url}" />
    <script>window.location.replace(${JSON.stringify(input.canonicalUrl)});</script>
  </head>
  <body>
    <p>Redirecting to <a href="${url}">${title}</a>…</p>
  </body>
</html>`;
}

/** OG document for a missing/expired share — generic, still unfurls cleanly. */
export function renderNotFoundOgHtml(canonicalUrl: string): string {
  return renderShareOgHtml({
    title: SITE_NAME,
    description: 'This shared item is no longer available.',
    canonicalUrl,
  });
}
