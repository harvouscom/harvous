/**
 * Single rule for which space id to attach to thread/note links (see docs/fixes/04-open-in-current-space.md):
 * URL ?space= wins, then /space/... path, then explicit effective space from parent (route + storage),
 * then getSelectedSpaceId().
 *
 * Left nav (PersistentNavigation) omits ?space= on / and /dashboard so stale storage cannot
 * re-scope My Home threads to another space.
 */

import { getSelectedSpaceId } from '@/components/react/navigation/selectedSpace';
import { extractIdFromPath } from '@/utils/url-helpers';

export function getSpaceIdForPersistentNavLinks(options: {
  pathname: string;
  search: string;
  /** NavigationColumn effectiveSelectedSpaceId — route ?space= or /space/... then storage */
  effectiveSpaceId?: string | null;
}): string | null {
  const pathname = options.pathname || '';

  if (pathname === '/' || pathname === '/dashboard') {
    return null;
  }

  try {
    const q = options.search?.startsWith('?') ? options.search.slice(1) : options.search || '';
    const fromUrl = new URLSearchParams(q).get('space');
    if (fromUrl?.startsWith('space_')) return fromUrl;
  } catch {
    // ignore
  }

  if (pathname.startsWith('/space/')) {
    const id = extractIdFromPath(pathname);
    if (id?.startsWith('space_')) return id.replace(/\/$/, '');
  }

  const eff = options.effectiveSpaceId?.trim();
  if (eff?.startsWith('space_')) return eff;

  return getSelectedSpaceId();
}

/** Append ?space= or &space= if not already present. */
export function appendSpaceQueryParam(href: string, spaceId: string | null | undefined): string {
  if (!spaceId || !spaceId.startsWith('space_')) return href;
  if (/[?&]space=/.test(href)) return href;
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}space=${encodeURIComponent(spaceId)}`;
}
