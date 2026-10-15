/**
 * What a library resource *is*, in Discover's words — video, article, book, tool, guide,
 * series (`CuratedResourceType`) — guessed from what can be read off the item itself.
 *
 * Shared by the server (a default at save, the backfill) and the SPA (an item saved before
 * types existed, until the backfill reaches it). Deliberately without the curated catalog:
 * that is 27 KB the client would carry to every row, and the server checks it first anyway
 * (`server/utils/resource-type-detect.ts`).
 *
 * A guess, and said to be one: the add form pre-fills it and the person can change it. The
 * rules only reach for a type when the URL or the file says so plainly; everything else is an
 * article, which is what most saved pages are.
 */
import type { CuratedResourceType } from '../data/curated-resources';

export type ResourceType = CuratedResourceType;

export const RESOURCE_TYPES: readonly ResourceType[] = ['video', 'article', 'book', 'tool', 'guide', 'series'];

export function isResourceType(value: unknown): value is ResourceType {
  return typeof value === 'string' && (RESOURCE_TYPES as readonly string[]).includes(value);
}

type TypeableItem = {
  kind: string;
  sourceUrl?: string | null;
  fileMime?: string | null;
  fileName?: string | null;
};

const VIDEO_HOSTS = new Set(['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'vimeo.com', 'player.vimeo.com']);

/** Reference sites: you look something up in them and put them back down. */
const TOOL_HOSTS = new Set([
  'blueletterbible.org',
  'biblegateway.com',
  'biblehub.com',
  'stepbible.org',
  'openbible.info',
  'biblestudytools.com',
  'studylight.org',
  'biblia.com',
  'esv.org',
  'netbible.org',
  'bible.com',
  'logos.com',
]);

/** Libraries of full-length works. */
const BOOK_HOSTS = new Set(['ccel.org', 'gutenberg.org', 'archive.org', 'standardebooks.org']);

const SERIES_PATH = /\/(courses?|series|class(es)?|curriculum|reading-plans?|plans?)(\/|$)/i;
const BOOK_PATH = /\/(books?|commentar(y|ies))(\/|$)|\.epub$/i;

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
}

export function inferResourceType(item: TypeableItem): ResourceType {
  if (item.kind === 'file') {
    const mime = (item.fileMime ?? '').toLowerCase();
    const name = (item.fileName ?? '').toLowerCase();
    if (mime.startsWith('video/')) return 'video';
    if (mime === 'application/epub+zip' || name.endsWith('.epub')) return 'book';
    return 'article';
  }

  let url: URL;
  try {
    url = new URL(item.sourceUrl ?? '');
  } catch {
    return 'article';
  }
  const host = hostOf(url);
  const path = url.pathname.replace(/\/+$/, '');

  if (VIDEO_HOSTS.has(host)) return 'video';
  /* A show is a run of episodes; one episode is a thing you listen to once. */
  if (host === 'open.spotify.com') return /\/(show|playlist)\//.test(url.pathname) ? 'series' : 'article';
  if (host === 'harvous.com') return 'guide';
  if (SERIES_PATH.test(path)) return 'series';
  if (BOOK_HOSTS.has(host) || BOOK_PATH.test(path)) return 'book';
  if (TOOL_HOSTS.has(host)) return 'tool';
  /* A whole site rather than a page on it — a home page is somewhere you go to look things up. */
  if (path === '') return 'tool';
  return 'article';
}

/** The type to show and filter by: the one chosen or detected, else the rules' guess. */
export function effectiveResourceType(item: TypeableItem & { resourceType?: string | null }): ResourceType {
  return isResourceType(item.resourceType) ? item.resourceType : inferResourceType(item);
}
