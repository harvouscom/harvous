/**
 * What a pasted link is, fetched once and remembered.
 *
 * The hover card used to own this. Moving it out is what lets the editor warm a link the
 * moment it is pasted, so the first hover shows the page rather than "Loading preview…" —
 * the round trip happens while you are still typing, which is the only time it is free.
 *
 * Backed by sessionStorage as well as memory. Per-page-load caching meant every reload paid
 * for every link again, and a note full of references is exactly where that is most visible.
 * Session-scoped rather than permanent on purpose: a page's title is not ours to hold onto
 * indefinitely, and a stale one is worse than a re-fetch nobody waits for.
 */

const STORAGE_KEY = 'harvous.linkMetadata.v1';
/** Enough for a long note's worth of links; beyond that the oldest are dropped. */
const MAX_ENTRIES = 120;

export interface LinkMetadata {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

const memory = new Map<string, LinkMetadata>();
const inflight = new Map<string, Promise<LinkMetadata | null>>();
let hydrated = false;

function hydrate(): void {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, LinkMetadata>;
    if (!parsed || typeof parsed !== 'object') return;
    for (const [url, meta] of Object.entries(parsed)) {
      if (meta && typeof meta === 'object') memory.set(url, meta);
    }
  } catch {
    // Unreadable cache is an empty cache. Nothing here is worth failing a paste over.
  }
}

function persist(): void {
  if (typeof window === 'undefined') return;
  try {
    // Map preserves insertion order, so the tail is the most recently learned.
    const entries = [...memory.entries()].slice(-MAX_ENTRIES);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Quota or disabled storage — the in-memory half still works for this page.
  }
}

/** What is already known about this link, without asking for it. */
export function peekLinkMetadata(url: string): LinkMetadata | null {
  hydrate();
  return memory.get(url) ?? null;
}

/**
 * Resolve a link's metadata, at most once per URL per session.
 *
 * Reuses `POST /api/resource/metadata`, which the Resource Library already relies on — it is
 * authenticated, rate limited, and validates the URL against private and loopback addresses
 * before fetching anything (see `validateResourceUrl`). A second scraper would have meant a
 * second place to get that wrong.
 */
export function fetchLinkMetadata(url: string): Promise<LinkMetadata | null> {
  hydrate();
  const cached = memory.get(url);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(url);
  if (pending) return pending;

  const request = fetch('/api/resource/metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ url }),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const m = data?.metadata;
      if (!m) return null;
      const meta: LinkMetadata = {
        title: m.title || null,
        description: m.description || null,
        image: m.image || null,
        siteName: m.siteName || null,
      };
      memory.set(url, meta);
      persist();
      return meta;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, request);
  return request;
}

/**
 * Warm a link without caring about the answer.
 *
 * For the paste path: the point is that the cache is full by the time anyone hovers, and a
 * link that cannot be resolved simply stays as it is.
 */
export function prefetchLinkMetadata(url: string): void {
  if (!url) return;
  void fetchLinkMetadata(url);
}
