import { useNavigate } from '@tanstack/react-router';
import SafeSubscriptionDetailsButton from '@/components/react/SafeSubscriptionDetailsButton';
import { useSubscriptionStatus } from '../../../hooks/queries/useSubscriptionStatus';
import { SettingsGroup, SettingsIntro, SettingsRow, SettingsShell } from './SettingsShell';

/**
 * Settings > Add-ons — browse paid upgrades. Shared Spaces links to /addon;
 * Review and Challenges are coming soon.
 */
export default function PrototypeAddonsPage() {
  const navigate = useNavigate();
  const { data: subscription, isLoading } = useSubscriptionStatus();
  const hasSharedSpaces = Boolean(subscription?.hasSharedSpaces);
  const showLoading = isLoading && !subscription;

  return (
    <SettingsShell>
      <SettingsIntro>Optional paid upgrades for your Bible study.</SettingsIntro>

      {showLoading ? (
        <p className="pds-caption" style={{ marginTop: 4, color: 'var(--pds-text-secondary)' }}>
          Loading…
        </p>
      ) : null}

      <SettingsGroup>
        <SettingsRow
          label="Shared Spaces"
          sublabel="Shared notes for group study."
          leadingIcon="user-group"
          leadingAccent="var(--pds-highlight-coral-rose)"
          badge={hasSharedSpaces ? 'Active' : undefined}
          onClick={() => navigate({ to: '/addon' })}
        />
        <SettingsRow
          label="Review"
          sublabel="Spaced practice from your notes and highlights."
          leadingIcon="rotate-left"
          leadingAccent="var(--pds-highlight-sky-blue)"
          badge="Coming later"
          trailing="none"
          disabled
        />
        <SettingsRow
          label="Challenges"
          sublabel="Themed study seasons with guides and leaderboards."
          leadingIcon="trophy"
          leadingAccent="var(--pds-highlight-warm-amber)"
          badge="Coming later"
          trailing="none"
          disabled
        />
      </SettingsGroup>

      {hasSharedSpaces ? (
        <SafeSubscriptionDetailsButton publishableKey={null}>
          <button type="button" className="proto-settings-btn proto-settings-btn--secondary">
            Manage subscription
          </button>
        </SafeSubscriptionDetailsButton>
      ) : null}
    </SettingsShell>
  );
}
