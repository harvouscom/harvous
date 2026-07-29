import { afterEach, describe, expect, it } from 'vitest';
import {
  consumePendingComposeSession,
  markPendingComposeSession,
} from '../pending-compose-session';

afterEach(() => {
  sessionStorage.clear();
});

describe('pending compose session bridge', () => {
  it('marks and consumes a one-shot compose flag', () => {
    expect(consumePendingComposeSession()).toBe(false);
    markPendingComposeSession();
    expect(consumePendingComposeSession()).toBe(true);
    expect(consumePendingComposeSession()).toBe(false);
  });
});
