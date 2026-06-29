import { useMemo, useState } from 'react';
import type { DailyCount } from '@/hooks/queries/useAdminUsage';

type TrendPoint = {
  date: string;
  label: string;
  signups: number;
  notes: number;
  activeUsers: number;
  scripturePills: number;
};

type SeriesKey = 'signups' | 'notes' | 'activeUsers' | 'scripturePills';

const LEFT_SERIES: { key: SeriesKey; label: string; className: string }[] = [
  { key: 'signups', label: 'Signups', className: 'admin-usage__trend-line--signups' },
  { key: 'activeUsers', label: 'Active users', className: 'admin-usage__trend-line--active' },
];

const RIGHT_SERIES: { key: SeriesKey; label: string; className: string }[] = [
  { key: 'notes', label: 'Notes created', className: 'admin-usage__trend-line--notes' },
  { key: 'scripturePills', label: 'Scripture pills', className: 'admin-usage__trend-line--scripture' },
];

const SERIES = [
  ...LEFT_SERIES.map((series) => ({ ...series, axis: 'left' as const })),
  ...RIGHT_SERIES.map((series) => ({ ...series, axis: 'right' as const })),
];

const WIDTH = 640;
const HEIGHT = 240;
const MARGIN = { top: 14, right: 42, bottom: 30, left: 34 };

function mergeTrendPoints(
  signups: DailyCount[],
  notesCreated: DailyCount[],
  activeUsers: DailyCount[],
  scripturePillsCreated: DailyCount[],
  days: number,
): TrendPoint[] {
  const recent = signups.slice(-days);
  const notesByDate = new Map(notesCreated.map((r) => [r.date, r.count]));
  const activeByDate = new Map(activeUsers.map((r) => [r.date, r.count]));
  const scriptureByDate = new Map(scripturePillsCreated.map((r) => [r.date, r.count]));
  return recent.map((row) => ({
    date: row.date,
    label: row.date.slice(5),
    signups: row.count,
    notes: notesByDate.get(row.date) ?? 0,
    activeUsers: activeByDate.get(row.date) ?? 0,
    scripturePills: scriptureByDate.get(row.date) ?? 0,
  }));
}

