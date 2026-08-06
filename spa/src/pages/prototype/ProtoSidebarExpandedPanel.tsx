/**
 * Chrome for the expanded sidebar tool surface.
 *
 * The sidebar tops out at 420px, which is enough for a list and nothing else.
 * Tools that need a board, a calendar, or a master-detail pair used to have
 * only one escape hatch — a modal — and a modal says "finish this and get out",
 * which is the wrong posture for planning work you sit in for a while.
 *
 * So this grows out of the sidebar's own footprint and covers the main pane,
 * keeping the sidebar's identity (left-anchored, same frame inset and radius)
 * while borrowing the room. The note editor underneath stays mounted, so
 * closing is a step back rather than a re-render.
 *
 * Deliberately not a dialog: no focus trap, no scrim. The toolbar above stays
 * live, and the surface is a `region` you tab into and out of. Escape closes,
 * but only when nothing inside claimed the key first.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import Icon from '@/components/react/Icon';

type ProtoSidebarExpandedPanelProps = {
  /** Accessible name for the region — the tool's title. */
  label: string;
  /** Rendered at the head of the panel, left of the view switcher. */
  title: ReactNode;
  /** Center slot — a view switcher or segmented control. */
  toolbar?: ReactNode;
  /** Right slot — tool-level actions. */
  actions?: ReactNode;
  /** True during the exit animation window. */
  exiting: boolean;
  onClose: () => void;
  children: ReactNode;
};

export default function ProtoSidebarExpandedPanel({
  label,
  title,
  toolbar,
  actions,
  exiting,
  onClose,
  children,
}: ProtoSidebarExpandedPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  /* Focus moves in once on mount and back to the opener on close. Not a trap —
     the toolbar and the note underneath stay reachable by keyboard. */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    const active = document.activeElement;
    restoreFocusRef.current = active instanceof HTMLElement ? active : null;
    panel.focus({ preventScroll: true });
    return () => {
      const restore = restoreFocusRef.current;
      if (restore?.isConnected) restore.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      /* Inner pickers, comboboxes and sheets consume Escape first — closing the
         whole surface out from under an open date picker loses the edit. */
      if (event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className={`proto-sidebar-expanded-panel${exiting ? ' proto-sidebar-expanded-panel--exiting' : ''}`}
      role="region"
      aria-label={label}
      tabIndex={-1}
    >
      <div className="proto-sidebar-expanded-panel__header">
        <div className="proto-sidebar-expanded-panel__header-lead">
          <button
            type="button"
            className="proto-side-panel__action-btn"
            title="Collapse"
            aria-label={`Collapse ${label}`}
            onClick={onClose}
          >
            <Icon name="down-left-and-up-right-to-center" size={14} />
          </button>
          <span className="proto-sidebar-expanded-panel__title proto-marquee">
            <span>{title}</span>
          </span>
        </div>
        {toolbar ? <div className="proto-sidebar-expanded-panel__toolbar">{toolbar}</div> : null}
        {actions ? <div className="proto-sidebar-expanded-panel__actions">{actions}</div> : null}
      </div>
      <div className="proto-sidebar-expanded-panel__body">{children}</div>
    </div>
  );
}
