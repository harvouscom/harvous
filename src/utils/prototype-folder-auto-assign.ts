/**
 * Prototype primary-folder assignment — full title+body after edit idle.
 * Typing and paste share this path so the same final content yields the same folder.
 */

import {
  applyAutoCollectionAfterEdit,
  type CollectionChromeState,
} from '@/utils/bible-study-collection-web';
import { stripHtml } from '@/utils/html-stripper';
import { isEffectivelyEmptyPrototypeNote } from '@/utils/prototype-note-empty';
import { getCachedPassageKnowledge } from '@/utils/passage-knowledge-cache';
import { passageCandidatesFromText } from '@/utils/passage-tag-candidates';

const MAX_PASSAGE_SECONDARIES = 3;

/**
 * Add passage-derived people/places (from the cached per-user knowledge) as secondary
 * collections — additive and deduped, never touching the primary. Web-only (the native folder
 * suggester is mirrored separately); a cache miss is a no-op, so notes whose passages aren't
 * cached yet fall back cleanly. See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md (Phase 2 / Option B).
 */
function withPassageSecondaries(
  chrome: CollectionChromeState,
  title: string,
  bodyHtml: string,
): CollectionChromeState {
  const candidates = passageCandidatesFromText(
    `${title}\n${plainBodyForFolderSnapshot(bodyHtml)}`,
    getCachedPassageKnowledge(),
  );
  if (!candidates.length) return chrome;

  const primaryLow = (chrome.primaryCollection ?? '').trim().toLowerCase();
  const present = new Set(chrome.secondaryCollections.map((s) => s.trim().toLowerCase()));
  const additions: string[] = [];
  for (const c of candidates) {
    const low = c.keyword.toLowerCase();
    if (!low || low === primaryLow || present.has(low)) continue;
    additions.push(c.keyword);
    present.add(low);
    if (additions.length >= MAX_PASSAGE_SECONDARIES) break;
  }
  return additions.length
    ? { ...chrome, secondaryCollections: [...chrome.secondaryCollections, ...additions] }
    : chrome;
}

/** Plain body for folder snapshots — matches `buildRowsForCollectionSuggest` stripping. */
export function plainBodyForFolderSnapshot(html: string): string {
  return stripHtml(html || '', { preserveSpacing: true }).trim();
}

/** Body text is required for auto primary folder assignment. */
export function hasAutoFolderBodyContent(bodyHtml: string): boolean {
  return plainBodyForFolderSnapshot(bodyHtml).length > 0;
}

/** Clear auto-assigned folder chrome; pinned primary is preserved. */
export function clearAutoFolderChrome(prev: CollectionChromeState): CollectionChromeState {
  if (prev.collectionUserOverride && !prev.collectionPinned) return prev;
  if (prev.collectionPinned) {
    return {
      ...prev,
      secondaryCollections: [],
    };
  }
  return {
    ...prev,
    primaryCollection: null,
    secondaryCollections: [],
    collectionLastAutoUpdatedAtIso: null,
  };
}

/**
 * Full title+body folder assignment (400ms live chip + 700ms autosave).
 * Body text required; title alone does not assign a primary folder.
 */
export function applyIdleFolderAutoAssign(
  prev: CollectionChromeState,
  title: string,
  bodyHtml: string,
  now: Date,
  allowPrimaryUpdate = true,
): CollectionChromeState {
  if (prev.collectionUserOverride && !prev.collectionPinned) return prev;

  if (isEffectivelyEmptyPrototypeNote(title, bodyHtml) || !hasAutoFolderBodyContent(bodyHtml)) {
    return clearAutoFolderChrome(prev);
  }

  return withPassageSecondaries(
    applyAutoCollectionAfterEdit(prev, title, bodyHtml, now, { allowPrimaryUpdate }),
    title,
    bodyHtml,
  );
}

/** True when note-open auto folder should run (saved notes with body text). */
export function noteHasFolderSuggestContent(_title: string, bodyHtml: string): boolean {
  return hasAutoFolderBodyContent(bodyHtml);
}
