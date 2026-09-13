/**
 * How Discover draws a topic and a curated resource — in step with harvous.com.
 *
 * The catalog is one list on two surfaces: this panel, and harvous.com/discover. A topic that
 * wears a church on the site and a folder here, or a lexicon labelled "Tool" there and
 * "Resource" here, is the same list telling two stories. So the glyphs and nouns below are the
 * site's, not picked afresh:
 *
 *  - topic glyphs: `discoverTopicIcon` in harvous.com's `src/lib/discover-data.ts`, which takes
 *    each topic's icon from its use-case page (`src/lib/use-cases-data.ts`) and gives the two
 *    topics with no use-case page their own;
 *  - resource types: `DISCOVER_RESOURCE_TYPE_NOUN` and `RESOURCE_TYPE_ICON`, same file.
 *
 * Copied rather than imported, because the site is another repo. Change one side, change the
 * other — the ids themselves are shared (`src/data/discover-categories.ts`), so a topic added
 * there without a glyph here fails `discover-display.test.ts` rather than quietly drawing the
 * fallback.
 */
import type { IconName } from '@/components/react/Icon';
import type { CuratedResourceType } from '@/data/curated-resources';

export const DISCOVER_TOPIC_ICON: Record<string, IconName> = {
  'daily-journal': 'book-open-reader',
  'sermon-notes': 'church',
  'sermon-prep': 'pen-to-square',
  'book-study': 'magnifying-glass',
  'topical-study': 'tags',
  'deep-study': 'glasses',
  'small-group': 'user-group',
  /* The two with no use-case page — the site's `TOPIC_ICON_FALLBACK`. */
  'teaching-prep': 'chalkboard-user',
  reference: 'bookmark',
};

/** A topic's glyph, with the site's own fallback for one it has none for. */
export function discoverTopicIcon(id: string): IconName {
  return DISCOVER_TOPIC_ICON[id] ?? 'layer-group';
}

export const DISCOVER_RESOURCE_TYPE_NOUN: Record<CuratedResourceType, string> = {
  video: 'Video',
  article: 'Article',
  book: 'Book',
  tool: 'Tool',
  guide: 'Guide',
  series: 'Series',
};

/**
 * The glyph a resource type wears in place of the newspaper every link otherwise does.
 *
 * Article and guide have none on the site either — they are pages you read, which is what the
 * newspaper already says.
 */
export const DISCOVER_RESOURCE_TYPE_ICON: Partial<Record<CuratedResourceType, IconName>> = {
  video: 'play',
  /* A lexicon or an index — something you look something up in. */
  tool: 'magnifying-glass',
  /* A full-length work; not `book`, which a scripture note already wears. */
  book: 'book-open',
  /* A curriculum worked through over weeks — a stack, not a page. */
  series: 'layer-group',
};
