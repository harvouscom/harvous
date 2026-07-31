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
});
