/**
 * Verify the Polar catalog matches the local plan registry.
 *
 * Usage: npm run billing:verify
 * Requires POLAR_ACCESS_TOKEN (+ optional POLAR_ENV, product id env vars).
 *
 * Catches the failure that otherwise reaches production silently: a live env var
 * pointing at a sandbox product id (or a price/interval drift after a dashboard edit).
 */

import { Polar } from '@polar-sh/sdk';
import {
  getPlans,
  getPlusProductAnnualId,
  getPlusProductMonthlyId,
} from '../../src/lib/billing-plans';

function polarServer(): 'sandbox' | 'production' {
  const env = (process.env.POLAR_ENV || 'sandbox').toLowerCase();
  return env === 'production' || env === 'live' ? 'production' : 'sandbox';
}

/** Fixed price amount for a Polar product, or null if it has no fixed price. */
function fixedAmount(product: { prices?: Array<{ amountType?: string; priceAmount?: number | null }> }): number | null {
  const fixed = product.prices?.find((p) => p.amountType === 'fixed');
  return typeof fixed?.priceAmount === 'number' ? fixed.priceAmount : null;
}

export async function verifyBillingSetup(): Promise<{ ok: boolean; errors: string[] }> {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) {
    return { ok: false, errors: ['POLAR_ACCESS_TOKEN is required'] };
  }

  const server = polarServer();
  const polar = new Polar({ accessToken, server });
  const errors: string[] = [];

  console.log(`POLAR_ENV → ${server}`);
  console.log(`Registry monthly: ${getPlusProductMonthlyId() || '(unset)'}`);
  console.log(`Registry annual:  ${getPlusProductAnnualId() || '(unset)'}`);
  console.log('');

  const rows: Array<{ productId: string; expected: string; actual: string; listed: boolean; ok: boolean }> = [];

  for (const plan of getPlans()) {
    if (!plan.productId) {
      errors.push(`Missing product id for ${plan.key}/${plan.interval} (env unset)`);
      rows.push({
        productId: '(missing)',
        expected: `${plan.amountCents}/${plan.interval}`,
        actual: 'env unset',
        listed: plan.listed,
        ok: false,
      });
      continue;
    }

    try {
      const product = await polar.products.get({ id: plan.productId });
      const amount = fixedAmount(product);
      const interval = product.recurringInterval;
      const amountOk = amount === plan.amountCents;
      const intervalOk = interval === plan.interval;
      const activeOk = product.isArchived === false;
      const ok = amountOk && intervalOk && activeOk;
      if (!ok) {
        errors.push(
          `${plan.productId}: expected ${plan.amountCents}/${plan.interval}/active, got ${amount}/${interval}/${product.isArchived ? 'archived' : 'active'}`,
        );
      }
      rows.push({
        productId: plan.productId,
        expected: `${plan.amountCents}/${plan.interval}`,
        actual: `${amount}/${interval}/${product.isArchived ? 'archived' : 'active'}`,
        listed: plan.listed,
        ok,
      });
    } catch (error: any) {
      errors.push(`${plan.productId}: ${error?.message || error}`);
      rows.push({
        productId: plan.productId,
        expected: `${plan.amountCents}/${plan.interval}`,
        actual: error?.message || 'fetch failed',
        listed: plan.listed,
        ok: false,
      });
    }
  }

  // Best-effort: confirm a webhook endpoint is registered for our route.
  try {
    const endpoints: string[] = [];
    const list = await polar.webhooks.listWebhookEndpoints({});
    for await (const page of list) {
      for (const ep of page.result?.items ?? []) {
        if (ep.url) endpoints.push(ep.url);
      }
    }
    const hasPolarWebhook = endpoints.some((u) => u.includes('/api/webhooks/polar'));
    console.log(`Webhook endpoints (${endpoints.length}): ${hasPolarWebhook ? 'polar route registered ✓' : 'NO /api/webhooks/polar endpoint'}`);
    if (!hasPolarWebhook) {
      errors.push('No webhook endpoint registered for /api/webhooks/polar — run billing:setup --apply or add it in the dashboard');
    }
  } catch (error: any) {
    console.warn(`Webhook endpoint check skipped: ${error?.message || error}`);
  }

  console.log('\nproductId | expected | actual | listed | ok');
  for (const row of rows) {
    console.log(`${row.productId} | ${row.expected} | ${row.actual} | ${row.listed} | ${row.ok ? 'yes' : 'NO'}`);
  }

  return { ok: errors.length === 0, errors };
}

// Run directly (not when imported by the setup script).
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyBillingSetup()
    .then(({ ok, errors }) => {
      if (!ok) {
        console.error('\nMismatch:');
        for (const e of errors) console.error(`  - ${e}`);
        process.exit(1);
      }
      console.log('\nAll registry products match Polar.');
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
