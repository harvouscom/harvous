/**
 * Hostname decides which app you get.
 *
 * `isDedicatedPrototypeHost` gates the sign-in design, the base path, the Admin pages and the
 * route guards all at once, so a host it does not recognise silently serves Classic. On a
 * tunnel that reads as "the old design is back" rather than as a hostname problem, which is
 * why the tunnel suffixes are tested rather than left to the comment.
 */
import { describe, expect, it } from 'vitest';
import {
  getPrototypeBasePath,
  isDedicatedPrototypeHost,
  isDevTunnelHost,
  isSiteInspiredAuthHost,
  prototypeHref,
} from '../prototype-path';

describe('dev tunnel hosts', () => {
  const tunnels = [
    'dish-primary-texas-composite.trycloudflare.com',
    'abc-123.ngrok-free.app',
    'harvous.ngrok.io',
    'tidy-pug-42.loca.lt',
  ];

  it('counts a tunnel subdomain as a dedicated prototype host', () => {
    for (const host of tunnels) {
      expect(isDevTunnelHost(host)).toBe(true);
      expect(isDedicatedPrototypeHost(host)).toBe(true);
    }
  });

  it('serves the app at the root on a tunnel, not under /prototype', () => {
    // The PWA manifest's start_url is "/", so a tunnel that resolved to /prototype would put
    // Classic behind the Home Screen icon.
    const host = tunnels[0]!;
    expect(getPrototypeBasePath(host)).toBe('');
    expect(prototypeHref('settings/reminders', host)).toBe('/settings/reminders');
  });

  it('gives a tunnel the site-inspired sign-in, like the real hosts', () => {
    expect(isSiteInspiredAuthHost(tunnels[0]!)).toBe(true);
  });

  it('keeps the real hosts working', () => {
    for (const host of ['app.harvous.com', 'new.harvous.com', 'localhost']) {
      expect(isDedicatedPrototypeHost(host)).toBe(true);
    }
  });

  it('does not mistake a lookalike domain for a tunnel', () => {
    // Suffix match, so the boundary matters: only a subdomain *of* the provider counts.
    for (const host of [
      'trycloudflare.com.evil.example',
      'nottrycloudflare.com.example',
      'example.com',
      'harvous.com',
    ]) {
      expect(isDevTunnelHost(host)).toBe(false);
      expect(isDedicatedPrototypeHost(host)).toBe(false);
    }
  });
});
