import {
  normalizePrototypeApiSpaceId,
  toPrototypeSpaceSearchParam,
} from './utils/prototype-space-api-id';

/**
 * Default TanStack search decode coerces bare digits to numbers (bad for space ids)
 * and stringify JSON-quotes numeric-looking strings (`space=%221785%22`).
 * Keep flat string params bare and un-coerced; still JSON-encode objects/arrays.
 */
export function parsePrototypeSearch(searchStr: string): Record<string, unknown> {
  const raw = searchStr.startsWith('?') ? searchStr.slice(1) : searchStr;
  const params = new URLSearchParams(raw);
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, value] of params.entries()) {
    if (value === 'true') {
      result[key] = true;
      continue;
    }
    if (value === 'false') {
      result[key] = false;
      continue;
    }
    if (
      (value.startsWith('{') && value.endsWith('}')) ||
      (value.startsWith('[') && value.endsWith(']')) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      try {
        result[key] = JSON.parse(value);
        continue;
      } catch {
        /* keep string */
      }
    }
    result[key] = value;
  }
  return result;
}

export type PrototypeNoteSearch = {
  studyThread?: string;
  reference?: string;
  scriptureRef?: string;
  scriptureTranslation?: string;
  highlight?: string;
  /**
   * `'1'` when the highlight was opened by an "Add a thought" suggestion rather than a
   * "revisit" one — the dock opens with its note field focused. Two different asks that
   * would otherwise issue byte-identical navigations.
   */
  annotate?: string;
  /** Resource Library item id — opens a collapsed-only resource chip in the study dock. */
  libItem?: string;
  dockReq?: string;
  crossRefTarget?: string;
  /** Bare space id in the URL (`?space=1785…`); normalize with {@link normalizePrototypeApiSpaceId} for APIs. */
  space?: string;
};

export function legacySpaceNoteRedirectSearch(
  search: PrototypeNoteSearch,
  spaceId: string,
): PrototypeNoteSearch {
  return {
    ...search,
    space: toPrototypeSpaceSearchParam(normalizePrototypeApiSpaceId(spaceId)),
  };
}
