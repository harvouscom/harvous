/**
 * Everything a guest has made, on this device.
 *
 * **Why not the offline Dexie DB.** That was the obvious home — every table there is already
 * partitioned `[userId+id]`, so a `guest` partition needs no migration. It does not fit, for a
 * reason that only shows up once you look for highlights: `studyThreadEntry` is a sync *entity*
 * with no table of its own. Notes would have landed in IndexedDB and highlights nowhere, and
 * the guest's two gestures would have been kept in two different places with two different
 * adoption paths. Adding a table to the account's schema to fix that means a version bump on a
 * database every signed-in user is already carrying, for the sake of visitors who have no
 * account — the wrong direction to take the risk in.
 *
 * So: one small store, entirely separate from the sync machinery, that cannot leak a guest row
 * into a member's queue because it shares nothing with it.
 *
 * **Why localStorage.** A guest's work is a handful of notes and highlights, and reading it
 * synchronously means the reader can paint their colours in the first frame rather than after
 * an await — the same reason the shell's other first-paint state lives here. Writes are capped
 * (see `MAX_ENTRIES`) and wrapped, so the failure mode of a very long session is "the newest
 * item is not kept", not a thrown quota error in the middle of typing.
 */
import type { StudyHighlightAccentKey } from '@/utils/study-highlight-accents';

const STORE_KEY = 'harvous-proto-guest-store';
const STORE_VERSION = 1;

/**
 * A ceiling, not a target. Guest mode is a look around, and someone who has made 200 highlights
 * without signing up is someone the account prompt has already failed with — losing the 201st is
 * a better outcome than a quota exception thrown into the editor.
 */
const MAX_ENTRIES = 200;

export interface GuestHighlight {
  id: string;
  book: string;
  chapter: number;
  translation: string;
  reference: string;
  accent: StudyHighlightAccentKey;
  /** Null for a whole-verse highlight — see `src/utils/scripture-span-key.ts`. */
  spanKey: string | null;
  excerpt: string;
  /**
   * A note written on the verse, from the reader's annotate dock.
   *
   * This is how a guest writes at all. The full editor needs a space and a server round trip,
   * but a thought attached to a highlight needs neither — and it is the same field the account
   * version writes, so adoption carries it up without a second path.
   */
  miniNoteBody?: string;
  /** The name they gave the highlight, from the same dock. Optional there, optional here. */
  focusTitle?: string;
  createdAt: string;
}

export interface GuestNote {
  id: string;
  title: string;
  contentHtml: string;
  createdAt: string;
  updatedAt: string;
}

interface GuestStore {
  version: number;
  highlights: GuestHighlight[];
  notes: GuestNote[];
}

const EMPTY: GuestStore = { version: STORE_VERSION, highlights: [], notes: [] };

/**
 * The parsed store, held so repeated reads hand back the same array identity.
 *
 * `useSyncExternalStore` compares snapshots by reference: re-parsing the JSON on every read
 * would return a new array every time and re-render forever. Invalidated only by a write.
 */
let cache: GuestStore | null = null;
const listeners = new Set<() => void>();

function read(): GuestStore {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) {
      cache = EMPTY;
      return cache;
    }
    const parsed = JSON.parse(raw) as Partial<GuestStore>;
    cache = {
      version: STORE_VERSION,
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    };
  } catch {
    /* unreadable or corrupt — an empty store beats a broken reader */
    cache = EMPTY;
  }
  return cache;
}

function write(next: GuestStore): void {
  cache = next;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    /* quota or private mode — the in-memory copy still serves this page */
  }
  for (const listener of listeners) listener();
}

export function subscribeToGuestStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function guestStoreSnapshot(): GuestStore {
  return read();
}

/** Server render has no storage, and a guest is by definition a thing one browser holds. */
export function guestStoreServerSnapshot(): GuestStore {
  return EMPTY;
}

