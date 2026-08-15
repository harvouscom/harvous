/**
 * Reading preferences for the Bible reader — text size, leading, verse numbers.
 *
 * Mirrors the appearance module's shape (localStorage + a `useSyncExternalStore`
 * subscription + an apply step that writes CSS vars) rather than inventing a second
 * settings mechanism. The vars it writes are the ones the reader's type role already
 * reads, so changing a preference re-points a variable instead of re-rendering the
 * chapter.
 *
 * Persistence is local for now. These belong on `UserMetadata.appearanceSettings` so a
 * reader's chosen size follows them across devices, the way canvas + colour scheme already
 * do; that is a follow-up, not a different design.
 */

/**
 * Steps centre on the size the reader actually wants by default, with one step either
 * side. The scale used to start at 17 and climb to 24, which made the comfortable size
 * the *smallest* option — so the default read as "you are already zoomed out".
 *
 * Web-only for now: `ReaderTextSize` in HarvousTypography.swift still carries the older
 * four-step scale. Reconcile when native picks up the reader.
 */
export type ReaderTextSize = 'small' | 'medium' | 'large';

export const READER_TEXT_SIZES: readonly { id: ReaderTextSize; label: string; px: number; lineHeight: number }[] = [
  { id: 'small', label: 'S', px: 15, lineHeight: 1.75 },
  { id: 'medium', label: 'M', px: 17, lineHeight: 1.75 },
  { id: 'large', label: 'L', px: 19, lineHeight: 1.7 },
];

/**
 * How verses are set on the page.
 *
 * `prose` is the default because it is how a Bible actually reads — verses run together
 * into paragraphs and the numbers are locators inside the flow. One-verse-per-line is a
 * study layout: easy to scan and annotate, but it turns narrative into a list.
 */
export type ReaderVerseLayout = 'prose' | 'lines';

export interface ReadingPrefs {
  textSize: ReaderTextSize;
  /** Verse numbers are a locator; some readers want the prose uninterrupted. */
  showVerseNumbers: boolean;
  verseLayout: ReaderVerseLayout;
  /**
   * Bars in the gutter marking verses your notes cover. On by default — a chapter you have
   * written about should say so — but a reader who wants only Scripture can put them away.
   */
  showMarginNotes: boolean;
}

const STORAGE_KEY = 'harvous-proto-reading-prefs';

/**
 * Bumped when a stored value changes meaning rather than shape.
 *
 * v1 ran small=17 / medium=19 / large=21 / xlarge=24. v2 recentres on the comfortable
 * size: small=15 / medium=17 / large=19. The *names* survived but the sizes moved, so a
 * v1 reader who chose "small" would silently drop from 17px to 15px — the preference
 * would look untouched while the page got smaller. Migrating by point size keeps the size
 * they actually picked.
 */
const PREFS_VERSION = 2;

const V1_POINT_SIZES: Record<string, number> = { small: 17, medium: 19, large: 21, xlarge: 24 };

function migrateV1TextSize(stored: unknown): ReaderTextSize {
  const px = typeof stored === 'string' ? V1_POINT_SIZES[stored] : undefined;
  if (px == null) return DEFAULT_READING_PREFS.textSize;
  // Nearest surviving step, so 21 and 24 both land on the largest we still offer.
  let best = READER_TEXT_SIZES[0];
  for (const step of READER_TEXT_SIZES) {
    if (Math.abs(step.px - px) < Math.abs(best.px - px)) best = step;
  }
  return best.id;
}

export const DEFAULT_READING_PREFS: ReadingPrefs = {
  textSize: 'medium',
  showVerseNumbers: true,
  verseLayout: 'prose',
  showMarginNotes: true,
};

function isTextSize(value: unknown): value is ReaderTextSize {
  return READER_TEXT_SIZES.some((s) => s.id === value);
}

function isVerseLayout(value: unknown): value is ReaderVerseLayout {
  return value === 'prose' || value === 'lines';
}

export function readReadingPrefs(): ReadingPrefs {
  if (typeof window === 'undefined') return DEFAULT_READING_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_READING_PREFS;
    const parsed = JSON.parse(raw) as (Partial<ReadingPrefs> & { version?: number }) | null;
    const isLegacy = (parsed?.version ?? 1) < PREFS_VERSION;
    return {
      textSize: isLegacy
        ? migrateV1TextSize(parsed?.textSize)
        : isTextSize(parsed?.textSize)
          ? parsed.textSize
          : DEFAULT_READING_PREFS.textSize,
      showVerseNumbers:
        typeof parsed?.showVerseNumbers === 'boolean'
          ? parsed.showVerseNumbers
          : DEFAULT_READING_PREFS.showVerseNumbers,
      verseLayout: isVerseLayout(parsed?.verseLayout)
        ? parsed.verseLayout
        : DEFAULT_READING_PREFS.verseLayout,
      /*
       * No version bump for this field. Each key falls back independently, so a stored v2
       * blob written before it existed simply lands on the default — while bumping the
       * version would re-run the v1 text-size migration over already-migrated values.
       */
      showMarginNotes:
        typeof parsed?.showMarginNotes === 'boolean'
          ? parsed.showMarginNotes
          : DEFAULT_READING_PREFS.showMarginNotes,
    };
  } catch {
    return DEFAULT_READING_PREFS;
  }
}

/** Writes the two vars `.pds-reader-text` reads. Idempotent; safe to call on every change. */
export function applyReadingPrefs(prefs: ReadingPrefs): void {
  if (typeof document === 'undefined') return;
  const step = READER_TEXT_SIZES.find((s) => s.id === prefs.textSize) ?? READER_TEXT_SIZES[1];
  const root = document.documentElement;
  root.style.setProperty('--pds-reader-font-size', `${step.px}px`);
  root.style.setProperty('--pds-reader-line-height', String(step.lineHeight));
  root.classList.toggle('harvous-reader-hide-verse-nums', !prefs.showVerseNumbers);
}

const listeners = new Set<() => void>();

export function subscribeReadingPrefs(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

let snapshot: ReadingPrefs | null = null;

export function getReadingPrefsSnapshot(): ReadingPrefs {
  // Cached so `useSyncExternalStore` gets a stable reference between writes; returning a
  // fresh object each call makes React think the store changed on every render.
  if (!snapshot) snapshot = readReadingPrefs();
  return snapshot;
}

export function getReadingPrefsServerSnapshot(): ReadingPrefs {
  return DEFAULT_READING_PREFS;
}

export function writeReadingPrefs(next: ReadingPrefs): void {
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, version: PREFS_VERSION }));
  } catch {
    /* quota / storage disabled — the preference still applies for this session */
  }
  applyReadingPrefs(next);
  listeners.forEach((fn) => fn());
}
