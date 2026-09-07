/**
 * Discover categories — the closed vocabulary a listing can be filed under.
 *
 * One category per listing, and **the reviewer sets it, not the submitter**:
 * filing is a curator's job, and asking someone to do it while they are giving
 * something away is asking them to guess at a taxonomy they cannot see.
 *
 * The ids deliberately match the use-case slugs on harvous.com
 * (`src/lib/use-cases-data.ts`), so `/use-cases/sermon-notes/` can link straight
 * to `/discover/?topic=sermon-notes` with no mapping table on either side, and
 * the site borrows each topic's glyph from its use-case page. Adding an
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
  /**
   * The topic's hue, as a thread-colour name.
   *
   * Templates carry a colour their author picked; nothing else in the catalog
   * does, and a note or a Thread still has to be drawn. This is what it is
   * drawn in — so a tile always means something: *the author chose this* for a
   * template, *this is what it is for* otherwise. Never the reader's appearance
   * setting: the site is built statically with no viewer, so the two products
   * would disagree for every reader and "the green one" would stop naming
   * anything.
   *
   * Reference is **grey**: it is the shelf you keep things on rather than a kind
   * of study, and it holds the links, which are grey for the same reason — a
   * pointer is not somebody's work. That frees pink to sit alone on Sermon prep.
   *
   * The rest share **five** hues, and yellow is deliberately not among them.
   * It is the one thread colour with no paired appearance preset, so
   * `spaceIconAccentHex` falls through to the raw `--color-yellow` and the app
   * draws it a good deal more saturated than the five pastels beside it — while
   * harvous.com maps it to soft cream. Same name, two visibly different tiles.
   * An author picking yellow for their own template still gets it; a topic
   * colour is ours to choose, so it chooses one that reads the same in both.
   *
   * No two neighbours in this list repeat, and the four hues that do pair
   * related work — a sermon heard with a class prepared, the desk work with the
   * shelf you keep nearby, the daily rhythm with the theme followed across
   * months, and a book worked through with a group working through one.
   */
  color: 'blue' | 'orange' | 'pink' | 'purple' | 'green' | 'gray';
}

export const DISCOVER_CATEGORIES: readonly DiscoverCategory[] = [
  {
    id: 'daily-journal',
    label: 'Daily journal',
    blurb: 'For keeping a regular reading rhythm.',
    color: 'blue',
  },
  {
    id: 'sermon-notes',
    label: 'Sermon notes',
    blurb: 'For writing down what you heard on Sunday.',
    color: 'orange',
  },
  {
    id: 'sermon-prep',
    label: 'Sermon prep',
    blurb: 'For the week of work before you preach.',
    color: 'pink',
  },
  {
    id: 'book-study',
    label: 'Book study',
    blurb: 'Working through one book of the Bible.',
    color: 'green',
  },
  {
    id: 'topical-study',
    label: 'Topical study',
    blurb: 'Following a theme across the whole Bible.',
    color: 'blue',
  },
  {
    id: 'deep-study',
    label: 'Deep study',
    blurb: 'Longer, slower work on a single passage.',
    color: 'purple',
  },
  {
    id: 'small-group',
    label: 'Small group',
    blurb: 'For studying together and coming back with something.',
    color: 'green',
  },
  {
    id: 'teaching-prep',
    label: 'Teaching prep',
    blurb: 'Preparing to teach a class, a group, or a family.',
    color: 'orange',
  },
  {
    id: 'reference',
    label: 'Reference',
    blurb: 'Things to keep nearby rather than work through.',
    color: 'gray',
  },
] as const;

const CATEGORY_IDS = new Set(DISCOVER_CATEGORIES.map((category) => category.id));

export function isDiscoverCategory(value: unknown): value is string {
  return typeof value === 'string' && CATEGORY_IDS.has(value);
}

export function getDiscoverCategory(id: string): DiscoverCategory | undefined {
  return DISCOVER_CATEGORIES.find((category) => category.id === id);
}

/** The topic's hue for a stored id; null for one that has no category. */
export function discoverCategoryColor(id: string | null | undefined): string | null {
  if (!id) return null;
  return getDiscoverCategory(id)?.color ?? null;
}

/** Label for a stored id, falling back to the raw id so a retired one still renders. */
export function discoverCategoryLabel(id: string | null | undefined): string {
  if (!id) return 'Uncategorized';
  return getDiscoverCategory(id)?.label ?? id;
}
