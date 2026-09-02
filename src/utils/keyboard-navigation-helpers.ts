/**
 * Helpers for global keyboard shortcuts: persistent nav strip and content tabs.
 */

import { extractIdFromPath, idToUrl } from './url-helpers';

function appNavigate(path: string): void {
  if (typeof window === 'undefined') return;
  if ((window as unknown as { appNavigate?: (p: string) => void }).appNavigate) {
    (window as unknown as { appNavigate: (p: string) => void }).appNavigate(path);
  } else {
    window.location.href = path;
  }
}

function normalizePathSearch(href: string): { pathname: string; search: string } {
  try {
    const u = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'https://harvous.local');
    return { pathname: u.pathname, search: u.search };
  } catch {
    return { pathname: '', search: '' };
  }
}

/** Top “active space” link + persistent history links; drops persistent entries that duplicate the top href. */
function getPersistentNavCycleLinks(): HTMLAnchorElement[] {
  const top = document.querySelector<HTMLAnchorElement>('.nav-column-buttons .space-switcher-anchor > a.nav-link');
  const persistent = Array.from(document.querySelectorAll<HTMLAnchorElement>('#persistent-navigation a.nav-link')).filter((a) => {
    const href = a.getAttribute('href');
    return href && href !== '#' && !href.startsWith('javascript:');
  });

  if (!top) return persistent;

  const out: HTMLAnchorElement[] = [top];
  const topHref = top.getAttribute('href');
  const nt = topHref ? normalizePathSearch(topHref) : null;

  for (const a of persistent) {
    const ah = a.getAttribute('href');
    if (!ah || !nt) {
      out.push(a);
      continue;
    }
    const na = normalizePathSearch(ah);
    if (na.pathname === nt.pathname && na.search === nt.search) continue;
    out.push(a);
  }
  return out;
}

function isSameLocationAsHref(hrefAttr: string): boolean {
  const { pathname, search } = normalizePathSearch(hrefAttr);
  return pathname === window.location.pathname && search === window.location.search;
}

function findPersistentNavCurrentIndex(links: HTMLAnchorElement[]): number {
  const activeWrap =
    document.querySelector('#persistent-navigation [data-persistent-nav-active="true"]') ??
    document.querySelector('.space-switcher-anchor > a.nav-link[data-persistent-nav-active="true"]');

  if (activeWrap) {
    const id = activeWrap.getAttribute('data-navigation-item');
    if (id) {
      const i = links.findIndex(
        (a) => a.closest('[data-navigation-item]')?.getAttribute('data-navigation-item') === id,
      );
      if (i >= 0) return i;
    }
  }

  const path = window.location.pathname;
  const search = window.location.search;
  for (let i = 0; i < links.length; i++) {
    const { pathname, search: s } = normalizePathSearch(links[i].href);
    if (pathname === path && s === search) return i;
  }

  if (path.startsWith('/note/')) {
    const noteEl = document.querySelector('[data-note-id][data-parent-thread-id]') as HTMLElement | null;
    const tid = noteEl?.dataset?.parentThreadId;
    if (tid?.startsWith('thread_')) {
      const threadPath = new URL(idToUrl(tid), window.location.origin).pathname;
      const i = links.findIndex((a) => normalizePathSearch(a.href).pathname === threadPath);
      if (i >= 0) return i;
    }
  }

  if (path.startsWith('/thread/')) {
    const pathId = extractIdFromPath(path);
    if (pathId?.startsWith('thread_')) {
      const threadPath = new URL(idToUrl(pathId), window.location.origin).pathname;
      const i = links.findIndex((a) => normalizePathSearch(a.href).pathname === threadPath);
      if (i >= 0) return i;
    }
  }

  return -1;
}

/**
 * Move to the previous/next opened item in the desktop nav column: active space (top) + persistent strip.
 */
export function navigatePersistentNavStep(direction: 1 | -1): boolean {
  if (typeof document === 'undefined') return false;

  const navButtons = document.querySelector('.nav-column-buttons');
  if (!navButtons) return false;

  const cs = window.getComputedStyle(navButtons);
  if (cs.display === 'none' || cs.visibility === 'hidden' || navButtons.offsetParent === null) {
    return false;
  }

  const links = getPersistentNavCycleLinks();
  if (links.length < 2) return false;

  let idx = findPersistentNavCurrentIndex(links);
  if (idx < 0) idx = 0;

  const nextIdx = (idx + direction + links.length) % links.length;
  const nextLink = links[nextIdx];
  const href = nextLink.getAttribute('href');
  if (!href) return false;

  const dest = href.startsWith('http') ? new URL(href).pathname + new URL(href).search + new URL(href).hash : href;
  if (isSameLocationAsHref(dest)) {
    nextLink.focus();
    return true;
  }

  appNavigate(dest);
  return true;
}
