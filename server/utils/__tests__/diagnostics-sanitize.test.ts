import { describe, expect, it } from 'vitest';
import {
  computeIssueSignature,
  sanitizeDiagnosticPayload,
  topStackFrame,
} from '../diagnostics-sanitize';
import {
  normalizeDiagnosticMessageForSignature,
  redactDiagnosticRoute,
  scrubDiagnosticText,
} from '@/utils/diagnostics-route';

describe('redactDiagnosticRoute', () => {
  it('redacts note and token segments', () => {
    expect(redactDiagnosticRoute('/n/my-note-slug')).toBe('/n/my-note-slug');
    expect(redactDiagnosticRoute('/note/note_abc123')).toBe('/note/:id');
    expect(redactDiagnosticRoute('/spaces/join/abcdef0123456789abcdef0123456789')).toBe(
      '/spaces/join/:token',
    );
  });

  it('redacts flat note slugs at the root but keeps reserved segments', () => {
    // Notes are first-class at /{base62}; without this the slug is stored verbatim and
    // one error across N notes becomes N issue rows.
    expect(redactDiagnosticRoute('/fWdqYzt')).toBe('/:id');
    expect(redactDiagnosticRoute('/settings')).toBe('/settings');
    expect(redactDiagnosticRoute('/upgrade')).toBe('/upgrade');
    expect(redactDiagnosticRoute('/settings/support')).toBe('/settings/support');
    expect(redactDiagnosticRoute('/')).toBe('/');
  });
});

describe('normalizeDiagnosticMessageForSignature', () => {
  it('collapses build hashes so one chunk failure is one issue', () => {
    const a = normalizeDiagnosticMessageForSignature(
      'Failed to fetch dynamically imported module: https://app.harvous.com/assets/PrototypeSupportPage-CJECPRhB.js',
    );
    const b = normalizeDiagnosticMessageForSignature(
      'Failed to fetch dynamically imported module: https://app.harvous.com/assets/PrototypeSupportPage-Dt9ieVmR.js',
    );
    expect(a).toBe(b);
  });

  it('collapses chunk ids and package versions', () => {
    const a = normalizeDiagnosticMessageForSignature('Loading chunk 9573 failed. (@clerk/clerk-js@5.127.1)');
    const b = normalizeDiagnosticMessageForSignature('Loading chunk 1192 failed. (@clerk/clerk-js@5.128.0)');
    expect(a).toBe(b);
  });

  it('drops the SQL params tail', () => {
    expect(
      normalizeDiagnosticMessageForSignature('Failed query: select "id" from "Entitlements"\nparams: [user],active'),
    ).toBe('Failed query: select "id" from "Entitlements"');
  });
});

describe('scrubDiagnosticText', () => {
  it('removes emails and ids', () => {
    const out = scrubDiagnosticText('Failed for user_abc at note_xyz derek@harvous.com');
    expect(out).not.toContain('derek@harvous.com');
    expect(out).toContain('[email]');
    expect(out).toContain('[user]');
    expect(out).toContain('[note]');
  });
});

describe('computeIssueSignature', () => {
  it('is stable for the same normalized input', () => {
    const a = computeIssueSignature('TypeError: x is null', '/n/:id', 'at foo (bar.js:1:1)');
    const b = computeIssueSignature('TypeError: x is null', '/n/:id', 'at foo (bar.js:1:1)');
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });

  it('groups the same fault seen on different routes', () => {
    // route is a facet (topRoute on the summary), not part of issue identity — it was
    // splitting one error into a row per route.
    const home = computeIssueSignature('TypeError: x is null', '/', 'at foo (bar.js:1:1)');
    const settings = computeIssueSignature('TypeError: x is null', '/settings', 'at foo (bar.js:1:1)');
    expect(home).toBe(settings);
  });

  it('groups the same chunk failure across deploys', () => {
    const before = computeIssueSignature(
      'Failed to fetch dynamically imported module: https://app.harvous.com/assets/PrototypeChurchPage-BXQxzH_e.js',
      '/settings',
      null,
    );
    const after = computeIssueSignature(
      'Failed to fetch dynamically imported module: https://app.harvous.com/assets/PrototypeChurchPage-DARCVtjk.js',
      '/settings/church',
      null,
    );
    expect(before).toBe(after);
  });

  it('still separates genuinely different errors', () => {
    const a = computeIssueSignature('TypeError: x is null', '/', null);
    const b = computeIssueSignature('TypeError: y is undefined', '/', null);
    expect(a).not.toBe(b);
  });
});

describe('topStackFrame', () => {
  it('picks first at-frame line', () => {
    const stack = 'Error: boom\n    at doThing (app.js:10:5)\n    at run (app.js:20:1)';
    expect(topStackFrame(stack)).toContain('doThing');
  });
});

