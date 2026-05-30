/**
 * Account menu — toolbar dropdown. Shows the signed-in name + email (like native
 * Mac's account screen) and a single entry into the prototype Settings hub.
 * Mirrors SpaceSwitcherMenu / ListViewMenu (proto-menu popover, right-anchored).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { storeSettingsOpenerPath } from '../../lib/prototype-settings-opener';
import { useProfile } from '../../hooks/queries/useProfile';
import ProtoPopoverShell from './ProtoPopoverShell';

export default function AccountMenu({ iconSize, disabled = false }: { iconSize: number; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchRaw = useRouterState({ select: (s) => s.location.searchStr });
  const { data: profile } = useProfile();

  const name =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() ||
    profile?.displayName ||
    'Your account';
  const email = profile?.email ?? '';

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

  return (
    <div className="proto-menu" ref={rootRef}>
      <button
        type="button"
        className="proto-toolbar-icon-btn"
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
        <Icon name="circle-user" size={iconSize} />
      </button>

      {open ? (
        <ProtoPopoverShell className="proto-menu__popover proto-menu__popover--right" role="menu" aria-label="Account">
          {/* Name + email header (mirrors native Mac account screen). */}
          <div style={{ padding: '8px 10px 10px', borderBottom: '0.5px solid var(--pds-border)', marginBottom: 4 }}>
            <div className="pds-list-title" style={{ color: 'var(--pds-text-primary)' }}>{name}</div>
            {email ? (
              <div className="pds-list-preview" style={{ color: 'var(--pds-text-secondary)', marginTop: 2 }}>{email}</div>
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
                void navigate({ to: '/prototype/settings' });
              }}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="gear" size={15} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>Settings</span>
            </button>
          </div>
        </ProtoPopoverShell>
      ) : null}
    </div>
  );
}
