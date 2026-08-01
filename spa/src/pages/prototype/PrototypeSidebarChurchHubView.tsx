/**
 * My Church hub — two lanes: church Shared Spaces + ministry channels.
 * Not a space dashboard; picking a row opens that space.
 * Catalog scope: docs/future/MY_CHURCH_SIDEBAR.md (Layer 1–2).
 */
import { useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useSwitchToSpace } from '../../hooks/useSwitchToSpace';
import { useNavigation } from '../../hooks/queries/useNavigation';
import { useProfile } from '../../hooks/queries/useProfile';
import { useChurchStaffStatus } from '../../hooks/queries/useChurchStaffStatus';
import {
  canCreateChurchOrgContent,
  churchHubSpacesForOrg,
  formatChurchLocation,
  formatHubNewBadge,
  formatMinistryChannelTeaser,
  resolveMyChurchFromNav,
} from '../../lib/church-settings';
import { isMinistryBroadcastSpace } from '../../lib/shared-space-capabilities';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import PrototypeSidebarToolbar from './PrototypeSidebarToolbar';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import CreateSharedSpaceSheet, { type CreateSpaceSheetKind } from './CreateSharedSpaceSheet';

function normalizeSpaceId(id: string): string {
  return id.startsWith('space_') ? id : `space_${id}`;
}

type HubSpace = ReturnType<typeof churchHubSpacesForOrg>[number];

function ChurchHubSpaceButton({
  space,
  ministry,
  onOpen,
}: {
  space: HubSpace;
  ministry: boolean;
  onOpen: (spaceId: string) => void;
}) {
  const subtitle = ministry ? formatMinistryChannelTeaser(space) : null;
  const badge = formatHubNewBadge(space.newNoteCount);
  const hasUnseen = Boolean(badge);

  return (
    <button
      type="button"
      className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
      onClick={() => onOpen(space.id)}
    >
      <div className="proto-home-card__body">
        <div className="proto-home-card__title-row">
          <span className="proto-home-card__icon-orb" aria-hidden>
            <ProtoSpaceMenuIcon
              color={space.color || 'paper'}
              size={28}
              radius={8}
              iconName={ministry ? 'rss' : 'user-group'}
            />
            {hasUnseen ? <span className="proto-space-switcher-dot" aria-hidden /> : null}
          </span>
          <div className="proto-church-hub__row-text">
            <p className="pds-list-title proto-home-card__title">{space.title}</p>
            {subtitle ? (
              <p className="proto-caption proto-church-hub__row-meta">{subtitle}</p>
            ) : null}
          </div>
          {badge ? (
            <span
              className="proto-space-switcher-badge"
              aria-label={badge === '1' ? '1 new note' : `${badge} new notes`}
            >
              {badge}
            </span>
          ) : null}
          <span className="proto-home-card__chevron" aria-hidden>
            <Icon name="caret-right" size={11} />
          </span>
        </div>
      </div>
    </button>
  );
}

