/**
 * Discover categories — the closed vocabulary a listing can be filed under.
 *
 * One category per listing, and **the reviewer sets it, not the submitter**:
 * filing is a curator's job, and asking someone to do it while they are giving
 * something away is asking them to guess at a taxonomy they cannot see.
 *
 * The ids deliberately match the use-case slugs on harvous.com
 * (`src/lib/use-cases-data.ts`), so `/use-cases/sermon-notes/` can link straight
 * to `/discover/sermon-notes/` with no mapping table on either side. Adding an
 * id here that has no use-case page is fine; renaming one that does is not —
 * ids are URL identity on the marketing site.
 *
 * Lives in `src/data/` rather than `server/` because the `@/` alias reaches it
 * from `server/` and `spa/` both, and the build-time export hands the same list
 * to the static site. One source of truth, three consumers.
 */

export interface DiscoverCategory {
  id: string;
  label: string;
  /** One line, shown under the heading on a category page. */
  blurb: string;
}

export const DISCOVER_CATEGORIES: readonly DiscoverCategory[] = [
  {
    id: 'daily-journal',
    label: 'Daily journal',
    blurb: 'For keeping a regular reading rhythm.',
  },
  {
    id: 'sermon-notes',
    label: 'Sermon notes',
    blurb: 'For writing down what you heard on Sunday.',
  },
  {
    id: 'sermon-prep',
    label: 'Sermon prep',
    blurb: 'For the week of work before you preach.',
  },
  {
    id: 'book-study',
    label: 'Book study',
    blurb: 'Working through one book of the Bible.',
  },
  {
    id: 'topical-study',
    label: 'Topical study',
    blurb: 'Following a theme across the whole Bible.',
  },
  {
    id: 'deep-study',
    label: 'Deep study',
    blurb: 'Longer, slower work on a single passage.',
  },
  {
    id: 'small-group',
    label: 'Small group',
    blurb: 'For studying together and coming back with something.',
  },
  {
    id: 'teaching-prep',
    label: 'Teaching prep',
    blurb: 'Preparing to teach a class, a group, or a family.',
  },
  {
    id: 'reference',
    label: 'Reference',
    blurb: 'Things to keep nearby rather than work through.',
  },
] as const;

const CATEGORY_IDS = new Set(DISCOVER_CATEGORIES.map((category) => category.id));

export function isDiscoverCategory(value: unknown): value is string {
  return typeof value === 'string' && CATEGORY_IDS.has(value);
}

export function getDiscoverCategory(id: string): DiscoverCategory | undefined {
  return DISCOVER_CATEGORIES.find((category) => category.id === id);
}

/** Label for a stored id, falling back to the raw id so a retired one still renders. */
export function discoverCategoryLabel(id: string | null | undefined): string {
  if (!id) return 'Uncategorized';
  return getDiscoverCategory(id)?.label ?? id;
}
