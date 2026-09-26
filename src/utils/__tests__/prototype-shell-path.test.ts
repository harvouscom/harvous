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

  /*
   * A church's join link is the first page a congregant sees, usually from a QR on a
   * bulletin — it must load as a public page on the dedicated host, not inside the
   * app shell the visitor has no account for yet.
   */
  it('treats a church join link as a public route, and reserves the bare segment', () => {
    expect(isPublicAppPath('/churches/join/AbCdEf123456')).toBe(true);
    expect(isPrototypeShellPath('/churches/join/AbCdEf123456')).toBe(false);
    expect(isPublicAppPath('/churches')).toBe(false);
    expect(isReservedPrototypeSegment('churches')).toBe(true);
    expect(isPrototypeNotePath('/churches')).toBe(false);
  });
});

describe('boot-script mirror (public/scripts/prototype-shell-path.js)', () => {
  /*
   * The pre-React boot script and the service worker read their own copy. A path the
   * TypeScript side calls public but the mirror calls shell loads a first paint in the
   * wrong chrome, which is the Discover bug over again.
   */
  it('agrees with prototype-path.ts on the church join link', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const code = readFileSync(resolve(process.cwd(), 'public/scripts/prototype-shell-path.js'), 'utf8');
    // The script installs itself on `window`; hand it a stand-in so the test reads
    // this copy, not whatever an earlier import left on the real global.
    const holder: Record<string, unknown> = {};
    new Function('window', 'self', code)(holder, holder);
    const mirror = holder.__harvousPrototypeShellPath as {
      isPrototypeShellPath: (p: string, h: string) => boolean;
      isPublicAppPath: (p: string) => boolean;
      isPrototypeNotePath: (p: string, h: string) => boolean;
    };
    expect(mirror.isPublicAppPath('/churches/join/AbCdEf123456')).toBe(true);
    expect(mirror.isPrototypeShellPath('/churches/join/AbCdEf123456', 'localhost')).toBe(false);
    expect(mirror.isPrototypeNotePath('/churches', 'localhost')).toBe(false);
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
