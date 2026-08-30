/**
 * My Church hub — two lanes: church Shared Spaces + ministry channels.
 * Not a space dashboard; picking a row opens that space.
 * Catalog scope: docs/future/MY_CHURCH_SIDEBAR.md (Layer 1–2).
 *
 * ## Why this takes a variant rather than being copied
 *
 * The hub is moving off the rail and into the main pane, where Activity already lives, and for
 * a while it has to be both: the rail survives behind ⇧S this phase, and `proto-shell-context`
 * is explicit that "the two must not move each other". A second copy for the sheet is exactly
 * the mistake `use-home-surface-data` was written to undo — Home's derivation lived inside the
 * sidebar, so Activity could only offer what it could cheaply re-derive, and the two drifted
 * where a reader could see it.
 *
 * So: one component, one set of lanes and gates, and `variant` decides only the chrome around
 * them. Everything between the header and the create sheet is identical on both, which is the
 * property that makes the eventual deletion of the rail a deletion rather than a migration.
 *
 * The body needs no translation because it was already written in Home's vocabulary — sections
 * are `.proto-home-section` with a `__eyebrow`, the same anatomy `PrototypeHomeSection` renders
 * on the day sheet. That is why this is a hosting change and not a rewrite.
 */
import { useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useSwitchToSpace } from '../../hooks/useSwitchToSpace';
import { useNavigation } from '../../hooks/queries/useNavigation';
import { isQuerySettled } from '@/utils/prototype-home-ready';
import { useProfile } from '../../hooks/queries/useProfile';
import { useChurchStaffStatus } from '../../hooks/queries/useChurchStaffStatus';
import { useChurchPlannerAccess } from '../../hooks/useChurchPlannerAccess';
import { useChurchBilling } from '../../hooks/queries/useChurchBilling';
import {
  canCreateChurchOrgContent,
  churchHubSpacesForOrg,
  formatChurchLocation,
  formatHubNewBadge,
  formatMinistryChannelTeaser,
  resolveMyChurchFromNav,
} from '../../lib/church-settings';
import { isMinistryBroadcastSpace } from '../../lib/shared-space-capabilities';
import { useChurchChannels, type ChurchChannel } from '../../hooks/queries/useChurchChannels';
import { useFollowChannel } from '../../hooks/mutations/useFollowChannel';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import PrototypeSidebarToolbar from './PrototypeSidebarToolbar';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import CreateSharedSpaceSheet, { type CreateSpaceSheetKind } from './CreateSharedSpaceSheet';
import PrototypeChurchPlanRow from './PrototypeChurchPlanRow';
import { ProtoToolsRowList, type ProtoToolRow } from './proto-tools-registry';
import PrototypeChurchStaffSection from './PrototypeChurchStaffSection';
import PrototypeChurchTeachingPlanSection from './PrototypeChurchTeachingPlanSection';
import PrototypeChurchEngagementSection from './PrototypeChurchEngagementSection';
import PrototypeChurchStarterSection from './PrototypeChurchStarterSection';
import PrototypeChurchSettingsSection from './PrototypeChurchSettingsSection';
import { useProtoHomeViewClassName } from './useProtoHomeViewEnter';
import PrototypeChannelPairingSection from './PrototypeChannelPairingSection';

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

/**
 * Browse/manage row for a ministry channel, with a Follow/Following toggle.
 * Deliberately a div, not the tappable ChurchHubSpaceButton — an unfollowed
 * channel has no space to open, and a nested button would be invalid markup.
 */
