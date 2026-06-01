'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '@/styles/harvous-menu-pill.css';

export interface HarvousMenuPillOption {
  value: string;
  label: string;
}

export interface HarvousMenuPillProps {
  value: string;
  options: HarvousMenuPillOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  /** When set, shown on trigger instead of selected option label. */
  displayLabel?: string;
  variant?: 'default' | 'book' | 'compact';
  monospaceDigits?: boolean;
}

interface MenuPosition {
  top: number;
  left: number;
  minWidth: number;
}

function computeMenuPosition(trigger: HTMLButtonElement): MenuPosition {
  const rect = trigger.getBoundingClientRect();
  const viewportMargin = 8;
  const menuMaxHeight = 220;
  const gap = 5;
  let top = rect.bottom + gap;
  const spaceBelow = window.innerHeight - rect.bottom - viewportMargin;
  if (spaceBelow < menuMaxHeight && rect.top > menuMaxHeight + viewportMargin) {
    top = Math.max(viewportMargin, rect.top - gap - menuMaxHeight);
  }
  const left = Math.min(
    Math.max(viewportMargin, rect.left),
    window.innerWidth - viewportMargin - Math.max(rect.width, 120),
  );
  return { top, left, minWidth: rect.width };
}

export default function HarvousMenuPill({
  value,
  options,
  onChange,
  ariaLabel,
  displayLabel,
  variant = 'default',
  monospaceDigits = false,
}: HarvousMenuPillProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const menuId = useId();

  const selected = options.find((o) => o.value === value);
  const triggerLabel = displayLabel ?? selected?.label ?? value;

  const close = useCallback(() => setOpen(false), []);

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return;
    setMenuPos(computeMenuPosition(triggerRef.current));
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
  }, [open, updateMenuPosition, options.length, triggerLabel]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onReposition = () => updateMenuPosition();
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, close, updateMenuPosition]);

  const variantClass =
    variant === 'book' ? ' harvous-menu-pill--book' : variant === 'compact' ? ' harvous-menu-pill--compact' : '';

  const menu =
    open && menuPos && typeof document !== 'undefined'
      ? createPortal(
          <ul
            ref={menuRef}
            className="harvous-menu-pill__menu harvous-menu-pill__menu--portal"
            id={menuId}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              minWidth: menuPos.minWidth,
              zIndex: 6000,
            }}
          >
            {options.map((opt) => {
              const selectedItem = opt.value === value;
              return (
                <li key={opt.value} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedItem}
                    className={`harvous-menu-pill__item${selectedItem ? ' harvous-menu-pill__item--selected' : ''}${
                      monospaceDigits ? ' harvous-menu-pill__item--digits' : ''
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(opt.value);
                      close();
                    }}
                  >
                    {opt.label}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div className={`harvous-menu-pill${variantClass}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="harvous-menu-pill__trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span
          className={`harvous-menu-pill__label${monospaceDigits ? ' harvous-menu-pill__label--digits' : ''}`}
        >
          {triggerLabel}
        </span>
        <svg
          className={`harvous-menu-pill__chevron${open ? ' harvous-menu-pill__chevron--open' : ''}`}
          viewBox="0 0 512 512"
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"
          />
        </svg>
      </button>
      {menu}
    </div>
  );
}
