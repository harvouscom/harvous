/**
 * localStorage-backed sidebar navigation snapshot for the prototype shell.
 * Persists Home vs list layer and drill-down state across refresh.
 */

import type { ScriptureDrillState } from './sidebar-universal-search';

type SidebarLayer = 'space' | 'list';
type SidebarFolderDrilldown = string | null | undefined;

export const PROTO_SIDEBAR_NAV_STORAGE_KEY = 'harvous-prototype-sidebar-nav';

/** Stored folder drill encoding — avoids JSON undefined ambiguity. */
export type PersistedFolderDrill = 'top' | 'unsorted' | string;

type PersistedSidebarNavRaw = {
  layer?: unknown;
  folderDrill?: unknown;
  threadDrillId?: unknown;
  scriptureDrill?: unknown;
};

export type PersistedSidebarNav = {
  layer: SidebarLayer;
  folderDrill: SidebarFolderDrilldown;
  threadDrillId: string | undefined;
  scriptureDrill: ScriptureDrillState;
};

const DEFAULT_SCRIPTURE_DRILL: ScriptureDrillState = { level: 'books' };

function safeReadRaw(): PersistedSidebarNavRaw {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PROTO_SIDEBAR_NAV_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as PersistedSidebarNavRaw) : {};
  } catch {
    return {};
  }
}

function safeWriteRaw(next: PersistedSidebarNavRaw): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PROTO_SIDEBAR_NAV_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / storage disabled — ignore */
  }
}

function parseLayer(value: unknown): SidebarLayer {
  return value === 'list' ? 'list' : 'space';
}

export function encodeFolderDrill(value: SidebarFolderDrilldown): PersistedFolderDrill | undefined {
  if (value === undefined) return 'top';
  if (value === null) return 'unsorted';
  if (typeof value === 'string' && value.length > 0) return value;
  return 'top';
}

export function decodeFolderDrill(value: unknown): SidebarFolderDrilldown {
  if (value === 'top' || value === undefined) return undefined;
  if (value === 'unsorted') return null;
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
}

function parseThreadDrillId(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value;
}

function parseScriptureDrill(value: unknown): ScriptureDrillState {
  if (!value || typeof value !== 'object') return DEFAULT_SCRIPTURE_DRILL;
  const drill = value as Record<string, unknown>;
  if (drill.level === 'books') return { level: 'books' };
  if (drill.level === 'passages') {
    const bookOrder = drill.bookOrder;
    if (typeof bookOrder !== 'number' || !Number.isFinite(bookOrder)) return DEFAULT_SCRIPTURE_DRILL;
    return { level: 'passages', bookOrder };
  }
  if (drill.level === 'notes') {
    const bookOrder = drill.bookOrder;
    const passageKey = drill.passageKey;
    if (
      typeof bookOrder !== 'number' ||
      !Number.isFinite(bookOrder) ||
      typeof passageKey !== 'string' ||
      passageKey.length === 0
    ) {
      return DEFAULT_SCRIPTURE_DRILL;
    }
    return { level: 'notes', bookOrder, passageKey };
  }
  return DEFAULT_SCRIPTURE_DRILL;
}

export function readPersistedSidebarNav(): PersistedSidebarNav {
  const raw = safeReadRaw();
  return {
    layer: parseLayer(raw.layer),
    folderDrill: decodeFolderDrill(raw.folderDrill),
    threadDrillId: parseThreadDrillId(raw.threadDrillId),
    scriptureDrill: parseScriptureDrill(raw.scriptureDrill),
  };
}

export type SidebarNavPatch = {
  layer?: SidebarLayer;
  folderDrill?: SidebarFolderDrilldown;
  threadDrillId?: string | undefined;
  scriptureDrill?: ScriptureDrillState;
  /** When true, omit folderDrill from storage (cleared). */
  clearFolderDrill?: boolean;
  /** When true, omit threadDrillId from storage (cleared). */
  clearThreadDrill?: boolean;
  /** When true, omit scriptureDrill from storage (cleared). */
  clearScriptureDrill?: boolean;
};

export function writePersistedSidebarNav(patch: SidebarNavPatch): void {
  const current = safeReadRaw();
  const next: PersistedSidebarNavRaw = { ...current };

  if (patch.layer !== undefined) {
    next.layer = patch.layer;
  }

  if (patch.clearFolderDrill) {
    delete next.folderDrill;
  } else if ('folderDrill' in patch) {
    next.folderDrill = encodeFolderDrill(patch.folderDrill);
  }

  if (patch.clearThreadDrill) {
    delete next.threadDrillId;
  } else if (patch.threadDrillId !== undefined) {
    if (patch.threadDrillId) {
      next.threadDrillId = patch.threadDrillId;
    } else {
      delete next.threadDrillId;
    }
  }

  if (patch.clearScriptureDrill) {
    delete next.scriptureDrill;
  } else if (patch.scriptureDrill !== undefined) {
    next.scriptureDrill = patch.scriptureDrill;
  }

  safeWriteRaw(next);
}

export function clearPersistedDrilldowns(options?: {
  folder?: boolean;
  thread?: boolean;
  scripture?: boolean;
}): void {
  writePersistedSidebarNav({
    clearFolderDrill: options?.folder ?? true,
    clearThreadDrill: options?.thread ?? true,
    clearScriptureDrill: options?.scripture ?? true,
  });
}