export function guestHighlights(): GuestHighlight[] {
  return read().highlights;
}

export function guestNotes(): GuestNote[] {
  return read().notes;
}

export function guestNoteById(id: string): GuestNote | undefined {
  return read().notes.find((n) => n.id === id);
}

/** True for an id this store owns — the one check anything server-bound should make first. */
export function isGuestNoteId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('guest_note_');
}

/** Local ids are prefixed so adoption, and anything reading a URL, can tell them apart. */
export function guestId(kind: 'note' | 'highlight'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `guest_${kind}_${Date.now().toString(36)}${rand}`;
}

export function addGuestHighlight(
  input: Omit<GuestHighlight, 'id' | 'createdAt'>,
): GuestHighlight {
  const store = read();
  /*
   * Reference AND span, not reference alone — the same collision the server upsert and the
   * optimistic cache both had to be taught about. Two phrases in one verse are two highlights;
   * re-highlighting the same span is a recolour.
   */
  const idx = store.highlights.findIndex(
    (h) => h.reference === input.reference && (h.spanKey ?? null) === (input.spanKey ?? null),
  );
  if (idx !== -1) {
    const updated = { ...store.highlights[idx], ...input };
    const highlights = store.highlights.slice();
    highlights[idx] = updated;
    write({ ...store, highlights });
    return updated;
  }
  const row: GuestHighlight = { ...input, id: guestId('highlight'), createdAt: new Date().toISOString() };
  write({ ...store, highlights: [...store.highlights, row].slice(-MAX_ENTRIES) });
  return row;
}

export function updateGuestHighlight(
  id: string,
  patch: Partial<Pick<GuestHighlight, 'accent' | 'miniNoteBody' | 'focusTitle'>>,
): GuestHighlight | undefined {
  const store = read();
  const idx = store.highlights.findIndex((h) => h.id === id);
  if (idx === -1) return undefined;
  const updated = { ...store.highlights[idx], ...patch };
  const highlights = store.highlights.slice();
  highlights[idx] = updated;
  write({ ...store, highlights });
  return updated;
}

export function removeGuestHighlight(id: string): void {
  const store = read();
  write({ ...store, highlights: store.highlights.filter((h) => h.id !== id) });
}

export function addGuestNote(input: { title: string; contentHtml: string }): GuestNote {
  const store = read();
  const now = new Date().toISOString();
  const note: GuestNote = {
    id: guestId('note'),
    title: input.title,
    contentHtml: input.contentHtml,
    createdAt: now,
    updatedAt: now,
  };
  write({ ...store, notes: [...store.notes, note].slice(-MAX_ENTRIES) });
  return note;
}

export function updateGuestNote(
  id: string,
  patch: Partial<Pick<GuestNote, 'title' | 'contentHtml'>>,
): GuestNote | undefined {
  const store = read();
  const idx = store.notes.findIndex((n) => n.id === id);
  if (idx === -1) return undefined;
  const updated = { ...store.notes[idx], ...patch, updatedAt: new Date().toISOString() };
  const notes = store.notes.slice();
  notes[idx] = updated;
  write({ ...store, notes });
  return updated;
}

export function deleteGuestNote(id: string): void {
  const store = read();
  write({ ...store, notes: store.notes.filter((n) => n.id !== id) });
}

/** What the guest has to lose by walking away — the exit prompt says this out loud. */
export function guestStoreCounts(): { notes: number; highlights: number; total: number } {
  const store = read();
  // A note written on a highlight counts as a note, because that is what it is to the person
  // who wrote it — the row it happens to live on is our filing, not theirs.
  const notes = store.notes.length + store.highlights.filter((h) => h.miniNoteBody?.trim()).length;
  return { notes, highlights: store.highlights.length, total: notes + store.highlights.length };
}

/** Called by adoption, once the work has been handed to the account. */
export function clearGuestStore(): void {
  cache = EMPTY;
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
  for (const listener of listeners) listener();
}
