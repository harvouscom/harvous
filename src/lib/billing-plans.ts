/**
 * Processor-agnostic plan registry for Harvous Plus (and future plans).
 * Gates check feature keys — never plan names or providers.
 *
 * Price ids come from env so sandbox and live stay distinct. Founding prices
 * stay in the registry with `listed: true`; superseded price points use
 * `listed: false` so grandfathered subscribers keep resolving correctly.
 */

export const FEATURE_KEYS = ['shared_spaces', 'review', 'challenges', 'connector'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type PlanInterval = 'month' | 'year';
export type PlanKey = 'plus';

export interface PlanLimits {
  ownedSpaces: number;
  membersPerSpace: number;
}

export interface PlanDefinition {
  /** Stable product key (not a Paddle id). */
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
  /** Paddle price id (`pri_…`). Empty when env is unset. */
  priceId: string;
}

const PLUS_FEATURES = ['shared_spaces'] as const satisfies readonly FeatureKey[];

const PLUS_LIMITS: PlanLimits = {
  ownedSpaces: 10,
  membersPerSpace: 30,
};

function envPrice(name: string, viteName: string): string {
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

/** Founding Harvous Plus monthly ($5). */
export const PLUS_PRICE_MONTHLY_ID = envPrice('PADDLE_PLUS_PRICE_MONTHLY', 'VITE_PADDLE_PLUS_PRICE_MONTHLY');

/** Founding Harvous Plus annual ($45). */
export const PLUS_PRICE_ANNUAL_ID = envPrice('PADDLE_PLUS_PRICE_ANNUAL', 'VITE_PADDLE_PLUS_PRICE_ANNUAL');

/**
 * All known price → plan mappings. Add superseded founding/step-up prices here
 * with `listed: false` when prices rise for new subscribers.
 */
export const PLANS: PlanDefinition[] = [
  {
    key: 'plus',
    name: 'Harvous Plus',
    interval: 'month',
    amountCents: 500,
    currencyCode: 'USD',
    features: PLUS_FEATURES,
    limits: PLUS_LIMITS,
    listed: true,
    priceId: PLUS_PRICE_MONTHLY_ID,
  },
  {
    key: 'plus',
    name: 'Harvous Plus',
    interval: 'year',
    amountCents: 4500,
    currencyCode: 'USD',
    features: PLUS_FEATURES,
    limits: PLUS_LIMITS,
    listed: true,
    priceId: PLUS_PRICE_ANNUAL_ID,
  },
];

const planByPriceId = new Map<string, PlanDefinition>();
for (const plan of PLANS) {
  if (plan.priceId) planByPriceId.set(plan.priceId, plan);
}

export function featuresForPriceId(priceId: string | null | undefined): FeatureKey[] {
  if (!priceId) return [];
  const plan = planByPriceId.get(priceId);
  return plan ? [...plan.features] : [];
}

export function planForPriceId(priceId: string | null | undefined): PlanDefinition | null {
  if (!priceId) return null;
  return planByPriceId.get(priceId) ?? null;
}

export function limitsForFeatures(features: readonly FeatureKey[]): PlanLimits {
  // Highest matching plan wins; Plus is the only shipped paid plan today.
  if (features.includes('shared_spaces')) {
    return { ...PLUS_LIMITS };
  }
  return { ownedSpaces: 0, membersPerSpace: PLUS_LIMITS.membersPerSpace };
}

/** Plans shown on the upgrade page (unique by key+interval among listed). */
export function listedPlans(): PlanDefinition[] {
  return PLANS.filter((p) => p.listed && p.priceId);
}

export function listedPlanForInterval(interval: PlanInterval): PlanDefinition | null {
  return listedPlans().find((p) => p.key === 'plus' && p.interval === interval) ?? null;
}

export function formatPlanPrice(plan: PlanDefinition): string {
  const dollars = plan.amountCents / 100;
  if (Number.isInteger(dollars)) return `$${dollars}`;
  return `$${dollars.toFixed(2)}`;
}

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(value);
}
