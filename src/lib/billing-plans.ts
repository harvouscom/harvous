/**
 * Processor-agnostic plan registry for Harvous Plus and Connector.
 * Gates check feature keys — never plan names or providers.
 *
 * Product ids come from env so sandbox and live stay distinct. Superseded price
 * points stay in the registry with `listed: false` so grandfathered subscribers
 * keep resolving correctly.
 *
 * Polar models each (plan × interval) as its own Product with a catalog price,
 * so `productId` below is a Polar product id (`checkouts.create({ products })`
 * takes product ids; subscriptions carry `productId`).
 *
 * Product ids are resolved lazily (not at module evaluate time) so local
 * `server/dev.ts` can run `dotenv` before the first checkout lookup — ESM
 * hoists static imports above `config()`, which left ids empty and broke
 * `/api/billing/checkout` with "Invalid or unconfigured plan product".
 *
 * ## Pricing model (July 2026)
 *
 * | Plan                | Price            | Notes                                  |
 * |---------------------|------------------|----------------------------------------|
 * | Free                | $0               | Private study only — cannot host        |
 * | Founding            | $30/yr           | First 99 · annual only · lifetime lock  |
 * | Plus                | $5/mo · Founding $30/yr | Hosting now; Review/Challenges later |
 * | Connector           | $5/mo · $60/yr          | Separate add-on; NO annual discount  |
 *
 * Interim list price: Plus is $5/mo while Shared Spaces is the live paid
 * surface. Standard annual is $45 (unlisted) — Founding ($30/yr, first 99)
 * is the only yearly offer for now.
 *
 * Two deliberate asymmetries, so they don't read as mistakes later:
 * - **Plus discounts annual via Founding, Connector does not.** Discount the
 *   product you want commitment in; don't lock a discount into an unproven
 *   add-on. An undiscounted annual is still worth offering — one charge
 *   instead of twelve saves eleven flat processor fees.
 * - **Connector is a separate product, not a Plus tier.** Different buyer
 *   (CLI/MCP power users, not small-group hosts). Separate products are fine;
 *   tiers within one product are what we avoid.
 */

export const FEATURE_KEYS = ['shared_spaces', 'review', 'challenges', 'connector'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type PlanInterval = 'month' | 'year';
export type PlanKey = 'plus' | 'connector' | 'church';

/**
 * Sentinel for "no limit". Deliberately -1 rather than `Infinity`:
 * `JSON.stringify(Infinity)` is `null`, which silently reads as 0 in a numeric
 * client compare. Always test with `isUnlimited()` before comparing.
 */
export const UNLIMITED = -1;

export function isUnlimited(limit: number | null | undefined): boolean {
  return typeof limit === 'number' && limit < 0;
}

/** How many founding subscriptions exist before the price is retired for good. */
export const FOUNDING_CAP = 99;

export interface PlanLimits {
  /** `UNLIMITED` for Plus — the member cap is the fence, not the space count. */
  ownedSpaces: number;
  membersPerSpace: number;
}

export interface PlanDefinition {
  /** Stable product key (not a Polar id). */
  key: PlanKey;
  name: string;
  interval: PlanInterval;
  /** Amount in the lowest currency unit (USD cents). */
  amountCents: number;
  currencyCode: 'USD';
  features: readonly FeatureKey[];
  limits: PlanLimits;
  /** When false, hidden from upgrade UI but still resolves for existing subs. */
  listed: boolean;
  /** Polar product id. Empty when env is unset. */
  productId: string;
  /** Founding price — capped at `FOUNDING_CAP` claims, then retired forever. */
  founding?: boolean;
}

/**
 * Plus grants every consumer feature — one price, no matrix. `review` and
 * `challenges` are granted from day one even though those products haven't
 * shipped: nothing gates on them yet, and issuing the rows now means existing
 * subscribers need no backfill when they do land. Seasons ride `challenges`;
 * there is deliberately no `season_pass` key (Plus includes every season).
 */
const PLUS_FEATURES = ['shared_spaces', 'review', 'challenges'] as const satisfies readonly FeatureKey[];

const CONNECTOR_FEATURES = ['connector'] as const satisfies readonly FeatureKey[];

/**
 * A church subscription grants the **church** (Churches.billingPlan), not the
 * staff member who checks out. Deliberately empty: issuing a personal feature
 * key here would silently hand the buyer a free Plus, and would revoke it the
 * moment the church's card changed hands. Church capability is read through
 * `churchIsSponsored`, never through user entitlements.
 */
const CHURCH_FEATURES = [] as const satisfies readonly FeatureKey[];

/**
 * Unlimited spaces, 50 people each.
 *
 * The member cap — not the space count — is what keeps a congregation from
 * running off one personal plan; at 50 they hit the wall and the church
 * conversation starts, which is the space-transfer path. Set this number by
 * "where does a person end and an org begin", never by cost (spaces are rows;
 * they cost nothing). 50 is generous for small groups and still below most
 * churches, so oversized personal spaces migrate to a church org.
 */
const PLUS_LIMITS: PlanLimits = {
  ownedSpaces: UNLIMITED,
  membersPerSpace: 50,
};

/** Free tier is strictly private: no hosting. Joining someone else's space is always free. */
export const FREE_LIMITS: PlanLimits = {
  ownedSpaces: 0,
  membersPerSpace: PLUS_LIMITS.membersPerSpace,
};

function envProduct(name: string, viteName: string): string {
  if (typeof process !== 'undefined' && process.env?.[name]) {
    return process.env[name]!;
  }
  // Vite client: import.meta.env is injected at build time
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
    if (meta?.[viteName]) return String(meta[viteName]);
  } catch {
    /* ignore */
  }
  return '';
}

