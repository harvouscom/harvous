import { describe, expect, it } from 'vitest';
import { isChunkLoadFailureMessage, isExtensionOriginated } from '../diagnostics-route';

/**
 * Four of the eight issues open in the admin panel on 2026-09-11 were browser extensions
 * throwing inside our document: two `og:type` reads (nothing in this repo has ever read an og
 * tag from the DOM), one `window.ethereum.emit` (no web3 dependency exists), and one
 * unattributable TDZ error.
 *
 * The bar for this filter is that it can never hide one of ours, so most of what follows is
 * about what it must NOT match.
 */
describe('isExtensionOriginated', () => {
  it('matches an extension filename', () => {
    expect(isExtensionOriginated('chrome-extension://abcdefghijklmnop/inject.js', null)).toBe(true);
    expect(isExtensionOriginated('moz-extension://1f2e/content.js', null)).toBe(true);
    expect(isExtensionOriginated('safari-web-extension://A1B2/page.js', null)).toBe(true);
  });

  it('matches a stack made only of extension frames', () => {
    const stack = [
      "TypeError: null is not an object (evaluating 'document.querySelector(\"meta[property=\\'og:type\\']\").content')",
      '    at getMeta (chrome-extension://mnopqrst/share.js:12:9)',
      '    at chrome-extension://mnopqrst/share.js:44:3',
    ].join('\n');
    expect(isExtensionOriginated(null, stack)).toBe(true);
  });

  it('does NOT match our own bundle', () => {
    const stack = [
      "TypeError: Cannot read properties of undefined (reading 'blankLengths')",
      '    at Vt (https://app.harvous.com/assets/PrototypeReviewSample-C1x9.js:1:2048)',
      '    at https://app.harvous.com/assets/index-1uUOH_2w.js:49:118',
    ].join('\n');
    expect(isExtensionOriginated(null, stack)).toBe(false);
    expect(isExtensionOriginated('https://app.harvous.com/assets/index-1uUOH_2w.js', stack)).toBe(false);
  });

  it('does NOT match a public script of ours', () => {
    const stack = '    at https://app.harvous.com/scripts/service-worker-manager.js:31:5';
    expect(isExtensionOriginated(null, stack)).toBe(false);
  });

  /* An extension that wraps our code puts its frame in a stack that is still ours to fix. */
  it('does NOT match a mixed stack that touches our bundle', () => {
    const stack = [
      'TypeError: x is not a function',
      '    at chrome-extension://mnopqrst/hook.js:3:1',
      '    at https://app.harvous.com/assets/index-1uUOH_2w.js:20:7',
    ].join('\n');
    expect(isExtensionOriginated(null, stack)).toBe(false);
  });

  it('does NOT match when there is nothing to go on', () => {
    expect(isExtensionOriginated(null, null)).toBe(false);
    expect(isExtensionOriginated('', '')).toBe(false);
    expect(isExtensionOriginated(undefined, undefined)).toBe(false);
  });
});

describe('isChunkLoadFailureMessage', () => {
  it('matches each engine’s wording of a missing lazy chunk', () => {
    expect(
      isChunkLoadFailureMessage(
        'Failed to fetch dynamically imported module: https://app.harvous.com/assets/PrototypePinSheet-BMsZRtqG.js',
      ),
    ).toBe(true);
    expect(isChunkLoadFailureMessage('Importing a module script failed.')).toBe(true);
    expect(
      isChunkLoadFailureMessage('error loading dynamically imported module: https://app.harvous.com/assets/x-AbCdEfGh.js'),
    ).toBe(true);
    expect(isChunkLoadFailureMessage('Unable to preload CSS for /assets/scan-offer-RP-LgaTI.css')).toBe(true);
  });

  it('does not match ordinary errors', () => {
    expect(isChunkLoadFailureMessage("Cannot read property 'includes' of undefined")).toBe(false);
    expect(isChunkLoadFailureMessage('Failed to fetch')).toBe(false);
  });
});
