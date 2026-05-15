/**
 * Space switcher popover — prototype lists only My Home (no shared-space / classic-app shortcuts).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import ProtoHouseIcon from './ProtoHouseIcon';
import { PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';

export default function SpaceSwitcherMenu({ homeSpaceId, navReady }: { homeSpaceId: string | null; navReady: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const normalizedActive = useMemo(
    () =>
      homeSpaceId == null ? null : homeSpaceId.startsWith('space_') ? homeSpaceId : `space_${homeSpaceId}`,
    [homeSpaceId],
  );

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const loading = !navReady;
  const hasHome = Boolean(normalizedActive);

  return (
    <div className="proto-menu" ref={rootRef}>
      <button
        type="button"
        className="proto-space-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={loading}
        title={
          loading
            ? 'Loading spaces…'
            : hasHome
              ? 'My Home'
              : 'No My Home yet — finish setup in the classic app'
        }
        onClick={() => {
          if (loading) return;
          setOpen((x) => !x);
        }}
      >
        {hasHome ? (
          <ProtoHouseIcon size={PROTO_TOOLBAR_ICON_SIZE} />
        ) : (
          <Icon name="table-cells" size={PROTO_TOOLBAR_ICON_SIZE} />
        )}
      </button>

      {open && !loading ? (
        <div className="proto-menu__popover" role="menu" aria-label="My Home">
          <div className="proto-menu-section" role="group">
            {!hasHome ? (
              <p className="proto-menu-muted">
                My Home isn’t available yet — open the classic app to finish setup.
              </p>
            ) : (
              <button
                key="proto-space-my-home"
                type="button"
                role="menuitemradio"
                aria-checked
                className="proto-menu-item"
                onClick={() => {
                  setOpen(false);
                  navigate({ to: '/prototype/', replace: true });
                }}
              >
                <span className="proto-menu-item__check" aria-hidden>
                  ✓
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>My Home</span>
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
