/**
 * Space switcher — Home layer half of the sidebar layer toggle.
 * When the user has a Harvous church (connected or staff bridge), My Home / My Church
 * are a segmented chip toggle; otherwise only My Home appears as a row. Below that:
 * personal Shared Spaces (or church spaces in My Church mode), with "New shared space"
 * gated on the add-on. Ministry channels live under My Church — not in this list.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import ProtoHouseIcon from './ProtoHouseIcon';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { resolveSpaceSwitcherToolbarState, useActiveSpace } from '../../hooks/useActiveSpace';
import { usePrototypeShiftHints } from '../../hooks/usePrototypeShiftHints';
import { useNavigation, getNavigationQueryKey, type NavSpace } from '../../hooks/queries/useNavigation';
import { useSubscriptionStatus } from '../../hooks/queries/useSubscriptionStatus';
import { useCreateSharedSpace } from '../../hooks/mutations/useCreateSharedSpace';
import { APIError } from '../../lib/api';
import { isMinistryBroadcastSpace } from '../../lib/shared-space-capabilities';
import {
  churchHubSpacesForOrg,
  isPersonalSharedSpace,
  resolveMyChurchFromNav,
} from '../../lib/church-settings';
import {
  dispatchSharedSpacesEntitlementSynced,
  syncSharedSpacesBilling,
} from '@/utils/sync-shared-spaces-billing';
import { type ThreadColor } from '@/utils/colors';
import { SPACE_COVER_PICKER_COLORS, spacePickerSwatchColor } from '@/utils/space-cover';
import PrototypeToolbarShortcutItem from './PrototypeToolbarShortcutItem';
import ProtoPopoverShell from './ProtoPopoverShell';
import { PROTO_TOOLBAR_ICON_SIZE, PROTO_TOOLBAR_ORB_ICON_SIZE, PROTO_TOOLBAR_POPOVER_OFFSET } from './proto-toolbar-tokens';

function normalizeSpaceId(id: string): string {
  return id.startsWith('space_') ? id : `space_${id}`;
}

function sortSpaces<T extends { title: string }>(spaces: T[]): T[] {
  return [...spaces].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}

/** Mirror server OWNED_SHARED_SPACES_ADDON_LIMIT — used when API cache is stale (limit still 0). */
const OWNED_SHARED_SPACES_ADDON_LIMIT = 10;

