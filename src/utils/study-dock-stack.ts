import { normalizeScriptureReference } from '@/utils/scripture-detector';

export const STUDY_DOCK_STACK_MAX_ENTRIES = 8;

export type ScripturePillDockSession = {
  boundaries: { from: number; to: number };
  reference: string;
  translation: string | null;
  noteId: string | null;
  pillAccent: string | null;
};

export type HighlightDockSession = {
  studyThreadEntryId: string | null;
  accent: string;
  excerpt: string;
  range: { from: number; to: number } | null;
  focusTitle?: string;
  miniNoteBody?: string;
  entryKind?: 'miniNote' | 'scriptureLink' | 'reference' | 'linkedNote' | 'workspace';
};

/** Dictionary reference dock — either a not-yet-saved suggestion or a saved reference highlight. */
export type ReferenceDockSession = {
  /** The word / headword to look up in Easton's. */
  query: string;
  /** Set once saved — the highlight mark range in the note. */
  noteHighlightRange?: { from: number; to: number } | null;
  noteHighlightAccent?: string | null;
  studyThreadEntryId?: string | null;
  /** Set when opened from a typed suggestion that is not yet saved (range of the hinted word). */
  pendingSuggestion?: { from: number; to: number } | null;
};

export type StudyDockEntry =
  | {
      id: string;
      kind: 'scripture';
      stableKey: string;
      openedAt: number;
      expanded: boolean;
      session: ScripturePillDockSession;
    }
  | {
      id: string;
      kind: 'highlight';
      stableKey: string;
      openedAt: number;
      expanded: boolean;
      session: HighlightDockSession;
    }
  | {
      id: string;
      kind: 'reference';
      stableKey: string;
      openedAt: number;
      expanded: boolean;
      session: ReferenceDockSession;
    };

export type StudyDockStack = {
  entries: StudyDockEntry[];
  activeId: string | null;
};

export function emptyStudyDockStack(): StudyDockStack {
  return { entries: [], activeId: null };
}

export function scriptureDockStableKey(reference: string, boundaries: { from: number; to: number }): string {
  const norm = normalizeScriptureReference(reference) ?? reference;
  return `scripture:${norm}:${boundaries.from}-${boundaries.to}`;
}

export function highlightDockStableKey(
  studyThreadEntryId: string | null,
  range: { from: number; to: number } | null,
): string {
  if (studyThreadEntryId) return `highlight:${studyThreadEntryId}`;
  if (range) return `highlight:range:${range.from}-${range.to}`;
  return `highlight:anonymous:${Date.now()}`;
}

export function referenceDockStableKey(session: ReferenceDockSession): string {
  // Key on the note range so a pending suggestion and the saved reference for the same word
  // (same from/to) collapse to one entry — pending → saved transitions in place.
  const range = session.noteHighlightRange ?? session.pendingSuggestion;
  if (range) return `reference:range:${range.from}-${range.to}`;
  return `reference:q:${session.query.trim().toLowerCase()}`;
}

