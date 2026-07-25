/**
 * Polar subscription helpers for Settings › Plan manage layer.
 * Uses org OAT (Core API). Payment-method updates stay on the hosted portal.
 */

import { planForProductId, type PlanInterval, type PlanKey } from '@/lib/billing-plans';
import { getPolarClient, isPolarConfigured } from './polar-client';

export type BillingSubscriptionSummary = {
  subscriptionId: string;
  status: string;
  interval: PlanInterval;
  amountCents: number;
  currency: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
};

export type BillingPaymentMethodSummary = {
  brand: string;
  last4: string;
};

export type BillingOrderSummary = {
  id: string;
  createdAt: string;
  amountCents: number;
  currency: string;
  invoiceNumber: string | null;
  hasInvoice: boolean;
};

export type BillingManagePayload = {
  /** Harvous Plus subscription, if any. */
  billing: BillingSubscriptionSummary | null;
  /** Connector subscription, if any — a separate product, billed separately. */
  connector: BillingSubscriptionSummary | null;
  /** Customer-level — covers both products. */
  paymentMethod: BillingPaymentMethodSummary | null;
  orders: BillingOrderSummary[];
};

type PolarSubLike = {
  id?: string;
  status?: string;
  productId?: string | null;
  amount?: number;
  currency?: string;
  recurringInterval?: string;
  currentPeriodEnd?: Date | string | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | string | null;
};

type PolarPaymentMethodLike = {
  type?: string;
  isDefault?: boolean;
  methodMetadata?: { brand?: string; last4?: string } | null;
};

