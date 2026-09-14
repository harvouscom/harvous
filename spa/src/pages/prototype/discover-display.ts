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

/**
 * The generated background art a card without a picture of its own wears —
 * `DOCUMENT_ART` in harvous.com's `discover-data.ts`, same four images the
 * site's own auth-hero background already uses. Hotlinked rather than
 * mirrored: these are already public and stable, and nothing on this page
 * persists the URL anywhere a later site reshuffle would corrupt — unlike
 * `LibraryItems.sourceImage`, which deliberately never points here.
 */
const DISCOVER_DOCUMENT_ART = [
  'https://harvous.com/images/auth-hero/ai_bg_046.webp',
  'https://harvous.com/images/auth-hero/ai_bg_059.webp',
  'https://harvous.com/images/auth-hero/ai_bg_072.webp',
  'https://harvous.com/images/auth-hero/ai_bg_077.webp',
];

/** Site's own slug hash (`discoverDocumentArt` / `discoverArtPosition`), factored out here only
 *  because both read it — the site computes it fresh in each function instead. */
function discoverArtHash(slug: string | null | undefined): number {
  let h = 0;
  const s = slug ?? '';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic per slug, so a listing wears the same art on both products. */
export function discoverDocumentArt(slug: string | null | undefined): string {
  return DISCOVER_DOCUMENT_ART[discoverArtHash(slug) % DISCOVER_DOCUMENT_ART.length];
}

/** Where the art is cropped — deterministic per slug, matching the site's own, so two cards
 *  under the same picture are not the same crop twice and a listing crops the same way here as
 *  there. */
export function discoverArtPosition(slug: string | null | undefined): string {
  const h = discoverArtHash(slug);
  const x = [12, 30, 50, 70, 88][h % 5];
  const y = [22, 42, 58, 78][(h >> 3) % 4];
  return `${x}% ${y}%`;
}
