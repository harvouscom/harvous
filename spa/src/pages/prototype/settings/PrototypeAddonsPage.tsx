import { useNavigate } from '@tanstack/react-router';
import SafeSubscriptionDetailsButton from '@/components/react/SafeSubscriptionDetailsButton';
import { useSubscriptionStatus } from '../../../hooks/queries/useSubscriptionStatus';
import { SettingsGroup, SettingsIntro, SettingsRow, SettingsShell } from './SettingsShell';

/**
 * Settings > Add-ons — browse paid upgrades. Shared Spaces links to /upgrade;
 * Review and Challenges are coming soon.
 */
export default function PrototypeAddonsPage() {
  const navigate = useNavigate();
  const { data: subscription, isLoading } = useSubscriptionStatus();
  const hasSharedSpaces = Boolean(subscription?.hasSharedSpaces);

  return (
    <SettingsShell>
      <SettingsIntro>Optional paid upgrades for your Bible study.</SettingsIntro>

      {isLoading ? (
        <p className="pds-caption" style={{ marginTop: 4, color: 'var(--pds-text-secondary)' }}>
          Loading…
        </p>
      ) : null}

      <SettingsGroup>
        <SettingsRow
          label="Shared Spaces"
          sublabel="Notes, threads, and folders for group study."
          leadingIcon="user-group"
          leadingAccent="var(--pds-highlight-coral-rose)"
          badge={hasSharedSpaces ? 'Active' : undefined}
          onClick={() => navigate({ to: '/upgrade' })}
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
        <p className="pds-caption" style={{ margin: '4px 12px 0', color: 'var(--pds-text-secondary)' }}>
          <SafeSubscriptionDetailsButton publishableKey={null}>
            <button type="button" className="proto-settings-billing-link">
              Manage billing
            </button>
          </SafeSubscriptionDetailsButton>
        </p>
      ) : null}
    </SettingsShell>
  );
}
