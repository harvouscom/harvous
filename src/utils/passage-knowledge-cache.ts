/**
 * Client cache for per-user passage knowledge (themes/people/places per cited verse), fetched
 * from GET /api/scripture/passage-knowledge.
 *
 * Stored in localStorage so reads are SYNCHRONOUS — the folder/tag suggesters are synchronous and
 * native-mirrored, so they must not become async or hit the network. The payload is tiny (a few
 * KB; bounded by the user's distinct references), well within localStorage limits. The SPA layer
 * does the authenticated fetch and calls `setCachedPassageKnowledge`; the suggesters read via
 * `getCachedPassageKnowledge`. See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md (Phase 2 / Option B).
 */

export interface PassageKnowledgeEntry {
  themes: string[];
  people: string[];
  places: string[];
}

/** Keyed by "book|chapter|verse" (canonical book names, matching ScriptureMetadata). */
export type PassageKnowledgeMap = Record<string, PassageKnowledgeEntry>;

const STORAGE_KEY = 'harvous:passage-knowledge:v1';
const MAX_BYTES = 2_000_000; // ~2 MB guard; real payloads are far smaller

let memo: PassageKnowledgeMap | null = null;

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Synchronous read of the cached map (empty object if absent/unavailable). */
export function getCachedPassageKnowledge(): PassageKnowledgeMap {
  if (memo) return memo;
  const ls = safeLocalStorage();
  if (!ls) return (memo = {});
  try {
    const raw = ls.getItem(STORAGE_KEY);
    memo = raw ? ((JSON.parse(raw)?.passages ?? {}) as PassageKnowledgeMap) : {};
  } catch {
    memo = {};
  }
  return memo;
}

export function setCachedPassageKnowledge(passages: PassageKnowledgeMap): void {
  memo = passages;
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    const serialized = JSON.stringify({ updatedAt: Date.now(), passages });
    if (serialized.length <= MAX_BYTES) ls.setItem(STORAGE_KEY, serialized);
  } catch {
    /* quota exceeded or storage disabled — keep the in-memory copy */
  }
}

export function clearPassageKnowledgeCache(): void {
  memo = null;
  const ls = safeLocalStorage();
  try {
    ls?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
