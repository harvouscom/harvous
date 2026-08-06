import { isStudyHighlightAccentKey } from '@/utils/study-highlight-accents';
import { deriveHighlightFocusTitle } from '@/utils/study-thread-focus-title';
import { normalizeScriptureReference } from '@/utils/scripture-detector';
import { HARVOUS_STUDY_DOCK_STACK_PREFIX } from '@/utils/user-cache-keys';

export const STUDY_DOCK_STACK_MAX_ENTRIES = 8;

export type ScripturePillDockSession = {
  /** ProseMirror positions of the pill mark in the note. `null` for a read-only passage card
   *  (e.g. a cross-reference opened for reading) — there is no pill to edit. */
  boundaries: { from: number; to: number } | null;
  reference: string;
  translation: string | null;
  noteId: string | null;
  pillAccent: string | null;
  /** Read-only passage card — no pill write-back, no highlight/study-thread chrome. */
  readOnly?: boolean;
};

/** Build a read-only scripture session for opening a referenced passage (cross-ref) as a card. */
export function buildReadOnlyScriptureSession(
  reference: string,
  translation: string | null,
  sourceNoteId: string | null,
): ScripturePillDockSession {
  return { boundaries: null, reference, translation, noteId: sourceNoteId, pillAccent: null, readOnly: true };
}

export type HighlightDockSession = {
  studyThreadEntryId: string | null;
  accent: string;
  excerpt: string;
  range: { from: number; to: number } | null;
  focusTitle?: string;
  miniNoteBody?: string;
  entryKind?: 'miniNote' | 'scriptureLink' | 'reference' | 'linkedNote' | 'workspace';
  /** Passage context for `scriptureLink` highlights (no editor mark — painted inline in scripture dock). */
  scriptureReference?: string | null;
  scripturePassageTranslation?: string | null;
  /** Shared-space unioned highlights — who wrote this annotation. */
  authorDisplayName?: string | null;
  isOwnHighlight?: boolean;
  /** Explicit UI policy for another member's Activity entry. */
  readOnly?: boolean;
};

/** Snapshot passed through deep-link navigation when the editor mark may not be ready yet. */
export type HighlightDockOpenMetadata = {
  entryKind?: HighlightDockSession['entryKind'];
  accent: string;
  excerpt: string;
  focusTitle?: string;
  miniNoteBody?: string;
  linkedNoteId?: string | null;
  scriptureReference?: string | null;
  scripturePassageTranslation?: string | null;
  authorDisplayName?: string | null;
  isOwnHighlight?: boolean;
  anchorLocation?: number | null;
  anchorLength?: number | null;
  detached?: boolean;
  readOnly?: boolean;
};

/** Minimal study-thread fields needed to build a highlight dock session without a DOM mark. */
export type HighlightDockStudyThreadSource = {
  id: string;
  entryKind?: string | null;
  highlightAccentRaw?: string | null;
  anchorTextSnapshot?: string | null;
  sourceSnippet?: string | null;
  focusTitle?: string | null;
  miniNoteBody?: string | null;
  linkedNoteId?: string | null;
  scriptureReference?: string | null;
  scripturePassageTranslation?: string | null;
  scripturePassageExcerpt?: string | null;
  authorDisplayName?: string | null;
  isOwnHighlight?: boolean;
  anchorLocation?: number | null;
  anchorLength?: number | null;
  detached?: boolean;
};

function normalizeHighlightDockEntryKind(
  entryKind: string | null | undefined,
): HighlightDockSession['entryKind'] {
  switch (entryKind) {
    case 'miniNote':
    case 'scriptureLink':
    case 'reference':
    case 'linkedNote':
    case 'workspace':
      return entryKind;
    default:
      return 'miniNote';
  }
}

export function highlightDockExcerptFromStudyThread(row: HighlightDockStudyThreadSource): string {
  const anchor = (row.anchorTextSnapshot ?? '').trim();
  if (anchor) return anchor;
  const snippet = (row.sourceSnippet ?? '').trim();
  if (snippet) return snippet;
  const focus = (row.focusTitle ?? '').trim();
  if (focus) return focus;
  const mini = (row.miniNoteBody ?? '').trim();
  if (mini) return mini;
  return 'Highlight';
}

