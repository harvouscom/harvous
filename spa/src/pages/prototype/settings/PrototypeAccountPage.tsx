import { useClerk } from '@clerk/clerk-react';
import { useProfile } from '../../../hooks/queries/useProfile';
import { SettingsShell, SettingsGroup, SettingsRow } from './SettingsShell';

/**
 * Account detail pane — name + email header and Manage account (Clerk).
 * Log out lives in the account toolbar menu. Default detail pane on wide screens
 * (PrototypeSettingsIndex redirects here).
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
    </SettingsShell>
  );
}
