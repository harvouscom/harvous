import { describe, expect, it } from 'vitest';
import { validateDiagnosticEventInput } from '../record-diagnostic-event';

describe('validateDiagnosticEventInput', () => {
  it('returns null for empty message', () => {
    expect(
      validateDiagnosticEventInput({
        source: 'client_api',
        message: '   ',
        anonymousSessionId: 'abc',
        platform: 'web',
      }),
    ).toBeNull();
  });

  it('returns sanitized input for manual reports', () => {
    const result = validateDiagnosticEventInput({
      source: 'client_manual',
      severity: 'error',
      message: 'Save failed',
      manualNote: 'Could not save my note',
      anonymousSessionId: 'anon-1',
      platform: 'web',
      route: '/n/test-slug',
    });
    expect(result?.manualNote).toBe('Could not save my note');
    expect(result?.issueSignature).toHaveLength(32);
  });
});
