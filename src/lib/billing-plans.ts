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
 * ## Pricing model (September 2026 — 3.0)
 *
 * | Plan      | Price                    | Notes                                   |
 * |-----------|--------------------------|-----------------------------------------|
 * | Free      | $0                       | Private study only — cannot host         |
 * | Plus      | $7/mo · $49/yr           | Both listed; annual is 42% under monthly |
 * | Founding  | $35 first year, then $49 | First 99 · a Polar discount, not a SKU   |
 * | Connector | $5/mo · $60/yr           | Separate add-on; NO annual discount      |
 *
 * Set at the 3.0 cutover, when Review and Challenges shipped and the paid hook
 * stopped being "you may host a shared space" (social, needs a network) and
 * became "your study comes back to you" (personal, works on day one).
 *
 * **Why sevens.** $7 and $49 are not rounded-off $8s. $49 is seven sevens — the
 * Jubilee arithmetic of Leviticus 25, where seven sabbaths of years precede the
 * year of return. It is the right number for a product whose whole promise is
 * returning to what you already studied. Do not "tidy" these to $50.
 *
 * The category sits well above this: Dwell $59.99/yr, Hallow $69.99/yr,
 * Glorify $69.99/yr, Readwise $119.88/yr. $49 is deliberately the value price,
 * not the ceiling — there is room above if the product earns it.
 *
 * Three deliberate asymmetries, so they don't read as mistakes later:
 * - **Plus discounts annual structurally; Connector does not.** $49 against $84
 *   annualized is 42% off, because Polar's flat 50c per charge makes monthly the
 *   worst instrument we have (12.1% effective take at $7/mo vs 6.0% at $49/yr).
 *   Don't lock a discount into an unproven add-on; an undiscounted annual is
 *   still worth offering, since one charge instead of twelve saves eleven flat
 *   fees.
 * - **Founding is a discount, not a product.** A Polar product recurs at its own
 *   price forever, which is what made the old $30/yr founding row a lifetime
 *   lock on 99 seats priced before the market was known. As a `duration: once`
 *   discount it is a launch offer that renews to list, and Polar's
 *   `max_redemptions` enforces the 99 server-side — which is the distributed
 *   lock `getFoundingAvailability` says isn't worth building.
 * - **Connector is a separate product, not a Plus tier.** Different buyer
 *   (CLI/MCP power users, not small-group hosts). Separate products are fine;
 *   tiers within one product are what we avoid.
 *
 * Known incoherence, left alone on purpose: Connector's $60/yr now costs more
 * than the $49/yr product it adds to. It is `listed: false` and unbuyable, and
 * moving it would break `billing:verify` unless the Polar catalog moved too.
 * Reprice it when it actually ships.
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

/**
 * How many people can ever claim the founding offer.
 *
 * Enforced twice on purpose: Polar's `max_redemptions` on the discount is the
 * hard stop (server-side, so two checkouts opened at slot 99 cannot both
 * succeed), and this constant drives the "N spots left" copy without an
 * outbound call on every pageview. Keep them equal.
 */
export const FOUNDING_CAP = 99;

/** What a founder pays for their first year. Renews at the annual list price. */
export const FOUNDING_FIRST_YEAR_CENTS = 3500;

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

/**
 * Founding offer — a Polar **discount** id, not a product id.
 *
 * Deliberately not a SKU: a Polar product recurs at its own price forever, so
 * the old founding product was a lifetime lock on 99 seats priced before the
 * market was known. A `duration: once` discount is a launch offer that renews
 * to list, and carries `max_redemptions` so Polar enforces the cap.
 */
export function getPlusFoundingDiscountId(): string {
  return envProduct('POLAR_PLUS_FOUNDING_DISCOUNT_ID', 'VITE_POLAR_PLUS_FOUNDING_DISCOUNT_ID');
}

/** Standard Harvous Plus monthly ($7). */
export function getPlusProductMonthlyId(): string {
  return envProduct('POLAR_PLUS_PRODUCT_MONTHLY', 'VITE_POLAR_PLUS_PRODUCT_MONTHLY');
}

/** Standard Harvous Plus annual ($49 — listed since 3.0; 42% under monthly). */
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

