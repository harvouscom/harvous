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
import { getNavAvatarInitials, resolveProfileFullName } from '@/utils/nav-avatar-initials';
import { resolveClerkProfileImageUrl } from '../../lib/clerk-profile-image';
import { prototypeSettingsAccountRouteTo, prototypeSettingsRouteTo } from '@/lib/prototype-path';
import { storeSettingsOpenerPath } from '../../lib/prototype-settings-opener';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { updateCachedProfile, useProfile } from '../../hooks/queries/useProfile';
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss';
import { prefetchSettingsOpenPath } from './settings/prefetch-settings-chunks';
import ProtoPopoverShell from './ProtoPopoverShell';
import { PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';

export default function AccountMenu({ iconSize, disabled = false }: { iconSize: number; disabled?: boolean }) {
  const clerk = useClerk();
  const { user } = useUser();
  const { open, setOpen, rootRef } = usePopoverDismiss<HTMLDivElement>();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchRaw = useRouterState({ select: (s) => s.location.searchStr });
  const { isMobileSidebar } = useProtoShell();
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
  /* Initials rather than a person glyph where there is no photo — the header's job is to
     say *which* account, and a generic silhouette is the one answer that does not. */
  const initials = useMemo(() => getNavAvatarInitials(user, profile), [user, profile]);
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
        <ProtoPopoverShell
          className="proto-menu__popover proto-menu__popover--right proto-menu__popover--account"
          role="menu"
          aria-label="Account"
        >
          {/*
            Who you are, shown rather than only spelled out. The face carries continuity from
            the orb that was just clicked — the menu opens from it and repeats it, so the two
            read as one object rather than as a button and an unrelated panel.
          */}
          <div className="proto-account-menu__identity">
            <span className="proto-account-menu__avatar" aria-hidden>
              {showProfilePhoto ? (
                <img
                  src={avatarImageUrl!}
                  alt=""
                  className="proto-profile-orb__photo"
                  onError={() => setPhotoLoadFailed(true)}
                />
              ) : (
                initials
              )}
            </span>
            <span className="proto-account-menu__text">
              <span className="pds-list-title proto-account-menu__name">{name}</span>
              {email ? (
                <span className="pds-list-preview proto-account-menu__email">{email}</span>
              ) : null}
            </span>
          </div>

          <div className="proto-menu-section" role="group">
            <button
              type="button"
              role="menuitem"
              className="proto-menu-item"
              onPointerEnter={prefetchSettingsOpenPath}
              onPointerDown={prefetchSettingsOpenPath}
              onFocus={prefetchSettingsOpenPath}
              onClick={() => {
                setOpen(false);
                storeSettingsOpenerPath(`${pathname}${searchRaw ?? ''}`);
                // Desktop: open Account detail directly so the settings Outlet never
                // briefly hits TanStack's default Not Found during the index redirect.
                void navigate({
                  to: isMobileSidebar ? prototypeSettingsRouteTo() : prototypeSettingsAccountRouteTo(),
                });
              }}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="gear" size={PROTO_TOOLBAR_ICON_SIZE} />
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
                <Icon name="right-from-bracket" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>{isSigningOut ? 'Logging out…' : 'Log out'}</span>
            </button>
          </div>
        </ProtoPopoverShell>
      ) : null}
    </div>
  );
}
