/**
 * How a resource's type looks in the library: its word, its glyph, and the order the filter
 * and the "Type" sort list them in.
 *
 * The words and glyphs are Discover's (`discover-display.ts`), so a BibleProject video wears
 * the same play glyph in your library that it wore in the catalog you saved it from. Discover
 * gives article and guide none — "they are pages you read, which is what the newspaper already
 * says" — and the library keeps that.
 */
import type { IconName } from '@/components/react/Icon';
import { effectiveResourceType, RESOURCE_TYPES, type ResourceType } from '@/utils/resource-type';
import { DISCOVER_RESOURCE_TYPE_ICON, DISCOVER_RESOURCE_TYPE_NOUN } from '../discover-display';

export type { ResourceType };
export { RESOURCE_TYPES, effectiveResourceType };

export function resourceTypeNoun(type: ResourceType): string {
  return DISCOVER_RESOURCE_TYPE_NOUN[type];
}

export function resourceTypeIcon(type: ResourceType): IconName {
  return DISCOVER_RESOURCE_TYPE_ICON[type] ?? 'newspaper';
}

export type ResourceSort = 'recent' | 'oldest' | 'title' | 'type';

export const RESOURCE_SORT_OPTIONS: { value: ResourceSort; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'title', label: 'A–Z' },
  { value: 'type', label: 'Type' },
];

type Sortable = {
  title: string;
  kind: string;
  sourceUrl?: string | null;
  fileMime?: string | null;
  fileName?: string | null;
  resourceType?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

const at = (value: string | Date | null | undefined) => (value ? new Date(value).getTime() || 0 : 0);
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/**
 * One ordering for every shelf, so "A–Z" means the same thing on My Library, the church's and
 * a room's. Recent is what the list always did: last touched first.
 */
export function compareResources(sort: ResourceSort) {
  return (a: Sortable, b: Sortable): number => {
    switch (sort) {
      case 'oldest':
        return at(a.createdAt) - at(b.createdAt);
      case 'title':
        return collator.compare(a.title, b.title);
      case 'type': {
        const byType =
          RESOURCE_TYPES.indexOf(effectiveResourceType(a)) - RESOURCE_TYPES.indexOf(effectiveResourceType(b));
        return byType || collator.compare(a.title, b.title);
      }
      case 'recent':
      default:
        return at(b.updatedAt ?? b.createdAt) - at(a.updatedAt ?? a.createdAt);
    }
  };
}