export function buildHighlightDockOpenMetadataFromStudyThread(
  row: HighlightDockStudyThreadSource,
): HighlightDockOpenMetadata {
  const excerpt = highlightDockExcerptFromStudyThread(row);
  const accent =
    row.highlightAccentRaw && isStudyHighlightAccentKey(row.highlightAccentRaw)
      ? row.highlightAccentRaw
      : 'warmAmber';
  return {
    entryKind: normalizeHighlightDockEntryKind(row.entryKind),
    accent,
    excerpt,
    focusTitle: (row.focusTitle ?? '').trim() || deriveHighlightFocusTitle(excerpt),
    miniNoteBody: row.miniNoteBody ?? '',
    linkedNoteId: row.linkedNoteId ?? null,
    scriptureReference: (row.scriptureReference ?? '').trim() || null,
    scripturePassageTranslation: (row.scripturePassageTranslation ?? '').trim() || null,
    authorDisplayName: row.authorDisplayName ?? null,
    isOwnHighlight: row.isOwnHighlight,
    anchorLocation: row.anchorLocation ?? null,
    anchorLength: row.anchorLength ?? null,
    detached: row.detached === true,
    readOnly: row.isOwnHighlight === false,
  };
}

export function buildHighlightDockSessionForDeepLink(
  studyThreadEntryId: string,
  metadata: HighlightDockOpenMetadata | undefined,
  range: { from: number; to: number } | null,
): HighlightDockSession {
  if (metadata) {
    return {
      studyThreadEntryId,
      accent: metadata.accent,
      excerpt: metadata.excerpt,
      range,
      focusTitle: metadata.focusTitle,
      miniNoteBody: metadata.miniNoteBody,
      entryKind: metadata.entryKind ?? 'miniNote',
      scriptureReference: metadata.scriptureReference ?? null,
      scripturePassageTranslation: metadata.scripturePassageTranslation ?? null,
      authorDisplayName: metadata.authorDisplayName ?? null,
      isOwnHighlight: metadata.isOwnHighlight,
      readOnly: metadata.readOnly === true,
    };
  }
  return {
    studyThreadEntryId,
    accent: 'warmAmber',
    excerpt: '',
    range,
    entryKind: 'miniNote',
  };
}

export function buildHighlightDockSessionFromStudyThread(
  row: HighlightDockStudyThreadSource,
  range?: { from: number; to: number } | null,
): HighlightDockSession {
  const metadata = buildHighlightDockOpenMetadataFromStudyThread(row);
  const session = buildHighlightDockSessionForDeepLink(row.id, metadata, range ?? null);
  return {
    ...session,
    authorDisplayName: row.authorDisplayName ?? null,
    isOwnHighlight: row.isOwnHighlight,
  };
}

export type ScriptureLinkPassageContext = {
  sourceNoteId: string;
  reference: string;
  translation: string;
  word: string;
};

/** Resolve passage paint coordinates for a scriptureLink highlight dock entry. */
export function resolveScriptureLinkPassageContext(
  stack: StudyDockStack,
  highlightEntry: Extract<StudyDockEntry, { kind: 'highlight' }>,
  sourceNoteId: string | null,
): ScriptureLinkPassageContext | null {
  if (highlightEntry.session.entryKind !== 'scriptureLink') return null;
  const word = highlightEntry.session.excerpt.trim();
  if (!word || !sourceNoteId) return null;

  const sessionRef = (highlightEntry.session.scriptureReference ?? '').trim();
  const sessionTrans = (highlightEntry.session.scripturePassageTranslation ?? '').trim();
  if (sessionRef && sessionTrans) {
    return { sourceNoteId, reference: sessionRef, translation: sessionTrans, word };
  }

  const parentId = highlightEntry.openedFromDockId;
  if (parentId) {
    const parent = stack.entries.find((e) => e.id === parentId);
    if (parent?.kind === 'scripture') {
      return {
        sourceNoteId,
        reference: parent.session.reference,
        translation: parent.session.translation || 'NET',
        word,
      };
    }
  }

  return null;
}

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
  /** Set when opened from a passage suggestion in the scripture pill dock (study-thread only, no note mark). */
  passageReference?: {
    reference: string;
    translation: string;
    sourceNoteId: string;
  } | null;
  /** Set once a passage reference is saved — drives accent/remove chrome without a note mark. */
  passageReferenceSaved?: boolean;
};

