import {
  SHARED_SPACE_DASHBOARD_FIXTURE_FULL,
  SHARED_SPACE_DASHBOARD_FIXTURE_SOCIAL,
  type SharedSpaceDashboardFixture,
} from './shared-space-dashboard-fixtures';

export type SharedSpaceDashboardFixtureMode = 'full' | 'social';

export const SHARED_SPACE_DASHBOARD_FIXTURE_STORAGE_KEY = 'harvous-dev-shared-space-dashboard-fixture';

export function readSharedSpaceDashboardFixtureMode(): SharedSpaceDashboardFixtureMode | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;

  const fromUrl = new URLSearchParams(window.location.search).get('sharedSpaceFixture');
  if (fromUrl === 'full' || fromUrl === 'social') return fromUrl;

  try {
    const stored = sessionStorage.getItem(SHARED_SPACE_DASHBOARD_FIXTURE_STORAGE_KEY);
    if (stored === 'full' || stored === 'social') return stored;
  } catch {
    /* ignore */
  }

  return null;
}

export function sharedSpaceDashboardFixtureForMode(
  mode: SharedSpaceDashboardFixtureMode,
): SharedSpaceDashboardFixture {
  return mode === 'social' ? SHARED_SPACE_DASHBOARD_FIXTURE_SOCIAL : SHARED_SPACE_DASHBOARD_FIXTURE_FULL;
}

export function enableSharedSpaceDashboardFixture(mode: SharedSpaceDashboardFixtureMode = 'full'): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SHARED_SPACE_DASHBOARD_FIXTURE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

export function disableSharedSpaceDashboardFixture(): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SHARED_SPACE_DASHBOARD_FIXTURE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.delete('sharedSpaceFixture');
  window.location.href = url.toString();
}
