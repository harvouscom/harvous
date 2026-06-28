import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AUTH_FORM_DRAFT_KEY,
  AUTH_SIGNUP_PROFILE_KEY,
  clearAuthDraft,
  readAuthDraft,
  writeAuthDraft,
} from '../auth-form-draft';

describe('auth-form-draft', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('returns null when no draft is stored', () => {
    expect(readAuthDraft('signIn')).toBeNull();
  });

  it('writes and reads a sign-in draft for the matching mode', () => {
    writeAuthDraft({ mode: 'signIn', step: 'enterEmail', email: 'user@example.com' });
    expect(readAuthDraft('signIn')).toEqual({
      mode: 'signIn',
      step: 'enterEmail',
      email: 'user@example.com',
    });
  });

  it('carries email from sign-up to sign-in', () => {
    writeAuthDraft({
      mode: 'signUp',
      step: 'enterEmail',
      email: 'user@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    expect(readAuthDraft('signIn')).toEqual({
      mode: 'signIn',
      step: 'enterEmail',
      email: 'user@example.com',
    });
  });

  it('carries email from sign-in to sign-up and restores sign-up names', () => {
    writeAuthDraft({
      mode: 'signUp',
      step: 'enterEmail',
      email: 'old@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    writeAuthDraft({ mode: 'signIn', step: 'enterEmail', email: 'user@example.com' });
    expect(readAuthDraft('signUp')).toEqual({
      mode: 'signUp',
      step: 'enterEmail',
      email: 'user@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
  });

  it('does not carry the OTP step across modes', () => {
    writeAuthDraft({ mode: 'signIn', step: 'enterCode', email: 'user@example.com' });
    expect(readAuthDraft('signUp')).toEqual({
      mode: 'signUp',
      step: 'enterEmail',
      email: 'user@example.com',
      firstName: '',
      lastName: '',
    });
  });

  it('clears the stored draft and sign-up profile', () => {
    writeAuthDraft({
      mode: 'signUp',
      step: 'enterEmail',
      email: 'user@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    clearAuthDraft();
    expect(sessionStorage.getItem(AUTH_FORM_DRAFT_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_SIGNUP_PROFILE_KEY)).toBeNull();
    expect(readAuthDraft('signIn')).toBeNull();
  });

  it('returns null for invalid stored JSON', () => {
    sessionStorage.setItem(AUTH_FORM_DRAFT_KEY, '{not json');
    expect(readAuthDraft('signIn')).toBeNull();
  });
});
