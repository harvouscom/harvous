import { describe, expect, it } from 'vitest';
import { isOnboardingSystemNote } from '../purge-onboarding-content';

/**
 * ensurePersonalHomeSpace excludes onboarding via NOT_ONBOARDING_* SQL fragments.
 * These unit tests document eligibility without requiring a live database.
 */
describe('ensurePersonalHomeSpace onboarding exclusion', () => {
  const userId = 'user_home';

  it('onboarding system note would be excluded from My Home backfill', () => {
    const onboardingNote = {
      threadId: `thread_onboarding_${userId}`,
      addedBy: 'system' as const,
      spaceId: null,
      noteType: 'default' as const,
    };
    expect(isOnboardingSystemNote(onboardingNote)).toBe(true);
  });

  it('regular unorganized note is eligible for backfill', () => {
    const regularNote = {
      threadId: 'thread_unorganized',
      addedBy: 'user' as const,
      spaceId: null,
      noteType: 'default' as const,
    };
    expect(isOnboardingSystemNote(regularNote)).toBe(false);
  });
});
