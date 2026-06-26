/**
 * Account menu — toolbar dropdown. Shows the signed-in name + email (like native
 * Mac's account screen), Settings, and Log out.
 * Mirrors SpaceSwitcherMenu / ListViewMenu (proto-menu popover, right-anchored).
 */
import { useClerk, useUser } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { resolveProfileFullName } from '@/utils/nav-avatar-initials';
import { resolveClerkProfileImageUrl } from '../../lib/clerk-profile-image';
import { prototypeSettingsRouteTo } from '@/lib/prototype-path';
import { storeSettingsOpenerPath } from '../../lib/prototype-settings-opener';
import { updateCachedProfile, useProfile } from '../../hooks/queries/useProfile';
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss';
import ProtoPopoverShell from './ProtoPopoverShell';

export default function AccountMenu({ iconSize, disabled = false }: { iconSize: number; disabled?: boolean }) {
  const clerk = useClerk();
  const { user } = useUser();
  const { open, setOpen, rootRef } = usePopoverDismiss<HTMLDivElement>();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchRaw = useRouterState({ select: (s) => s.location.searchStr });
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);

  const avatarImageUrl = useMemo(
    () => resolveClerkProfileImageUrl(user, profile?.profileImageUrl),
    [user, profile?.profileImageUrl],
  );

  useEffect(() => {
    setPhotoLoadFailed(false);
  }, [avatarImageUrl]);

  useEffect(() => {
    if (!user?.id || user.hasImage !== false) return;
    updateCachedProfile({ profileImageUrl: null });
    queryClient.setQueriesData<{ profileImageUrl?: string | null }>(
      { queryKey: ['profile'] },
      (old) => (old && typeof old === 'object' ? { ...old, profileImageUrl: null } : old),
    );
  }, [user?.hasImage, user?.id, queryClient]);

  const name = useMemo(() => resolveProfileFullName(user, profile), [user, profile]);
  const email = profile?.email ?? user?.primaryEmailAddress?.emailAddress ?? '';
  const showProfilePhoto = Boolean(avatarImageUrl) && !photoLoadFailed;

  return (
    <div className="proto-menu" ref={rootRef}>
      <button
        type="button"
        className={`proto-toolbar-icon-btn${showProfilePhoto ? ' proto-toolbar-icon-btn--profile-photo' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        title="Account"
        aria-label="Account"
        onClick={() => {
          if (disabled) return;
          setOpen((x) => !x);
        }}
      >
        <span className="proto-profile-orb" aria-hidden>
          {showProfilePhoto ? (
            <img
              src={avatarImageUrl!}
              alt=""
              className="proto-profile-orb__photo"
              onError={() => setPhotoLoadFailed(true)}
            />
          ) : (
            <Icon name="circle-user" size={iconSize} />
          )}
        </span>
      </button>

      {open ? (
        <ProtoPopoverShell className="proto-menu__popover proto-menu__popover--right" role="menu" aria-label="Account">
          {/* Name + email header (mirrors native Mac account screen). */}
          <div style={{ padding: '8px 10px 10px', borderBottom: '0.5px solid var(--pds-border)', marginBottom: 4 }}>
            <div className="pds-list-title" style={{ color: 'var(--pds-text-primary)' }}>{name}</div>
            {email ? (
              <div className="pds-list-preview" style={{ marginTop: 2 }}>{email}</div>
            ) : null}
          </div>

          <div className="proto-menu-section" role="group">
            <button
              type="button"
              role="menuitem"
              className="proto-menu-item"
              onClick={() => {
                setOpen(false);
                storeSettingsOpenerPath(`${pathname}${searchRaw ?? ''}`);
                void navigate({ to: prototypeSettingsRouteTo() });
              }}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="gear" size={15} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>Settings</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="proto-menu-item"
              disabled={isSigningOut}
              onClick={() => {
                setOpen(false);
                setIsSigningOut(true);
                void clerk.signOut({ redirectUrl: '/sign-in' }).finally(() => {
                  setIsSigningOut(false);
                });
              }}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="right-from-bracket" size={15} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>{isSigningOut ? 'Logging out…' : 'Log out'}</span>
            </button>
          </div>
        </ProtoPopoverShell>
      ) : null}
    </div>
  );
}