describe('sanitizeDiagnosticPayload', () => {
  /*
   * The client has always sent these three; the metadata allowlist dropped them, which is why
   * an extension's crash and ours looked identical in the admin list. Keeping them is what
   * makes the panel's script-origin line possible.
   */
  it('keeps the script origin of a client error', () => {
    const result = sanitizeDiagnosticPayload({
      source: 'client_js',
      message: 'Something broke',
      anonymousSessionId: 'sess-123',
      platform: 'web',
      metadata: {
        scriptFilename: 'https://app.harvous.com/assets/index-1uUOH_2w.js',
        scriptLineno: 49,
        scriptColno: 118,
      },
    });
    expect(result?.metadata?.scriptFilename).toBe('https://app.harvous.com/assets/index-1uUOH_2w.js');
    expect(result?.metadata?.scriptLineno).toBe(49);
    expect(result?.metadata?.scriptColno).toBe(118);
  });

  it('strips a query string off the script filename', () => {
    const result = sanitizeDiagnosticPayload({
      source: 'client_js',
      message: 'Something broke',
      anonymousSessionId: 'sess-123',
      platform: 'web',
      metadata: { scriptFilename: 'https://app.harvous.com/assets/index.js?token=abc' },
    });
    expect(result?.metadata?.scriptFilename).toBe('https://app.harvous.com/assets/index.js');
  });

  /* Rejected at ingest too, so a build predating the client-side filter can't keep filing these. */
  it('rejects an error thrown by a browser extension', () => {
    const byFilename = sanitizeDiagnosticPayload({
      source: 'client_js',
      message: 'window.ethereum.emit is not a function',
      anonymousSessionId: 'sess-123',
      platform: 'web',
      metadata: { scriptFilename: 'chrome-extension://abcdefgh/inject.js' },
    });
    expect(byFilename).toBeNull();

    const byStack = sanitizeDiagnosticPayload({
      source: 'client_js',
      message: "null is not an object (evaluating 'document.querySelector(...).content')",
      anonymousSessionId: 'sess-123',
      platform: 'web',
      stack: 'TypeError\n    at chrome-extension://abcdefgh/share.js:12:9',
    });
    expect(byStack).toBeNull();
  });

  it('still accepts our own crash with an extension somewhere in the stack', () => {
    const result = sanitizeDiagnosticPayload({
      source: 'client_js',
      message: "Cannot read properties of undefined (reading 'blankLengths')",
      anonymousSessionId: 'sess-123',
      platform: 'web',
      stack:
        'TypeError\n    at chrome-extension://abcdefgh/hook.js:3:1\n    at https://app.harvous.com/assets/index.js:20:7',
    });
    expect(result).not.toBeNull();
  });

  it('accepts valid client payload', () => {
    const result = sanitizeDiagnosticPayload({
      source: 'client_js',
      severity: 'error',
      message: 'Something broke',
      anonymousSessionId: 'sess-123',
      platform: 'web',
      route: '/settings/support',
    });
    expect(result?.source).toBe('client_js');
    expect(result?.issueSignature).toHaveLength(32);
  });

  it('passes through a valid sourceEnv', () => {
    const result = sanitizeDiagnosticPayload({
      source: 'client_js',
      message: 'Something broke',
      anonymousSessionId: 'sess-123',
      platform: 'web',
      sourceEnv: 'dev',
    });
    expect(result?.sourceEnv).toBe('dev');
  });

  it('defaults sourceEnv to prod when missing or invalid', () => {
    const missing = sanitizeDiagnosticPayload({
      source: 'client_js',
      message: 'Something broke',
      anonymousSessionId: 'sess-123',
      platform: 'web',
    });
    expect(missing?.sourceEnv).toBe('prod');

    const invalid = sanitizeDiagnosticPayload({
      source: 'client_js',
      message: 'Something broke',
      anonymousSessionId: 'sess-123',
      platform: 'web',
      sourceEnv: 'staging',
    });
    expect(invalid?.sourceEnv).toBe('prod');
  });

  it('rejects oversize session id', () => {
    const result = sanitizeDiagnosticPayload({
      source: 'client_js',
      message: 'x',
      anonymousSessionId: 'x'.repeat(100),
      platform: 'web',
    });
    expect(result).toBeNull();
  });

  it('rejects invalid source', () => {
    expect(
      sanitizeDiagnosticPayload({
        source: 'invalid',
        message: 'x',
        anonymousSessionId: 'sess',
        platform: 'web',
      }),
    ).toBeNull();
  });

  it('drops leftover instrumentation, Clerk remounts, and insecure-context noise', () => {
    // Old PWA builds keep posting these. Capture filters them too, but ingest is the
    // backstop so they cannot keep filling the admin list after a deploy.
    const noise = [
      '[push-nav] client navigate path=/read/today via=visible-peek waitedMs=0',
      '[push-nav] probe from setup',
      "@clerk/clerk-react: You've added multiple <ClerkProvider> components in your React component tree. Wrap your components in a single <ClerkProvider>.",
      'The operation is insecure.',
      'WebSocket not available: The operation is insecure.',
      "Failed to execute 'open' on 'IDBFactory': The operation is insecure.",
      "'text/html' is not a valid JavaScript MIME type.",
    ];
    for (const message of noise) {
      expect(
        sanitizeDiagnosticPayload({
          source: 'client_js',
          message,
          anonymousSessionId: 'sess-123',
          platform: 'web',
        }),
        message,
      ).toBeNull();
    }
  });
});