export default function PrototypeSidebarChurchHubView() {
  const { isMobileSidebar, activeChurchOrgId, ensureSidebarExpanded } = useProtoShell();
  const switchToSpace = useSwitchToSpace();
  const { data: nav } = useNavigation();
  const { data: profile } = useProfile();
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [createKind, setCreateKind] = useState<CreateSpaceSheetKind>('shared');

  function openCreateSheet(kind: CreateSpaceSheetKind) {
    setCreateKind(kind);
    setCreateSheetOpen(true);
  }

  const church = useMemo(
    () =>
      resolveMyChurchFromNav({
        spaces: nav?.spaces,
        memberOfSpaces: nav?.memberOfSpaces,
        connectedOrgId: activeChurchOrgId ?? profile?.connectedOrgId,
        churchName: profile?.churchName,
        churchCity: profile?.churchCity,
        churchState: profile?.churchState,
      }),
    [
      nav?.spaces,
      nav?.memberOfSpaces,
      activeChurchOrgId,
      profile?.connectedOrgId,
      profile?.churchName,
      profile?.churchCity,
      profile?.churchState,
    ],
  );

  const orgId = activeChurchOrgId ?? church?.orgId ?? null;
  const churchName = church?.churchName ?? 'My Church';
  const churchLocation = church ? formatChurchLocation(church) : null;
  const { isStaff: isOrgStaff } = useChurchStaffStatus(orgId);
  const canCreateChurchContent = useMemo(
    () =>
      canCreateChurchOrgContent({
        navigation: nav,
        orgId,
        connectedOrgId: profile?.connectedOrgId,
        isHomeChurchStaff: profile?.isHomeChurchStaff,
        isOrgStaff,
      }),
    [nav, orgId, profile?.connectedOrgId, profile?.isHomeChurchStaff, isOrgStaff],
  );
  const { sharedSpaces, ministryChannels } = useMemo(() => {
    const all = [...(nav?.spaces ?? []), ...(nav?.memberOfSpaces ?? [])];
    const hubSpaces = churchHubSpacesForOrg(all, orgId);
    const shared: HubSpace[] = [];
    const ministry: HubSpace[] = [];
    for (const space of hubSpaces) {
      if (isMinistryBroadcastSpace(space)) ministry.push(space);
      else shared.push(space);
    }
    return { sharedSpaces: shared, ministryChannels: ministry };
  }, [nav?.spaces, nav?.memberOfSpaces, orgId]);

  const isEmpty = sharedSpaces.length === 0 && ministryChannels.length === 0;

  const openSpace = (spaceId: string) => {
    ensureSidebarExpanded();
    switchToSpace(normalizeSpaceId(spaceId));
  };

  return (
    <div className="proto-sidebar-root proto-church-hub">
      {isMobileSidebar ? <PrototypeSidebarToolbar variant="drawer" /> : null}
      <div className="proto-shared-space-header">
        <div className="proto-shared-space-header__row">
          <span className="proto-shared-space-header__church-icon" aria-hidden>
            <Icon name="church" size={18} />
          </span>
          <div className="proto-shared-space-header__meta">
            <div className="pds-list-title proto-shared-space-header__title" title={churchName}>
              {churchName}
            </div>
            {churchLocation ? (
              <p className="proto-caption proto-shared-space-header__location" title={churchLocation}>
                {churchLocation}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="proto-sidebar-scroll">
        <div className="proto-home-view">
          <>
            {isEmpty ? (
              <div className="proto-home-section">
                <PrototypeListEmptyState
                  iconName="church"
                  title="Still quiet here"
                  description="Shared spaces are for groups. Ministry channels are where your church publishes study."
                />
                {canCreateChurchContent ? (
                  <div className="proto-church-hub__create-stack">
                    <button
                      type="button"
                      className="proto-settings-btn proto-settings-btn--secondary"
                      onClick={() => openCreateSheet('shared')}
                    >
                      New church shared space
                    </button>
                    <button
                      type="button"
                      className="proto-settings-btn proto-settings-btn--secondary"
                      onClick={() => openCreateSheet('ministry')}
                    >
                      New ministry channel
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="proto-home-section">
                  <p className="proto-caption proto-home-section__eyebrow">Shared spaces</p>
                  {sharedSpaces.length > 0 ? (
                    <ul className="proto-church-hub__list">
                      {sharedSpaces.map((space) => (
                        <li key={space.id}>
                          <ChurchHubSpaceButton space={space} ministry={false} onOpen={openSpace} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="proto-caption proto-church-hub__empty-lane">
                      No church shared spaces yet.
                    </p>
                  )}
                  {canCreateChurchContent ? (
                    <button
                      type="button"
                      className="proto-church-hub__lane-action"
                      onClick={() => openCreateSheet('shared')}
                    >
                      New church shared space
                    </button>
                  ) : null}
                </div>

                <div className="proto-home-section">
                  <p className="proto-caption proto-home-section__eyebrow">Ministry channels</p>
                  {ministryChannels.length > 0 ? (
                    <ul className="proto-church-hub__list">
                      {ministryChannels.map((space) => (
                        <li key={space.id}>
                          <ChurchHubSpaceButton space={space} ministry onOpen={openSpace} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="proto-caption proto-church-hub__empty-lane">
                      No ministry channels yet.
                    </p>
                  )}
                  {canCreateChurchContent ? (
                    <button
                      type="button"
                      className="proto-church-hub__lane-action"
                      onClick={() => openCreateSheet('ministry')}
                    >
                      New ministry channel
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </>
        </div>
      </div>

      {orgId && canCreateChurchContent ? (
        <CreateSharedSpaceSheet
          open={createSheetOpen}
          onOpenChange={setCreateSheetOpen}
          orgId={orgId}
          kind={createKind}
          onCreated={(spaceId) => openSpace(spaceId)}
        />
      ) : null}
    </div>
  );
}
