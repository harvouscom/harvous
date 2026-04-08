import { useEffect, useState, type AnimationEvent, type ReactNode } from 'react';

/**
 * Wraps async-loaded main content with the shared subtle grid expand + fade-in
 * (see `.subtle-content-mount` in `src/styles/cards.css`).
 * After the fade animation, inner overflow is released so nested scroll areas work.
 */
export default function SubtleContentMount({
  children,
  className = '',
  innerClassName = '',
  /** `expand`: grid height reveal (compact blocks). `fade`: opacity/slide only — use inside flex scroll columns (dashboard, thread, space) so layout height is not collapsed to 0. */
  variant = 'expand',
}: {
  children: ReactNode;
  /** Applied to the outer grid wrapper */
  className?: string;
  /** Applied to the inner overflow clip + fade layer */
  innerClassName?: string;
  variant?: 'expand' | 'fade';
}) {
  const [innerScrollSafe, setInnerScrollSafe] = useState(false);

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

  const outerClass =
    variant === 'fade'
      ? `subtle-content-mount subtle-content-mount--fade${className ? ` ${className}` : ''}`
      : `subtle-content-mount${className ? ` ${className}` : ''}`;

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
