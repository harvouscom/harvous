/**
 * Verify Paddle catalog matches the local plan registry.
 *
 * Usage: npm run billing:verify
 * Requires PADDLE_API_KEY (+ optional PADDLE_ENV, price id env vars).
 */

import { Environment, Paddle } from '@paddle/paddle-node-sdk';
import { PLANS, PLUS_PRICE_ANNUAL_ID, PLUS_PRICE_MONTHLY_ID } from '../../src/lib/billing-plans';

function paddleEnv(): Environment {
  const env = (process.env.PADDLE_ENV || 'sandbox').toLowerCase();
  return env === 'production' || env === 'live' ? Environment.production : Environment.sandbox;
}

async function main() {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) {
    console.error('PADDLE_API_KEY is required');
    process.exit(1);
  }

  const env = paddleEnv();
  const paddle = new Paddle(apiKey, { environment: env });
  const errors: string[] = [];

  console.log(`PADDLE_ENV → ${env === Environment.production ? 'production' : 'sandbox'}`);
  console.log(`Registry monthly: ${PLUS_PRICE_MONTHLY_ID || '(unset)'}`);
  console.log(`Registry annual:  ${PLUS_PRICE_ANNUAL_ID || '(unset)'}`);
  console.log('');

  const rows: Array<{
    priceId: string;
    expectedAmount: string;
    expectedInterval: string;
    listed: boolean;
    ok: boolean;
    detail: string;
  }> = [];

  for (const plan of PLANS) {
    if (!plan.priceId) {
      errors.push(`Missing price id for ${plan.key}/${plan.interval}`);
      rows.push({
        priceId: '(missing)',
        expectedAmount: String(plan.amountCents),
        expectedInterval: plan.interval,
        listed: plan.listed,
        ok: false,
        detail: 'env unset',
      });
      continue;
    }

    try {
      const price = await paddle.prices.get(plan.priceId);
      const amount = price.unitPrice?.amount;
      const interval = price.billingCycle?.interval;
      const status = price.status;
      const amountOk = amount === String(plan.amountCents);
      const intervalOk = interval === plan.interval;
      const statusOk = status === 'active';
      const prefixOk =
        env === Environment.sandbox
          ? plan.priceId.startsWith('pri_')
          : plan.priceId.startsWith('pri_');
      // Sandbox vs live are separate accounts — id prefix alone is not enough;
      // API key/env mismatch surfaces as get failures.
      const ok = amountOk && intervalOk && statusOk && prefixOk;
      if (!ok) {
        errors.push(
          `${plan.priceId}: expected ${plan.amountCents}/${plan.interval}/active, got ${amount}/${interval}/${status}`,
        );
      }
      rows.push({
        priceId: plan.priceId,
        expectedAmount: String(plan.amountCents),
        expectedInterval: plan.interval,
        listed: plan.listed,
        ok,
        detail: `${amount} ${interval} ${status}`,
      });
    } catch (error: any) {
      errors.push(`${plan.priceId}: ${error?.message || error}`);
      rows.push({
        priceId: plan.priceId,
        expectedAmount: String(plan.amountCents),
        expectedInterval: plan.interval,
        listed: plan.listed,
        ok: false,
        detail: error?.message || 'fetch failed',
      });
    }
  }

  console.log('priceId | expected | actual | listed | ok');
  for (const row of rows) {
    console.log(
      `${row.priceId} | ${row.expectedAmount}/${row.expectedInterval} | ${row.detail} | ${row.listed} | ${row.ok ? 'yes' : 'NO'}`,
    );
  }

  if (errors.length) {
    console.error('\nMismatch:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log('\nAll registry prices match Paddle.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