function niceMax(value: number): number {
  if (value <= 0) return 5;
  if (value <= 5) return 5;
  if (value <= 10) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function buildLinePath(values: number[], max: number, xAt: (index: number) => number, yAt: (value: number, max: number) => number): string {
  if (values.length === 0) return '';
  return values
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index).toFixed(2)} ${yAt(value, max).toFixed(2)}`)
    .join(' ');
}

function axisTicks(max: number, count = 4): number[] {
  const step = max / count;
  return Array.from({ length: count + 1 }, (_, i) => Math.round(step * i));
}

export default function AdminUsageTrendsChart({
  signups,
  notesCreated,
  activeUsers,
  scripturePillsCreated,
  days = 14,
}: {
  signups: DailyCount[];
  notesCreated: DailyCount[];
  activeUsers: DailyCount[];
  scripturePillsCreated: DailyCount[];
  days?: number;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const points = useMemo(
    () => mergeTrendPoints(signups, notesCreated, activeUsers, scripturePillsCreated, days),
    [signups, notesCreated, activeUsers, scripturePillsCreated, days],
  );

  const { leftMax, rightMax, plotWidth, plotHeight, xAt, yLeft, yRight } = useMemo(() => {
    const leftRaw = Math.max(1, ...points.map((p) => Math.max(p.signups, p.activeUsers)));
    const rightRaw = Math.max(1, ...points.map((p) => Math.max(p.notes, p.scripturePills)));
    const left = niceMax(leftRaw);
    const right = niceMax(rightRaw);
    const plotW = WIDTH - MARGIN.left - MARGIN.right;
    const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const count = Math.max(points.length - 1, 1);

    return {
      leftMax: left,
      rightMax: right,
      plotWidth: plotW,
      plotHeight: plotH,
      xAt: (index: number) => MARGIN.left + (index / count) * plotW,
      yLeft: (value: number, max: number) => MARGIN.top + plotH - (value / max) * plotH,
      yRight: (value: number, max: number) => MARGIN.top + plotH - (value / max) * plotH,
    };
  }, [points]);

  const leftTicks = axisTicks(leftMax);
  const rightTicks = axisTicks(rightMax);
  const hovered = hoveredIndex != null ? points[hoveredIndex] : null;

  if (points.length === 0) {
    return <p className="admin-usage__muted admin-usage__empty pds-caption">No trend data yet.</p>;
  }

  return (
    <div className="admin-usage__trend-chart">
      <div className="admin-usage__trend-legend" aria-hidden>
        <div className="admin-usage__trend-legend-group">
          <span className="admin-usage__trend-legend-axis admin-usage__trend-legend-axis--left">Users</span>
          {LEFT_SERIES.map((series) => (
            <span key={series.key} className="admin-usage__trend-legend-item">
              <span className={`admin-usage__trend-legend-swatch ${series.className}`} />
              {series.label}
            </span>
          ))}
        </div>
        <div className="admin-usage__trend-legend-group">
          <span className="admin-usage__trend-legend-axis admin-usage__trend-legend-axis--right">Content</span>
          {RIGHT_SERIES.map((series) => (
            <span key={series.key} className="admin-usage__trend-legend-item">
              <span className={`admin-usage__trend-legend-swatch ${series.className}`} />
              {series.label}
            </span>
          ))}
        </div>
      </div>

      <div className="admin-usage__trend-chart-wrap">
        <svg
          className="admin-usage__trend-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Multi-line trend chart for signups, notes created, active users, and scripture pills"
        >
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={plotWidth}
            height={plotHeight}
            className="admin-usage__trend-plot-bg"
            rx={6}
          />

          {leftTicks.map((tick) => {
            const y = yLeft(tick, leftMax);
            return (
              <g key={`left-${tick}`}>
                <line
                  x1={MARGIN.left}
                  x2={WIDTH - MARGIN.right}
                  y1={y}
                  y2={y}
                  className="admin-usage__trend-grid-line"
                />
                <text x={MARGIN.left - 8} y={y + 4} className="admin-usage__trend-axis-label admin-usage__trend-axis-label--left">
                  {tick}
                </text>
              </g>
            );
          })}

          {rightTicks.map((tick) => {
            const y = yRight(tick, rightMax);
            return (
              <text
                key={`right-${tick}`}
                x={WIDTH - MARGIN.right + 8}
                y={y + 4}
                className="admin-usage__trend-axis-label admin-usage__trend-axis-label--right"
              >
                {tick}
              </text>
            );
          })}

          {SERIES.map((series) => {
            const max = series.axis === 'left' ? leftMax : rightMax;
            const yAt = series.axis === 'left' ? yLeft : yRight;
            const values = points.map((p) => p[series.key]);
            return (
              <path
                key={series.key}
                d={buildLinePath(values, max, xAt, yAt)}
                className={`admin-usage__trend-line ${series.className}`}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {hoveredIndex != null
            ? SERIES.map((series) => {
                const point = points[hoveredIndex];
                const max = series.axis === 'left' ? leftMax : rightMax;
                const yAt = series.axis === 'left' ? yLeft : yRight;
                const cx = xAt(hoveredIndex);
                const cy = yAt(point[series.key], max);
                return (
                  <circle
                    key={`${point.date}-${series.key}`}
                    cx={cx}
                    cy={cy}
                    r={4}
                    className={`admin-usage__trend-point ${series.className}`}
                    pointerEvents="none"
                    tabIndex={-1}
                  />
                );
              })
            : null}

          {points.map((point, index) => {
            const bandWidth = plotWidth / Math.max(points.length - 1, 1);
            return (
              <rect
                key={`hover-${point.date}`}
                x={xAt(index) - bandWidth / 2}
                y={MARGIN.top}
                width={bandWidth}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            );
          })}

          {hoveredIndex != null ? (
            <line
              x1={xAt(hoveredIndex)}
              x2={xAt(hoveredIndex)}
              y1={MARGIN.top}
              y2={MARGIN.top + plotHeight}
              className="admin-usage__trend-hover-line"
            />
          ) : null}

          {points.map((point, index) => {
            if (index % 2 !== 0 && points.length > 10) return null;
            return (
              <text
                key={point.date}
                x={xAt(index)}
                y={HEIGHT - 8}
                className="admin-usage__trend-x-label"
                textAnchor="middle"
              >
                {point.label}
              </text>
            );
          })}
        </svg>

        {hovered ? (
          <div className="admin-usage__trend-tooltip" role="status">
            <p className="admin-usage__trend-tooltip-date">{hovered.date}</p>
            {SERIES.map((series) => (
              <p key={series.key} className="admin-usage__trend-tooltip-row">
                <span className={`admin-usage__trend-tooltip-swatch ${series.className}`} aria-hidden />
                <span>
                  {series.label}: {hovered[series.key].toLocaleString()}
                </span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
