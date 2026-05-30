import { useClerk } from '@clerk/clerk-react';
import { useProfile } from '../../../hooks/queries/useProfile';
import { SettingsShell, SettingsGroup, SettingsRow } from './SettingsShell';

/**
 * Account detail pane — name + email header, Manage account (Clerk), and Sign out.
 * Extracted from the old single-page Settings hub; this is the default detail pane
 * on wide screens (PrototypeSettingsIndex redirects here).
 */
export default function PrototypeAccountPage() {
  const clerk = useClerk();
  const { data: profile } = useProfile();

  const name =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() ||
    profile?.displayName ||
    'Your account';
  const email = profile?.email ?? '';

  return (
    <SettingsShell title="Account">
      {/* Name + email header (mirrors native Mac account screen). */}
      <div style={{ padding: '4px 12px 18px' }}>
        <div className="pds-title" style={{ margin: 0 }}>{name}</div>
        {email ? (
          <div className="pds-caption" style={{ color: 'var(--pds-text-secondary)', marginTop: 2 }}>{email}</div>
        ) : null}
      </div>

      <SettingsGroup>
        <SettingsRow
          label="Manage account"
          sublabel="Name, email, and password"
          trailing="none"
          onClick={() => clerk.openUserProfile()}
        />
      </SettingsGroup>

      <button
        type="button"
        className="proto-settings-btn"
        style={{ marginTop: 8 }}
        onClick={() => { void clerk.signOut({ redirectUrl: '/sign-in' }); }}
      >
        Sign out
      </button>
    </SettingsShell>
  );
}
