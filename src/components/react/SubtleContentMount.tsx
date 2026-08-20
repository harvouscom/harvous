import { useEffect, useState, type AnimationEvent, type ReactNode } from 'react';

/**
 * Wraps async-loaded main content (see `.subtle-content-mount` in `src/styles/cards.css`).
 * `expand`: grid height reveal + inner fade-up. `fade`: flex-column layout for main column scroll
 * areas — inner uses scroll-safe overflow immediately (no entrance animation).
 */
export default function SubtleContentMount({
  children,
  className = '',
  innerClassName = '',
  /** `expand`: grid height reveal (compact blocks). `fade`: use inside flex scroll columns (dashboard, thread, space) so layout height is not collapsed to 0. */
  variant = 'expand',
  /**
   * Skip the entrance entirely.
   *
   * For content that is being *replaced* rather than arriving — applying a note template
   * remounts the editor so TipTap re-seeds, and playing a 0.42s fade-up over a canvas the
   * user is already looking at reads as lag, not as an entrance. Nothing is appearing; the
   * same surface is being refilled.
   */
  instant = false,
}: {
  children: ReactNode;
  /** Applied to the outer grid wrapper */
  className?: string;
  /** Applied to the inner overflow clip + fade layer */
  innerClassName?: string;
  variant?: 'expand' | 'fade';
  instant?: boolean;
}) {
  const [innerScrollSafe, setInnerScrollSafe] = useState(() => instant || variant === 'fade');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setInnerScrollSafe(true);
    }
  }, []);

  const handleInnerAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.animationName !== 'subtle-content-mount-fade-up') return;
    setInnerScrollSafe(true);
  };

  const outerClass = [
    'subtle-content-mount',
    variant === 'fade' ? 'subtle-content-mount--fade' : '',
    instant ? 'subtle-content-mount--instant' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={outerClass}>
      <div
        className={`subtle-content-mount__inner${innerScrollSafe ? ' subtle-content-mount__inner--scroll-safe' : ''}${innerClassName ? ` ${innerClassName}` : ''}`}
        onAnimationEnd={handleInnerAnimationEnd}
      >
        {children}
      </div>
    </div>
  );
}
