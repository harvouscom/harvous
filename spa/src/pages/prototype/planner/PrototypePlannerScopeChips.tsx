/**
 * Which plan you are looking at: the church's, or one of its channels.
 *
 * A chip per plan does not survive contact with a real church. One channel fits
 * a 304px sidebar; five turn the bar into a horizontal scroll of half-legible
 * pills, where the thing you want is usually off-screen and the control stops
 * reading as a toggle at all.
 *
 * So the bar stays two positions — Church, and *a* channel — and the second one
 * carries a picker for which. That keeps the tab affordance the switcher is
 * built on (two plans, one selected, side by side) while letting the number of
 * channels grow without the control changing shape.
 *
 * The two-stage click is the toolbar orbs' rule, deliberately: an inactive chip
 * is a fast switch (one click straight to the channel you were last on), an
 * active one opens the menu. Making the planner's switcher behave differently
 * from the sidebar's would be the arbitrary choice, not this.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import ProtoPopoverShell from '../ProtoPopoverShell';
import { computeRightAnchoredPopoverPosition } from '../proto-popover-position';
import type { PlannableSpace } from '../../../hooks/useChurchPlannerAccess';

const POPOVER_WIDTH = 240;
const POPOVER_FALLBACK_HEIGHT = 220;
const POPOVER_OFFSET = 6;

export default function PrototypePlannerScopeChips({
  plannableSpaces,
  planSpaceId,
  onChange,
  /** Remembers which channel the second chip returns to. */
  lastChannelId,
}: {
  plannableSpaces: PlannableSpace[];
  /** null = the church's own plan. */
  planSpaceId: string | null;
  onChange: (planSpaceId: string | null) => void;
  lastChannelId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [anchorPos, setAnchorPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setAnchorPos(null);
      return undefined;
    }
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const measured = popoverRef.current?.getBoundingClientRect();
      const pos = computeRightAnchoredPopoverPosition(
        rect,
        measured?.width || POPOVER_WIDTH,
        measured?.height || POPOVER_FALLBACK_HEIGHT,
        POPOVER_OFFSET,
      );
      setAnchorPos({ top: pos.top, left: pos.left });
    };
    update();
    /* Capture-phase scroll: the sidebar scrolls, not the window, and a menu that
       stays put while its trigger slides away points at nothing. */
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      /* Dismiss the menu without closing the expanded planner around it. */
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  if (plannableSpaces.length === 0) return null;

  const onChurch = planSpaceId === null;
  /* What the channel chip stands for right now: the open channel, else the one
     you were last on, else the first. Never empty — the chip has to be a place
     you can go, not a label for nothing. */
  const chipSpace =
    plannableSpaces.find((s) => s.id === planSpaceId) ??
    plannableSpaces.find((s) => s.id === lastChannelId) ??
    plannableSpaces[0];
  /** One channel is not a choice — a menu holding a single item is only friction. */
  const hasPicker = plannableSpaces.length > 1;

  const onChannelChipClick = () => {
    if (onChurch) {
      onChange(chipSpace.id);
      return;
    }
    if (hasPicker) setOpen((x) => !x);
  };

  const menu =
    open && hasPicker && typeof document !== 'undefined'
      ? createPortal(
          <ProtoPopoverShell
            ref={popoverRef}
            /* Rides the list-view popover's styling: same menu, same selected
               row treatment, so the planner's picker and the sidebar's read as
               one control family. */
            className="proto-menu__popover proto-menu__popover--list-view proto-menu__popover--planner-scope"
            role="menu"
            aria-label="Channels"
            style={{
              position: 'fixed',
              top: anchorPos?.top ?? -9999,
              left: anchorPos?.left ?? 0,
              width: POPOVER_WIDTH,
              zIndex: 6000,
            }}
          >
            <div className="proto-menu-section" role="group">
              {plannableSpaces.map((space) => (
                <button
                  key={space.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={planSpaceId === space.id}
                  className="proto-menu-item"
                  onClick={() => {
                    onChange(space.id);
                    setOpen(false);
                  }}
                >
                  {/* Same glyph on every row, selection carried by
                      `aria-checked` — the list-view popover's convention, and
                      swapping in a tick would lose what the row *is*. */}
                  <span className="proto-menu-item__icon" aria-hidden>
                    <Icon name="megaphone" size={12} />
                  </span>
                  <span className="proto-menu-item__label">{space.title}</span>
                </button>
              ))}
            </div>
          </ProtoPopoverShell>,
          document.body,
        )
      : null;

  return (
    <div className="proto-chip-bar proto-planner-scope" role="radiogroup" aria-label="Plan">
      <button
        type="button"
        role="radio"
        aria-checked={onChurch}
        className={`proto-chip${onChurch ? ' proto-chip--selected' : ''}`}
        onClick={() => onChange(null)}
      >
        Church
      </button>
      <button
        ref={triggerRef}
        type="button"
        role="radio"
        aria-checked={!onChurch}
        /* The menu is a second job this control does; `aria-haspopup` says so
           without pretending the chip is only a menu button. */
        aria-haspopup={hasPicker ? 'menu' : undefined}
        aria-expanded={hasPicker ? open : undefined}
        className={`proto-chip proto-planner-scope__channel${!onChurch ? ' proto-chip--selected' : ''}`}
        title={hasPicker && !onChurch ? 'Switch channel' : chipSpace.title}
        onClick={onChannelChipClick}
      >
        <span className="proto-planner-scope__channel-name proto-marquee">
          <span>{chipSpace.title}</span>
        </span>
        {hasPicker ? (
          <Icon
            name={open ? 'caret-up' : 'caret-down'}
            size={9}
            aria-hidden
            /* Dimmed until this side is active — on the church side the chip is
               a switch, and a live-looking caret would promise a menu that one
               click does not open. */
            className="proto-planner-scope__caret"
          />
        ) : null}
      </button>
      {menu}
    </div>
  );
}
