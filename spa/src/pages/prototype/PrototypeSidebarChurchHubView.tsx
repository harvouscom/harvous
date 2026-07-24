/**
 * My Church hub — two lanes: church Shared Spaces + ministry channels.
 * Not a space dashboard; picking a row opens that space.
 */
import { useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useNavigation } from '../../hooks/queries/useNavigation';
import { useProfile } from '../../hooks/queries/useProfile';
import {
  churchHubSpacesForOrg,
  formatChurchLocation,
  resolveMyChurchFromNav,
} from '../../lib/church-settings';
import { isMinistryBroadcastSpace } from '../../lib/shared-space-capabilities';
import { cadenceShortLabel } from '@/utils/channel-publish-cadence';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import PrototypeSidebarToolbar from './PrototypeSidebarToolbar';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import CreateSharedSpaceSheet from './CreateSharedSpaceSheet';

function normalizeSpaceId(id: string): string {
  return id.startsWith('space_') ? id : `space_${id}`;
}

type HubSpace = ReturnType<typeof churchHubSpacesForOrg>[number];

function ministryHubSubtitle(space: HubSpace): string | null {
  const cadence = cadenceShortLabel(space.publishCadence ?? null);
  if (!cadence) return null;
  if (space.cadenceStale) return `${cadence} · Quiet lately`;
  return cadence;
}

function ChurchHubSpaceButton({
  space,
  ministry,
  onOpen,
}: {
  space: HubSpace;
  ministry: boolean;
  onOpen: (spaceId: string) => void;
}) {
  const subtitle = ministry ? ministryHubSubtitle(space) : null;
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
          </span>
          <div className="proto-church-hub__row-text">
            <p className="pds-list-title proto-home-card__title">{space.title}</p>
            {subtitle ? (
              <p className="proto-caption proto-church-hub__row-meta">{subtitle}</p>
            ) : null}
          </div>
          <span className="proto-home-card__chevron" aria-hidden>
            <Icon name="caret-right" size={11} />
          </span>
        </div>
      </div>
    </button>
  );
}

export default function PrototypeSidebarChurchHubView() {
  const { isMobileSidebar, activeChurchOrgId, setActiveSpaceId, ensureSidebarExpanded } = useProtoShell();
  const { data: nav } = useNavigation();
  const { data: profile } = useProfile();
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  const church = useMemo(
    () =>
      resolveMyChurchFromNav({
        spaces: nav?.spaces,
        memberOfSpaces: nav?.memberOfSpaces,
        connectedOrgId: activeChurchOrgId ?? profile?.connectedOrgId,
      }),
    [nav?.spaces, nav?.memberOfSpaces, activeChurchOrgId, profile?.connectedOrgId],
  );

  const orgId = activeChurchOrgId ?? church?.orgId ?? null;
  const churchName = church?.churchName ?? 'My Church';
  const churchLocation = church ? formatChurchLocation(church) : null;

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
    setActiveSpaceId(normalizeSpaceId(spaceId));
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
                  title="No spaces yet"
                  description="Create a church Shared Space, or open a ministry channel once staff add one."
                />
              </div>
            ) : null}

            <div className="proto-home-section">
              {!isEmpty ? (
                <p className="proto-caption proto-home-section__eyebrow">Shared Spaces</p>
              ) : null}
              {sharedSpaces.length > 0 ? (
                <ul className="proto-church-hub__list">
                  {sharedSpaces.map((space) => (
                    <li key={space.id}>
                      <ChurchHubSpaceButton space={space} ministry={false} onOpen={openSpace} />
                    </li>
                  ))}
                </ul>
              ) : !isEmpty ? (
                <p className="proto-caption proto-church-hub__empty-lane">
                  No church Shared Spaces yet.
                </p>
              ) : null}
              {orgId ? (
                <button
                  type="button"
                  className={
                    isEmpty
                      ? 'proto-settings-btn proto-settings-btn--secondary'
                      : 'proto-caption'
                  }
                  style={
                    isEmpty
                      ? { marginTop: 12 }
                      : {
                          marginTop: 8,
                          appearance: 'none',
                          border: 0,
                          background: 'transparent',
                          color: 'var(--pds-text-accent, var(--pds-accent))',
                          cursor: 'pointer',
                          padding: 0,
                          fontWeight: 500,
                        }
                  }
                  onClick={() => setCreateSheetOpen(true)}
                >
                  New church Shared Space
                </button>
              ) : null}
            </div>

            {!isEmpty || ministryChannels.length > 0 ? (
              <div className="proto-home-section">
                <p className="proto-caption proto-home-section__eyebrow">Ministry channels</p>
                {ministryChannels.length === 0 ? (
                  <p className="proto-caption proto-church-hub__empty-lane">
                    No ministry channels yet.
                  </p>
                ) : (
                  <ul className="proto-church-hub__list">
                    {ministryChannels.map((space) => (
                      <li key={space.id}>
                        <ChurchHubSpaceButton space={space} ministry onOpen={openSpace} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </>
        </div>
      </div>
      {orgId ? (
        <CreateSharedSpaceSheet
          open={createSheetOpen}
          onOpenChange={setCreateSheetOpen}
          orgId={orgId}
          onCreated={(spaceId) => openSpace(spaceId)}
        />
      ) : null}
    </div>
  );
}
