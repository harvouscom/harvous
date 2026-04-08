/**
 * Persisted content tab selection for space and thread list views (All, Notes, Search, etc.).
 */

import { safeGetItem, safeSetItem } from './safe-storage';

const SPACE_KEY_PREFIX = 'harvous-space-content-tab--';
const THREAD_KEY_PREFIX = 'harvous-thread-content-tab--';
const DASHBOARD_KEY = 'harvous-dashboard-content-tab';

const SPACE_TAB_IDS = new Set(['all', 'threads', 'notes', 'scripture', 'search']);
const THREAD_TAB_IDS = new Set(['all', 'notes', 'scripture', 'search']);
const DASHBOARD_TAB_IDS = new Set(['all', 'threads', 'notes', 'scripture', 'search']);

export type SpaceContentTabId = 'all' | 'threads' | 'notes' | 'scripture' | 'search';
export type ThreadContentTabId = 'all' | 'notes' | 'scripture' | 'search';
/** Home / dashboard tabs (All, …, Search). */
export type DashboardContentTabId = 'all' | 'threads' | 'notes' | 'scripture' | 'search';

function spaceKey(spaceId: string): string {
  return `${SPACE_KEY_PREFIX}${spaceId}`;
}

function threadKey(threadId: string): string {
  return `${THREAD_KEY_PREFIX}${threadId}`;
}

export function getStoredSpaceContentTab(spaceId: string): SpaceContentTabId | null {
  const raw = safeGetItem(spaceKey(spaceId));
  if (!raw || !SPACE_TAB_IDS.has(raw)) return null;
  return raw as SpaceContentTabId;
}

export function setStoredSpaceContentTab(spaceId: string, tab: SpaceContentTabId): void {
  if (!SPACE_TAB_IDS.has(tab)) return;
  safeSetItem(spaceKey(spaceId), tab);
}

export function getStoredThreadContentTab(threadId: string): ThreadContentTabId | null {
  const raw = safeGetItem(threadKey(threadId));
  if (!raw || !THREAD_TAB_IDS.has(raw)) return null;
  return raw as ThreadContentTabId;
}

export function setStoredThreadContentTab(threadId: string, tab: ThreadContentTabId): void {
  if (!THREAD_TAB_IDS.has(tab)) return;
  safeSetItem(threadKey(threadId), tab);
}

export function getStoredDashboardContentTab(): DashboardContentTabId | null {
  const raw = safeGetItem(DASHBOARD_KEY);
  if (!raw || !DASHBOARD_TAB_IDS.has(raw)) return null;
  return raw as DashboardContentTabId;
}

export function setStoredDashboardContentTab(tab: DashboardContentTabId): void {
  if (!DASHBOARD_TAB_IDS.has(tab)) return;
  safeSetItem(DASHBOARD_KEY, tab);
}