type PolarOrderLike = {
  id?: string;
  createdAt?: Date | string;
  totalAmount?: number;
  currency?: string;
  invoiceNumber?: string | null;
  isInvoiceGenerated?: boolean;
  receiptNumber?: string | null;
  paid?: boolean;
  customer?: { externalId?: string | null } | null;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapInterval(recurring: string | undefined, productId: string): PlanInterval {
  const plan = planForProductId(productId);
  if (plan) return plan.interval;
  if (recurring === 'year' || recurring === 'annual') return 'year';
  return 'month';
}

function isActiveStatus(status: string | undefined): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

function toSummary(sub: PolarSubLike): BillingSubscriptionSummary | null {
  const subscriptionId = sub.id?.trim();
  const productId = sub.productId ?? null;
  if (!subscriptionId || !productId || !planForProductId(productId)) return null;
  if (!isActiveStatus(sub.status)) return null;

  const periodEnd = toIso(sub.currentPeriodEnd);
  if (!periodEnd) return null;

  return {
    subscriptionId,
    status: sub.status ?? 'active',
    interval: mapInterval(sub.recurringInterval, productId),
    amountCents: typeof sub.amount === 'number' ? sub.amount : 0,
    currency: (sub.currency || 'usd').toUpperCase(),
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
    canceledAt: toIso(sub.canceledAt),
  };
}

/** Pure mapper — card payment methods only. Prefers default card. */
export function mapPolarPaymentMethod(
  methods: PolarPaymentMethodLike[],
): BillingPaymentMethodSummary | null {
  const cards = methods.filter(
    (m) =>
      m.type === 'card' &&
      typeof m.methodMetadata?.last4 === 'string' &&
      m.methodMetadata.last4.length > 0,
  );
  if (cards.length === 0) return null;
  const preferred = cards.find((m) => m.isDefault) ?? cards[0]!;
  const rawBrand = (preferred.methodMetadata?.brand || 'Card').trim().replace(/_/g, ' ');
  const last4 = preferred.methodMetadata!.last4!.trim();
  const brand = rawBrand
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
  return { brand, last4 };
}

/** Pure mapper for order history rows. */
export function mapPolarOrder(order: PolarOrderLike): BillingOrderSummary | null {
  const id = order.id?.trim();
  if (!id) return null;
  const createdAt = toIso(order.createdAt);
  if (!createdAt) return null;
  return {
    id,
    createdAt,
    amountCents: typeof order.totalAmount === 'number' ? order.totalAmount : 0,
    currency: (order.currency || 'usd').toUpperCase(),
    invoiceNumber: order.invoiceNumber?.trim() || null,
    hasInvoice: Boolean(order.isInvoiceGenerated || order.receiptNumber || order.invoiceNumber),
  };
}

/**
 * Active subscriptions for the Clerk user (externalCustomerId), keyed by plan.
 *
 * A user can hold Plus and Connector at once — they are separate Polar products
 * with separate subscriptions — so anything that acts on "the" subscription has
 * to say which one it means.
 */
export async function getPolarBillingSummaries(
  userId: string,
): Promise<Partial<Record<PlanKey, BillingSubscriptionSummary>>> {
  if (!isPolarConfigured()) return {};

  const byPlan: Partial<Record<PlanKey, BillingSubscriptionSummary>> = {};
  try {
    const polar = getPolarClient();
    const collection = await polar.subscriptions.list({
      externalCustomerId: [userId],
      active: true,
    });

    for await (const page of collection) {
      for (const item of page.result?.items ?? []) {
        const sub = item as PolarSubLike;
        const summary = toSummary(sub);
        const planKey = planForProductId(sub.productId ?? null)?.key;
        // First active subscription per plan wins; later duplicates are ignored.
        if (summary && planKey && !byPlan[planKey]) byPlan[planKey] = summary;
      }
    }
  } catch (error) {
    console.error('[polar-billing] getPolarBillingSummaries failed:', error);
  }
  return byPlan;
}

/**
 * Active subscription for one plan (defaults to Plus).
 * Pass `planKey` explicitly whenever the caller means Connector.
 */
export async function getPolarBillingSummary(
  userId: string,
  planKey: PlanKey = 'plus',
): Promise<BillingSubscriptionSummary | null> {
  const summaries = await getPolarBillingSummaries(userId);
  return summaries[planKey] ?? null;
}

async function getPolarPaymentMethod(userId: string): Promise<BillingPaymentMethodSummary | null> {
  try {
    const polar = getPolarClient();
    const collection = await polar.customers.listPaymentMethodsExternal({
      externalId: userId,
      limit: 20,
    });
    const methods: PolarPaymentMethodLike[] = [];
    for await (const page of collection) {
      for (const item of page.result?.items ?? []) {
        methods.push(item as PolarPaymentMethodLike);
      }
    }
    return mapPolarPaymentMethod(methods);
  } catch (error) {
    console.error('[polar-billing] getPolarPaymentMethod failed:', error);
    return null;
  }
}

async function getPolarOrders(userId: string, limit = 8): Promise<BillingOrderSummary[]> {
  try {
    const polar = getPolarClient();
    const collection = await polar.orders.list({
      externalCustomerId: [userId],
      limit,
    });
    const orders: BillingOrderSummary[] = [];
    for await (const page of collection) {
      for (const item of page.result?.items ?? []) {
        const mapped = mapPolarOrder(item as PolarOrderLike);
        if (mapped) orders.push(mapped);
      }
      break; // first page only
    }
    return orders;
  } catch (error) {
    console.error('[polar-billing] getPolarOrders failed:', error);
    return [];
  }
}

/**
 * Full manage payload for Settings › Plan (subscription + card + recent orders).
 *
 * `billing` is the Plus subscription; `connector` is surfaced alongside it so
 * the page can show both without a second round trip. Payment method and orders
 * are customer-level and cover both products.
 */
export async function getPolarBillingManage(userId: string): Promise<BillingManagePayload | null> {
  if (!isPolarConfigured()) return null;

  const summaries = await getPolarBillingSummaries(userId);
  const billing = summaries.plus ?? null;
  const connector = summaries.connector ?? null;
  if (!billing && !connector) return null;

  const [paymentMethod, orders] = await Promise.all([
    getPolarPaymentMethod(userId),
    getPolarOrders(userId, 8),
  ]);

  return { billing, connector, paymentMethod, orders };
}

/**
 * Presigned receipt/invoice URL for an order owned by this external customer.
 */
export async function getPolarOrderDocumentUrl(userId: string, orderId: string): Promise<string> {
  if (!isPolarConfigured()) {
    throw new Error('Billing is not configured');
  }

  const polar = getPolarClient();
  const order = await polar.orders.get({ id: orderId });
  const externalId = order.customer?.externalId ?? null;
  if (externalId !== userId) {
    throw new Error('Order not found');
  }

  try {
    const receipt = await polar.orders.receipt({ id: orderId });
    if (receipt?.url) return receipt.url;
  } catch {
    /* fall through to invoice */
  }

  try {
    if (!order.isInvoiceGenerated) {
      await polar.orders.generateInvoice({ id: orderId });
    }
  } catch {
    /* invoice may already exist or not be available */
  }

  const invoice = await polar.orders.invoice({ id: orderId });
  if (!invoice?.url) {
    throw new Error('Receipt unavailable for this order');
  }
  return invoice.url;
}

/**
 * Schedule cancel at period end (`true`) or resume (`false`).
 * Does not clear Entitlements — webhook remains authoritative for revoke.
 */
export async function setPolarCancelAtPeriodEnd(
  userId: string,
  cancelAtPeriodEnd: boolean,
  planKey: PlanKey = 'plus',
): Promise<BillingSubscriptionSummary> {
  if (!isPolarConfigured()) {
    throw new Error('Billing is not configured');
  }

  // Plan-scoped: canceling Connector must never touch the Plus subscription.
  const current = await getPolarBillingSummary(userId, planKey);
  if (!current) {
    throw new Error('No active subscription found');
  }

  const polar = getPolarClient();
  const updated = await polar.subscriptions.update({
    id: current.subscriptionId,
    subscriptionUpdate: { cancelAtPeriodEnd },
  });

  const summary = toSummary(updated as PolarSubLike);
  if (!summary) {
    const again = await getPolarBillingSummary(userId, planKey);
    if (again) return again;
    throw new Error('Subscription updated but could not read billing state');
  }
  return summary;
}
