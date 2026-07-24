/**
 * Rewrite social crawlers on public share URLs to server-rendered OG HTML.
 *
 * Humans keep the SPA at /shared/note|thread/:token.
 * Bots are rewritten (200) to /api/og/share/note|thread/:token so unfurls
 * get og:title, og:description, and og:image.
 *
 * Crawler list covers common unfurlers: Facebook, Twitter/X, Slack, Discord,
 * LinkedIn, Applebot/iMessage, WhatsApp, Telegram, and related preview bots.
 */

import type { Config, Context } from '@netlify/edge-functions';

/** Case-insensitive substrings matched against User-Agent. */
const CRAWLER_UA_SNIPPETS = [
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'LinkedInBot',
  'Slackbot',
  'Slack-ImgProxy',
  'Discordbot',
  'TelegramBot',
  'WhatsApp',
  'Applebot',
  'facebookcatalog',
  'meta-externalagent',
  'Pinterestbot',
  'Embedly',
  'Quora Link Preview',
  'outbrain',
  'vkShare',
  'W3C_Validator',
  'redditbot',
  'SkypeUriPreview',
  'Iframely',
  'Googlebot',
  'bingbot',
  'Baiduspider',
  'DuckDuckBot',
  'YandexBot',
  'ia_archiver',
];

const SHARE_PATH =
  /^\/shared\/(note|thread)\/([A-Za-z0-9]{12})\/?$/;

function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return CRAWLER_UA_SNIPPETS.some((snippet) => ua.includes(snippet.toLowerCase()));
}

export default async function sharedOg(request: Request, _context: Context) {
  if (!isCrawler(request.headers.get('user-agent'))) {
    return;
  }

  const url = new URL(request.url);
  const match = url.pathname.match(SHARE_PATH);
  if (!match) return;

  const [, kind, token] = match;
  return new URL(`/api/og/share/${kind}/${token}`, request.url);
}

export const config: Config = {
  path: ['/shared/note/*', '/shared/thread/*'],
};