function newEntryId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `dock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function trimToMaxEntries(entries: StudyDockEntry[]): StudyDockEntry[] {
  if (entries.length <= STUDY_DOCK_STACK_MAX_ENTRIES) return entries;
  const drop = entries.length - STUDY_DOCK_STACK_MAX_ENTRIES;
  return entries.slice(drop);
}

export function openOrFocusScripture(
  stack: StudyDockStack,
  session: ScripturePillDockSession,
): StudyDockStack {
  const stableKey = scriptureDockStableKey(session.reference, session.boundaries);
  const existing = stack.entries.find((e) => e.stableKey === stableKey);
  if (existing) {
    return {
      entries: stack.entries.map((e) =>
        e.id === existing.id
          ? { ...e, kind: 'scripture' as const, expanded: true, session }
          : { ...e, expanded: false },
      ),
      activeId: existing.id,
    };
  }
  const id = newEntryId();
  const entry: StudyDockEntry = {
    id,
    kind: 'scripture',
    stableKey,
    openedAt: Date.now(),
    expanded: true,
    session,
  };
  const entries = trimToMaxEntries([
    ...stack.entries.map((e) => ({ ...e, expanded: false })),
    entry,
  ]);
  return { entries, activeId: id };
}

export function openOrFocusHighlight(
  stack: StudyDockStack,
  session: HighlightDockSession,
): StudyDockStack {
  const stableKey = highlightDockStableKey(session.studyThreadEntryId, session.range);
  const existing = stack.entries.find((e) => e.stableKey === stableKey);
  if (existing) {
    return {
      entries: stack.entries.map((e) =>
        e.id === existing.id
          ? { ...e, kind: 'highlight' as const, expanded: true, session }
          : { ...e, expanded: false },
      ),
      activeId: existing.id,
    };
  }
  const id = newEntryId();
  const entry: StudyDockEntry = {
    id,
    kind: 'highlight',
    stableKey,
    openedAt: Date.now(),
    expanded: true,
    session,
  };
  const entries = trimToMaxEntries([
    ...stack.entries.map((e) => ({ ...e, expanded: false })),
    entry,
  ]);
  return { entries, activeId: id };
}

export function openOrFocusReference(
  stack: StudyDockStack,
  session: ReferenceDockSession,
): StudyDockStack {
  const stableKey = referenceDockStableKey(session);
  const existing = stack.entries.find((e) => e.stableKey === stableKey);
  if (existing) {
    return {
      entries: stack.entries.map((e) =>
        e.id === existing.id
          ? { ...e, kind: 'reference' as const, expanded: true, session }
          : { ...e, expanded: false },
      ),
      activeId: existing.id,
    };
  }
  const id = newEntryId();
  const entry: StudyDockEntry = {
    id,
    kind: 'reference',
    stableKey,
    openedAt: Date.now(),
    expanded: true,
    session,
  };
  const entries = trimToMaxEntries([
    ...stack.entries.map((e) => ({ ...e, expanded: false })),
    entry,
  ]);
  return { entries, activeId: id };
}

/** Reorders one entry to `toIndex` (carousel drag-and-drop). */
export function moveDockEntryToIndex(stack: StudyDockStack, entryId: string, toIndex: number): StudyDockStack {
  const fromIndex = stack.entries.findIndex((e) => e.id === entryId);
  if (fromIndex < 0 || stack.entries.length === 0) return stack;
  const clamped = Math.max(0, Math.min(stack.entries.length - 1, toIndex));
  if (fromIndex === clamped) return stack;
  const entries = [...stack.entries];
  const [removed] = entries.splice(fromIndex, 1);
  entries.splice(clamped, 0, removed);
  return { ...stack, entries };
}

export function setActiveDockEntry(stack: StudyDockStack, id: string): StudyDockStack {
  if (!stack.entries.some((e) => e.id === id)) return stack;
  return {
    entries: stack.entries.map((e) => ({
      ...e,
      expanded: e.id === id,
    })),
    activeId: id,
  };
}

export function closeDockEntry(stack: StudyDockStack, id: string): StudyDockStack {
  const idx = stack.entries.findIndex((e) => e.id === id);
  if (idx < 0) return stack;
  const remaining = stack.entries.filter((e) => e.id !== id);
  if (remaining.length === 0) {
    return emptyStudyDockStack();
  }
  let activeId = stack.activeId;
  if (activeId === id) {
    const next = remaining[remaining.length - 1];
    activeId = next.id;
    return {
      entries: remaining.map((e) => ({
        ...e,
        expanded: e.id === activeId,
      })),
      activeId,
    };
  }
  return { entries: remaining, activeId };
}

/** Collapse the active entry body without removing it from the stack. */
export function collapseActiveDockEntry(stack: StudyDockStack): StudyDockStack {
  if (!stack.activeId) return stack;
  return {
    entries: stack.entries.map((e) =>
      e.id === stack.activeId ? { ...e, expanded: false } : e,
    ),
    activeId: stack.activeId,
  };
}

export function collapseActiveScriptureIfActive(stack: StudyDockStack): StudyDockStack {
  const active = stack.entries.find((e) => e.id === stack.activeId);
  if (!active || active.kind !== 'scripture') return stack;
  return collapseActiveDockEntry(stack);
}

export function updateDockEntry(
  stack: StudyDockStack,
  id: string,
  updater: (entry: StudyDockEntry) => StudyDockEntry,
): StudyDockStack {
  return {
    ...stack,
    entries: stack.entries.map((e) => (e.id === id ? updater(e) : e)),
  };
}

export function getActiveDockEntry(stack: StudyDockStack): StudyDockEntry | null {
  if (!stack.activeId) return null;
  return stack.entries.find((e) => e.id === stack.activeId) ?? null;
}

export function studyDockStackHasEntries(stack: StudyDockStack): boolean {
  return stack.entries.length > 0;
}

export function pruneStudyDockStack(
  stack: StudyDockStack,
  isValid: (entry: StudyDockEntry) => boolean,
): StudyDockStack {
  const entries = stack.entries.filter(isValid);
  if (entries.length === stack.entries.length) return stack;
  if (entries.length === 0) return emptyStudyDockStack();
  let activeId = stack.activeId;
  if (!activeId || !entries.some((e) => e.id === activeId)) {
    const last = entries[entries.length - 1];
    activeId = last.id;
    return {
      entries: entries.map((e) => ({ ...e, expanded: e.id === activeId })),
      activeId,
    };
  }
  return { entries, activeId };
}

export function dockChipLabel(entry: StudyDockEntry): string {
  if (entry.kind === 'scripture') {
    const ref = entry.session.reference;
    const trans = entry.session.translation;
    if (trans) return `${ref} · ${trans}`;
    return ref;
  }
  if (entry.kind === 'reference') {
    const q = entry.session.query.trim();
    if (q.length > 28) return `${q.slice(0, 28)}…`;
    return q || 'Reference';
  }
  const excerpt = entry.session.excerpt.trim();
  if (excerpt.length > 28) return `${excerpt.slice(0, 28)}…`;
  return excerpt || 'Highlight';
}
