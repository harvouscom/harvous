/**
 * The prototype's choice control — a trigger that opens a menu of options.
 *
 * **Use this instead of a native `<select>`.** Harvous does not use OS select
 * chrome anywhere a user actually chooses something: the space switcher, the
 * list-view picker, the note row menu and the planner's scope chips are all a
 * button plus a portaled `ProtoPopoverShell` of `menuitemradio` rows with a
 * tick on the current one. A `<select>` renders the platform's popup, which
 * matches none of it — different type, different radius, different selected
 * state, and on macOS a different font entirely.
 *
 * It exists because that pattern had been hand-rolled four times over, which
 * is exactly how a fifth call site reaches for the native element instead: the
 * convention was real but there was nothing to import.
 *
 * Portaled and fixed-positioned like its siblings, so an ancestor with
 * `overflow: hidden` — every sheet and rail in this app — cannot clip it.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import ProtoPopoverShell from './ProtoPopoverShell';
import { computeRightAnchoredPopoverPosition } from './proto-popover-position';
import { PROTO_MENU_CHECK_ICON_SIZE } from './proto-toolbar-tokens';

const FALLBACK_WIDTH = 220;
const FALLBACK_HEIGHT = 240;
const OFFSET = 6;

export type ProtoSelectOption<T extends string | number> = {
  value: T;
  label: string;
};

export default function ProtoSelectMenu<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled,
  className,
  menuWidth,
  menuClassName,
}: {
  value: T;
  options: ProtoSelectOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name for the trigger — what is being chosen. */
  label: string;
  disabled?: boolean;
  /** Extra class on the trigger, for callers that need their own width. */
  className?: string;
  menuWidth?: number;
  /** Extra class on the popover, for callers whose options are not a list of labels. */
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menuId = useId();

  const selected = options.find((option) => option.value === value) ?? options[0];
  const width = menuWidth ?? FALLBACK_WIDTH;

  useEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const measured = popoverRef.current?.getBoundingClientRect();
      const next = computeRightAnchoredPopoverPosition(
        rect,
        measured?.width || width,
        measured?.height || FALLBACK_HEIGHT,
        OFFSET,
      );
      setPos({ top: next.top, left: next.left });
    };
    update();
    /* Capture-phase: these open inside scrolling sheets, and a menu that stays
       put while its trigger slides away points at nothing. */
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, width]);

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
      /* Claimed here so the sheet or panel around it stays open — Escape means
         "close this menu", not "abandon what I was editing". */
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`proto-select-menu__trigger${className ? ` ${className}` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((x) => !x)}
      >
        <span className="proto-select-menu__value">{selected?.label ?? ''}</span>
        <Icon name={open ? 'caret-up' : 'caret-down'} size={9} aria-hidden />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <ProtoPopoverShell
              ref={popoverRef}
              id={menuId}
              className={`proto-menu__popover proto-menu__popover--list-view proto-select-menu__popover${menuClassName ? ` ${menuClassName}` : ''}`}
              role="menu"
              aria-label={label}
              style={{
                position: 'fixed',
                top: pos?.top ?? -9999,
                left: pos?.left ?? 0,
                width,
                zIndex: 6000,
              }}
            >
              <div className="proto-menu-section" role="group">
                {options.map((option) => {
                  const checked = option.value === value;
                  return (
                    <button
                      key={String(option.value)}
                      type="button"
                      role="menuitemradio"
                      aria-checked={checked}
                      className="proto-menu-item"
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                        triggerRef.current?.focus();
                      }}
                    >
                      <span className="proto-menu-item__label">{option.label}</span>
                      <span className="proto-menu-item__check" aria-hidden>
                        {checked ? <Icon name="check" size={PROTO_MENU_CHECK_ICON_SIZE} /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </ProtoPopoverShell>,
            document.body,
          )
        : null}
    </>
  );
}
