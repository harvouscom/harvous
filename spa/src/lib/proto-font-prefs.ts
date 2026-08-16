/**
 * Reading typeface — the face the Bible reader sets Scripture in.
 *
 * Reading only, deliberately. Notes are written in the app's own voice and sit among app
 * chrome, so a second face there mostly fights the interface; sustained reading is the case
 * where a serif, or a dyslexia-friendly face, genuinely changes how well the page works.
 *
 * Follows the appearance module's shape (localStorage + subscription + an apply step that
 * writes a CSS var) rather than inventing a second settings mechanism. Lives beside
 * appearance because that is where a reader looks for "how the app looks".
 */

export type FontChoice = 'sans' | 'serif' | 'hand' | 'dyslexic';

export interface FontPrefs {
  reading: FontChoice;
}

/**
 * Each choice is a full stack, so a missing webfont degrades to something of the same
 * character rather than to the sans default — a serif reader who has not downloaded Neuton
 * still gets a serif.
 */
export const FONT_STACKS: Record<FontChoice, string> = {
  sans: 'var(--pds-font-choice-sans)',
  serif: 'var(--pds-font-choice-serif)',
  hand: 'var(--pds-font-choice-hand)',
  dyslexic: 'var(--pds-font-choice-dyslexic)',
};

export const FONT_CHOICES: readonly { id: FontChoice; label: string }[] = [
  { id: 'sans', label: 'Sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'hand', label: 'Hand' },
  { id: 'dyslexic', label: 'Dyslexic' },
];

const STORAGE_KEY = 'harvous-proto-font-prefs';

export const DEFAULT_FONT_PREFS: FontPrefs = { reading: 'sans' };

function isChoice(value: unknown): value is FontChoice {
  return FONT_CHOICES.some((c) => c.id === value);
}

export function readFontPrefs(): FontPrefs {
  if (typeof window === 'undefined') return DEFAULT_FONT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FONT_PREFS;
    const parsed = JSON.parse(raw) as Partial<FontPrefs> | null;
    return {
      reading: isChoice(parsed?.reading) ? parsed.reading : DEFAULT_FONT_PREFS.reading,
    };
  } catch {
    return DEFAULT_FONT_PREFS;
  }
}

/** Writes the var the reading canvas resolves its face from. */
export function applyFontPrefs(prefs: FontPrefs): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--pds-font-reading', FONT_STACKS[prefs.reading]);
  // Google Sans Flex is variable and carries a rounded-terminal axis; the optional faces are
  // static and would ignore it. Clearing the variation stops a stale axis setting riding
  // along on a face that has no such axis.
  root.style.setProperty(
    '--pds-font-reading-variation',
    prefs.reading === 'sans' ? '"ROND" 0' : 'normal',
  );
}

const listeners = new Set<() => void>();

export function subscribeFontPrefs(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

let snapshot: FontPrefs | null = null;

export function getFontPrefsSnapshot(): FontPrefs {
  if (!snapshot) snapshot = readFontPrefs();
  return snapshot;
}

export function getFontPrefsServerSnapshot(): FontPrefs {
  return DEFAULT_FONT_PREFS;
}

export function writeFontPrefs(next: FontPrefs): void {
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / storage disabled — the choice still applies for this session */
  }
  applyFontPrefs(next);
  listeners.forEach((fn) => fn());
}