/** Founding Harvous Plus — $30/yr, annual only, first 99 subscribers. */
export function getPlusProductFoundingAnnualId(): string {
  return envProduct('POLAR_PLUS_PRODUCT_FOUNDING_ANNUAL', 'VITE_POLAR_PLUS_PRODUCT_FOUNDING_ANNUAL');
}

/** Standard Harvous Plus monthly ($5). */
export function getPlusProductMonthlyId(): string {
  return envProduct('POLAR_PLUS_PRODUCT_MONTHLY', 'VITE_POLAR_PLUS_PRODUCT_MONTHLY');
}

/** Standard Harvous Plus annual ($45 — unlisted; Founding is the yearly path). */
export function getPlusProductAnnualId(): string {
  return envProduct('POLAR_PLUS_PRODUCT_ANNUAL', 'VITE_POLAR_PLUS_PRODUCT_ANNUAL');
}

/** Connector monthly ($5). */
export function getConnectorProductMonthlyId(): string {
  return envProduct('POLAR_CONNECTOR_PRODUCT_MONTHLY', 'VITE_POLAR_CONNECTOR_PRODUCT_MONTHLY');
}

/** Connector annual ($60 — same rate as monthly, no discount). */
export function getConnectorProductAnnualId(): string {
  return envProduct('POLAR_CONNECTOR_PRODUCT_ANNUAL', 'VITE_POLAR_CONNECTOR_PRODUCT_ANNUAL');
}

/** Church monthly ($39). */
export function getChurchProductMonthlyId(): string {
  return envProduct('POLAR_CHURCH_PRODUCT_MONTHLY', 'VITE_POLAR_CHURCH_PRODUCT_MONTHLY');
}

/** Church annual ($390 — two months free, the one discount we do offer a church). */
export function getChurchProductAnnualId(): string {
  return envProduct('POLAR_CHURCH_PRODUCT_ANNUAL', 'VITE_POLAR_CHURCH_PRODUCT_ANNUAL');
}

/**
 * All known product → plan mappings. Add superseded price points here with
 * `listed: false` when prices change for new subscribers.
 *
 * Prefer getPlans() — this Proxy rebuilds rows so product ids stay current.
 */
export function getPlans(): PlanDefinition[] {
  return [
    {
      key: 'plus',
      name: 'Harvous Plus',
      interval: 'year',
      amountCents: 3000,
      currencyCode: 'USD',
      features: PLUS_FEATURES,
      limits: PLUS_LIMITS,
      listed: true,
      founding: true,
      productId: getPlusProductFoundingAnnualId(),
    },
    {
      key: 'plus',
      name: 'Harvous Plus',
      interval: 'month',
      amountCents: 500,
      currencyCode: 'USD',
      features: PLUS_FEATURES,
      limits: PLUS_LIMITS,
      listed: true,
      productId: getPlusProductMonthlyId(),
    },
    {
      key: 'plus',
      name: 'Harvous Plus',
      interval: 'year',
      amountCents: 4500,
      currencyCode: 'USD',
      features: PLUS_FEATURES,
      limits: PLUS_LIMITS,
      // Not for sale while Plus is hosting-only — Founding is the yearly path.
      listed: false,
      productId: getPlusProductAnnualId(),
    },
    {
      key: 'connector',
      name: 'Connector',
      interval: 'month',
      amountCents: 500,
      currencyCode: 'USD',
      features: CONNECTOR_FEATURES,
      limits: FREE_LIMITS,
      // Not for sale yet — registry + webhooks stay wired; Settings / checkout hide it.
      listed: false,
      productId: getConnectorProductMonthlyId(),
    },
    {
      key: 'connector',
      name: 'Connector',
      interval: 'year',
      amountCents: 6000,
      currencyCode: 'USD',
      features: CONNECTOR_FEATURES,
      limits: FREE_LIMITS,
      listed: false,
      productId: getConnectorProductAnnualId(),
    },
    {
      key: 'church',
      name: 'Harvous for Churches',
      interval: 'month',
      amountCents: 3900,
      currencyCode: 'USD',
      features: CHURCH_FEATURES,
      limits: FREE_LIMITS,
      // Never on the personal /upgrade page — churches buy from the My Church
      // hub, and the buyer is a staff member paying for the org.
      listed: false,
      productId: getChurchProductMonthlyId(),
    },
    {
      key: 'church',
      name: 'Harvous for Churches',
      interval: 'year',
      amountCents: 39000,
      currencyCode: 'USD',
      features: CHURCH_FEATURES,
      limits: FREE_LIMITS,
      listed: false,
      productId: getChurchProductAnnualId(),
    },
  ];
}

