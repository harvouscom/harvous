import { describe, expect, it } from 'vitest';
import {
  computeIssueSignature,
  sanitizeDiagnosticPayload,
  topStackFrame,
} from '../diagnostics-sanitize';
import { redactDiagnosticRoute, scrubDiagnosticText } from '@/utils/diagnostics-route';

describe('redactDiagnosticRoute', () => {
  it('redacts note and token segments', () => {
    expect(redactDiagnosticRoute('/n/my-note-slug')).toBe('/n/my-note-slug');
    expect(redactDiagnosticRoute('/note/note_abc123')).toBe('/note/:id');
    expect(redactDiagnosticRoute('/spaces/join/abcdef0123456789abcdef0123456789')).toBe(
      '/spaces/join/:token',
    );
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
