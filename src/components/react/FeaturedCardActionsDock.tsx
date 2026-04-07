import type { ReactNode } from 'react';

/** Cream dock + mobile action strip row; pairs with `.featured-card-shell` and `.featured-card` surface in cards.css */
export function FeaturedCardActionsDock({
  children,
  trailing,
  animateEntrance = true,
  className,
}: {
  children: ReactNode;
  /** Dismiss / close / erase — aligned end (space-between), like note thread strip meta */
  trailing?: ReactNode;
  /** When true, dock uses slide-in animation (dashboard featured card). List contexts (e.g. My Inbox) should pass false. */
  animateEntrance?: boolean;
  className?: string;
}) {
  const dockClass = animateEntrance ? 'featured-card__dock featured-card__dock--showing' : 'featured-card__dock';
  return (
    <div className={className ? `${dockClass} ${className}` : dockClass}>
      <div
        className="action-strip action-strip--mobile featured-card__action-strip"
        role="group"
        aria-label="Actions"
      >
        <div
          className={
            trailing != null
              ? 'action-strip__inner featured-card__action-strip__inner'
              : 'action-strip__inner'
          }
        >
          {trailing != null ? (
            <>
              <div className="featured-card__action-strip__start">{children}</div>
              <div className="featured-card__action-strip__end">{trailing}</div>
            </>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