/**
 * Resource Library item docked beside a note.
 *
 * Everything needed to render and open the chip is snapshotted here, so the
 * dock survives a reload without a fetch. The id is what re-resolves the item
 * server-side when the user acts on it.
 */
export type ResourceDockSession = {
  libraryItemId: string;
  title: string;
  /** 'link' | 'file'. Absent on stacks stored before files existed — treat as 'link'. */
  kind?: 'link' | 'file';
  /** kind='link': the destination. Empty for files, which sign a URL at click time. */
  url: string;
  domain?: string | null;
  fileName?: string | null;
  fileMime?: string | null;
  fileBytes?: number | null;
};

export type StudyDockEntry =
  | {
      id: string;
      kind: 'scripture';
      stableKey: string;
      openedAt: number;
      expanded: boolean;
      /** Id of the dock this one was opened from, or null/undefined when opened from the editor. */
      openedFromDockId?: string | null;
      session: ScripturePillDockSession;
    }
  | {
      id: string;
      kind: 'highlight';
      stableKey: string;
      openedAt: number;
      expanded: boolean;
      /** Id of the dock this one was opened from, or null/undefined when opened from the editor. */
      openedFromDockId?: string | null;
      session: HighlightDockSession;
    }
  | {
      id: string;
      kind: 'reference';
      stableKey: string;
      openedAt: number;
      expanded: boolean;
      /** Id of the dock this one was opened from, or null/undefined when opened from the editor. */
      openedFromDockId?: string | null;
      session: ReferenceDockSession;
    }
  | {
      id: string;
      kind: 'resource';
      stableKey: string;
      openedAt: number;
      /** Always false — see {@link dockKindSupportsExpanded}. */
      expanded: boolean;
      /** Id of the dock this one was opened from, or null/undefined when opened from the editor. */
      openedFromDockId?: string | null;
      session: ResourceDockSession;
    };

/**
 * Whether a dock kind has an expanded body at all.
 *
 * Resources don't: an item is a pointer to something outside Harvous, and a
 * scraped preview in a dock card would be a worse copy of the destination. The
 * chip keeps the link in reach while writing; tapping it goes there.
 *
 * Every path that could set `expanded: true` reads this — activation, close-
 * follow, prune, and deserialize — so the invariant holds even against a
 * hand-edited localStorage payload.
 */
export function dockKindSupportsExpanded(kind: StudyDockEntry['kind']): boolean {
  return kind !== 'resource';
}

/** Applies {@link dockKindSupportsExpanded} to a would-be expanded state. */
function expandedFor(entry: StudyDockEntry, wantExpanded: boolean): boolean {
  return wantExpanded && dockKindSupportsExpanded(entry.kind);
}

/** Options for the open helpers — `openedFromDockId` records the parent dock for close-follow. */
export type OpenDockOptions = {
  openedFromDockId?: string | null;
};

export type StudyDockStack = {
  entries: StudyDockEntry[];
  activeId: string | null;
};

export function studyDockContextKey(
  noteId?: string | null,
  contextSpaceId?: string | null,
): string {
  return `${noteId ?? ''}::${contextSpaceId?.trim() || 'home'}`;
}

export function studyDockStackStorageKey(noteId: string, contextSpaceId?: string | null): string {
  const contextSuffix = contextSpaceId?.trim()
    ? `--${encodeURIComponent(contextSpaceId.trim())}`
    : '';
  return `${HARVOUS_STUDY_DOCK_STACK_PREFIX}${noteId}${contextSuffix}`;
}

