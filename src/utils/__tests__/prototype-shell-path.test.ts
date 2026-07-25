import { afterEach, describe, expect, it } from 'vitest';
import {
  isPrototypeNotePath,
  isPrototypeShellPath,
  isPublicAppPath,
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
  it('uses /n/$noteId as the dedicated-host canonical route', () => {
    expect(prototypeNoteRouteTo('localhost')).toBe('/n/$noteId');
    expect(prototypeNoteRouteTo('new.harvous.com')).toBe('/n/$noteId');
    expect(prototypeNoteRouteTo('app.harvous.com')).toBe('/n/$noteId');
    expect(prototypeNoteRoutePaths('localhost')).toEqual({
      canonicalChildPath: 'n/$noteId',
      compatibilityChildPath: '$noteId',
    });
    expect(prototypeHref('fXvv5uY', 'localhost')).toBe('/n/fXvv5uY');
    expect(prototypeHref('settings/account', 'localhost')).toBe('/settings/account');
    expect(isPrototypeShellPath('/n/fXvv5uY')).toBe(true);
    expect(isPrototypeNotePath('/n/fXvv5uY')).toBe(true);
    expect(matchPrototypeNoteId('/n/fXvv5uY')).toBe('fXvv5uY');
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
  it('treats join, shared, invitation, and upgrade as public marketing routes', () => {
    expect(isPublicAppPath('/spaces/join/abc')).toBe(true);
    expect(isPublicAppPath('/shared/note/abc')).toBe(true);
    expect(isPublicAppPath('/invitations/abc')).toBe(true);
    expect(isPublicAppPath('/upgrade')).toBe(true);
    expect(isPublicAppPath('/addon')).toBe(true);
    expect(isPublicAppPath('/')).toBe(false);
    expect(isPublicAppPath('/settings/addons')).toBe(false);
  });
});

describe('public route html class synchronization', () => {
  it('removes public styling when navigating public → app', () => {
    syncPublicRouteHtmlClass('/shared/note/abc');
    expect(document.documentElement.classList.contains(PUBLIC_ROUTE_HTML_CLASS)).toBe(true);

    syncPublicRouteHtmlClass('/n/note_1');
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
