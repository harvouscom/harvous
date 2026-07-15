/**
 * Dedicated Netlify Function for OG share screenshots (1200×630).
 *
 * Routed ahead of the main api.cjs catch-all so Chromium / puppeteer are not
 * forced into the single-file API bundle. Uses @sparticuz/chromium (external).
 *
 *   GET /api/og/image/note/:shareToken
 *   GET /api/og/image/thread/:shareToken
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { isValidShareToken } from '../src/utils/ids';
import { captureShareOgScreenshot } from './utils/og-screenshot';
import {
  createOgImageResponse,
  fallbackImageHtml,
} from '../src/utils/og-image';
import { buildDefaultNoteCardHtml } from './utils/og-note-cards';
import { buildThreadCardHtml } from './utils/og-thread-cards';

const PATH_PATTERNS = [
  /^\/api\/og\/image\/(note|thread)\/([A-Za-z0-9]{12})\/?$/,
  /^\/\.netlify\/functions\/og-image\/(note|thread)\/([A-Za-z0-9]{12})\/?$/,
  /^\/(note|thread)\/([A-Za-z0-9]{12})\/?$/,
];

function originFromEvent(event: HandlerEvent): string {
  const headers = event.headers || {};
  const host = headers['x-forwarded-host'] || headers.host || 'localhost';
  const proto = headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function parseKindToken(event: HandlerEvent): { kind: 'note' | 'thread'; token: string } | null {
  const q = event.queryStringParameters || {};
  if ((q.kind === 'note' || q.kind === 'thread') && q.token && isValidShareToken(q.token)) {
    return { kind: q.kind, token: q.token };
  }

  const candidates = [
    event.path || '',
    event.rawUrl ? new URL(event.rawUrl).pathname : '',
  ];

  for (const path of candidates) {
    if (!path) continue;
    for (const pattern of PATH_PATTERNS) {
      const match = path.match(pattern);
      if (match) {
        return { kind: match[1] as 'note' | 'thread', token: match[2] };
      }
    }
  }
  return null;
}

async function webResponseToLambda(res: Response): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}> {
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const contentType = res.headers.get('content-type') || '';
  if (contentType.startsWith('image/')) {
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: res.status,
      headers,
      body: buf.toString('base64'),
      isBase64Encoded: true,
    };
  }
  return {
    statusCode: res.status,
    headers,
    body: await res.text(),
  };
}

export const handler: Handler = async (event) => {
  const parsed = parseKindToken(event);
  if (!parsed || !isValidShareToken(parsed.token)) {
    return webResponseToLambda(await createOgImageResponse(fallbackImageHtml('Invalid share link')));
  }

  const { kind, token } = parsed;
  const origin = originFromEvent(event);
  const pageUrl = `${origin}/shared/${kind}/${token}?ogCapture=1`;

  try {
    const png = await captureShareOgScreenshot(pageUrl);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'X-Og-Source': 'screenshot',
      },
      body: png.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('[og-image] screenshot failed, falling back to satori:', error);
    const html =
      kind === 'thread'
        ? buildThreadCardHtml({ title: 'Shared study thread', noteCount: 0 })
        : buildDefaultNoteCardHtml('Shared note', '');
    const fallback = await webResponseToLambda(await createOgImageResponse(html));
    return {
      ...fallback,
      headers: {
        ...fallback.headers,
        'X-Og-Source': 'satori-fallback',
      },
    };
  }
};