export default function SpaceSwitcherMenu({
  homeSpaceId,
  authReady,
  iconOnly = false,
}: {
  homeSpaceId: string | null;
  authReady: boolean;
  /** Icon-only orb (detail toolbar when sidebar is collapsed). */
  iconOnly?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn, has, userId } = useAuth();
  const {
    sidebarLayer,
    setSidebarLayer,
    activeSpaceId,
    setActiveSpaceId,
    activeChurchOrgId,
    setActiveChurchOrgId,
    ensureSidebarExpanded,
  } = useProtoShell();
  const { isSharedSpace, space, spaceTitle } = useActiveSpace();
  const showShiftHints = usePrototypeShiftHints();
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createColor, setCreateColor] = useState<ThreadColor>('blue');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createShowAddonLink, setCreateShowAddonLink] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [anchorPos, setAnchorPos] = useState<{ top: number; left: number } | null>(null);
  const { data: nav } = useNavigation();
  const { data: subscription } = useSubscriptionStatus();
  const createSharedSpace = useCreateSharedSpace();
  const backgroundSyncStarted = useRef(false);

  const clerkEntitled = isLoaded && isSignedIn && has({ feature: 'shared_spaces' });
  const apiHasSharedSpaces = Boolean(subscription?.hasSharedSpaces);
  const hasSharedSpaces = apiHasSharedSpaces || clerkEntitled;

  useEffect(() => {
    if (!clerkEntitled || apiHasSharedSpaces || backgroundSyncStarted.current) return;
    backgroundSyncStarted.current = true;
    void syncSharedSpacesBilling()
      .then((result) => {
        dispatchSharedSpacesEntitlementSynced({
          hasSharedSpaces: result.hasSharedSpaces,
          updated: result.updated,
        });
      })
      .catch((error) => {
        console.error('[SpaceSwitcherMenu] Shared Spaces billing sync failed:', error);
        backgroundSyncStarted.current = false;
      });
  }, [clerkEntitled, apiHasSharedSpaces]);

  const normalizedActive = useMemo(
    () => (homeSpaceId == null ? null : normalizeSpaceId(homeSpaceId)),
    [homeSpaceId],
  );
  const myChurch = useMemo(
    () =>
      resolveMyChurchFromNav({
        spaces: nav?.spaces,
        memberOfSpaces: nav?.memberOfSpaces,
      }),
    [nav?.spaces, nav?.memberOfSpaces],
  );
  const inMyChurchMode = Boolean(activeChurchOrgId);
  /** My Home: personal Shared Spaces you host. My Church: that church’s spaces (owned + joined). */
  const ownedHosted = useMemo(() => {
    if (inMyChurchMode && activeChurchOrgId) {
      return churchHubSpacesForOrg(
        [...(nav?.spaces ?? []), ...(nav?.memberOfSpaces ?? [])],
        activeChurchOrgId,
      );
    }
    return sortSpaces((nav?.spaces ?? []).filter((s) => isPersonalSharedSpace(s)));
  }, [nav?.spaces, nav?.memberOfSpaces, inMyChurchMode, activeChurchOrgId]);
  const memberOf = useMemo(
    () => sortSpaces((nav?.memberOfSpaces ?? []).filter((s) => isPersonalSharedSpace(s))),
    [nav?.memberOfSpaces],
  );
  const ownedLimit = hasSharedSpaces
    ? Math.max(subscription?.sharedSpacesOwnedLimit ?? OWNED_SHARED_SPACES_ADDON_LIMIT, OWNED_SHARED_SPACES_ADDON_LIMIT)
    : 0;
  /** Shared Spaces add-on limit counts collaborative spaces only — not ministry channels. */
  const ownedCount = useMemo(
    () => (nav?.spaces ?? []).filter((s) => s.type === 'shared').length,
    [nav?.spaces],
  );
  const atOwnedLimit = hasSharedSpaces && ownedLimit > 0 && ownedCount >= ownedLimit;
  const activeIsMinistry = Boolean(space && isMinistryBroadcastSpace(space));

  useLayoutEffect(() => {
    if (!open) {
      setAnchorPos(null);
      return undefined;
    }
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchorPos({ top: rect.bottom + PROTO_TOOLBAR_POPOVER_OFFSET, left: rect.left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setIsCreating(false);
      setCreateColor('blue');
      setCreateError(null);
      setCreateShowAddonLink(false);
    }
  }, [open]);

  if (!authReady) {
    return null;
  }

  const hasHome = Boolean(normalizedActive);
  const { showSharedSpaceToolbar, label: sharedSpaceLabel, triggerTitle } = resolveSpaceSwitcherToolbarState({
    space,
    spaceTitle,
    hasHome,
    myChurchMode: inMyChurchMode,
    myChurchName: myChurch?.churchName ?? null,
  });
  /** Pill when a space/channel is selected (title); My Home / My Church hubs stay circular orbs.
   * Same in the collapsed detail toolbar — the sidebar title isn't visible there. */
  const useSpaceSwitcherPill = showSharedSpaceToolbar;
  // Pill: color tile + title. Hub modes: plain orb glyphs.
  const triggerIcon = activeIsMinistry ? (
    <ProtoSpaceMenuIcon color={space?.color || 'paper'} iconName="rss" />
  ) : showSharedSpaceToolbar ? (
    <ProtoSpaceMenuIcon color={space?.color || 'paper'} />
  ) : inMyChurchMode ? (
    <Icon name="church" size={PROTO_TOOLBAR_ORB_ICON_SIZE} aria-hidden />
  ) : hasHome ? (
    <ProtoHouseIcon size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
  ) : (
    <Icon name="table-cells" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
  );

  function selectHome(options?: { keepOpen?: boolean }) {
    if (!options?.keepOpen) setOpen(false);
    setActiveSpaceId(null);
    ensureSidebarExpanded();
  }

  function selectMyChurch(options?: { keepOpen?: boolean }) {
    if (!myChurch) return;
    if (!options?.keepOpen) setOpen(false);
    setActiveChurchOrgId(myChurch.orgId);
    ensureSidebarExpanded();
  }

  function selectSpace(spaceId: string, options?: { keepChurch?: boolean }) {
    setOpen(false);
    if (!options?.keepChurch) {
      setActiveChurchOrgId(null);
    }
    setActiveSpaceId(normalizeSpaceId(spaceId));
    ensureSidebarExpanded();
  }

  async function handleCreateSubmit() {
    const title = createTitle.trim();
    if (!title || createSharedSpace.isPending) return;
    setCreateError(null);
    setCreateShowAddonLink(false);
    try {
      if (clerkEntitled && !apiHasSharedSpaces) {
        try {
          const syncResult = await syncSharedSpacesBilling();
          dispatchSharedSpacesEntitlementSynced({
            hasSharedSpaces: syncResult.hasSharedSpaces,
            updated: syncResult.updated,
          });
        } catch (error) {
          console.error('[SpaceSwitcherMenu] Shared Spaces billing sync failed:', error);
        }
      }

      const result = await createSharedSpace.mutateAsync({ title, color: createColor });
      if (!result.space?.id) {
        setCreateError('Shared space was created but the response was incomplete. Try refreshing.');
        return;
      }

      if (userId) {
        await queryClient.refetchQueries({ queryKey: getNavigationQueryKey(userId) });
      }

      setCreateTitle('');
      setCreateColor('blue');
      setIsCreating(false);
      selectSpace(result.space.id);
    } catch (error) {
      if (error instanceof APIError) {
        setCreateError(error.message || `Request failed (${error.status})`);
        setCreateShowAddonLink(error.status === 403 && error.code === 'SHARED_SPACE_LIMIT_EXCEEDED');
      } else if (error instanceof Error) {
        setCreateError(error.message);
        setCreateShowAddonLink(false);
      } else {
        setCreateError('Could not create shared space. Try again.');
        setCreateShowAddonLink(false);
      }
    }
  }

  function renderSpaceRow(row: NavSpace) {
    const checked = activeSpaceId === normalizeSpaceId(row.id);
    const hasUnseen = !checked && Boolean(row.newNoteCount && row.newNoteCount > 0);
    const badge =
      checked && row.newNoteCount && row.newNoteCount > 0
        ? row.newNoteCount > 9
          ? '9+'
          : String(row.newNoteCount)
        : null;
    const ministry = isMinistryBroadcastSpace(row);
    return (
      <button
        key={row.id}
        type="button"
        role="menuitemradio"
        aria-checked={checked}
        className="proto-menu-item"
        title={row.title}
        onClick={() => selectSpace(row.id, { keepChurch: inMyChurchMode })}
      >
        <span className="proto-menu-item__icon proto-menu-item__icon--space" aria-hidden>
          {ministry ? (
            <ProtoSpaceMenuIcon color={row.color || 'paper'} iconName="rss" />
          ) : (
            <ProtoSpaceMenuIcon color={row.color || 'paper'} />
          )}
          {hasUnseen ? <span className="proto-space-switcher-dot" aria-hidden /> : null}
        </span>
        <span className="proto-menu-item__label">{row.title}</span>
        {badge ? (
          <span className="proto-space-switcher-badge" aria-label={`${badge} new notes`}>
            {badge}
          </span>
        ) : null}
        <span className="proto-menu-item__check" aria-hidden>
          {checked ? <Icon name="check" size={12} /> : null}
        </span>
      </button>
    );
  }

  const popover = open && typeof document !== 'undefined'
    ? createPortal(
        <ProtoPopoverShell
          ref={popoverRef}
          className="proto-menu__popover proto-menu__popover--sidebar-toolbar proto-menu__popover--sidebar-toolbar-portal"
          role="menu"
          aria-label="Spaces"
          style={{ top: anchorPos?.top ?? -9999, left: anchorPos?.left ?? 0 }}
        >
          {myChurch ? (
            <div className="proto-menu-section proto-menu-section--mode-toggle" role="group" aria-label="Home or church">
              <div className="proto-space-switcher__mode-toggle" role="radiogroup" aria-label="Home or church">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!inMyChurchMode}
                  className={
                    inMyChurchMode
                      ? 'proto-space-switcher__mode-chip'
                      : 'proto-space-switcher__mode-chip proto-space-switcher__mode-chip--active'
                  }
                  onClick={() => selectHome({ keepOpen: true })}
                >
                  <span className="proto-space-switcher__mode-chip-icon" aria-hidden>
                    <ProtoHouseIcon size={12} />
                  </span>
                  My Home
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={inMyChurchMode}
                  className={
                    inMyChurchMode
                      ? 'proto-space-switcher__mode-chip proto-space-switcher__mode-chip--active'
                      : 'proto-space-switcher__mode-chip'
                  }
                  title={myChurch.churchName}
                  aria-label={`My Church, ${myChurch.churchName}`}
                  onClick={() => selectMyChurch({ keepOpen: true })}
                >
                  <span className="proto-space-switcher__mode-chip-icon" aria-hidden>
                    <Icon name="church" size={12} />
                  </span>
                  My Church
                </button>
              </div>
            </div>
          ) : (
            <div className="proto-menu-section" role="group">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={!isSharedSpace}
                className="proto-menu-item"
                onClick={() => selectHome()}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <ProtoHouseIcon size={PROTO_TOOLBAR_ICON_SIZE} />
                </span>
                <span className="proto-menu-item__label">My Home</span>
                <span className="proto-menu-item__check" aria-hidden>
                  {!isSharedSpace ? <Icon name="check" size={12} /> : null}
                </span>
              </button>
            </div>
          )}

          {ownedHosted.length > 0 ? (
            <div
              className="proto-menu-section"
              role="group"
              aria-label={inMyChurchMode ? 'Church spaces' : 'Spaces you host'}
            >
              {ownedHosted.map((space) => renderSpaceRow(space))}
            </div>
          ) : null}

          {!inMyChurchMode && memberOf.length > 0 ? (
            <div className="proto-menu-section" role="group" aria-label="Spaces you've joined">
              {memberOf.map((space) => renderSpaceRow(space))}
            </div>
          ) : null}

          {!inMyChurchMode ? (
          <div className="proto-menu-section" role="group">
            {isCreating ? (
              <div className="proto-space-switcher__create-form">
                <div className="proto-space-switcher__preview" aria-hidden>
                  <span className="proto-menu-item__icon proto-menu-item__icon--space">
                    <ProtoSpaceMenuIcon color={createColor} />
                  </span>
                  <span className="proto-menu-item__label proto-space-switcher__preview-title">
                    {createTitle.trim() || 'New shared space'}
                  </span>
                </div>
                <input
                  autoFocus
                  type="text"
                  value={createTitle}
                  onChange={(e) => {
                    setCreateTitle(e.target.value);
                    if (createError) {
                      setCreateError(null);
                      setCreateShowAddonLink(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreateSubmit();
                    if (e.key === 'Escape') setIsCreating(false);
                  }}
                  placeholder="Space name"
                  disabled={createSharedSpace.isPending}
                  className="proto-space-switcher__create-input"
                />
                <div className="proto-space-switcher__create-colors">
                  {SPACE_COVER_PICKER_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Color ${color}`}
                      aria-pressed={createColor === color}
                      disabled={createSharedSpace.isPending}
                      onClick={() => setCreateColor(color)}
                      className={
                        createColor === color
                          ? 'proto-shared-space-settings__color proto-shared-space-settings__color--selected'
                          : 'proto-shared-space-settings__color'
                      }
                      style={{ ['--swatch-accent' as string]: spacePickerSwatchColor(color) }}
                    >
                      {createColor === color ? <Icon name="check" size={12} /> : null}
                    </button>
                  ))}
                </div>
                <div className="proto-space-switcher__create-actions">
                  <button
                    type="button"
                    className="proto-settings-btn proto-settings-btn--secondary"
                    onClick={() => {
                      setIsCreating(false);
                      setCreateError(null);
      setCreateShowAddonLink(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="proto-settings-btn"
                    disabled={!createTitle.trim() || createSharedSpace.isPending}
                    onClick={() => void handleCreateSubmit()}
                  >
                    {createSharedSpace.isPending ? 'Creating…' : 'Create'}
                  </button>
                </div>
                {createError ? (
                  <div className="proto-space-switcher__create-error" role="alert">
                    <span className="proto-space-switcher__create-error-text">{createError}</span>
                    {createShowAddonLink ? (
                      <button
                        type="button"
                        className="proto-space-switcher__create-error-link"
                        onClick={() => {
                          setOpen(false);
                          void navigate({ to: '/addon' as any });
                        }}
                      >
                        Get Shared Spaces
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="proto-menu-item"
                disabled={atOwnedLimit}
                aria-disabled={atOwnedLimit}
                onClick={() => {
                  if (atOwnedLimit) return;
                  if (!hasSharedSpaces) {
                    setOpen(false);
                    void navigate({ to: '/addon' as any });
                    return;
                  }
                  setCreateError(null);
      setCreateShowAddonLink(false);
                  setIsCreating(true);
                }}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="plus" size={PROTO_TOOLBAR_ICON_SIZE} />
                </span>
                <span className="proto-menu-item__label">New shared space</span>
                {!hasSharedSpaces ? <span className="proto-menu-item__badge">Add-on</span> : null}
              </button>
            )}
          </div>
          ) : null}

          {!inMyChurchMode && hasSharedSpaces && !isCreating && atOwnedLimit ? (
            <div className="proto-space-switcher__footer proto-space-switcher__footer--limit" role="status">
              {`You've used all ${ownedLimit} shared spaces you can own.`}
            </div>
          ) : null}
        </ProtoPopoverShell>,
        document.body,
      )
    : null;

  return (
    <div className="proto-menu proto-sidebar-toolbar__mode-menu">
      <PrototypeToolbarShortcutItem shortcut="H" showShortcut={showShiftHints}>
        <button
          ref={triggerRef}
          type="button"
          className={useSpaceSwitcherPill ? 'proto-toolbar-space-switcher' : 'proto-toolbar-icon-btn'}
          data-active={iconOnly ? undefined : sidebarLayer === 'space'}
          title={triggerTitle}
          aria-label={triggerTitle}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={!hasHome}
          onClick={() => {
            if (!hasHome) return;
            if (!open && sidebarLayer !== 'space') {
              // First tap when on the list layer just switches to the space
              // layer (matches the old orb behavior); tap again to open the menu.
              setSidebarLayer('space');
              ensureSidebarExpanded();
              return;
            }
            setOpen((x) => !x);
          }}
        >
          {useSpaceSwitcherPill ? (
            <>
              <span className="proto-toolbar-space-switcher__icon" aria-hidden>
                {triggerIcon}
              </span>
              {sharedSpaceLabel ? (
                <span className="proto-toolbar-space-switcher__label">{sharedSpaceLabel}</span>
              ) : null}
            </>
          ) : (
            triggerIcon
          )}
        </button>
      </PrototypeToolbarShortcutItem>
      {popover}
    </div>
  );
}
