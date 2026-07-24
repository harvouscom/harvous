import { useNavigate } from '@tanstack/react-router';
import SafeSubscriptionDetailsButton from '@/components/react/SafeSubscriptionDetailsButton';
import { getSharedSpacesAddonFeatureBullets } from '@/lib/shared-spaces-limits';
import { formatPlanPrice, listedPlanForInterval } from '@/lib/billing-plans';
import { useSubscriptionStatus } from '../../../hooks/queries/useSubscriptionStatus';
import { SettingsGroup, SettingsRow, SettingsShell } from './SettingsShell';

const monthPlan = listedPlanForInterval('month');
const yearPlan = listedPlanForInterval('year');
const PLAN_NAME = yearPlan?.name ?? monthPlan?.name ?? 'Harvous Plus';
const PRICE_SUMMARY = [
  monthPlan ? `${formatPlanPrice(monthPlan)}/mo` : null,
  yearPlan ? `${formatPlanPrice(yearPlan)}/yr` : null,
]
  .filter(Boolean)
  .join(' · ');

/** Badge helper retained for tests / join-state copy. */
export function resolveSharedSpacesAddonBadge(options: {
  hasSharedSpaces: boolean;
  memberOfCount: number;
}): string | undefined {
  if (options.hasSharedSpaces) return 'Active';
  if (options.memberOfCount <= 0) return undefined;
  return options.memberOfCount === 1 ? 'In 1 space' : `In ${options.memberOfCount} spaces`;
}

/**
 * Settings > Plan — active Harvous Plus summary, or a path to upgrade.
 */
export default function PrototypeAddonsPage() {
  const navigate = useNavigate();
  const { data: subscription, isLoading } = useSubscriptionStatus();
  const hasSharedSpaces = Boolean(subscription?.hasSharedSpaces);
  const showLoading = isLoading && !subscription;
  const featureBullets = getSharedSpacesAddonFeatureBullets({
    hasAddOn: hasSharedSpaces,
    ownedCount: hasSharedSpaces ? (subscription?.sharedSpacesOwnedCount ?? null) : null,
    ownedLimit: subscription?.sharedSpacesOwnedLimit ?? null,
  });

  return (
    <SettingsShell>
      {showLoading ? (
        <p className="pds-caption" style={{ marginTop: 4, color: 'var(--pds-text-secondary)' }}>
          Loading…
        </p>
      ) : null}

      <SettingsGroup>
        <SettingsRow
          label={PLAN_NAME}
          sublabel={
            hasSharedSpaces
              ? 'Active on your account'
              : PRICE_SUMMARY || 'Unlock Shared Spaces hosting'
          }
          leadingIcon="layer-group"
          leadingAccent="var(--pds-highlight-coral-rose)"
          badge={hasSharedSpaces ? 'Active' : undefined}
          onClick={hasSharedSpaces ? undefined : () => navigate({ to: '/upgrade' })}
          trailing={hasSharedSpaces ? 'none' : 'chevron'}
        />
      </SettingsGroup>

      <ul className="proto-settings-plan-features" style={{ margin: '12px 0 0', paddingLeft: 20 }}>
        {featureBullets.map((bullet) => (
          <li key={bullet} className="pds-caption" style={{ color: 'var(--pds-text-secondary)', marginBottom: 6 }}>
            {bullet}
          </li>
        ))}
      </ul>

      {!hasSharedSpaces ? (
        <button
          type="button"
          className="proto-settings-btn proto-settings-btn--primary"
          style={{ marginTop: 16 }}
          onClick={() => navigate({ to: '/upgrade' })}
        >
          Get {PLAN_NAME}
        </button>
      ) : (
        <div style={{ marginTop: 16 }}>
          <SafeSubscriptionDetailsButton publishableKey={null}>
            <button type="button" className="proto-settings-btn proto-settings-btn--secondary">
              Manage Subscription
            </button>
          </SafeSubscriptionDetailsButton>
        </div>
      )}
    </SettingsShell>
  );
}
