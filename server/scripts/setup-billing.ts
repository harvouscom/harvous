/**
 * Create the Polar catalog for Harvous Plus + Connector and register the
 * webhook endpoint — idempotent, so re-runs are safe.
 *
 * Usage:
 *   npm run billing:setup                       # dry-run: prints what it would create
 *   npm run billing:setup -- --apply            # create in the current POLAR_ENV
 *   npm run billing:setup -- --apply --url=https://harvous.com
 *
 * Requires POLAR_ACCESS_TOKEN (+ POLAR_ENV). The webhook base URL comes from
 * --url or POLAR_WEBHOOK_URL. Prints product ids + the webhook secret to drop
 * into env (secrets are never written to disk automatically).
 *
 * Matching is by product name. If a same-named product exists at a different
 * fixed price, setup creates a new product with a price suffix so the registry
 * can point at the correct SKU without silently reusing the wrong amount.
 *
 * NOT automatable here (do in the dashboard): account approval to sell, tax
 * collection settings, and the checkout embed-origin allowlist.
 */

import { Polar } from '@polar-sh/sdk';
import { verifyBillingSetup } from './verify-billing-setup';

type DesiredProduct = {
  name: string;
  interval: 'month' | 'year';
  amountCents: number;
  envVar: string;
};

const DESIRED: DesiredProduct[] = [
  {
    name: 'Harvous Plus — Founding',
    interval: 'year',
    amountCents: 4500,
    envVar: 'POLAR_PLUS_PRODUCT_FOUNDING_ANNUAL',
  },
  {
    name: 'Harvous Plus (Monthly)',
    interval: 'month',
    amountCents: 500,
    envVar: 'POLAR_PLUS_PRODUCT_MONTHLY',
  },
  {
    name: 'Harvous Plus (Annual)',
    interval: 'year',
    amountCents: 6400,
    envVar: 'POLAR_PLUS_PRODUCT_ANNUAL',
  },
  {
    name: 'Connector (Monthly)',
    interval: 'month',
    amountCents: 500,
    envVar: 'POLAR_CONNECTOR_PRODUCT_MONTHLY',
  },
  {
    name: 'Connector (Annual)',
    interval: 'year',
    amountCents: 6000,
    envVar: 'POLAR_CONNECTOR_PRODUCT_ANNUAL',
  },
];

const WEBHOOK_EVENTS = [
  'subscription.active',
  'subscription.updated',
  'subscription.canceled',
  'subscription.revoked',
  'subscription.past_due',
  'order.paid',
] as const;

const VITE_MIRROR_PREFIXES = ['POLAR_PLUS_PRODUCT_', 'POLAR_CONNECTOR_PRODUCT_'] as const;

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

function polarServer(): 'sandbox' | 'production' {
  const env = (process.env.POLAR_ENV || 'sandbox').toLowerCase();
  return env === 'production' || env === 'live' ? 'production' : 'sandbox';
}

function fixedAmount(product: {
  prices?: Array<{ amountType?: string; priceAmount?: number | null }>;
}): number | null {
  const fixed = product.prices?.find((p) => p.amountType === 'fixed');
  return typeof fixed?.priceAmount === 'number' ? fixed.priceAmount : null;
}

async function main() {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('POLAR_ACCESS_TOKEN is required');
    process.exit(1);
  }

  const apply = process.argv.includes('--apply');
  const server = polarServer();
  const baseUrl = arg('url') || process.env.POLAR_WEBHOOK_URL || '';
  const polar = new Polar({ accessToken, server });

  console.log(`POLAR_ENV → ${server}`);
  console.log(apply ? 'Mode: APPLY (creating)\n' : 'Mode: dry-run (pass --apply to create)\n');

  type Existing = { id: string; name: string; amount: number | null; archived: boolean };
  const existing: Existing[] = [];
  for await (const page of await polar.products.list({})) {
    for (const p of page.result?.items ?? []) {
      if (!p.name) continue;
      existing.push({
        id: p.id,
        name: p.name,
        amount: fixedAmount(p),
        archived: Boolean(p.isArchived),
      });
    }
  }

  const envOut: string[] = [];
  for (const d of DESIRED) {
    const exact = existing.find(
      (p) => !p.archived && p.name === d.name && p.amount === d.amountCents,
    );
    if (exact) {
      console.log(`• ${d.name}: exists → ${exact.id}`);
      envOut.push(`${d.envVar}=${exact.id}`);
      continue;
    }

    const sameNameWrongPrice = existing.find((p) => !p.archived && p.name === d.name);
    const createName =
      sameNameWrongPrice && sameNameWrongPrice.amount !== d.amountCents
        ? `${d.name} $${d.amountCents / 100}`
        : d.name;

    if (sameNameWrongPrice && sameNameWrongPrice.amount !== d.amountCents) {
      console.log(
        `• ${d.name}: existing ${sameNameWrongPrice.id} is $${(sameNameWrongPrice.amount ?? 0) / 100} (want $${d.amountCents / 100}) — using name "${createName}"`,
      );
      const alreadyRenamed = existing.find(
        (p) => !p.archived && p.name === createName && p.amount === d.amountCents,
      );
      if (alreadyRenamed) {
        console.log(`• ${createName}: exists → ${alreadyRenamed.id}`);
        envOut.push(`${d.envVar}=${alreadyRenamed.id}`);
        continue;
      }
    }

    if (!apply) {
      console.log(`• ${createName}: WOULD CREATE ($${d.amountCents / 100}/${d.interval})`);
      continue;
    }

    const product = await polar.products.create({
      name: createName,
      recurringInterval: d.interval,
      prices: [{ amountType: 'fixed', priceAmount: d.amountCents }],
    });
    console.log(`• ${createName}: created → ${product.id}`);
    envOut.push(`${d.envVar}=${product.id}`);
  }

  // ─── Webhook endpoint ───────────────────────────────────────────────
  if (!baseUrl) {
    console.log('\nNo --url / POLAR_WEBHOOK_URL given → skipping webhook endpoint. Pass --url=https://<host>.');
  } else {
    const target = `${baseUrl.replace(/\/$/, '')}/api/webhooks/polar`;
    let already = false;
    for await (const page of await polar.webhooks.listWebhookEndpoints({})) {
      for (const ep of page.result?.items ?? []) {
        if (ep.url === target) already = true;
      }
    }
    if (already) {
      console.log(`\n• Webhook ${target}: already registered (secret unchanged)`);
    } else if (!apply) {
      console.log(`\n• Webhook ${target}: WOULD CREATE for events ${WEBHOOK_EVENTS.join(', ')}`);
    } else {
      const endpoint = await polar.webhooks.createWebhookEndpoint({
        url: target,
        format: 'raw',
        events: [...WEBHOOK_EVENTS],
      });
      console.log(`\n• Webhook ${target}: created → ${endpoint.id}`);
      envOut.push(`POLAR_WEBHOOK_SECRET=${endpoint.secret}`);
    }
  }

  if (envOut.length) {
    console.log('\n─── Put these in env (Netlify for production) ───');
    for (const line of envOut) console.log(line);
    for (const line of envOut) {
      if (VITE_MIRROR_PREFIXES.some((prefix) => line.startsWith(prefix))) {
        console.log(`VITE_${line}`);
      }
    }
  }

  if (apply) {
    console.log('\n─── Verifying (needs ids in process.env; dry-print above if not yet written) ───');
    const { ok, errors } = await verifyBillingSetup();
    if (!ok) {
      console.error('\nVerify found mismatches (write the ids above into .env, then re-run billing:verify):');
      for (const e of errors) console.error(`  - ${e}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
