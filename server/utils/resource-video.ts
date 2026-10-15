/**
 * The video a saved page is *for*, when it is a video page.
 *
 * A BibleProject video link is an HTML page, so it used to fall into reader view and show the
 * page's text around a missing player. Publishers describe the video itself in the page's
 * markup — schema.org `VideoObject` JSON-LD for search engines, `og:video` for link previews —
 * and that description is what the viewer needs: the file or embed to play, a poster, and how
 * long it runs.
 *
 * Only what a browser can play in place is returned: a YouTube or Vimeo id, or a direct
 * progressive file (mp4/webm/mov). HLS (`.m3u8`) is not — no browser but Safari plays it
 * without a library, and a player that works on one browser is a bug report.
 */
import { parseHTML } from 'linkedom';

export type ResourceVideo =
  | {
      kind: 'file';
      src: string;
      poster: string | null;
      durationSeconds: number | null;
    }
  | {
      kind: 'youtube' | 'vimeo';
      id: string;
      /** An unlisted Vimeo video's access hash. */
      hash?: string;
      poster: string | null;
      durationSeconds: number | null;
    };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const FILE_EXT = /\.(mp4|m4v|webm|mov)(?:$|[?#])/i;

/** ISO 8601 `PT1H2M3S` → seconds. */
export function isoDurationSeconds(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!m || !m.slice(1).some(Boolean)) return null;
  const total =
    Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
  return total > 0 ? Math.round(total) : null;
}

function httpsUrl(raw: unknown, base: string): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim(), base);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A YouTube or Vimeo player, from any of the URL shapes those hosts use. */
export function hostedVideoFrom(raw: string | null): { kind: 'youtube' | 'vimeo'; id: string; hash?: string } | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id =
      host === 'youtu.be'
        ? url.pathname.split('/')[1]
        : url.pathname === '/watch'
          ? url.searchParams.get('v')
          : url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1];
    return id && YOUTUBE_ID.test(id) ? { kind: 'youtube', id } : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    const i = parts.findIndex((p) => /^\d+$/.test(p));
    if (i < 0) return null;
    const hash = url.searchParams.get('h') ?? (host === 'vimeo.com' ? parts[i + 1] : undefined);
    return { kind: 'vimeo', id: parts[i], ...(hash && /^[a-f0-9]+$/i.test(hash) ? { hash } : {}) };
  }
  return null;
}

type JsonObject = Record<string, unknown>;

/** Every object in a JSON-LD document whose @type includes VideoObject, however nested. */
function videoObjects(node: unknown, out: JsonObject[] = [], depth = 0): JsonObject[] {
  if (depth > 6 || node == null) return out;
  if (Array.isArray(node)) {
    for (const child of node) videoObjects(child, out, depth + 1);
    return out;
  }
  if (typeof node !== 'object') return out;
  const obj = node as JsonObject;
  const type = obj['@type'];
  if (type === 'VideoObject' || (Array.isArray(type) && type.includes('VideoObject'))) out.push(obj);
  for (const key of ['@graph', 'video', 'mainEntity', 'hasPart', 'associatedMedia']) {
    if (key in obj) videoObjects(obj[key], out, depth + 1);
  }
  return out;
}

function firstString(value: unknown): unknown {
  if (Array.isArray(value)) return value.find((v) => typeof v === 'string') ?? (value[0] as JsonObject)?.url;
  if (value && typeof value === 'object') return (value as JsonObject).url;
  return value;
}

export function extractResourceVideo(html: string, pageUrl: string): ResourceVideo | null {
  let document: Document;
  try {
    ({ document } = parseHTML(html) as unknown as { document: Document });
  } catch {
    return null;
  }

  const meta = (name: string) =>
    document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content') ?? null;
  const ogImage = httpsUrl(meta('og:image'), pageUrl);

  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? '');
    } catch {
      continue;
    }
    for (const video of videoObjects(data)) {
      const poster = httpsUrl(firstString(video.thumbnailUrl), pageUrl) ?? ogImage;
      const durationSeconds = isoDurationSeconds(video.duration);
      const hosted = hostedVideoFrom(httpsUrl(video.embedUrl, pageUrl)) ?? hostedVideoFrom(httpsUrl(video.contentUrl, pageUrl));
      if (hosted) return { ...hosted, poster, durationSeconds };
      const file = httpsUrl(video.contentUrl, pageUrl);
      if (file && FILE_EXT.test(new URL(file).pathname)) return { kind: 'file', src: file, poster, durationSeconds };
    }
  }

  const ogVideo = httpsUrl(meta('og:video:secure_url') ?? meta('og:video:url') ?? meta('og:video'), pageUrl);
  const hosted = hostedVideoFrom(ogVideo);
  if (hosted) return { ...hosted, poster: ogImage, durationSeconds: null };
  const ogType = meta('og:video:type') ?? '';
  if (ogVideo && (/^video\/(mp4|webm|quicktime)/i.test(ogType) || FILE_EXT.test(new URL(ogVideo).pathname))) {
    return { kind: 'file', src: ogVideo, poster: ogImage, durationSeconds: null };
  }
  return null;
}
