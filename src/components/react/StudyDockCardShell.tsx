'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import '@/styles/study-dock-card.css';

const NARROW_BREAKPOINT = 420;

function useNarrowViewport(breakpoint: number): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setNarrow(e.matches);
    setNarrow(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return narrow;
}

function OverflowMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
  }, []);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    updatePos();
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('touchstart', dismiss, { passive: true });
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('touchstart', dismiss);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open, updatePos]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="study-dock-card__header-btn study-dock-card__overflow-trigger"
        aria-label="More actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="ellipsis" size={12} />
      </button>
      {open && pos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popRef}
              className="study-dock-card__overflow-popover"
              role="menu"
              style={{ position: 'fixed', top: pos.top, right: pos.right }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** Matches `--study-dock-motion-spring-layer` duration for exit-before-dismiss. */
const DOCK_EXIT_MS = 320;

export interface StudyDockCardShellProps {
  /** CSS color for accent stroke (--study-dock-accent). */
  accentColor: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  /**
   * This kind has no expanded state (resource chips). The card stays activatable
   * — `onToggleExpanded` becomes the activation handler — but drops the
   * `aria-expanded` claim, which would otherwise promise a region that will
   * never open.
   */
  collapsedOnly?: boolean;
  onDismiss: () => void;
  /** Region label for aria. */
  ariaLabel: string;
  /** Optional root class (e.g. scripture-pill-chrome, highlight-dock-web). */
  rootClassName?: string;
  /** Play native-style enter animation on mount. */
  animateEnter?: boolean;
  headerIcon: React.ReactNode;
  /** Title area — button, input, or static text. */
  headerTitle: React.ReactNode;
  /** When true, title slot is a button that toggles expand. */
  headerTitleIsButton?: boolean;
  headerTrailing?: React.ReactNode;
  /** Accent swatch, trash, etc. — inserted before chevron/X. */
  headerActions?: React.ReactNode;
  /** Primary action on the accent stripe — always visible (not buried in narrow overflow). */
  accentPrimaryAction?: {
    label: string;
    ariaLabel?: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  children?: React.ReactNode;
}

/**
 * Shared floating card chrome for scripture / highlight / reference study docks.
 */
export default function StudyDockCardShell({
  accentColor,
  expanded,
  onToggleExpanded,
  collapsedOnly = false,
  onDismiss,
  ariaLabel,
  rootClassName = '',
  animateEnter = true,
  headerIcon,
  headerTitle,
  headerTitleIsButton = false,
  headerTrailing,
  headerActions,
  accentPrimaryAction,
  children,
}: StudyDockCardShellProps) {
  const isNarrow = useNarrowViewport(NARROW_BREAKPOINT);
  const [isExiting, setIsExiting] = useState(false);
  const [showEnter, setShowEnter] = useState(animateEnter);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!animateEnter) {
      setShowEnter(false);
      return;
    }
    const timer = setTimeout(() => setShowEnter(false), DOCK_EXIT_MS);
    return () => clearTimeout(timer);
  }, [animateEnter]);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null;
      onDismiss();
    }, DOCK_EXIT_MS);
  }, [isExiting, onDismiss]);

  const titleClass = `study-dock-card__header-title${
    headerTitleIsButton && expanded ? ' study-dock-card__header-title--button' : ''
  }`;
  const titleUsesToggleButton = headerTitleIsButton && expanded;

  const stopHeaderActionClickBubble = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  /** Pointer: run on mousedown (preventDefault suppresses duplicate click). Keyboard: fallback via click detail 0. */
  const runHeaderPointerAction = (e: React.MouseEvent, action: () => void) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    action();
  };

  const rootClass = [
    'study-dock-card',
    rootClassName,
    showEnter ? 'study-dock-card--enter' : '',
    isExiting ? 'study-dock-card--exit' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const hasBody = Boolean(children);

  return (
    <div className={rootClass} role="region" aria-label={ariaLabel}>
      <div className="study-dock-card__outer">
        <div
          className={`study-dock-card__card${expanded ? '' : ' study-dock-card__card--collapsed'}`}
          data-expanded={expanded ? 'true' : 'false'}
          style={{ '--study-dock-accent': accentColor } as React.CSSProperties}
          tabIndex={expanded ? undefined : 0}
          aria-expanded={collapsedOnly ? undefined : expanded}
          onClick={
            expanded
              ? undefined
              : (e) => {
                  /* Keyboard activation only — mouse expand runs on mousedown (preventDefault there suppresses click). */
                  if (e.detail === 0) onToggleExpanded();
                }
          }
          onMouseDown={
            expanded
              ? undefined
              : (e) => {
                  if (e.button !== 0) return;
                  if ((e.target as HTMLElement).closest('.study-dock-card__header-actions')) return;
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleExpanded();
                }
          }
          onKeyDown={
            expanded
              ? undefined
              : (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggleExpanded();
                  }
                }
          }
        >
          {accentPrimaryAction ? (
            <button
              type="button"
              className="study-dock-card__accent-primary-action"
              aria-label={accentPrimaryAction.ariaLabel ?? accentPrimaryAction.label}
              onMouseDown={(e) => runHeaderPointerAction(e, accentPrimaryAction.onClick)}
              onClick={(e) => {
                e.stopPropagation();
                if (e.detail === 0) accentPrimaryAction.onClick();
              }}
            >
              {accentPrimaryAction.icon ? (
                <span className="study-dock-card__accent-primary-action-icon" aria-hidden>
                  {accentPrimaryAction.icon}
                </span>
              ) : null}
              <span className="study-dock-card__accent-primary-action-label">{accentPrimaryAction.label}</span>
            </button>
          ) : null}
          <div
            className={`study-dock-card__card-main${accentPrimaryAction ? ' study-dock-card__card-main--with-accent-action' : ''}`}
          >
          <div className="study-dock-card__header">
            <span className="study-dock-card__header-icon" aria-hidden>
              {headerIcon}
            </span>
            {titleUsesToggleButton ? (
              <button
                type="button"
                className={titleClass}
                onMouseDown={(e) => e.preventDefault()}
                onClick={onToggleExpanded}
                aria-expanded={expanded}
              >
                {headerTitle}
              </button>
            ) : (
              <div className={titleClass}>{headerTitle}</div>
            )}
            {headerTrailing && expanded ? (
              <div className="study-dock-card__header-trailing">{headerTrailing}</div>
            ) : null}
            <div className="study-dock-card__header-actions" onClick={stopHeaderActionClickBubble}>
              {expanded && headerActions ? (
                isNarrow ? (
                  <OverflowMenu>{headerActions}</OverflowMenu>
                ) : (
                  <>
                    {headerActions}
                    <span className="study-dock-card__header-divider" aria-hidden />
                  </>
                )
              ) : null}
              {expanded ? (
                <button
                  type="button"
                  className="study-dock-card__header-btn"
                  onMouseDown={(e) => runHeaderPointerAction(e, onToggleExpanded)}
                  onClick={(e) => {
                    stopHeaderActionClickBubble(e);
                    if (e.detail === 0) onToggleExpanded();
                  }}
                  aria-expanded={expanded}
                  aria-label="Collapse"
                >
                  <Icon name="caret-down" size={12} />
                </button>
              ) : null}
              <button
                type="button"
                className="study-dock-card__header-btn"
                onMouseDown={(e) => runHeaderPointerAction(e, handleDismiss)}
                onClick={(e) => {
                  stopHeaderActionClickBubble(e);
                  if (e.detail === 0) handleDismiss();
                }}
                aria-label="Dismiss"
              >
                <Icon name="xmark" size={12} />
              </button>
            </div>
          </div>
          {hasBody ? (
            <div
              className="study-dock-card__body-wrap"
              data-expanded={expanded ? 'true' : 'false'}
              inert={expanded ? undefined : true}
            >
              <div className="study-dock-card__body">{children}</div>
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
