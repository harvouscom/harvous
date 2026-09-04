/**
 * One row of the Review section: a question waiting, or a path to continue.
 *
 * The overflow is the recall shelf's, deliberately — same portal, same measurement, same
 * flip-when-it-does-not-fit. What differs is what the answers mean. A recall card's menu ends
 * in a permanent dismissal because Harvous chose to offer that card; here the reader put the
 * item in the queue themselves, so the strongest answer is "remove from Review", which they
 * can undo by adding it again.
 */
import type { ReactNode } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon, { type IconName } from '@/components/react/Icon';
import PrototypeHomeRow from './PrototypeHomeRow';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { computeRightAnchoredPopoverPosition } from './proto-popover-position';
import { PROTO_TOOLBAR_POPOVER_OFFSET } from './proto-toolbar-tokens';
import {
  REVIEW_DEFER_COPY,
  REVIEW_MORE_COPY,
  REVIEW_PAUSE_COPY,
  REVIEW_REMOVE_COPY,
} from './proto-review-copy';

/** Matches `.proto-review-row__menu`; used only until the real popover can be measured. */
const MENU_WIDTH = 200;
const MENU_FALLBACK_HEIGHT = 124;

export interface StudyInboxRowAction {
  key: string;
  label: string;
  icon: IconName;
  onSelect: () => void;
}

export default function PrototypeReviewRow({
  icon,
  title,
  meta,
  onOpen,
  actions,
}: {
  icon: IconName;
  title: string;
  /** Strings, or a node — the recall state rides here as a chip. See `PrototypeHomeRow`. */
  meta: ReactNode[];
  onOpen: () => void;
  /** Empty renders no overflow at all — a row with nothing to answer needs no menu. */
  actions: StudyInboxRowAction[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [anchorPos, setAnchorPos] = useState<{ top: number; left: number } | null>(null);
  useDismissOnOutside(menuRef, () => setMenuOpen(false), menuOpen);

  // Re-measured on scroll with capture: Activity is a scroller, so a menu anchored once
  // stays where the row was rather than where it is.
  useLayoutEffect(() => {
    if (!menuOpen) {
      setAnchorPos(null);
      return undefined;
    }
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const measured = popoverRef.current?.getBoundingClientRect();
      const pos = computeRightAnchoredPopoverPosition(
        rect,
        measured?.width || MENU_WIDTH,
        measured?.height || MENU_FALLBACK_HEIGHT,
        PROTO_TOOLBAR_POPOVER_OFFSET,
      );
      setAnchorPos({ top: pos.top, left: pos.left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [menuOpen]);

  /* Closed before the answer runs: every one of these takes the row off the stack, and a menu
     closing on an element that is already gone paints over whichever row moved up. */
  const answer = (act: () => void) => () => {
    setMenuOpen(false);
    act();
  };

  return (
    <PrototypeHomeRow
      icon={icon}
      title={title}
      meta={meta}
      onClick={onOpen}
      trailing={
        actions.length > 0 ? (
          <span className="proto-review-row__more" ref={menuRef}>
            <button
              ref={triggerRef}
              type="button"
              className="proto-side-panel__action-btn"
              aria-label={`${REVIEW_MORE_COPY} — ${title}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((wasOpen) => !wasOpen)}
            >
              <Icon name="ellipsis-vertical" size={12} aria-hidden />
            </button>
            {menuOpen && typeof document !== 'undefined'
              ? createPortal(
                  <div
                    ref={popoverRef}
                    className="proto-menu__popover proto-menu__popover--list-view proto-review-row__menu"
                    role="menu"
                    aria-label={`${REVIEW_MORE_COPY} — ${title}`}
                    /* Off-screen until measured, so the first paint is never in the wrong place. */
                    style={{ top: anchorPos?.top ?? -9999, left: anchorPos?.left ?? 0 }}
                  >
                    {actions.map((action) => (
                      <button
                        key={action.key}
                        type="button"
                        role="menuitem"
                        className="proto-menu-item"
                        onClick={answer(action.onSelect)}
                      >
                        <span className="proto-menu-item__icon" aria-hidden>
                          <Icon name={action.icon} size={14} />
                        </span>
                        <span className="proto-menu-item__label">{action.label}</span>
                      </button>
                    ))}
                  </div>,
                  document.body,
                )
              : null}
          </span>
        ) : undefined
      }
    />
  );
}

/** The three answers a due review row offers, in the order they should be read. */
export function reviewRowActions(handlers: {
  onDefer: () => void;
  onPause: () => void;
  onRemove: () => void;
}): StudyInboxRowAction[] {
  return [
    { key: 'defer', label: REVIEW_DEFER_COPY, icon: 'clock-rotate-left', onSelect: handlers.onDefer },
    { key: 'pause', label: REVIEW_PAUSE_COPY, icon: 'circle-minus', onSelect: handlers.onPause },
    { key: 'remove', label: REVIEW_REMOVE_COPY, icon: 'eye-slash', onSelect: handlers.onRemove },
  ];
}
