/**
 * Pure helpers for the Polar webhook handler — event → entitlement intent and
 * id extraction. Kept separate from the route so they're unit-testable without
 * forging signed payloads (signature verification is the SDK's `validateEvent`).
 *
 * Polar follows the Standard Webhooks spec; event names per
 * https://polar.sh/docs/integrate/webhooks/events
 */

export type PolarBillingIntent = 'enable' | 'disable';

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

/**
 * Map a Polar event (+ optional subscription status) to what it should do to
 * billing entitlements. Returns null for events we don't act on.
 *
 * - `subscription.updated` is status-dependent (plan changes keep access; a flip
 *   to canceled/revoked removes it).
 * - `subscription.past_due` keeps access during dunning (never-evict contract).
 * - `order.paid` enables — the one-time path for future add-ons (Season Pass).
 */
export function polarBillingIntent(
  eventType: string,
  subscriptionStatus?: string | null,
): PolarBillingIntent | null {
  switch (eventType) {
    case 'subscription.active':
    case 'subscription.created':
    case 'subscription.uncanceled':
    case 'subscription.past_due':
    case 'order.paid':
      return 'enable';
    case 'subscription.canceled':
    case 'subscription.revoked':
      return 'disable';
    case 'subscription.updated':
      return subscriptionStatus && ACTIVE_STATUSES.has(subscriptionStatus) ? 'enable' : 'disable';
    default:
      return null;
  }
}

type PolarWebhookData = {
  productId?: string | null;
  product_id?: string | null;
  product?: { id?: string | null } | null;
  customerId?: string | null;
  customer_id?: string | null;
  customer?: { id?: string | null; externalId?: string | null; external_id?: string | null } | null;
  externalCustomerId?: string | null;
  external_customer_id?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  // Discounts: subscriptions carry the applied discount; orders carry it too.
  discountId?: string | null;
  discount_id?: string | null;
  discount?: { id?: string | null } | null;
  // order.paid carries the product on line items / subscription
  items?: Array<{ productId?: string | null; product?: { id?: string | null } | null }>;
};

/** Polar product id from a subscription/order payload (camel + snake tolerant). */
export function productIdFromPolarData(data: PolarWebhookData | null | undefined): string | null {
  if (!data) return null;
  return (
    data.productId ??
    data.product_id ??
    data.product?.id ??
    data.items?.[0]?.productId ??
    data.items?.[0]?.product?.id ??
    null
  );
}

/** Your user id (Clerk) — set as the customer's `external_id` at checkout, also copied to metadata. */
export function externalUserIdFromPolarData(data: PolarWebhookData | null | undefined): string | null {
  if (!data) return null;
  const fromMetadata =
    typeof data.metadata?.clerkUserId === 'string' ? (data.metadata.clerkUserId as string) : null;
  return (
    data.customer?.externalId ??
    data.customer?.external_id ??
    data.externalCustomerId ??
    data.external_customer_id ??
    fromMetadata ??
    null
  );
}

/** Polar customer id — the fallback lookup key against UserMetadata.polarCustomerId. */
export function customerIdFromPolarData(data: PolarWebhookData | null | undefined): string | null {
  if (!data) return null;
  return data.customerId ?? data.customer_id ?? data.customer?.id ?? null;
}

export function subscriptionStatusFromPolarData(data: PolarWebhookData | null | undefined): string | null {
  return data?.status ?? null;
}

/**
 * Polar discount id applied to this subscription/order, if any.
 *
 * Founding is a `duration: once` discount rather than its own product, so this
 * is the only signal on the wire that says a founder just checked out. It is
 * present on the first invoice and gone from every renewal after it — which is
 * exactly why the claim gets stamped on UserMetadata instead of being re-derived.
 */
export function discountIdFromPolarData(data: PolarWebhookData | null | undefined): string | null {
  if (!data) return null;
  return data.discountId ?? data.discount_id ?? data.discount?.id ?? null;
}

/**
 * Harvous church id stamped into checkout metadata for church subscriptions.
 * This — not the buyer's user id — is what a church payment grants against, so
 * the subscription survives the staff member who happened to check out.
 */
export function churchIdFromPolarData(data: PolarWebhookData | null | undefined): string | null {
  const value = data?.metadata?.churchId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
