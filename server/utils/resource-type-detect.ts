/**
 * A library item's type, worked out on the server where the most is known.
 *
 * In order of how sure each answer is:
 *   1. The item came from Discover's curated catalog — that listing's own type, exactly.
 *   2. The page describes a video (`VideoObject` / `og:video`) — a video. This is what makes a
 *      BibleProject link a video and not an article: nothing in its URL says so.
 *   3. The shared format/URL rules (`inferResourceType`).
 */
import { CURATED_RESOURCES } from '@/data/curated-resources';
import { inferResourceType, isResourceType, type ResourceType } from '@/utils/resource-type';
import { extractResourceVideo } from './resource-video';

/** Scheme, `www.` and trailing slash differences are not different resources. */
function urlKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.hostname.replace(/^www\./, '').toLowerCase()}${url.pathname.replace(/\/+$/, '')}${url.search}`;
  } catch {
    return null;
  }
}

const CURATED_BY_URL = new Map<string, ResourceType>(
  CURATED_RESOURCES.flatMap((r) => {
    const key = urlKey(r.source.url);
    return key ? [[key, r.resourceType] as const] : [];
  }),
);

export function curatedResourceType(sourceUrl: string | null | undefined): ResourceType | null {
  const key = urlKey(sourceUrl);
  return key ? (CURATED_BY_URL.get(key) ?? null) : null;
}

export function detectResourceType(
  item: { kind: string; sourceUrl?: string | null; fileMime?: string | null; fileName?: string | null },
  page?: { html: string; url: string } | null,
): ResourceType {
  if (item.kind === 'link') {
    const curated = curatedResourceType(item.sourceUrl);
    if (curated) return curated;
    if (page && extractResourceVideo(page.html, page.url)) return 'video';
  }
  return inferResourceType(item);
}

/**
 * The type a new row is saved with: what the person picked when it is one of the six, else
 * what detection says. Every insert goes through this so no path saves an untyped row.
 */
export function chosenOrDetectedResourceType(
  chosen: unknown,
  item: { kind: string; sourceUrl?: string | null; fileMime?: string | null; fileName?: string | null },
): ResourceType {
  return isResourceType(chosen) ? chosen : detectResourceType(item);
}
