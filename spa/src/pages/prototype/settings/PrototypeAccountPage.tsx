import { useMemo, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import Icon from '@/components/react/Icon';
import { resolveClerkProfileImageUrl } from '../../../lib/clerk-profile-image';
import { useProfile } from '../../../hooks/queries/useProfile';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { SettingsShell, SettingsGroup, SettingsRow } from './SettingsShell';
import SettingsAdminShortcut from './SettingsAdminShortcut';
import AccountEditProfile from './account/AccountEditProfile';
import AccountEmails from './account/AccountEmails';
import AccountChangePassword from './account/AccountChangePassword';
import AccountSecurity from './account/AccountSecurity';

type AccountView = 'hub' | 'profile' | 'emails' | 'password' | 'security';

/**
 * Account hub — identity header + one-tap rows for each Clerk setting
 * (edit profile, email addresses, change password, security). Sub-screens are
 * rendered in-pane via local view state (not router routes) so the back button
 * works the same in the wide two-pane modal and the mobile sheet. Log out lives
 * in the account toolbar menu.
 */
export default function PrototypeAccountPage() {
  const { user } = useUser();
  const { data: profile } = useProfile();
  const { isMobileSidebar } = useProtoShell();
  const [view, setView] = useState<AccountView>('hub');

  const avatarUrl = useMemo(
    () => resolveClerkProfileImageUrl(user, profile?.profileImageUrl),
    [user, profile?.profileImageUrl],
  );

  const name =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() ||
    profile?.displayName ||
    'Your account';
  const email = profile?.email ?? '';
  // Show "Set password" when the account has no password strategy configured.
  const passwordRowLabel = user?.passwordEnabled === false ? 'Set password' : 'Change password';

  const back = () => setView('hub');

  if (view === 'profile') return <AccountEditProfile onBack={back} />;
  if (view === 'emails') return <AccountEmails onBack={back} />;
  if (view === 'password') return <AccountChangePassword onBack={back} />;
  if (view === 'security') return <AccountSecurity onBack={back} />;

  return (
    <SettingsShell>
      {/* Identity header — avatar + name + email (mirrors native Mac account screen). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 12px 20px' }}>
        <span
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            flexShrink: 0,
            background: 'var(--pds-bg-input)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--pds-text-tertiary)',
            overflow: 'hidden',
          }}
        >
          {avatarUrl ? <img src={avatarUrl} alt="" className="proto-profile-orb__photo" /> : <Icon name="circle-user" size={40} />}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="pds-title" style={{ margin: 0 }}>{name}</div>
          {email ? (
            <div className="pds-caption" style={{ color: 'var(--pds-text-secondary)', marginTop: 2, wordBreak: 'break-all' }}>{email}</div>
          ) : null}
        </div>
      </div>

      {!isMobileSidebar ? (
        <div style={{ marginBottom: 20 }}>
          <SettingsAdminShortcut variant="card" />
        </div>
      ) : null}

      <SettingsGroup>
        <SettingsRow label="Edit profile" sublabel="Name and photo" onClick={() => setView('profile')} />
        <SettingsRow label="Email addresses" sublabel="Add, verify, or set primary" onClick={() => setView('emails')} />
        <SettingsRow label={passwordRowLabel} sublabel="Update your password" onClick={() => setView('password')} />
        <SettingsRow label="Security" sublabel="Active devices and account" onClick={() => setView('security')} />
      </SettingsGroup>
    </SettingsShell>
  );
}
