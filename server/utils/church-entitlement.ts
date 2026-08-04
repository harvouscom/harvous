/**
 * Church sponsorship — the single answer to "is this church entitled today?".
 *
 * A church is sponsored while it is active and either **paying**
 * (`billingPlan` set by the Polar webhook) or **inside its concierge pilot
 * window** (`pilotUntil` in the future). Both states grant exactly the same
 * capabilities; "try then pay" is a change of funding source, not of product.
 *
 * Why a church-scoped column rather than an expiring `Entitlements` row:
 * `listActiveFeatureKeys` in entitlements.ts never checks `expiresAt`, so an
 * expiring user grant never lapses. Church billing is org-scoped anyway — the
 * staff member who checks out is the payer, not the beneficiary.
 *
 * Lapsing is a **write** gate, never a read gate: staff can no longer create
 * channels or church Shared Spaces and congregants can no longer follow new
 * ones, but everything already published stays readable. Never delete or hide
 * a congregation's study because a card expired.
 */

import { db, first, Churches, eq } from '../db';

export type ChurchRow = typeof Churches.$inferSelect;

/** Plan slug written by the Polar webhook for the single Church product. */
export const CHURCH_PLAN_SLUG = 'church';

export type ChurchSponsorship = {
  sponsored: boolean;
  /** 'paid' | 'pilot' | 'lapsed' — 'lapsed' also covers never-sponsored. */
  state: 'paid' | 'pilot' | 'lapsed';
  /** Pilot end, when the church is on a pilot (paid churches report null). */
  pilotUntil: string | null;
  /** Whole days left in the pilot, rounded up. Null unless state is 'pilot'. */
  pilotDaysLeft: number | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Pure sponsorship read. Paid wins over pilot so a church that converts
 * mid-pilot stops showing a countdown.
 */
export function churchSponsorship(
  church: Pick<ChurchRow, 'isActive' | 'deletedAt' | 'billingPlan' | 'pilotUntil'> | null | undefined,
  now: Date = new Date(),
): ChurchSponsorship {
  const lapsed: ChurchSponsorship = {
    sponsored: false,
    state: 'lapsed',
    pilotUntil: null,
    pilotDaysLeft: null,
  };

  if (!church) return lapsed;
  if (!church.isActive || church.deletedAt) return lapsed;

  if (church.billingPlan) {
    return { sponsored: true, state: 'paid', pilotUntil: null, pilotDaysLeft: null };
  }

  const pilotUntil = toDate(church.pilotUntil);
  if (pilotUntil && pilotUntil.getTime() > now.getTime()) {
    return {
      sponsored: true,
      state: 'pilot',
      pilotUntil: pilotUntil.toISOString(),
      pilotDaysLeft: Math.ceil((pilotUntil.getTime() - now.getTime()) / MS_PER_DAY),
    };
  }

  return lapsed;
}

/** Convenience boolean for gates that don't need the reason. */
export function churchIsSponsored(
  church: Pick<ChurchRow, 'isActive' | 'deletedAt' | 'billingPlan' | 'pilotUntil'> | null | undefined,
  now: Date = new Date(),
): boolean {
  return churchSponsorship(church, now).sponsored;
}

/** Message shown when a write is refused because the church lapsed. */
export const CHURCH_LAPSED_ERROR =
  'This church’s Harvous plan has ended. Existing study stays readable — subscribe to publish again.';
export const CHURCH_LAPSED_CODE = 'CHURCH_NOT_SPONSORED';

/**
 * Apply a church subscription state change from the billing provider.
 *
 * Writes `Churches`, never `Entitlements` — a church subscription grants the
 * org, not the staff member who checked out. `pilotUntil` is left alone on
 * purpose: if a church cancels, whatever remains of its pilot window is still
 * honoured rather than being cut short by the cancel.
 */
export async function applyChurchSubscription(input: {
  churchId: string;
  enabled: boolean;
  subscriptionId: string | null;
  /** Polar status verbatim, for audit ('active', 'canceled', …). */
  status?: string | null;
}): Promise<boolean> {
  const now = new Date();
  const updated = await db
    .update(Churches)
    .set({
      billingPlan: input.enabled ? CHURCH_PLAN_SLUG : null,
      billingPlanUpdatedAt: now,
      billingSubscriptionId: input.subscriptionId ?? null,
      billingStatus: input.status ?? (input.enabled ? 'active' : 'canceled'),
      updatedAt: now,
    })
    .where(eq(Churches.id, input.churchId))
    .returning({ id: Churches.id });
  return updated.length > 0;
}

/** Resolve the church a Polar subscription belongs to, by stored subscription id. */
export async function findChurchBySubscriptionId(
  subscriptionId: string,
): Promise<ChurchRow | null> {
  const trimmed = subscriptionId.trim();
  if (!trimmed) return null;
  return (
    first(
      await db.select().from(Churches).where(eq(Churches.billingSubscriptionId, trimmed)).limit(1),
    ) ?? null
  );
}

/** Load a church by Clerk org id and report its sponsorship in one round trip. */
export async function getChurchSponsorshipByOrgId(
  orgId: string,
): Promise<{ church: ChurchRow | null; sponsorship: ChurchSponsorship }> {
  const trimmed = orgId.trim();
  if (!trimmed) return { church: null, sponsorship: churchSponsorship(null) };
  const church =
    first(await db.select().from(Churches).where(eq(Churches.orgId, trimmed)).limit(1)) ?? null;
  return { church, sponsorship: churchSponsorship(church) };
}
