import { useNavigate } from '@tanstack/react-router';
import SafeSubscriptionDetailsButton from '@/components/react/SafeSubscriptionDetailsButton';
import { useNavigation } from '../../../hooks/queries/useNavigation';
import { useSubscriptionStatus } from '../../../hooks/queries/useSubscriptionStatus';
import { SettingsGroup, SettingsRow, SettingsShell } from './SettingsShell';

const SHARED_SPACES_SUBLABEL = 'Host spaces for group study. Free to join.';

/** Badge for Settings > Add-ons Shared Spaces row — host add-on vs. free member. */
export function resolveSharedSpacesAddonBadge(options: {
  hasSharedSpaces: boolean;
  memberOfCount: number;
}): string | undefined {
  if (options.hasSharedSpaces) return 'Active';
  if (options.memberOfCount <= 0) return undefined;
  return options.memberOfCount === 1 ? 'In 1 space' : `In ${options.memberOfCount} spaces`;
}

/**
 * Settings > Add-ons — browse paid upgrades. Shared Spaces links to /addon;
 * Review and Challenges are coming soon.
 */
export default function PrototypeAddonsPage() {
  const navigate = useNavigate();
  const { data: nav } = useNavigation();
  const { data: subscription, isLoading } = useSubscriptionStatus();
  const hasSharedSpaces = Boolean(subscription?.hasSharedSpaces);
  const memberOfCount = nav?.memberOfSpaces?.length ?? 0;
  const sharedSpacesBadge = resolveSharedSpacesAddonBadge({ hasSharedSpaces, memberOfCount });
  const showLoading = isLoading && !subscription;

  return (
    <SettingsShell>
      {showLoading ? (
        <p className="pds-caption" style={{ marginTop: 4, color: 'var(--pds-text-secondary)' }}>
          Loading…
        </p>
      ) : null}

      <SettingsGroup>
        <SettingsRow
          label="Shared Spaces"
          sublabel={SHARED_SPACES_SUBLABEL}
          leadingIcon="user-group"
          leadingAccent="var(--pds-highlight-coral-rose)"
          badge={sharedSpacesBadge}
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
            Manage Add-On
          </button>
        </SafeSubscriptionDetailsButton>
      ) : null}
    </SettingsShell>
  );
}
