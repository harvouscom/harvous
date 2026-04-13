import React from 'react';
import { formatBadgeCount } from '@/utils/badge-count';

export interface RecentSearchRowProps {
  term: string;
  count: number;
  onRemove: () => void;
  onPrefetchSearch?: (term: string) => void;
  /**
   * When set, the main row is a focusable control (use on list pages). Omit in Spotlight — `Command.Item` handles selection.
   */
  onPrimaryAction?: () => void;
  /**
   * `overlay` — background only (Spotlight; cmdk/CSS apply row shadow). `list` — gradient row + shadow like inline Find/space search.
   */
  variant?: 'overlay' | 'list';
}

/**
 * Shared recent-search row: label + badge count with stacked dismiss (see `spotlight.css`).
 * Used by Spotlight (`variant="overlay"`) and [`RecentSearches`](./RecentSearches.tsx) (`variant="list"` + `onPrimaryAction`).
 */
export default function RecentSearchRow({
  term,
  count,
  onRemove,
  onPrefetchSearch,
  onPrimaryAction,
  variant = 'list',
}: RecentSearchRowProps) {
  const isStandalone = onPrimaryAction !== undefined;
  const rowStyle: React.CSSProperties =
    variant === 'list'
      ? { background: 'var(--color-gradient-gray)', boxShadow: 'var(--shadow-small)' }
      : { background: 'var(--color-gradient-gray)' };

  return (
    <div className="spotlight-recent-item">
      <div
        className="relative nav-item-container rounded-2xl recent-search-row spotlight-recent-row spotlight-recent-item__row"
        style={rowStyle}
      >
        <div
          className="spotlight-recent-item__main flex-fill"
          style={{
            color: 'var(--color-deep-grey)',
            ...(isStandalone ? { cursor: 'pointer' } : undefined),
          }}
          role={isStandalone ? 'button' : undefined}
          tabIndex={isStandalone ? 0 : undefined}
          onMouseEnter={() => onPrefetchSearch?.(term)}
          onClick={isStandalone ? () => onPrimaryAction() : undefined}
          onKeyDown={
            isStandalone
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPrimaryAction();
                  }
                }
              : undefined
          }
        >
          <span className="panel__list-item-label text-truncate">{term}</span>
          <div className="nav-item__badge-slot spotlight-recent-item__badge-slot">
            <span className="badge-count">
              <span className="badge-number">{formatBadgeCount(count)}</span>
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onRemove();
              }}
              className="close-icon recent-search-close-icon"
              aria-label="Remove from recent searches"
            >
              <svg viewBox="0 0 384 512" aria-hidden="true">
                <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
