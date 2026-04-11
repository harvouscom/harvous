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

function findPersistentNavCurrentIndex(links: HTMLAnchorElement[]): number {
  const root = document.querySelector('#persistent-navigation');
  if (!root) return -1;

  const activeWrap = root.querySelector('[data-persistent-nav-active="true"]');
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
 * Move to the previous/next opened item in #persistent-navigation (desktop sidebar).
 */
export function navigatePersistentNavStep(direction: 1 | -1): boolean {
  if (typeof document === 'undefined') return false;

  const root = document.querySelector('#persistent-navigation') as HTMLElement | null;
  if (!root) return false;

  const style = window.getComputedStyle(root);
  if (style.display === 'none' || style.visibility === 'hidden' || root.offsetParent === null) {
    return false;
  }

  const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a.nav-link')).filter((a) => {
    const href = a.getAttribute('href');
    return href && href !== '#' && !href.startsWith('javascript:');
  });

  if (links.length < 2) return false;

  let idx = findPersistentNavCurrentIndex(links);
  if (idx < 0) idx = 0;

  const nextIdx = (idx + direction + links.length) % links.length;
  const href = links[nextIdx].getAttribute('href');
  if (!href) return false;

  const dest = href.startsWith('http') ? new URL(href).pathname + new URL(href).search + new URL(href).hash : href;
  appNavigate(dest);
  return true;
}

/**
 * Cycle TabNav on Space/Thread pages (buttons with [data-tab-button]).
 */
export function cycleTabNavStep(direction: 1 | -1): boolean {
  if (typeof document === 'undefined') return false;

  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.tab-nav .tab-nav__button[data-tab-button]'),
  );
  if (buttons.length < 2) return false;

  let activeIndex = buttons.findIndex((b) => b.getAttribute('data-active') === 'true');
  if (activeIndex < 0) activeIndex = 0;

  const nextIndex = (activeIndex + direction + buttons.length) % buttons.length;
  buttons[nextIndex].click();
  return true;
}
