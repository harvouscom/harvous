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
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import type { ProtoExpandRect } from '../../layouts/proto-shell-context';

type ProtoSidebarExpandedPanelProps = {
  /** Accessible name for the region — the tool's title. */
  label: string;
  /** Rendered at the head of the panel, left of the view switcher. */
  title: ReactNode;
  /**
   * Scope control, immediately after the title — which plan, which space,
   * which thing this tool is pointed at.
   *
   * Beside the title rather than in a band of its own, because it answers the
   * same question the title does. The planner had it as a second full-width row
   * under the header: 31px of chrome to restate what the title already said,
   * and two stacked bars of controls before any content.
   */
  scope?: ReactNode;
  /** Center slot — a view switcher or segmented control. */
  toolbar?: ReactNode;
  /** Right slot — tool-level actions. */
  actions?: ReactNode;
  /** True during the exit animation window. */
  exiting: boolean;
  /**
   * The box this was opened from, in viewport coordinates.
   *
   * Absent leaves the panel's original animation: an unfurl from the left edge at the
   * sidebar's width, which was the truth while the sidebar was the only way in.
   */
  origin?: ProtoExpandRect | null;
  onClose: () => void;
  children: ReactNode;
};

export default function ProtoSidebarExpandedPanel({
  label,
  title,
  scope,
  toolbar,
  actions,
  exiting,
  origin,
  onClose,
  children,
}: ProtoSidebarExpandedPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  /*
   * Grow out of whatever opened this.
   *
   * A clip, not a scale, and for the reason the width animation gave: the body is laid out at
   * the final size and each frame is a window onto it rather than a reflow. A transform would
   * have squashed a 1040px panel into a 30px button and stretched every word in it back out.
   * This is the same idea the edge unfurl had, generalised from "a strip at the left" to any
   * rectangle — so the surface opens from the header chip, the row, the step in the plan that
   * asked for it.
   *
   * A layout effect, before paint: measured after, the first frame would be the panel at full
   * size and the animation would start from a flash of the thing it is supposed to reveal.
   */
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el || !origin) return;
    /*
     * Switch the animation over *before* measuring, or the box measured is the wrong one.
     *
     * The edge unfurl animates `width` with `fill-mode: both`, so its `from` keyframe holds
     * the panel at the sidebar's width from the moment it mounts — and reading the rect there
     * returns 304px rather than the 1000 it is about to become. The clip came out ~500px wide
     * on the wrong side of the panel. Setting this first swaps in the rule whose width is the
     * CSS one, and the `getBoundingClientRect` below forces the recalc that makes it true.
     */
    el.dataset.expandFrom = 'origin';
    const to = el.getBoundingClientRect();
    if (to.width < 1 || to.height < 1) {
      delete el.dataset.expandFrom;
      return;
    }
    /* Negative insets are fine and mean the opener sits outside the panel — a toolbar button
       above it, say. `clip-path` takes them, and the reveal simply starts off-panel. */
    const top = Math.round(origin.top - to.top);
    const right = Math.round(to.right - (origin.left + origin.width));
    const bottom = Math.round(to.bottom - (origin.top + origin.height));
    const left = Math.round(origin.left - to.left);
    el.style.setProperty(
      '--proto-expand-clip-from',
      `inset(${top}px ${right}px ${bottom}px ${left}px round 12px)`,
    );
  }, [origin]);

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

  /*
    Tapping the page outside collapses it, the way every other floating surface
    in the app behaves — the drawer sidebar, the desktop inspector, and every
    popover. This panel covers the main pane without a scrim, so "outside" is
    real estate a reader can see and will reach for.

    `mousedown`, matching usePopoverDismiss: a `click` listener fires after the
    button under the cursor has already acted, so closing on click would let a
    stray press land on the note underneath on its way out.

    Deliberately ignores drags that *start* inside — the board's cards are
    dragged to column edges and past them, and releasing outside must not be
    read as a dismissal.
  */
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const panel = panelRef.current;
      if (!panel || !(event.target instanceof Node)) return;
      if (panel.contains(event.target)) return;
      /* Portaled children — select menus, date pickers, confirm dialogs — are
         outside the panel in the DOM but inside it to the reader. */
      if (
        event.target instanceof Element &&
        event.target.closest('[role="menu"], [role="dialog"], .proto-menu__popover, .proto-popover-shell')
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
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
          {/*
            Not `proto-marquee`. That class sets `container-type: inline-size`,
            and inline-size containment zeroes an element's own intrinsic width
            — fine in a column whose width comes from its parent, fatal here
            where the title's width comes from its own text. It rendered at 0px,
            so the panel showed no name at all. Ellipsis via max-width instead.
          */}
          <span className="proto-sidebar-expanded-panel__title">{title}</span>
          {scope}
        </div>
        {/*
          Always rendered, even when empty. The header is a three-column grid so
          the centre cell is the panel's centre whatever the sides hold —
          dropping an empty cell would collapse the track and slide the switcher
          across. Conditional cells are why it sat 114px right of centre once
          the scope control moved in beside the title.
        */}
        <div className="proto-sidebar-expanded-panel__toolbar">{toolbar}</div>
        <div className="proto-sidebar-expanded-panel__actions">{actions}</div>
      </div>
      <div className="proto-sidebar-expanded-panel__body">{children}</div>
    </div>
  );
}