/** Church monthly ($30). */
export function getChurchProductMonthlyId(): string {
  return envProduct('POLAR_CHURCH_PRODUCT_MONTHLY', 'VITE_POLAR_CHURCH_PRODUCT_MONTHLY');
}

/** Church annual ($216 — 40% off, the one discount we do offer a church). */
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
      interval: 'month',
      amountCents: 700,
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
      amountCents: 4900,
      currencyCode: 'USD',
      features: PLUS_FEATURES,
      limits: PLUS_LIMITS,
      // Listed since 3.0. It was unlisted while Plus was hosting-only and
      // Founding was the only yearly path; Founding is now a discount on this
      // row, so this is the yearly plan rather than an alternative to it.
      listed: true,
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
      amountCents: 3000,
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
      // 40% off twelve months at $30 ($360 → $216). Churches respond to a
      // steep, legible break far better than a shallow one.
      amountCents: 21600,
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

/**
 * The founding offer: the annual plan, what a founder pays for year one, and the
 * discount that gets them there. Null when the discount id is unset.
 *
 * Whether any seats remain is a runtime count — see `getFoundingAvailability`.
 */
export function foundingOffer(): {
  plan: PlanDefinition;
  firstYearCents: number;
  discountId: string;
} | null {
  const plan = planFor('plus', 'year');
  const discountId = getPlusFoundingDiscountId();
  if (!plan || !discountId) return null;
  return { plan, firstYearCents: FOUNDING_FIRST_YEAR_CENTS, discountId };
}

/** Listed plan for a key + interval. */
export function planFor(key: PlanKey, interval: PlanInterval): PlanDefinition | null {
  return listedPlans().find((p) => p.key === key && p.interval === interval) ?? null;
}

/**
 * Standard Plus plan for an interval.
 * @deprecated Prefer `planFor('plus', interval)` — kept for existing call sites.
 */
export function listedPlanForInterval(interval: PlanInterval): PlanDefinition | null {
  return planFor('plus', interval);
}

/** `$49`, or `$4.92` when it isn't whole dollars. */
export function formatCents(amountCents: number, _currencyCode: 'USD' = 'USD'): string {
  const dollars = amountCents / 100;
  if (Number.isInteger(dollars)) return `$${dollars}`;
  return `$${dollars.toFixed(2)}`;
}

export function formatPlanPrice(plan: PlanDefinition): string {
  return formatCents(plan.amountCents, plan.currencyCode);
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
 * every Plus feature must stay fixed-cost or near-zero-marginal.
 *
 * Review shipped in 3.0 with **no runtime model at all** — authored prompts filled
 * with the reader's own notes, and a schedule that is arithmetic. Its marginal cost
 * is a few database rows, which is the strongest possible version of this
 * constraint rather than an exception to it. See
 * docs/future/REVIEWS_CHALLENGES_SEASON_PASS_STRATEGY.md.
 *
 * The original budget assumed a small model at ~$0.001/session against ~$4.25 net
 * on the old $5 plan. That headroom is now unspent, and it grew: the floor is
 * ~$6.15 net on $7/mo and ~$46.05 on $49/yr. The reasoning still stands if
 * generation is ever proposed — a frontier model is a 30–100x jump that would put
 * heavy users underwater at every price in this file. Founders are no longer
 * locked in for life (the offer renews to list), which removes one reason the
 * constraint was absolute, but not the constraint: if that swap is proposed, the
 * price has to move first — and so does the product decision, which is currently
 * that Harvous does not generate study content.
 */
/**
 * Empty since 3.0, and kept rather than deleted.
 *
 * Review and Challenges shipped and moved into `SHARED_SPACES_ADDON_FEATURE_BULLETS`, which
 * left nothing here. The constant stays because both surfaces that render it now hide the
 * "Coming soon" heading when it is empty — so the next thing that is genuinely coming is one
 * string, not a re-plumbing of two pages.
 */
export const PLUS_COMING_SOON_FEATURE_BULLETS: readonly string[] = [];

/** Short label for the founding offer — permanent recognition, first-year price. */
export const PLUS_FOUNDING_BADGE = 'Founding';