export function isPersistableStudyDockNoteId(noteId?: string | null): boolean {
  return !!noteId && noteId.startsWith('note_');
}

export function clearStudyDockStackLocalCache(
  noteId?: string | null,
  contextSpaceId?: string | null,
): void {
  if (!isPersistableStudyDockNoteId(noteId)) return;
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(studyDockStackStorageKey(noteId!, contextSpaceId));
  } catch {
    /* ignore */
  }
}

export function withStudyThreadContext<T extends Record<string, unknown>>(
  body: T,
  contextSpaceId?: string | null,
): T & { contextSpaceId?: string } {
  const context = contextSpaceId?.trim();
  return context ? { ...body, contextSpaceId: context } : body;
}

export function studyThreadContextQuery(contextSpaceId?: string | null): string {
  const context = contextSpaceId?.trim();
  return context ? `?contextSpaceId=${encodeURIComponent(context)}` : '';
}

export function activeHighlightEntryId(stack: StudyDockStack): string | null {
  const active = stack.entries.find((entry) => entry.id === stack.activeId);
  if (!active || active.kind !== 'highlight') return null;
  return active.session.studyThreadEntryId ?? null;
}

export function isHighlightDockReadOnly(session: HighlightDockSession): boolean {
  return session.readOnly === true || session.isOwnHighlight === false;
}

export function shouldOpenHighlightRequestImmediately(request: {
  range?: { from: number; to: number } | null;
  metadata?: HighlightDockOpenMetadata;
  sharedAnnotationOverlayMode?: boolean;
}): boolean {
  return (
    request.sharedAnnotationOverlayMode === true ||
    request.metadata?.detached === true ||
    request.range != null ||
    (request.metadata?.anchorLocation != null && (request.metadata.anchorLength ?? 0) > 0)
  );
}

const STUDY_DOCK_STACK_STORAGE_VERSION = 1;

export function serializeStudyDockStack(stack: StudyDockStack): string {
  return JSON.stringify({ v: STUDY_DOCK_STACK_STORAGE_VERSION, stack });
}

function isStudyDockEntry(value: unknown): value is StudyDockEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as StudyDockEntry;
  if (typeof entry.id !== 'string' || typeof entry.stableKey !== 'string') return false;
  if (typeof entry.openedAt !== 'number' || typeof entry.expanded !== 'boolean') return false;
  if (
    entry.kind !== 'scripture' &&
    entry.kind !== 'highlight' &&
    entry.kind !== 'reference' &&
    entry.kind !== 'resource'
  ) {
    return false;
  }
  if (!entry.session || typeof entry.session !== 'object') return false;
  return true;
}

export function deserializeStudyDockStack(raw: string | null): StudyDockStack | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { v?: number; stack?: unknown };
    if (parsed.v !== STUDY_DOCK_STACK_STORAGE_VERSION) return null;
    const stack = parsed.stack;
    if (!stack || typeof stack !== 'object') return null;
    const { entries, activeId } = stack as StudyDockStack;
    if (!Array.isArray(entries)) return null;
    if (activeId !== null && typeof activeId !== 'string') return null;
    if (!entries.every(isStudyDockEntry)) return null;
    // Normalize rather than reject: a stored `expanded: true` on a collapsed-only
    // kind (older payload, hand edit) should degrade to a chip, not drop the stack.
    const trimmedEntries = trimToMaxEntries(
      entries.map((e) => ({ ...e, expanded: expandedFor(e, e.expanded) })),
    );
    let resolvedActiveId = activeId;
    if (resolvedActiveId && !trimmedEntries.some((e) => e.id === resolvedActiveId)) {
      resolvedActiveId = trimmedEntries.length > 0 ? trimmedEntries[trimmedEntries.length - 1].id : null;
    }
    return { entries: trimmedEntries, activeId: resolvedActiveId };
  } catch {
    return null;
  }
}

export function emptyStudyDockStack(): StudyDockStack {
  return { entries: [], activeId: null };
}

