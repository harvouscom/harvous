'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import '@/styles/study-dock-card.css';

/** Matches `--study-dock-motion-spring-layer` duration for exit-before-dismiss. */
const DOCK_EXIT_MS = 320;

export interface StudyDockCardShellProps {
  /** CSS color for accent stroke (--study-dock-accent). */
  accentColor: string;
  expanded: boolean;
  onToggleExpanded: () => void;
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
  children?: React.ReactNode;
}

/**
 * Shared floating card chrome for scripture / highlight / reference study docks.
 */
export default function StudyDockCardShell({
  accentColor,
  expanded,
  onToggleExpanded,
  onDismiss,
  ariaLabel,
  rootClassName = '',
  animateEnter = true,
  headerIcon,
  headerTitle,
  headerTitleIsButton = false,
  headerTrailing,
  headerActions,
  children,
}: StudyDockCardShellProps) {
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

  const stopHeaderActionBubble = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
          aria-expanded={expanded}
          onClick={expanded ? undefined : onToggleExpanded}
          onMouseDown={
            expanded
              ? undefined
              : (e) => {
                  e.preventDefault();
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
            <div
              className="study-dock-card__header-actions"
              onClick={stopHeaderActionBubble}
              onMouseDown={stopHeaderActionBubble}
            >
              {expanded && headerActions ? (
                <>
                  {headerActions}
                  <span className="study-dock-card__header-divider" aria-hidden />
                </>
              ) : null}
              {expanded ? (
                <button
                  type="button"
                  className="study-dock-card__header-btn"
                  onClick={onToggleExpanded}
                  aria-expanded={expanded}
                  aria-label="Collapse"
                >
                  <Icon name="chevron-down" size={12} />
                </button>
              ) : null}
              <button
                type="button"
                className="study-dock-card__header-btn"
                onClick={handleDismiss}
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
  );
}