function ChurchHubBrowseRow({
  channel,
  pending,
  onToggleFollow,
}: {
  channel: ChurchChannel;
  pending: boolean;
  onToggleFollow: (spaceId: string, follow: boolean) => void;
}) {
  const following = channel.isFollowing;
  return (
    <div className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-church-hub__browse-row">
      <div className="proto-home-card__body">
        <div className="proto-home-card__title-row">
          <span className="proto-home-card__icon-orb" aria-hidden>
            <ProtoSpaceMenuIcon color={channel.color || 'paper'} size={28} radius={8} iconName="rss" />
          </span>
          <div className="proto-church-hub__row-text">
            <p className="pds-list-title proto-home-card__title">{channel.title}</p>
            {channel.description ? (
              <p className="proto-caption proto-church-hub__row-meta">{channel.description}</p>
            ) : channel.cadenceLabel ? (
              <p className="proto-caption proto-church-hub__row-meta">{channel.cadenceLabel}</p>
            ) : null}
          </div>
          {/* Same control as New note / Add service — one action language. */}
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--control proto-glass-action"
            data-following={following ? 'true' : undefined}
            disabled={pending}
            aria-label={following ? `Unfollow ${channel.title}` : `Follow ${channel.title}`}
            onClick={() => onToggleFollow(channel.id, !following)}
          >
            {following ? null : <Icon name="plus" size={12} aria-hidden />}
            <span className="proto-glass-action__label">
              {pending ? '…' : following ? 'Following' : 'Follow'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export type ChurchHubVariant = 'rail' | 'sheet';

export default function PrototypeChurchHub({
  variant = 'rail',
}: {
  /**
   * Which chrome to wear. `rail` is the sidebar this grew up in; `sheet` is the main pane,
   * where it wears `.proto-feed-sheet` so a church reads as the same kind of surface as a day.
   */
  variant?: ChurchHubVariant;
} = {}) {
  const { isMobileSidebar, activeChurchOrgId, ensureSidebarExpanded, openExpandedSidebar } = useProtoShell();
  const switchToSpace = useSwitchToSpace();
  const navQuery = useNavigation();
  const profileQuery = useProfile();
  const nav = navQuery.data;
  const profile = profileQuery.data;
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
  const { isStaff: isOrgStaff, can: canChurch, isLoading: staffStatusLoading } =
    useChurchStaffStatus(orgId);
  /*
    The planner's own gates come from the shared hook, because the expanded
    planner reads the same verdicts: a board that lets you drag a card this
    pane would have shown as read-only is worse than either surface alone.
  */
  const plannerAccess = useChurchPlannerAccess(orgId);
  const canViewTeachingPlan = plannerAccess.canView;
  /** First client consumer of `manage_templates` — the church-starters gate. */
  const canManageChurchTemplates = canChurch('manage_templates');
  /** Admin-only: the church's own clock. */
  const canManageChurchSettings = canChurch('manage_church_settings');
  /*
    Admin-only, deliberately the narrowest audience: adoption numbers are an
    administrative view of the congregation, and widening later is one line
    while narrowing after a church has grown used to it is not.
  */
  const canViewEngagement = canChurch('manage_staff');
  /* Browsing the catalog is `sermon_tools`; curating it is `manage_library`.
     A teacher gets the row and a read-only view inside it. */
  const canBrowseLibrary = canChurch('sermon_tools');
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

  // Channels the church publishes that the viewer hasn't followed yet. Staff
  // reach their own channels through the lanes above, so they're filtered out.
  const channelsQuery = useChurchChannels();
  const billingEnabled = canCreateChurchContent;
  const billingQuery = useChurchBilling(orgId, { enabled: billingEnabled });
  const channelsData = channelsQuery.data;
  /**
   * Lapsed gates *writes* only. The plan stays listed and the congregation
   * keeps its Sunday — losing a church's study is never how a lapse shows up.
   * Read off the channels payload rather than adding a billing request.
   */
  const churchPlanLapsed = channelsData?.sponsorship?.state === 'lapsed';
  /**
   * Why the plan is read-only, when it is — derived once in the shared hook so
   * the compact pane and the expanded planner cannot disagree.
   */
  const teachingPlanReadOnly = plannerAccess.readOnlyReason;
  const followChannel = useFollowChannel();
  const [manageOpen, setManageOpen] = useState(false);
  /**
   * Which pane of the hub is showing. Staff tools are destinations now, not
   * collapsible footnotes — but a route would fight the shell (the layout
   * hosts the note page so navigation doesn't remount the editor), so the
   * stack lives here.
   */
  const [toolsView, setToolsView] = useState<
    | 'catalog'
    | 'teaching-plan'
    | 'team'
    | 'starters'
    | 'settings'
    | 'engagement'
  >('catalog');
  const pendingFollowId = followChannel.isPending
    ? followChannel.variables?.spaceId ?? null
    : null;

  /*
    The Tools card, in order. Each row keeps its own gate here rather than in
    the renderer: these gates are not one vocabulary — a planner verdict from a
    shared hook, two capability checks, an admin check, and a derived staff
    boolean — and the reasoning below belongs beside the row it decides.
  */
  const churchToolRows = useMemo<ProtoToolRow[]>(() => {
    const rows: ProtoToolRow[] = [];
    /* Role-gated on `sermon_tools`, NOT canCreateChurchContent — that is the
       publish-level gate. Seeing the plan is a pastor/teacher/admin act;
       *changing* it is narrower still (`manage_teaching_plan`), and that verdict
       rides in as `canWrite` rather than hiding the door. */
    if (canViewTeachingPlan) {
      rows.push({
        key: 'planner',
        icon: 'calendar-week',
        title: 'Planner',
        meta: 'Sermons and series',
        onSelect: () => setToolsView('teaching-plan'),
      });
    }
    if (canCreateChurchContent) {
      rows.push({
        key: 'team',
        icon: 'user-group',
        title: 'Team',
        meta: 'Staff and volunteers',
        onSelect: () => setToolsView('team'),
      });
    }
    /* Gated on `manage_templates`, not publish rights: a teacher writes
       curriculum, but provisioning what the whole church starts from is a
       pastor/admin act. The meta says the thing the title can't — these reach
       everyone, unlike a personal template. */
    if (canManageChurchTemplates) {
      rows.push({
        key: 'starters',
        icon: 'list-check',
        title: 'Note templates',
        meta: 'Shared with everyone',
        onSelect: () => setToolsView('starters'),
      });
    }
    /* Opens straight into the expanded surface rather than a sidebar pane: a
       catalog whose rows carry an audience and a set of rooms has nothing
       useful to say at 304px, so there is no compact version worth stepping
       through. */
    if (canBrowseLibrary) {
      rows.push({
        key: 'library',
        icon: 'newspaper',
        title: 'Resource library',
        meta: 'What your church studies from',
        chevron: 'expand',
        onSelect: () => openExpandedSidebar('library'),
      });
    }
    /* Admin-only. Sits above settings because it is something a pastor looks
       at, not something they configure — and below the tools they act with,
       because it changes nothing. The meta says the limit before anyone opens
       it: "how many" is the whole offer, and a pastor should not have to click
       to find out it is not "who". */
    if (canViewEngagement) {
      rows.push({
        key: 'engagement',
        icon: 'chart-simple',
        title: 'Engagement',
        meta: 'How many, never who',
        onSelect: () => setToolsView('engagement'),
      });
    }
    /* Admin-only, and last: setting the church's clock is the rarest of these
       jobs, and the only one that touches the church record itself. */
    if (canManageChurchSettings) {
      rows.push({
        key: 'settings',
        icon: 'gear',
        title: 'Church settings',
        meta: 'Times and time zone',
        onSelect: () => setToolsView('settings'),
      });
    }
    return rows;
  }, [
    canViewTeachingPlan,
    canCreateChurchContent,
    canManageChurchTemplates,
    canBrowseLibrary,
    canViewEngagement,
    canManageChurchSettings,
    openExpandedSidebar,
  ]);

  // Staff reach their own channels through the lanes above, so they never
  // appear here — you don't "follow" a channel you author.
  const followableChannels = useMemo(
    () => (channelsData?.channels ?? []).filter((channel) => !channel.isStaff),
    [channelsData?.channels],
  );
  const unfollowedChannels = useMemo(
    () => followableChannels.filter((channel) => !channel.isFollowing),
    [followableChannels],
  );
  // Closed, the lane is discovery (unfollowed only); open, it's the manage list
  // (every channel with a Following toggle) — which is where unfollow lives.
  const browseChannels = manageOpen ? followableChannels : unfollowedChannels;
  const canManageChannels = followableChannels.some((channel) => channel.isFollowing);

  const isEmpty =
    sharedSpaces.length === 0 && ministryChannels.length === 0 && followableChannels.length === 0;

  /**
   * Same staggered section enter as My Home and shared spaces. The hub reads as
   * a space dashboard, so it should arrive like one.
   *
   * Wait for every input before playing it: channels decides whether the
   * ministry and browse lanes exist at all, staff status decides whether Staff
   * tools renders, and billing decides whether the pilot row inside it does —
   * animating before those land would fade a lane in and then reshuffle every
   * following section's `:nth-child` delay.
   *
   * Billing is queried here purely to know when it has settled;
   * `PrototypeChurchPlanRow` renders it under the same key and the same
   * `enabled` gate, so React Query dedupes rather than issuing a second
   * request. Without this the pilot row popped into an already-animated card —
   * the second load state.
   *
   * It only counts when it is actually enabled: a disabled query stays
   * `isPending` forever in React Query v5, so requiring it for a congregant
   * (who never sees the row) would strand the animation permanently.
   */
  const contentReady =
    isQuerySettled(navQuery.isPending, nav != null) &&
    isQuerySettled(profileQuery.isPending, profile != null) &&
    isQuerySettled(channelsQuery.isPending, channelsData != null) &&
    !staffStatusLoading &&
    (!billingEnabled || isQuerySettled(billingQuery.isPending, billingQuery.data != null));
  // Each tools pane is its own destination, so it replays on the way in and back.
  const homeViewClassName = useProtoHomeViewClassName(contentReady, `${orgId ?? 'none'}:${toolsView}`);

  /** What the header reads — the pane's own name once you drill into one. */
  const headerTitle =
    toolsView === 'teaching-plan'
      ? 'Planner'
      : toolsView === 'team'
        ? 'Team'
        : toolsView === 'starters'
          ? 'Note templates'
          : toolsView === 'settings'
            ? 'Church settings'
            : toolsView === 'engagement'
              ? 'Engagement'
              : churchName;

  const openSpace = (spaceId: string) => {
    ensureSidebarExpanded();
    switchToSpace(normalizeSpaceId(spaceId));
  };

  const handleToggleFollow = (spaceId: string, follow: boolean) => {
    followChannel.mutate({ spaceId, follow });
  };

  const header = (
        <div className="proto-shared-space-header__row">
          {toolsView === 'catalog' ? (
            <span className="proto-shared-space-header__church-icon" aria-hidden>
              <Icon name="church" size={18} />
            </span>
          ) : (
            <button
              type="button"
              className="proto-shared-space-header__church-icon proto-sidebar-back-tile"
              aria-label={`Back to ${churchName}`}
              onClick={() => setToolsView('catalog')}
            >
              <Icon name="caret-left" size={16} />
            </button>
          )}
          <div className="proto-shared-space-header__meta">
            <div
              className="pds-list-title proto-shared-space-header__title proto-marquee"
              /* Matches what is rendered — it used to always say the church's
                 name, so hovering "Planner" produced a tooltip for a different
                 string than the one on screen. */
              title={headerTitle}
            >
              <span>{headerTitle}</span>
            </div>
            {toolsView === 'catalog' && churchLocation ? (
              <p className="proto-caption proto-shared-space-header__location" title={churchLocation}>
                {churchLocation}
              </p>
            ) : toolsView !== 'catalog' ? (
              <p className="proto-caption proto-shared-space-header__location">{churchName}</p>
            ) : null}
          </div>
          {/*
            Opt-in, not automatic: the compact list is still the right answer for
            "what am I preaching Sunday", and the board is for the afternoon you
            sit down to plan a quarter.
          */}
          {toolsView === 'teaching-plan' && canViewTeachingPlan ? (
            <button
              type="button"
              className="proto-side-panel__action-btn"
              title="Expand planner"
              aria-label="Expand planner"
              onClick={() => openExpandedSidebar('planner')}
            >
              <Icon name="up-right-and-down-left-from-center" size={14} />
            </button>
          ) : null}
        </div>
  );

  /*
    Hold the sections back until every query has landed, the way My Home
    does. Rendering them first and only *then* adding `--enter` painted a
    half-built catalog and animated it a beat later — one load state read as
    two.
  */
  const content = !contentReady ? (
    <ProtoSpaceLoading label="Loading church" />
  ) : (
        <div className={homeViewClassName}>
          {toolsView === 'teaching-plan' ? (
            /*
              Both lanes are plannable: a church Shared Space gathers as surely
              as a ministry channel broadcasts. The pane hides the switcher when
              there is nowhere other than the church to switch to.
            */
            <PrototypeChurchTeachingPlanSection
              orgId={orgId}
              canManage={canViewTeachingPlan}
              canWrite={teachingPlanReadOnly === null}
              readOnlyReason={teachingPlanReadOnly}
              canManageChurchTemplates={canManageChurchTemplates && !churchPlanLapsed}
              onOpenStarters={() => setToolsView('starters')}
              /* Colour and lane ride along: the scope picker draws each row as
                 the space switcher does, which it cannot do from id and title. */
              plannableSpaces={[
                ...ministryChannels.map((s) => ({
                  id: s.id,
                  title: s.title,
                  color: s.color ?? null,
                  ministry: true,
                })),
                ...sharedSpaces.map((s) => ({
                  id: s.id,
                  title: s.title,
                  color: s.color ?? null,
                  ministry: false,
                })),
              ]}
            />
          ) : toolsView === 'team' ? (
            <PrototypeChurchStaffSection orgId={orgId} isStaff={canCreateChurchContent} />
          ) : toolsView === 'starters' ? (
            <PrototypeChurchStarterSection
              canManage={canManageChurchTemplates}
              canWrite={canManageChurchTemplates && !churchPlanLapsed}
            />
          ) : toolsView === 'engagement' ? (
            <PrototypeChurchEngagementSection orgId={orgId} canView={canViewEngagement} />
          ) : toolsView === 'settings' ? (
            <PrototypeChurchSettingsSection
              orgId={orgId}
              canManage={canManageChurchSettings}
              canWrite={canManageChurchSettings && !churchPlanLapsed}
            />
          ) : (
          <>
            {isEmpty ? (
              <div className="proto-home-section">
                <PrototypeListEmptyState
                  iconName="church"
                  title="Still quiet here"
                  description={
                    // Positive framing per docs/BRAND_VOICE.md Rule 1 — the old
                    // congregant line led with "hasn't published any study yet".
                    canCreateChurchContent
                      ? 'Channels reach everyone. Shared spaces are for groups.'
                      : `When ${churchName} shares study, it shows up here.`
                  }
                />
                {canCreateChurchContent ? (
                  <div className="proto-church-hub__create-stack">
                    <button
                      type="button"
                      className="proto-settings-btn proto-settings-btn--secondary"
                      onClick={() => openCreateSheet('shared')}
                    >
                      New shared space
                    </button>
                    <button
                      type="button"
                      className="proto-settings-btn proto-settings-btn--secondary"
                      onClick={() => openCreateSheet('ministry')}
                    >
                      New channel
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="proto-home-section">
                  <p className="proto-caption proto-home-section__eyebrow">Shared spaces</p>
                  {sharedSpaces.length > 0 ? (
                    <>
                      <ul className="proto-church-hub__list">
                        {sharedSpaces.map((space) => (
                          <li key={space.id}>
                            <ChurchHubSpaceButton space={space} ministry={false} onOpen={openSpace} />
                          </li>
                        ))}
                      </ul>
                      {canCreateChurchContent ? (
                        <button
                          type="button"
                          className="proto-glass-surface proto-glass-surface--control proto-glass-action proto-church-tools__add"
                          onClick={() => openCreateSheet('shared')}
                        >
                          <Icon name="plus" size={12} aria-hidden />
                          <span className="proto-glass-action__label">New space</span>
                        </button>
                      ) : null}
                    </>
                  ) : (
                    /* Empty lane collapses caption and action into one quiet
                       row rather than a heading, an apology and a link. */
                    <div className="proto-church-tools__empty-row">
                      <p className="proto-caption proto-church-hub__empty-lane">None yet</p>
                      {canCreateChurchContent ? (
                        <button
                          type="button"
                          className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                          onClick={() => openCreateSheet('shared')}
                        >
                          <Icon name="plus" size={12} aria-hidden />
                          <span className="proto-glass-action__label">New space</span>
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>

                {canCreateChurchContent ? (
                  <PrototypeChannelPairingSection
                    orgId={orgId}
                    sharedSpaces={sharedSpaces}
                    channels={ministryChannels}
                  />
                ) : null}

                <div className="proto-home-section">
                  <p className="proto-caption proto-home-section__eyebrow">Channels</p>
                  {ministryChannels.length > 0 ? (
                    <>
                      <ul className="proto-church-hub__list">
                        {ministryChannels.map((space) => (
                          <li key={space.id}>
                            <ChurchHubSpaceButton space={space} ministry onOpen={openSpace} />
                          </li>
                        ))}
                      </ul>
                      {canCreateChurchContent ? (
                        <button
                          type="button"
                          className="proto-glass-surface proto-glass-surface--control proto-glass-action proto-church-tools__add"
                          onClick={() => openCreateSheet('ministry')}
                        >
                          <Icon name="plus" size={12} aria-hidden />
                          <span className="proto-glass-action__label">New channel</span>
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <div className="proto-church-tools__empty-row">
                      <p className="proto-caption proto-church-hub__empty-lane">None yet</p>
                      {canCreateChurchContent ? (
                        <button
                          type="button"
                          className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                          onClick={() => openCreateSheet('ministry')}
                        >
                          <Icon name="plus" size={12} aria-hidden />
                          <span className="proto-glass-action__label">New channel</span>
                        </button>
                      ) : null}
                    </div>
                  )}
                  {!canCreateChurchContent && canManageChannels ? (
                    <button
                      type="button"
                      className="proto-church-hub__lane-action"
                      aria-expanded={manageOpen}
                      onClick={() => setManageOpen((open) => !open)}
                    >
                      {manageOpen ? 'Done' : 'Manage channels'}
                    </button>
                  ) : null}
                </div>

                {browseChannels.length > 0 ? (
                  <div className="proto-home-section">
                    <p className="proto-caption proto-home-section__eyebrow">
                      {manageOpen ? 'All channels' : 'Discover'}
                    </p>
                    <ul className="proto-church-hub__list">
                      {browseChannels.map((channel) => (
                        <li key={channel.id}>
                          <ChurchHubBrowseRow
                            channel={channel}
                            pending={pendingFollowId === channel.id}
                            onToggleFollow={handleToggleFollow}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}

            {/*
              Church tools — one group, at the bottom, visually separate from
              the congregation-facing catalog above. Previously the teaching
              plan, the team and the plan banner were interleaved with the
              catalog as bare text links and a slab.
            */}
            {canCreateChurchContent ||
            canViewTeachingPlan ||
            canManageChurchTemplates ||
            canManageChurchSettings ? (
              <div className="proto-home-section">
                <p className="proto-caption proto-home-section__eyebrow">Tools</p>
                <ProtoToolsRowList rows={churchToolRows}>
                  {/* Silent while the church is paid and healthy. */}
                  <PrototypeChurchPlanRow orgId={orgId} isStaff={canCreateChurchContent} />
                </ProtoToolsRowList>
              </div>
            ) : null}
          </>
          )}
        </div>
  );

  const createSheet =
    orgId && canCreateChurchContent ? (
      <CreateSharedSpaceSheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
        orgId={orgId}
        kind={createKind}
        onCreated={(spaceId) => openSpace(spaceId)}
      />
    ) : null;

  /*
    The sheet wears the day sheet's own frame so a church and a day read as the same kind of
    thing in the same place — the point of moving the hub here at all. `.proto-church-hub`
    stays on both so the lane and row rules that key off it are untouched by the move.
  */
  if (variant === 'sheet') {
    return (
      <article className="proto-feed-sheet proto-church-hub proto-church-hub--sheet">
        <header className="proto-feed-sheet__head proto-shared-space-header">{header}</header>
        <div className="proto-feed-sheet__body">{content}</div>
        {createSheet}
      </article>
    );
  }

  return (
    <div className="proto-sidebar-root proto-church-hub">
      {isMobileSidebar ? <PrototypeSidebarToolbar variant="drawer" /> : null}
      <div className="proto-shared-space-header">{header}</div>
      <div className="proto-sidebar-scroll">{content}</div>
      {createSheet}
    </div>
  );
}
