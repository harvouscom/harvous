'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { StudyHighlightAccentKey } from '@/utils/study-highlight-accents';
import { STUDY_HIGHLIGHT_SWATCHES_WITH_NEUTRAL } from '@/utils/study-highlight-accents';
import '@/styles/highlight-dock-web.css';

export interface DockAccentSwatchButtonProps {
  selection: StudyHighlightAccentKey;
  paletteTokens?: readonly StudyHighlightAccentKey[];
  onSelectionChange: (accent: StudyHighlightAccentKey) => void;
}

type PopoverPosition = {
  top: number;
  left: number;
};

/** Resolved stroke/fill color for dock chrome — matches native `resolvedAccentNSColor` (light). */
export const SCRIPTURE_DOCK_ACCENT_COLORS: Record<StudyHighlightAccentKey, string> = {
  /** Matches native `HarvousColors.nsScripturePillNeutralAccent` (HSB 0.62, 0.22, 0.52). */
  neutral: '#676f84',
  warmAmber: '#e6a820',
  skyBlue: '#1e88c9',
  violet: '#8b5cf6',
  mintGreen: '#43a047',
  coralRose: '#e0409a',
};

function SwatchChoice({
  token,
  selected,
  onPick,
}: {
  token: StudyHighlightAccentKey;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className={`dock-accent-swatch__choice${selected ? ' dock-accent-swatch__choice--selected' : ''}`}
      title={token}
      aria-label={token}
      aria-pressed={selected}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
    >
      <span className="dock-accent-swatch__choice-ring" aria-hidden />
      <span
        className="dock-accent-swatch__choice-fill"
        style={{ backgroundColor: SCRIPTURE_DOCK_ACCENT_COLORS[token] }}
        aria-hidden
      />
    </button>
  );
}

/**
 * Compact accent swatch for dock headers — shows active color; opens upward popover palette.
 * Mirrors native `DockAccentSwatchButton`.
 */
export default function DockAccentSwatchButton({
  selection,
  paletteTokens = STUDY_HIGHLIGHT_SWATCHES_WITH_NEUTRAL,
  onSelectionChange,
}: DockAccentSwatchButtonProps) {
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<PopoverPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const updatePopoverPosition = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPopoverPos({
      top: rect.top - 10,
      left: rect.left + rect.width / 2,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPopoverPos(null);
      return;
    }
    updatePopoverPosition();
  }, [open, updatePopoverPosition, selection, paletteTokens.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onReposition = () => updatePopoverPosition();
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, close, updatePopoverPosition]);

  const popover =
    open && popoverPos && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="dock-accent-swatch__popover-anchor"
            style={{
              position: 'fixed',
              top: popoverPos.top,
              left: popoverPos.left,
              transform: 'translate(-50%, -100%)',
              zIndex: 6000,
            }}
          >
            <div
              ref={popoverRef}
              className="dock-accent-swatch__popover dock-accent-swatch__popover--portal"
              role="dialog"
              aria-label="Choose accent color"
            >
              <div className="dock-accent-swatch__palette" role="group" aria-label="Accent colors">
                {paletteTokens.map((key) => (
                  <SwatchChoice
                    key={key}
                    token={key}
                    selected={selection === key}
                    onPick={() => {
                      onSelectionChange(key);
                      close();
                    }}
                  />
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="dock-accent-swatch" ref={rootRef}>
      <button
        type="button"
        className="dock-accent-swatch__trigger"
        aria-label={`Accent color: ${selection}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="dock-accent-swatch__trigger-ring" aria-hidden />
        <span
          className="dock-accent-swatch__trigger-fill"
          style={{ backgroundColor: SCRIPTURE_DOCK_ACCENT_COLORS[selection] }}
          aria-hidden
        />
      </button>
      {popover}
    </div>
  );
}
