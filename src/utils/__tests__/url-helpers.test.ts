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

  it('returns classic /note/:slug on app.harvous.com from a shared note page', () => {
    mockLocation('app.harvous.com', '/shared/note/abc123');
    expect(noteUrlForCurrentSurface('note_1781400844391')).toBe('/note/1781400844391');
  });

  it('returns /prototype/:slug on app.harvous.com inside the prototype shell', () => {
    mockLocation('app.harvous.com', '/prototype/fWdqYzt');
    expect(noteUrlForCurrentSurface('note_1781400844391')).toBe('/prototype/fWdqYzt');
  });
});
