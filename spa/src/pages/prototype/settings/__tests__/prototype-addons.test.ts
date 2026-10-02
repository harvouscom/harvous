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

describe('Connector is part of Plus, not a second subscription', () => {
  it('never sells or cancels Connector on its own', () => {
    const source = addonsSource();
    // The add-on purchase and cancel UI was retired when Connector folded into Plus.
    expect(source).not.toContain("plan: 'connector'");
    expect(source).not.toContain('connectorBilling');
    expect(source).not.toContain('startConnectorCheckout');
  });

  it('cancels and resumes only the Plus subscription, with an explicit flag', () => {
    const source = addonsSource();
    const calls = source.match(/cancelBilling\.mutate\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(source).not.toMatch(/cancelBilling\.mutate\((?:true|false)\)/);
  });

  it('lists Connector as part of Plus rather than linking to it as a separate row', () => {
    // The Connector has its own settings page; the Plan page only says it is included.
    expect(addonsSource()).not.toContain("settings/connector");
  });

  it('does not claim the founding price outside /upgrade, where the cap is live', () => {
    const source = addonsSource();
    expect(source).not.toContain('`Founding price · ');
    // The badge is driven by the purchased product, not by planKey — founding
    // and standard Plus both carry key 'plus'.
    expect(source).toContain('isFounding');
  });
});
