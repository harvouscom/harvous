import { afterEach, describe, expect, it } from 'vitest';
import {
  isPrototypeNotePath,
  isPrototypeShellPath,
  isPublicAppPath,
  isReservedPrototypeSegment,
  matchPrototypeNoteId,
  PUBLIC_ROUTE_HTML_CLASS,
  prototypeHref,
  prototypeNoteRoutePaths,
  prototypeNoteRouteTo,
  syncPublicRouteHtmlClass,
} from '@/lib/prototype-path';

afterEach(() => {
  document.documentElement.classList.remove(PUBLIC_ROUTE_HTML_CLASS);
});

describe('prototype shell note paths', () => {
  it('uses /$noteId as the dedicated-host canonical route', () => {
    expect(prototypeNoteRouteTo('localhost')).toBe('/$noteId');
    expect(prototypeNoteRouteTo('new.harvous.com')).toBe('/$noteId');
    expect(prototypeNoteRouteTo('app.harvous.com')).toBe('/$noteId');
    expect(prototypeNoteRoutePaths('localhost')).toEqual({
      canonicalChildPath: '$noteId',
      compatibilityChildPath: 'n/$noteId',
    });
    expect(prototypeHref('fXvv5uY', 'localhost')).toBe('/fXvv5uY');
    expect(prototypeHref('settings/account', 'localhost')).toBe('/settings/account');
    expect(isPrototypeShellPath('/fXvv5uY')).toBe(true);
    expect(isPrototypeNotePath('/fXvv5uY')).toBe(true);
    expect(matchPrototypeNoteId('/fXvv5uY')).toBe('fXvv5uY');
    expect(isPrototypeNotePath('/n/fXvv5uY')).toBe(true);
    expect(matchPrototypeNoteId('/n/fXvv5uY')).toBe('fXvv5uY');
  });

  it('rejects reserved first segments as note ids', () => {
    for (const seg of [
      'settings',
      'search',
      'admin',
      'space',
      'n',
      'new',
      'compose',
      'church',
      'challenges',
      'compete',
      'learn',
      'org',
    ]) {
      expect(isReservedPrototypeSegment(seg)).toBe(true);
      expect(isPrototypeNotePath(`/${seg}`)).toBe(false);
      expect(matchPrototypeNoteId(`/${seg}`)).toBeNull();
    }
  });

  it('excludes auth and shared routes on dedicated host', () => {
    expect(isPrototypeShellPath('/sign-in')).toBe(false);
    expect(isPrototypeShellPath('/shared/note/abc')).toBe(false);
  });

  it('uses /prototype/$noteId only for non-dedicated compatibility hosts', () => {
    expect(prototypeNoteRouteTo('www.harvous.com')).toBe('/prototype/$noteId');
    expect(prototypeNoteRoutePaths('www.harvous.com')).toEqual({
      canonicalChildPath: '$noteId',
      compatibilityChildPath: 'n/$noteId',
    });
    expect(prototypeHref('fXvv5uY', 'www.harvous.com')).toBe('/prototype/fXvv5uY');
    expect(isPrototypeShellPath('/prototype/fXvv5uY')).toBe(true);
    expect(isPrototypeNotePath('/prototype/fXvv5uY')).toBe(true);
  });
});

describe('public app paths', () => {
  it('treats join, shared, invitation, upgrade, and status as public marketing routes', () => {
    expect(isPublicAppPath('/spaces/join/abc')).toBe(true);
    expect(isPublicAppPath('/shared/note/abc')).toBe(true);
    expect(isPublicAppPath('/invitations/abc')).toBe(true);
    expect(isPublicAppPath('/upgrade')).toBe(true);
    expect(isPublicAppPath('/addon')).toBe(true);
    expect(isPublicAppPath('/status')).toBe(true);
    expect(isPublicAppPath('/')).toBe(false);
    expect(isPublicAppPath('/settings/addons')).toBe(false);
  });

  /*
   * `/discover/{slug}` renders `PublicTopBar` and `.public-page` like every other
   * route above, and was missing from the list for as long as it existed. The
   * omission was silent in the worst way: on the dedicated host the path fell
   * through to the prototype shell, so the page loaded with the app's chrome and
   * none of its own, and nothing in-app linked to it to make that visible.
   */
  it('treats a Discover listing as a public route, not a prototype-shell path', () => {
    expect(isPublicAppPath('/discover/soap')).toBe(true);
    expect(isPrototypeShellPath('/discover/soap')).toBe(false);
  });

  /*
   * The bare segment is deliberately not claimed. It stays in
   * RESERVED_PROTOTYPE_SEGMENTS so it cannot resolve as a note id, but there is no
   * `/discover` page — the in-app catalog is an expanded-sidebar tool — so calling
   * it public would reserve a route nothing serves.
   */
  it('does not claim a bare /discover, which no page serves', () => {
    expect(isPublicAppPath('/discover')).toBe(false);
  });
});

describe('public route html class synchronization', () => {
  it('removes public styling when navigating public → app', () => {
    syncPublicRouteHtmlClass('/shared/note/abc');
    expect(document.documentElement.classList.contains(PUBLIC_ROUTE_HTML_CLASS)).toBe(true);

    syncPublicRouteHtmlClass('/note_1');
    expect(document.documentElement.classList.contains(PUBLIC_ROUTE_HTML_CLASS)).toBe(false);
  });

  it('adds public styling when navigating app → public', () => {
    syncPublicRouteHtmlClass('/');
    expect(document.documentElement.classList.contains(PUBLIC_ROUTE_HTML_CLASS)).toBe(false);

    syncPublicRouteHtmlClass('/spaces/join/abc');
    expect(document.documentElement.classList.contains(PUBLIC_ROUTE_HTML_CLASS)).toBe(true);
  });

  it('adds public styling for /upgrade', () => {
    syncPublicRouteHtmlClass('/upgrade');
    expect(document.documentElement.classList.contains(PUBLIC_ROUTE_HTML_CLASS)).toBe(true);
  });
});
