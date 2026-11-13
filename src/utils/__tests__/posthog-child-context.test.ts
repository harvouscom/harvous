import { describe, expect, it } from 'vitest';
import { childNotebookContext } from '../posthog';

/*
 * PostHog must record nothing on the pages a child can reach or that carry child data (COPPA, and the
 * notice's "no optional analytics"). The child's "Give it to my parent" button lands on adult sign-in with
 * the destination URL-encoded, which the filter used to miss.
 */
describe('PostHog child-notebook filter', () => {
  it.each([
    'https://app.harvous.com/sign-in?redirect_url=%2Fsettings%2Fchild-accounts&child_return=1',
    'https://app.harvous.com/sign-in?redirect_url=%2Fsettings%2Fchild-accounts',
    'https://app.harvous.com/sign-in?redirect_url=%2fsettings%2ffamily',
    'https://app.harvous.com/settings/child-accounts?child=child_96c2066d-db00-4b16-a087-472d927d375f',
    'https://app.harvous.com/settings/family',
    'https://kids.harvous.com/kids.html',
  ])('drops %s', (url) => {
    expect(childNotebookContext.test(url)).toBe(true);
  });

  it.each([
    'https://app.harvous.com/',
    'https://app.harvous.com/sign-in?redirect_url=%2Fsettings%2Fappearance',
    'https://app.harvous.com/settings/appearance',
  ])('keeps %s', (url) => {
    expect(childNotebookContext.test(url)).toBe(false);
  });
});
