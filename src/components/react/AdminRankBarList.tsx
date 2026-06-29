import Icon, { type IconName } from '@/components/react/Icon';
import { formatRankDeltaBadge, type ListedRankDelta } from '@/utils/admin-pulse-deltas';
import '@/styles/admin-usage.css';

function formatCount(n: number): string {
  return n.toLocaleString();
}

export type AdminRankBarItem = { name: string; count: number };

export type AdminRankBarTrendItem = ListedRankDelta;

export type AdminRankBarTone = 'notes' | 'threads' | 'highlights' | 'scripture' | 'folders' | 'recall';

export default function AdminRankBarList({
  items,
  tone,
  emptyLabel,
  limit = 8,
  showTrend = false,
}: {
  items: AdminRankBarItem[] | AdminRankBarTrendItem[];
  tone?: AdminRankBarTone;
  emptyLabel: string;
  limit?: number;
  showTrend?: boolean;
}) {
  if (items.length === 0) {
    return <p className="admin-usage__muted admin-usage__empty--inline">{emptyLabel}</p>;
  }

  const visible = items.slice(0, limit);
  const max = visible[0]?.count ?? 1;
  const toneClass = tone ? `admin-usage__rank-bars--${tone}` : '';

  return (
    <ol className={`admin-usage__rank-bars ${toneClass}`.trim()}>
      {visible.map((item, index) => {
        const widthPct = max > 0 ? Math.max((item.count / max) * 100, item.count > 0 ? 4 : 0) : 0;
        const trendItem = showTrend && 'delta' in item ? item : null;
        return (
          <li key={item.name} className="admin-usage__rank-bar-item">
            <div className="admin-usage__rank-bar-head">
              <span className="admin-usage__rank-bar-rank">{index + 1}</span>
              <span className="admin-usage__rank-bar-name" title={item.name}>
                {item.name}
              </span>
              {trendItem ? (
                <span className="admin-usage__rank-bar-meta">
                  <span className="admin-usage__rank-bar-count">{formatCount(item.count)}</span>
                  {trendItem.delta === 0 ? (
                    <span className="admin-usage__rank-bar-delta admin-usage__rank-bar-delta--flat" aria-label="No change vs prior period">
                      —
                    </span>
                  ) : (
                    <span
                      className={`admin-usage__rank-bar-delta admin-usage__rank-bar-delta--${trendItem.delta > 0 ? 'up' : 'down'}`}
                      title={`${formatCount(trendItem.previous)} in prior period`}
                    >
                      {formatRankDeltaBadge(trendItem, trendItem.delta > 0)}
                    </span>
                  )}
                </span>
              ) : (
                <span className="admin-usage__rank-bar-count">{formatCount(item.count)}</span>
              )}
            </div>
            <div className="admin-usage__rank-bar-track" aria-hidden>
              <div className="admin-usage__rank-bar-fill" style={{ width: `${widthPct}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function AdminSectionHeading({
  title,
  icon,
  tone,
  className = 'admin-usage__board-title',
  as: Tag = 'h2',
  id,
  iconSize = 12,
}: {
  title: string;
  icon: IconName;
  tone?: AdminRankBarTone;
  className?: string;
  as?: 'h2' | 'h3';
  id?: string;
  iconSize?: number;
}) {
  const toneClass = tone ? `admin-usage__section-heading--${tone}` : '';
  return (
    <Tag id={id} className={`admin-usage__section-heading ${className} ${toneClass}`.trim()}>
      <span className="admin-usage__section-heading-icon" aria-hidden>
        <Icon name={icon} size={iconSize} />
      </span>
      <span>{title}</span>
    </Tag>
  );
}

export function AdminWindowRangePills({
  value,
  onChange,
  options = [7, 14, 30] as const,
}: {
  value: number;
  onChange: (days: number) => void;
  options?: readonly number[];
}) {
  return (
    <div className="admin-usage__window-chips" role="group" aria-label="Choose time window">
      {options.map((days) => {
        const isActive = value === days;
        return (
          <button
            key={days}
            type="button"
            className={`proto-home-greeting__chip admin-usage__window-chip${isActive ? ' admin-usage__window-chip--active' : ' proto-glass-surface'}`}
            aria-pressed={isActive}
            onClick={() => onChange(days)}
          >
            <span>{days}d</span>
          </button>
        );
      })}
    </div>
  );
}
