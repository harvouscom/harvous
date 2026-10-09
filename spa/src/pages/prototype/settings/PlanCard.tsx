import type { ReactNode } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import { formatPlanPrice, getPlans } from '@/lib/billing-plans';
import { formatBillingPriceLine, formatBillingStatusLine } from '../../../lib/billing-manage-copy';

/**
 * The watercolour sky behind the Plus card — the same file harvous.com/pricing uses
 * (`ai_bg_077`). `ai_bg_plus`, which this used before, is white through the middle, so a
 * card-width crop of it showed no sky at all.
 */
export const PLUS_PLAN_CARD_SKY = '/images/auth-hero/ai_bg_077.webp';

/**
 * The price block of the plan card. Shaped like the pricing card on harvous.com: the price
 * large, then one quiet line. Subscribers see what they pay and when it renews; a plan given
 * by Harvous has no price to show, so it says so instead of inventing one.
 */
export function planCardPrice(options: {
  hasPlus: boolean;
  billing: Parameters<typeof formatBillingPriceLine>[0] & Parameters<typeof formatBillingStatusLine>[0] | null;
  canManageBilling: boolean;
}): { primary: string; secondary: string | null; note: string | null } {
  if (!options.hasPlus) {
    // From the plan definitions, not `planFor`: that only answers once a billing product is
    // configured, and the price is a fact about the plan, not about the environment.
    const listed = getPlans().filter((p) => p.key === 'plus' && p.listed);
    const monthDef = listed.find((p) => p.interval === 'month');
    const yearDef = listed.find((p) => p.interval === 'year');
    const month = monthDef ? `${formatPlanPrice(monthDef)}/mo` : null;
    const year = yearDef ? `${formatPlanPrice(yearDef)}/yr` : null;
    return { primary: month ?? year ?? '', secondary: month && year ? year : null, note: null };
  }
  if (options.billing) {
    return {
      primary: formatBillingPriceLine(options.billing),
      secondary: null,
      note: formatBillingStatusLine(options.billing),
    };
  }
  /* Not "Included": beside "Active" it read as a price with no number. Say what is true. */
  return {
    primary: 'You have Plus',
    secondary: null,
    note: options.canManageBilling ? 'Active on your account' : 'Managed by Harvous',
  };
}

/**
 * One plan, as a pricing card — the card on harvous.com/pricing in app tokens. Settings ›
 * Plan shows the Plus one; /upgrade shows Free beside Plus, the way the site does. One
 * component so the two cannot drift: the page you buy from and the page you manage from
 * describe the plan in the same shape.
 */
export default function PlanCard({
  name,
  icon,
  tone = 'plus',
  badge,
  price,
  tagline,
  bullets,
  children,
  className,
}: {
  name: string;
  icon: IconName;
  /** Plus wears the sky and the accent tile; Free is the quiet card beside it. */
  tone?: 'plus' | 'free';
  badge?: string | null;
  price: { primary: string; secondary?: string | null; note?: string | null };
  tagline: string;
  bullets: readonly string[];
  /** Whatever acts on the plan — a checkout, a link — at the foot of the card. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={['proto-plan-card', tone === 'free' ? 'proto-plan-card--free' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      aria-label={name}
    >
      {tone === 'plus' ? (
        <img className="proto-plan-card__sky" src={PLUS_PLAN_CARD_SKY} alt="" decoding="async" />
      ) : null}
      <header className="proto-plan-card__head">
        <p className="proto-plan-card__name">
          <span
            className={tone === 'plus' ? 'proto-plan-card__icon proto-ink-on-accent' : 'proto-plan-card__icon'}
            aria-hidden="true"
          >
            <Icon name={icon} size={13} />
          </span>
          {name}
        </p>
        {badge ? <span className="proto-plan-card__badge">{badge}</span> : null}
      </header>

      <p className="proto-plan-card__price">
        {price.primary}
        {price.secondary ? <span> or {price.secondary}</span> : null}
      </p>
      {price.note ? <p className="proto-plan-card__note">{price.note}</p> : null}
      <p className="proto-plan-card__tagline">{tagline}</p>

      <ul className="proto-plan-card__list" role="list">
        {bullets.map((bullet) => (
          <li key={bullet}>
            <span className="proto-plan-card__check" aria-hidden="true">
              <Icon name="check" size={12} />
            </span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      {children ? <div className="proto-plan-card__foot">{children}</div> : null}
    </section>
  );
}
