import { afterEach, describe, expect, it } from 'vitest';
import { noteUrlForCurrentSurface } from '../url-helpers';

describe('noteUrlForCurrentSurface', () => {
  const originalLocation = window.location;

  function mockLocation(hostname: string, pathname: string) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { hostname, pathname },
    });
  }

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('returns root /:base62-slug on new.harvous.com from a shared note page', () => {
    mockLocation('new.harvous.com', '/shared/note/abc123');
    // note_1781400844391 base62-encodes to fWdqYzt
    expect(noteUrlForCurrentSurface('note_1781400844391')).toBe('/fWdqYzt');
  });

  // app.harvous.com is a dedicated prototype host (see `DEDICATED_PROTOTYPE_HOSTS` in
  // `src/lib/prototype-path.ts`), so it always resolves to the root base62-slug route,
  // regardless of the page it's linked from.
  it('returns root /:base62-slug on app.harvous.com from a shared note page', () => {
    mockLocation('app.harvous.com', '/shared/note/abc123');
    expect(noteUrlForCurrentSurface('note_1781400844391')).toBe('/fWdqYzt');
  });

  it('returns classic /note/:slug on a non-dedicated host from a shared note page', () => {
    mockLocation('harvous-preview.netlify.app', '/shared/note/abc123');
    expect(noteUrlForCurrentSurface('note_1781400844391')).toBe('/note/1781400844391');
  });

  it('returns legacy /prototype/:slug on a non-dedicated host inside the prototype shell', () => {
    mockLocation('harvous-preview.netlify.app', '/prototype/fWdqYzt');
    expect(noteUrlForCurrentSurface('note_1781400844391')).toBe('/prototype/fWdqYzt');
  });
});
