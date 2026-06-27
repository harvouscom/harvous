'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
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
  // Touch/coarse pointers get a bottom-anchored sheet instead of a viewport-fixed dropdown:
  // inside the slide-up dock the trigger rect is unreliable (→ corner glitch) and the iOS
  // keyboard/visual-viewport leaves a fixed menu stale. The sheet needs no per-trigger math.
  const [isCoarse, setIsCoarse] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const selected = options.find((o) => o.value === value);
  const triggerLabel = displayLabel ?? selected?.label ?? value;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setIsCoarse(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      // Not laid out yet (dock still animating) — retry next frame rather than flash the
      // menu into the top-left corner.
      requestAnimationFrame(() => {
        if (triggerRef.current) setMenuPos(computeMenuPosition(triggerRef.current));
      });
      return;
    }
    setMenuPos(computeMenuPosition(trigger));
  }, []);

  // Desktop dropdown positioning (skipped for the mobile sheet).
  useLayoutEffect(() => {
    if (!open || isCoarse) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
  }, [open, isCoarse, updateMenuPosition, options.length, triggerLabel]);

  // Opening the sheet: dismiss the iOS keyboard (a focused editor would otherwise leave it
  // covering the bottom-anchored sheet) and scroll the selected option into view.
  useEffect(() => {
    if (!open || !isCoarse) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      active.blur();
    }
    requestAnimationFrame(() => selectedItemRef.current?.scrollIntoView({ block: 'center' }));
  }, [open, isCoarse]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      if (sheetRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('keydown', onKeyDown);
    if (!isCoarse) {
      const onReposition = () => updateMenuPosition();
      window.addEventListener('resize', onReposition);
      window.addEventListener('scroll', onReposition, true);
      return () => {
        window.removeEventListener('pointerdown', onPointerDown, { capture: true });
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', onReposition);
        window.removeEventListener('scroll', onReposition, true);
      };
    }
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, isCoarse, close, updateMenuPosition]);

  const variantClass =
    variant === 'book' ? ' harvous-menu-pill--book' : variant === 'compact' ? ' harvous-menu-pill--compact' : '';

  const optionItems = options.map((opt) => {
    const selectedItem = opt.value === value;
    return (
      <li key={opt.value} role="none">
        <button
          ref={selectedItem ? selectedItemRef : undefined}
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
  });

  const overlay =
    open && typeof document !== 'undefined'
      ? isCoarse
        ? createPortal(
            <div
              className="harvous-menu-pill__sheet-backdrop"
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) close();
              }}
            >
              <div
                ref={sheetRef}
                className="harvous-menu-pill__sheet"
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
              >
                <div className="harvous-menu-pill__sheet-header">{ariaLabel}</div>
                <ul
                  ref={menuRef}
                  className="harvous-menu-pill__sheet-list"
                  id={menuId}
                  role="listbox"
                  aria-label={ariaLabel}
                >
                  {optionItems}
                </ul>
              </div>
            </div>,
            document.body,
          )
        : menuPos
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
                {optionItems}
              </ul>,
              document.body,
            )
          : null
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
        <Icon
          name="caret-down"
          size={9}
          className={`harvous-menu-pill__chevron${open ? ' harvous-menu-pill__chevron--open' : ''}`}
        />
      </button>
      {overlay}
    </div>
  );
}
