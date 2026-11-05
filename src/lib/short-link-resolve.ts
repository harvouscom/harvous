/**
 * Where a harvo.us request goes. Pure, so the whole redirect table is unit-tested without
 * workerd; cloudflare/links/worker.ts is only the HTTP shell around it.
 *
 *   /                      → harvous.com
 *   /n/<token>             → app.harvous.com/shared/note/<token>
 *   /t/<token>             → app.harvous.com/shared/thread/<token>
 *   /j/<token>             → app.harvous.com/churches/join/<token>
 *   /john3.16, /1cor13 …   → app.harvous.com/read/<book>/<chapter>?v=…
 *   anything else          → harvous.com (never a dead end)
 */

import {
  SHORT_LINK_APP_ORIGIN,
  SHORT_LINK_SITE_ORIGIN,
  isShortLinkPrefix,
  longPathForShortLink,
} from './short-links';
import { scriptureReadPathFor } from './short-link-scripture';

export type ShortLinkOrigins = {
  appOrigin?: string;
  siteOrigin?: string;
};

/** The `Location` for a request to harvo.us. */
export function resolveShortLink(url: URL, origins: ShortLinkOrigins = {}): string {
  const app = (origins.appOrigin ?? SHORT_LINK_APP_ORIGIN).replace(/\/+$/, '');
  const site = (origins.siteOrigin ?? SHORT_LINK_SITE_ORIGIN).replace(/\/+$/, '');

  const shareTarget = longPathForShortLink(url.pathname);
  if (shareTarget) return `${app}${shareTarget}${url.search}`;

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 1 || isShortLinkPrefix(segments[0])) return site;

  const readPath = scriptureReadPathFor(segments[0]);
  if (!readPath) return site;

  // A query on the short link (say `?t=ESV` for a translation) rides along, but never
  // overrides the verse the link itself names.
  const target = new URL(`${app}${readPath}`);
  url.searchParams.forEach((value, key) => {
    if (!target.searchParams.has(key)) target.searchParams.set(key, value);
  });
  return target.toString();
}
