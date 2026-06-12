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

  return applyAutoCollectionAfterEdit(prev, title, bodyHtml, now, { allowPrimaryUpdate });
}

/** True when note-open auto folder should run (saved notes with body text). */
export function noteHasFolderSuggestContent(_title: string, bodyHtml: string): boolean {
  return hasAutoFolderBodyContent(bodyHtml);
}
