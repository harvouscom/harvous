import { describe, expect, it } from 'vitest';
import {
  isOnboardingThreadId,
  isOnboardingSystemNote,
  isCountableUserNote,
  onboardingThreadIdForUser,
  ONBOARDING_WELCOME_FOLDER_LABEL,
} from '../purge-onboarding-content';

describe('purge-onboarding-content helpers', () => {
  const userId = 'user_test123';

  it('onboardingThreadIdForUser uses stable prefix', () => {
    expect(onboardingThreadIdForUser(userId)).toBe(`thread_onboarding_${userId}`);
  });

  it('isOnboardingThreadId matches onboarding threads only', () => {
    expect(isOnboardingThreadId(`thread_onboarding_${userId}`)).toBe(true);
    expect(isOnboardingThreadId('thread_abc123')).toBe(false);
    expect(isOnboardingThreadId('thread_unorganized')).toBe(false);
    expect(isOnboardingThreadId(null)).toBe(false);
  });

  it('isOnboardingSystemNote requires onboarding thread and system addedBy', () => {
    expect(
      isOnboardingSystemNote({
        threadId: `thread_onboarding_${userId}`,
        addedBy: 'system',
      }),
    ).toBe(true);
    expect(
      isOnboardingSystemNote({
        threadId: `thread_onboarding_${userId}`,
        addedBy: 'user',
      }),
    ).toBe(false);
    expect(
      isOnboardingSystemNote({
        threadId: 'thread_other',
        addedBy: 'system',
      }),
    ).toBe(false);
  });

  it('isCountableUserNote excludes onboarding thread, system seed, and Welcome folder', () => {
    expect(
      isCountableUserNote({
        threadId: `thread_onboarding_${userId}`,
        addedBy: 'system',
        primaryCollection: null,
      }),
    ).toBe(false);
    expect(
      isCountableUserNote({
        threadId: 'thread_abc',
        addedBy: 'system',
        primaryCollection: null,
      }),
    ).toBe(false);
    expect(
      isCountableUserNote({
        threadId: 'thread_abc',
        addedBy: 'user',
        primaryCollection: ONBOARDING_WELCOME_FOLDER_LABEL,
      }),
    ).toBe(false);
    expect(
      isCountableUserNote({
        threadId: 'thread_abc',
        addedBy: 'user',
        primaryCollection: 'John',
      }),
    ).toBe(true);
  });
});
