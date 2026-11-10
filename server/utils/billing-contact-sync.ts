/** Reporting copies only. Entitlements continue to be resolved by Harvous, never Clerk metadata. */
import { createClerkClient } from '@clerk/backend';
import { planForProductId } from '@/lib/billing-plans';
import { tagAsAppUser } from '@/utils/audienceful';
import { getPolarClient, isPolarConfigured } from './polar-client';

export type ContactSubscription = {
  id: string;
  productId: string;
  status: string;
  createdAt: Date;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

const ACCESS_STATUSES = new Set(['active', 'trialing', 'past_due']);

/** Choose current personal Plus before historical subscriptions; church purchases never grant personal Plus. */
export function billingContactFields(subscriptions: ContactSubscription[]) {
  const personal = subscriptions
    .filter((sub) => planForProductId(sub.productId)?.key === 'plus')
    .sort((a, b) =>
      Number(ACCESS_STATUSES.has(b.status)) - Number(ACCESS_STATUSES.has(a.status)) ||
      b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id),
    );
  const sub = personal[0];
  const hasAccess = Boolean(sub && ACCESS_STATUSES.has(sub.status));
  const periodEnd = sub?.currentPeriodEnd?.toISOString() ?? '';
  return {
    billing_plan: hasAccess ? 'plus' : 'free',
    billing_subscription_status: sub?.status ?? 'none',
    billing_interval: sub ? planForProductId(sub.productId)!.interval : '',
    billing_current_period_end: periodEnd,
    billing_renews_at: hasAccess && !sub!.cancelAtPeriodEnd ? periodEnd : '',
    billing_cancel_at_period_end: Boolean(sub?.cancelAtPeriodEnd),
  };
}

export async function loadBillingContactFields(userId: string) {
  if (!isPolarConfigured()) throw new Error('POLAR_ACCESS_TOKEN is required for billing contact sync');
  // Fail closed on an incomplete catalog: otherwise real subscribers could be labeled Free.
  if (!process.env.POLAR_PLUS_PRODUCT_MONTHLY || !process.env.POLAR_PLUS_PRODUCT_ANNUAL) {
    throw new Error('Both Plus product IDs are required for billing contact sync');
  }
  const subscriptions: ContactSubscription[] = [];
  const pages = await getPolarClient().subscriptions.list({ externalCustomerId: [userId] });
  for await (const page of pages) subscriptions.push(...(page.result?.items ?? []));
  return billingContactFields(subscriptions);
}

/** Await all writes so Polar retries failures rather than acknowledging lost updates. */
export async function syncBillingContact(userId: string, options: { apply: boolean }) {
  const fields = await loadBillingContactFields(userId);
  if (!options.apply) return fields;
  if (!process.env.CLERK_SECRET_KEY || !process.env.AUDIENCEFUL_API_KEY) {
    throw new Error('CLERK_SECRET_KEY and AUDIENCEFUL_API_KEY are required for billing contact sync');
  }
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const user = await clerk.users.getUser(userId);
  const email = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress;
  if (!email) throw new Error('Billing contact has no primary email');

  const previous = user.privateMetadata.harvous_billing as Record<string, unknown> | undefined;
  // Avoid unnecessary user.updated events. Those events only sync identity/activity and cannot loop back here.
  if (!previous || Object.entries(fields).some(([key, value]) => previous[key] !== value)) {
    await clerk.users.updateUserMetadata(userId, { privateMetadata: { harvous_billing: fields } });
  }
  await tagAsAppUser(email, userId, user.firstName ?? undefined, user.lastName ?? undefined,
    undefined, undefined, fields);
  return fields;
}

export async function syncBillingContactIfEnabled(userId: string) {
  if (process.env.BILLING_CONTACT_SYNC_ENABLED !== 'true') return;
  await syncBillingContact(userId, { apply: true });
}
