import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatBillingStatusLine } from '../../../../lib/billing-manage-copy';
import { resolveSharedSpacesAddonBadge } from '../PrototypeAddonsPage';

const addonsSource = () =>
  readFileSync(
    resolve(process.cwd(), 'spa/src/pages/prototype/settings/PrototypeAddonsPage.tsx'),
    'utf8',
  );

describe('resolveSharedSpacesAddonBadge', () => {
  it('shows Active when the add-on is subscribed', () => {
    expect(resolveSharedSpacesAddonBadge({ hasSharedSpaces: true, memberOfCount: 2 })).toBe('Active');
  });

  it('shows member count when joined but not subscribed', () => {
    expect(resolveSharedSpacesAddonBadge({ hasSharedSpaces: false, memberOfCount: 1 })).toBe('In 1 space');
    expect(resolveSharedSpacesAddonBadge({ hasSharedSpaces: false, memberOfCount: 3 })).toBe('In 3 spaces');
  });

  it('shows no badge when not subscribed and not in any shared space', () => {
    expect(resolveSharedSpacesAddonBadge({ hasSharedSpaces: false, memberOfCount: 0 })).toBeUndefined();
  });
});

describe('plan manage status copy', () => {
  it('distinguishes renew vs end for Settings Plan sublabel', () => {
    const billing = {
      interval: 'month' as const,
      amountCents: 500,
      currency: 'USD',
      currentPeriodEnd: '2026-08-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
    };
    expect(formatBillingStatusLine(billing).startsWith('Renews')).toBe(true);
    expect(formatBillingStatusLine({ ...billing, cancelAtPeriodEnd: true }).startsWith('Ends')).toBe(
      true,
    );
  });
});

describe('Plus and Connector are separate subscriptions', () => {
  it('scopes every cancel/resume call to a plan', () => {
    const source = addonsSource();
    const calls = source.match(/cancelBilling\.mutate\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
    // A bare mutate(true/false) would cancel whichever subscription the server
    // happened to find first — Connector could take down Plus.
    expect(source).not.toMatch(/cancelBilling\.mutate\((?:true|false)\)/);
    expect(source).toContain("plan: 'connector'");
    expect(source).toContain("plan: 'plus'");
  });

  it('reads Connector state from its own subscription, not the Plus one', () => {
    const source = addonsSource();
    expect(source).toContain('manage?.connector ?? subscription?.connectorBilling');
    expect(source).toContain('hasConnector');
  });

  it('reassures the user that canceling Connector leaves Plus alone', () => {
    expect(addonsSource()).toContain('is not affected');
  });

  it('hides the Connector add-on card until the product is listed (or already active)', () => {
    const source = addonsSource();
    expect(source).toContain('hasConnector || connectorMonthPlan || connectorYearPlan');
  });

  it('does not claim the founding price outside /upgrade, where the cap is live', () => {
    const source = addonsSource();
    expect(source).not.toContain('`Founding price · ');
    // The badge is driven by the purchased product, not by planKey — founding
    // and standard Plus both carry key 'plus'.
    expect(source).toContain('isFounding');
  });
});
