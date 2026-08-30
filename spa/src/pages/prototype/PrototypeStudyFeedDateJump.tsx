/**
 * The date beside the day's name, turned into a way back to any of them.
 *
 * ## Why the date and not a new control
 *
 * The sheet already says "Today · August 29", and the second half of that was doing nothing —
 * a label that names exactly the thing you would want to change. Making it the trigger costs
 * the header no room and needs no explaining: pressing a date to pick a date is not a
 * convention anyone has to learn.
 *
 * ## Why a calendar rather than a stepper
 *
 * Reading back is usually a search for an occasion — the Sunday you took those notes, the week
 * you were in Romans — and a month grid is the shape people hold that in. A stepper would be
 * smaller and would make "three Sundays ago" a counting exercise.
 *
 * The stack is preserved: this moves the reader through the sheets that are already there
 * rather than replacing them, so the way back is the same way it always was.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ProtoDatePicker from './ProtoDatePicker';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { computeAnchoredPopoverPosition } from './proto-popover-position';
import { PROTO_TOOLBAR_POPOVER_OFFSET } from './proto-toolbar-tokens';

/** Roughly a month grid, for the frame before the popover has been measured. */
const PICKER_WIDTH = 260;
const PICKER_HEIGHT = 300;

export default function PrototypeStudyFeedDateJump({
  dateLabel,
  dayKey,
  earliestDayKey,
  todayKey,
  onPick,
}: {
  /** What the sheet already shows — this replaces the span, it does not add to it. */
  dateLabel: string;
  /** The day on screen, so the grid opens on the month being read. */
  dayKey: string;
  /**
   * Oldest day the feed can reach. Days before it are shown but not selectable — the study
   * does not go back that far, and offering them would promise a sheet that cannot exist.
   */
  earliestDayKey?: string;
  /** Nothing after today: the feed is a record, and tomorrow has not happened. */
  todayKey: string;
  onPick: (dayKey: string) => void;
}) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  /* The popover is portaled, so it is not inside the anchor and a plain containment check
     would treat a click on a date as "outside" — closing the picker on `pointerdown`, before
     the day's own `click` could land. */
  useDismissOnOutside(anchorRef, () => setOpen(false), open, {
    ignoreSelector: '.proto-feed-date-jump__popover',
  });

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const measured = popoverRef.current?.getBoundingClientRect();
      setPos(
        computeAnchoredPopoverPosition(
          rect,
          measured?.width || PICKER_WIDTH,
          measured?.height || PICKER_HEIGHT,
          PROTO_TOOLBAR_POPOVER_OFFSET,
        ),
      );
    };
    update();
    window.addEventListener('resize', update);
    /* The sheet scrolls, and the header scrolls with it. Capture, because the scroller is an
       ancestor rather than the window. */
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  return (
    <span className="proto-feed-date-jump" ref={anchorRef}>
      <button
        ref={triggerRef}
        type="button"
        className="proto-feed-sheet__date proto-feed-date-jump__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${dateLabel}. Jump to another day`}
        onClick={() => setOpen((was) => !was)}
      >
        {dateLabel}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              className="proto-menu__popover proto-feed-date-jump__popover"
              role="dialog"
              aria-label="Jump to a day"
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? 0 }}
            >
              <ProtoDatePicker
                value={dayKey}
                /* Absent until a page has loaded; the picker treats a missing floor as today,
                   which would disable everything, so fall back to the day being read. */
                min={earliestDayKey ?? dayKey}
                max={todayKey}
                aria-label="Jump to a day"
                onChange={(iso) => {
                  setOpen(false);
                  onPick(iso);
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