/** True when this product id is one of the church products. */
export function isChurchProductId(productId: string | null | undefined): boolean {
  return planForProductId(productId)?.key === 'church';
}

/** Church plans (monthly + annual) with a configured product id. */
export function churchPlans(): PlanDefinition[] {
  return getPlans().filter((p) => p.key === 'church' && p.productId);
}

/** Church plan for an interval, if configured. */
export function churchPlanFor(interval: PlanInterval): PlanDefinition | null {
  return churchPlans().find((p) => p.interval === interval) ?? null;
}

/** Live plan rows; product ids resolve from env on each access. */
export const PLANS: PlanDefinition[] = new Proxy([] as PlanDefinition[], {
  get(_target, prop, _receiver) {
    const plans = getPlans();
    const value = Reflect.get(plans, prop, plans);
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(plans) : value;
  },
  ownKeys() {
    return Reflect.ownKeys(getPlans());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(getPlans(), prop);
  },
  has(_target, prop) {
    return Reflect.has(getPlans(), prop);
  },
});

export function featuresForProductId(productId: string | null | undefined): FeatureKey[] {
  if (!productId) return [];
  const plan = getPlans().find((p) => p.productId === productId);
  return plan ? [...plan.features] : [];
}

export function planForProductId(productId: string | null | undefined): PlanDefinition | null {
  if (!productId) return null;
  return getPlans().find((p) => p.productId === productId) ?? null;
}

/** True when this product is the capped founding price. */
export function isFoundingProductId(productId: string | null | undefined): boolean {
  return Boolean(planForProductId(productId)?.founding);
}

export function limitsForFeatures(features: readonly FeatureKey[]): PlanLimits {
  // Only shared_spaces elevates hosting limits — Connector grants neither.
  if (features.includes('shared_spaces')) {
    return { ...PLUS_LIMITS };
  }
  return { ...FREE_LIMITS };
}

/** Plans shown on the upgrade page (those with a configured product id). */
export function listedPlans(): PlanDefinition[] {
  return getPlans().filter((p) => p.listed && p.productId);
}

/** The capped founding plan, if configured. Availability is a runtime count — see billing routes. */
export function foundingPlan(): PlanDefinition | null {
  return listedPlans().find((p) => p.founding) ?? null;
}

/** Standard (non-founding) plan for a key + interval. */
export function planFor(key: PlanKey, interval: PlanInterval): PlanDefinition | null {
  return listedPlans().find((p) => p.key === key && p.interval === interval && !p.founding) ?? null;
}

/**
 * Standard Plus plan for an interval.
 * @deprecated Prefer `planFor('plus', interval)` — kept for existing call sites.
 */
export function listedPlanForInterval(interval: PlanInterval): PlanDefinition | null {
  return planFor('plus', interval);
}

export function formatPlanPrice(plan: PlanDefinition): string {
  const dollars = plan.amountCents / 100;
  if (Number.isInteger(dollars)) return `$${dollars}`;
  return `$${dollars.toFixed(2)}`;
}

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(value);
}

/**
 * Plus features that fold in later (not sold separately). Shown on /upgrade and
 * Settings › Plan under a "Coming soon" heading — keep in sync with the
 * FEATURE_KEYS that PLUS_FEATURES already grants.
 *
 * COST CONSTRAINT — do not break this without re-running the pricing math:
 * every Plus feature must stay fixed-cost or near-zero-marginal. Review is
 * budgeted on a small model (~$0.001/session, so even a heavy user costs
 * pennies against ~$4.25 net on the $5 plan). Moving Review to a frontier model
 * is a 30–100x jump that would put heavy users underwater at every price in
 * this file — and founding subscribers are locked in for life. If that swap is
 * ever proposed, the price has to move first.
 */
export const PLUS_COMING_SOON_FEATURE_BULLETS = [
  'Review — practice from your notes',
  'Challenges — guided study seasons',
] as const;

/** Short label for the capped founding price lock ($30/yr). */
export const PLUS_FOUNDING_BADGE = 'Founding';
