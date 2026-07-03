/**
 * Space switcher — Home layer half of the sidebar layer toggle.
 * Tapping opens a popover: My Home, then owned + joined shared spaces, with
 * a "New shared space" action gated on the Shared Spaces add-on.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import ProtoHouseIcon from './ProtoHouseIcon';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { usePrototypeShiftHints } from '../../hooks/usePrototypeShiftHints';
import { useNavigation } from '../../hooks/queries/useNavigation';
import { useSubscriptionStatus } from '../../hooks/queries/useSubscriptionStatus';
import { useCreateSharedSpace } from '../../hooks/mutations/useCreateSharedSpace';
import PrototypeToolbarShortcutItem from './PrototypeToolbarShortcutItem';
import ProtoPopoverShell from './ProtoPopoverShell';
import { PROTO_TOOLBAR_ICON_SIZE, PROTO_TOOLBAR_ORB_ICON_SIZE, PROTO_TOOLBAR_POPOVER_OFFSET } from './proto-toolbar-tokens';

function normalizeSpaceId(id: string): string {
  return id.startsWith('space_') ? id : `space_${id}`;
}

export default function SpaceSwitcherMenu({
  homeSpaceId,
  authReady,
}: {
  homeSpaceId: string | null;
  authReady: boolean;
}) {
  const navigate = useNavigate();
  const { sidebarLayer, setSidebarLayer, activeSpaceId, setActiveSpaceId, ensureSidebarExpanded } = useProtoShell();
  const showShiftHints = usePrototypeShiftHints();
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [anchorPos, setAnchorPos] = useState<{ top: number; left: number } | null>(null);
  const { data: nav } = useNavigation();
  const { data: subscription } = useSubscriptionStatus();
  const createSharedSpace = useCreateSharedSpace();

  const normalizedActive = useMemo(
    () => (homeSpaceId == null ? null : normalizeSpaceId(homeSpaceId)),
    [homeSpaceId],
  );
  const ownedShared = useMemo(() => (nav?.spaces ?? []).filter((s) => s.type === 'shared'), [nav?.spaces]);
  const memberOf = nav?.memberOfSpaces ?? [];
  const hasSharedSpaces = Boolean(subscription?.hasSharedSpaces);

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
    if (!open) setIsCreating(false);
  }, [open]);

  if (!authReady) {
    return null;
  }

  const hasHome = Boolean(normalizedActive);
  const isViewingShared = sidebarLayer === 'space' && activeSpaceId != null;
  const triggerTitle = isViewingShared ? 'Spaces' : hasHome ? 'My Home' : 'No My Home yet — finish setup in the classic app';
  const triggerIcon = isViewingShared ? (
    <Icon name="user-group" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
  ) : hasHome ? (
    <ProtoHouseIcon size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
  ) : (
    <Icon name="table-cells" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
  );

  function selectHome() {
    setOpen(false);
    setActiveSpaceId(null);
    ensureSidebarExpanded();
  }

  function selectSpace(spaceId: string) {
    setOpen(false);
    setActiveSpaceId(normalizeSpaceId(spaceId));
    ensureSidebarExpanded();
  }

  async function handleCreateSubmit() {
    const title = createTitle.trim();
    if (!title || createSharedSpace.isPending) return;
    try {
      const result = await createSharedSpace.mutateAsync({ title });
      setCreateTitle('');
      selectSpace(result.space.id);
    } catch {
      // Leave the form open with the entered title so the user can retry.
    }
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
          <div className="proto-menu-section" role="group">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!isViewingShared}
              className="proto-menu-item"
              onClick={selectHome}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                <ProtoHouseIcon size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span className="proto-menu-item__label">My Home</span>
              <span className="proto-menu-item__check" aria-hidden>
                {!isViewingShared ? <Icon name="check" size={12} /> : null}
              </span>
            </button>
          </div>

          {ownedShared.length > 0 || memberOf.length > 0 ? (
            <div className="proto-menu-section" role="group">
              {[...ownedShared, ...memberOf].map((space) => {
                const checked = activeSpaceId === normalizeSpaceId(space.id);
                return (
                  <button
                    key={space.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    className="proto-menu-item"
                    onClick={() => selectSpace(space.id)}
                  >
                    <span className="proto-menu-item__icon" aria-hidden style={{ opacity: 1 }}>
                      <span
                        aria-hidden
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: `var(--color-${space.color || 'paper'})`,
                        }}
                      />
                    </span>
                    <span className="proto-menu-item__label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {space.title}
                    </span>
                    <span className="proto-menu-item__check" aria-hidden>
                      {checked ? <Icon name="check" size={12} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="proto-menu-section" role="group">
            {isCreating ? (
              <div style={{ padding: '6px 10px 8px' }}>
                <input
                  autoFocus
                  type="text"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreateSubmit();
                    if (e.key === 'Escape') setIsCreating(false);
                  }}
                  placeholder="Space name"
                  disabled={createSharedSpace.isPending}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: '1px solid var(--pds-border)',
                    font: 'inherit',
                    fontSize: 13,
                  }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button
                    type="button"
                    className="proto-menu-item"
                    style={{ flex: 1, justifyContent: 'center' }}
                    disabled={!createTitle.trim() || createSharedSpace.isPending}
                    onClick={() => void handleCreateSubmit()}
                  >
                    <span className="proto-menu-item__label" style={{ flex: 'unset' }}>
                      {createSharedSpace.isPending ? 'Creating…' : 'Create'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="proto-menu-item"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => setIsCreating(false)}
                  >
                    <span className="proto-menu-item__label" style={{ flex: 'unset' }}>Cancel</span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="proto-menu-item"
                onClick={() => {
                  if (!hasSharedSpaces) {
                    setOpen(false);
                    void navigate({ to: '/upgrade' as any });
                    return;
                  }
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
          className="proto-toolbar-icon-btn"
          data-active={sidebarLayer === 'space'}
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
          {triggerIcon}
        </button>
      </PrototypeToolbarShortcutItem>
      {popover}
    </div>
  );
}