export function scriptureDockStableKey(
  reference: string,
  boundaries: { from: number; to: number } | null,
): string {
  const norm = normalizeScriptureReference(reference) ?? reference;
  // Read-only passage cards have no pill range — dedupe by reference, distinct from editable pills.
  if (!boundaries) return `scripture:read:${norm}`;
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
  if (session.passageReference) {
    const norm = normalizeScriptureReference(session.passageReference.reference) ?? session.passageReference.reference;
    return `reference:passage:${norm}:${session.passageReference.translation}:${session.query.trim().toLowerCase()}`;
  }
  return `reference:q:${session.query.trim().toLowerCase()}`;
}

export function resourceDockStableKey(libraryItemId: string): string {
  return `resource:${libraryItemId}`;
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
  options?: OpenDockOptions,
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
    openedFromDockId: options?.openedFromDockId ?? null,
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
  options?: OpenDockOptions,
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
    openedFromDockId: options?.openedFromDockId ?? null,
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
  options?: OpenDockOptions,
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
    openedFromDockId: options?.openedFromDockId ?? null,
    session,
  };
  const entries = trimToMaxEntries([
    ...stack.entries.map((e) => ({ ...e, expanded: false })),
    entry,
  ]);
  return { entries, activeId: id };
}

/**
 * Dock a resource chip, or re-focus the one already docked for this item.
 *
 * Becomes the active entry like any other kind — activation drives roving focus
 * and reorder — it just never expands, and so it collapses whatever was
 * expanded before it.
 */
export function openOrFocusResource(
  stack: StudyDockStack,
  session: ResourceDockSession,
  options?: OpenDockOptions,
): StudyDockStack {
  const stableKey = resourceDockStableKey(session.libraryItemId);
  const existing = stack.entries.find((e) => e.stableKey === stableKey);
  if (existing) {
    return {
      entries: stack.entries.map((e) =>
        e.id === existing.id
          ? { ...e, kind: 'resource' as const, expanded: false, session }
          : { ...e, expanded: false },
      ),
      activeId: existing.id,
    };
  }
  const id = newEntryId();
  const entry: StudyDockEntry = {
    id,
    kind: 'resource',
    stableKey,
    openedAt: Date.now(),
    expanded: false,
    openedFromDockId: options?.openedFromDockId ?? null,
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
      expanded: expandedFor(e, e.id === id),
    })),
    activeId: id,
  };
}

export function closeDockEntry(stack: StudyDockStack, id: string): StudyDockStack {
  const closing = stack.entries.find((e) => e.id === id);
  if (!closing) return stack;
  const remaining = stack.entries.filter((e) => e.id !== id);
  if (remaining.length === 0) {
    return emptyStudyDockStack();
  }

  // Closing a background (non-active) dock never changes which dock is expanded.
  if (stack.activeId !== id) {
    return { entries: remaining, activeId: stack.activeId };
  }

  // Closing the active dock: if it was opened from a dock that's still open, return to it.
  const parentId = closing.openedFromDockId ?? null;
  const parent = parentId ? remaining.find((e) => e.id === parentId) : null;
  if (parent) {
    return {
      entries: remaining.map((e) => ({ ...e, expanded: expandedFor(e, e.id === parent.id) })),
      activeId: parent.id,
    };
  }

  // Opened from the editor (or the parent dock is already gone): do NOT auto-open the next
  // dock — leave the remaining docks collapsed with nothing expanded.
  return {
    entries: remaining.map((e) => ({ ...e, expanded: false })),
    activeId: null,
  };
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
      entries: entries.map((e) => ({ ...e, expanded: expandedFor(e, e.id === activeId) })),
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
  if (entry.kind === 'resource') {
    const title = entry.session.title.trim();
    if (title.length > 28) return `${title.slice(0, 28)}…`;
    return title || entry.session.domain || 'Resource';
  }
  const excerpt = entry.session.excerpt.trim();
  if (excerpt.length > 28) return `${excerpt.slice(0, 28)}…`;
  return excerpt || 'Highlight';
}
