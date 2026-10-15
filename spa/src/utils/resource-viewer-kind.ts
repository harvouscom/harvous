/**
 * How the Resources viewer shows a library item inside Harvous.
 *
 * Pure so the routing is testable without a browser: which links become an embedded
 * player, which become reader view, and which files the viewer can draw itself. Anything
 * it cannot show falls to `card` — the item's own title, image and blurb, with a way out.
 *
 * Arbitrary sites are never framed. Most refuse (`X-Frame-Options`), and allowing any
 * https frame would loosen the app's CSP for every page. Reader view covers articles; the
 * three players below are the hosts that publish an embed URL meant for exactly this.
 */

export type ResourceEmbed = {
  provider: 'youtube' | 'vimeo' | 'spotify';
  src: string;
  /** YouTube's video id — the Discover player (Plyr) is built from the id, not the URL. */
  id?: string;
  /** A player is 16:9; Spotify's is a fixed-height strip. */
  shape: 'video' | 'audio';
};

export type ResourceViewerKind =
  | { kind: 'embed'; embed: ResourceEmbed }
  | { kind: 'reader' }
  | { kind: 'image' }
  | { kind: 'pdf' }
  | { kind: 'video' }
  | { kind: 'audio' }
  | { kind: 'text' }
  | { kind: 'card' };

type ViewableItem = {
  kind: string;
  sourceUrl: string | null;
  fileMime: string | null;
  fileName: string | null;
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** `t=90`, `t=1m30s`, `t=1h2m3s` → seconds. Anything else is ignored rather than guessed. */
function youtubeStartSeconds(raw: string | null): number | null {
  if (!raw) return null;
  if (/^\d+s?$/.test(raw)) return Number.parseInt(raw, 10);
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function youtubeEmbed(url: URL): ResourceEmbed | null {
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      id = m?.[1] ?? null;
    }
  } else {
    return null;
  }
  if (!id || !YOUTUBE_ID.test(id)) return null;
  const start = youtubeStartSeconds(url.searchParams.get('t') ?? url.searchParams.get('start'));
  /* nocookie: nothing is set in the reader's browser until they press play. */
  const src = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
  src.searchParams.set('rel', '0');
  if (start) src.searchParams.set('start', String(start));
  return { provider: 'youtube', src: src.toString(), shape: 'video', id };
}

function vimeoEmbed(url: URL): ResourceEmbed | null {
  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const idIndex = parts.findIndex((p) => /^\d+$/.test(p));
  if (idIndex < 0) return null;
  const id = parts[idIndex];
  const src = new URL(`https://player.vimeo.com/video/${id}`);
  /* An unlisted video's hash rides in the path (vimeo.com/123/abc) or as `h`; without it
     the player refuses. */
  const hash = url.searchParams.get('h') ?? (host === 'vimeo.com' ? parts[idIndex + 1] : undefined);
  if (hash && /^[a-f0-9]+$/i.test(hash)) src.searchParams.set('h', hash);
  src.searchParams.set('dnt', '1');
  return { provider: 'vimeo', src: src.toString(), shape: 'video' };
}

function spotifyEmbed(url: URL): ResourceEmbed | null {
  if (url.hostname !== 'open.spotify.com') return null;
  const m = url.pathname.match(
    /^\/(?:intl-[a-z-]+\/)?(episode|show|track|album|playlist)\/([A-Za-z0-9]+)/,
  );
  if (!m) return null;
  return {
    provider: 'spotify',
    src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`,
    shape: 'audio',
  };
}

/** The player a link can be watched or heard in without leaving, if its host has one. */
export function resourceEmbedFor(sourceUrl: string | null): ResourceEmbed | null {
  if (!sourceUrl) return null;
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return youtubeEmbed(url) ?? vimeoEmbed(url) ?? spotifyEmbed(url);
}

function extensionOf(name: string | null): string {
  const m = name?.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?.[1] ?? '';
}

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv']);

export function resolveResourceViewer(item: ViewableItem): ResourceViewerKind {
  if (item.kind === 'link') {
    const embed = resourceEmbedFor(item.sourceUrl);
    if (embed) return { kind: 'embed', embed };
    /* A link straight to a PDF is a file on someone else's server — the reader can't
       extract it and the browser can't fetch it cross-origin, so it gets the card. */
    if (item.sourceUrl && /\.pdf(?:$|[?#])/i.test(item.sourceUrl)) return { kind: 'card' };
    return item.sourceUrl ? { kind: 'reader' } : { kind: 'card' };
  }
  if (item.kind !== 'file') return { kind: 'card' };

  const mime = (item.fileMime ?? '').toLowerCase();
  const ext = extensionOf(item.fileName);
  if (mime === 'application/pdf' || ext === 'pdf') return { kind: 'pdf' };
  if (mime.startsWith('image/')) return { kind: 'image' };
  if (mime.startsWith('video/')) return { kind: 'video' };
  if (mime.startsWith('audio/')) return { kind: 'audio' };
  if (mime === 'text/plain' || mime === 'text/markdown' || mime === 'text/csv' || TEXT_EXTENSIONS.has(ext)) {
    return { kind: 'text' };
  }
  return { kind: 'card' };
}
