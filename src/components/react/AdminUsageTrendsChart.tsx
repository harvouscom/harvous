import { useMemo, useState } from 'react';
import type { DailyCount } from '@/hooks/queries/useAdminUsage';
import {
  PROJECTION_HORIZON_DAYS,
  addProjectionDates,
  axisTicks,
  buildLinePath,
  formatTrendTick,
  mergeTrendPoints,
  panelMaxForSeries,
  projectLinearTrend,
  shouldProjectSeries,
  type TrendPoint,
  type TrendSeriesKey,
} from '@/utils/admin-usage-trends-chart';

type PanelSeries = {
  key: TrendSeriesKey;
  label: string;
  className: string;
};

const USERS_SERIES: PanelSeries[] = [
  { key: 'signups', label: 'Signups', className: 'admin-usage__trend-line--signups' },
  { key: 'activeUsers', label: 'Active users', className: 'admin-usage__trend-line--active' },
];

const CONTENT_SERIES: PanelSeries[] = [
  { key: 'notes', label: 'Notes created', className: 'admin-usage__trend-line--notes' },
  { key: 'scripturePills', label: 'Scripture pills', className: 'admin-usage__trend-line--scripture' },
  { key: 'recallOpens', label: 'Recall opens', className: 'admin-usage__trend-line--recall' },
];

const WIDTH = 640;
const PANEL_HEIGHT = 200;
const MARGIN = { top: 12, right: 16, bottom: 28, left: 40 };

type PanelId = 'users' | 'content';

type HoverState = { panel: PanelId; index: number } | null;

function TrendPanel({
  panelId,
  title,
  series,
  points,
  showAllXLabels,
  hovered,
  onHover,
}: {
  panelId: PanelId;
  title: string;
  series: PanelSeries[];
  points: TrendPoint[];
  showAllXLabels: boolean;
  hovered: HoverState;
  onHover: (state: HoverState) => void;
}) {
  const keys = series.map((s) => s.key);
  const yMax = panelMaxForSeries(points, keys);
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = PANEL_HEIGHT - MARGIN.top - MARGIN.bottom;
  const actualCount = Math.max(points.length - 1, 1);
  const projectionCount = PROJECTION_HORIZON_DAYS;
  const totalCount = actualCount + projectionCount;
  const hasProjection = series.some((s) => shouldProjectSeries(points.map((p) => p[s.key])));

  const xAt = (index: number) => MARGIN.left + (index / totalCount) * plotWidth;
  const yAt = (value: number, max: number) => MARGIN.top + plotHeight - (value / max) * plotHeight;
  const ticks = axisTicks(yMax);
  const lastActualIndex = points.length - 1;
  const projectionStartX = xAt(lastActualIndex);

  const panelHovered = hovered?.panel === panelId ? hovered.index : null;
  const hoveredPoint = panelHovered != null ? points[panelHovered] : null;

  return (
    <div className="admin-usage__trend-panel">
      <div className="admin-usage__trend-panel-head">
        <h3 className="admin-usage__trend-panel-title">{title}</h3>
        <div className="admin-usage__trend-legend" aria-hidden>
          {series.map((s) => (
            <span key={s.key} className="admin-usage__trend-legend-item">
              <span className={`admin-usage__trend-legend-swatch ${s.className}`} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="admin-usage__trend-chart-wrap">
        <svg
          className="admin-usage__trend-svg"
          viewBox={`0 0 ${WIDTH} ${PANEL_HEIGHT}`}
          role="img"
          aria-label={`${title} trend chart`}
        >
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={plotWidth}
            height={plotHeight}
            className="admin-usage__trend-plot-bg"
            rx={6}
          />

          {hasProjection ? (
            <rect
              x={projectionStartX}
              y={MARGIN.top}
              width={WIDTH - MARGIN.right - projectionStartX}
              height={plotHeight}
              className="admin-usage__trend-projection-zone"
              rx={0}
            />
          ) : null}

          {ticks.map((tick) => {
            const y = yAt(tick, yMax);
            return (
              <g key={`tick-${tick}`}>
                <line
                  x1={MARGIN.left}
                  x2={WIDTH - MARGIN.right}
                  y1={y}
                  y2={y}
                  className="admin-usage__trend-grid-line"
                />
                <text x={MARGIN.left - 8} y={y + 4} className="admin-usage__trend-axis-label">
                  {formatTrendTick(tick)}
                </text>
              </g>
            );
          })}

          {series.map((s) => {
            const values = points.map((p) => p[s.key]);
            const projected = shouldProjectSeries(values) ? projectLinearTrend(values) : [];
            const actualPath = buildLinePath(values, yMax, xAt, yAt, 0);

            return (
              <g key={s.key}>
                {actualPath ? (
                  <path
                    d={actualPath}
                    className={`admin-usage__trend-line ${s.className}`}
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {projected.length > 0 ? (
                  <path
                    d={buildLinePath(
                      [values[lastActualIndex], ...projected],
                      yMax,
                      xAt,
                      yAt,
                      lastActualIndex,
                    )}
                    className={`admin-usage__trend-line admin-usage__trend-line--projected ${s.className}`}
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
              </g>
            );
          })}

          {panelHovered != null
            ? series.map((s) => {
                const point = points[panelHovered];
                const cx = xAt(panelHovered);
                const cy = yAt(point[s.key], yMax);
                return (
                  <circle
                    key={`${point.date}-${s.key}`}
                    cx={cx}
                    cy={cy}
                    r={4}
                    className={`admin-usage__trend-point ${s.className}`}
                    pointerEvents="none"
                    tabIndex={-1}
                  />
                );
              })
            : null}

          {series.map((s) => {
            const lastValue = points[lastActualIndex]?.[s.key] ?? 0;
            const cx = xAt(lastActualIndex);
            const cy = yAt(lastValue, yMax);
            return (
              <circle
                key={`today-${s.key}`}
                cx={cx}
                cy={cy}
                r={5}
                className={`admin-usage__trend-point admin-usage__trend-point--today ${s.className}`}
                pointerEvents="none"
                tabIndex={-1}
              />
            );
          })}

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
                onMouseEnter={() => onHover({ panel: panelId, index })}
                onMouseLeave={() => onHover(null)}
              />
            );
          })}

          {panelHovered != null ? (
            <line
              x1={xAt(panelHovered)}
              x2={xAt(panelHovered)}
              y1={MARGIN.top}
              y2={MARGIN.top + plotHeight}
              className="admin-usage__trend-hover-line"
            />
          ) : null}

          {points.map((point, index) => {
            if (!showAllXLabels && index % 2 !== 0 && points.length > 10) return null;
            return (
              <text
                key={point.date}
                x={xAt(index)}
                y={PANEL_HEIGHT - 8}
                className="admin-usage__trend-x-label"
                textAnchor="middle"
              >
                {point.label}
              </text>
            );
          })}

          {hasProjection
            ? addProjectionDates(points[lastActualIndex].date, projectionCount).map((date, i) => (
                <text
                  key={date}
                  x={xAt(lastActualIndex + i + 1)}
                  y={PANEL_HEIGHT - 8}
                  className="admin-usage__trend-x-label admin-usage__trend-x-label--projected"
                  textAnchor="middle"
                >
                  {date.slice(5)}
                </text>
              ))
            : null}
        </svg>

        {hoveredPoint ? (
          <div className="admin-usage__trend-tooltip" role="status">
            <p className="admin-usage__trend-tooltip-date">{hoveredPoint.date}</p>
            {series.map((s) => (
              <p key={s.key} className="admin-usage__trend-tooltip-row">
                <span className={`admin-usage__trend-tooltip-swatch ${s.className}`} aria-hidden />
                <span>
                  {s.label}: {hoveredPoint[s.key].toLocaleString()}
                </span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminUsageTrendsChart({
  signups,
  notesCreated,
  activeUsers,
  scripturePillsCreated,
  recallOpens,
  days = 7,
}: {
  signups: DailyCount[];
  notesCreated: DailyCount[];
  activeUsers: DailyCount[];
  scripturePillsCreated: DailyCount[];
  recallOpens: DailyCount[];
  days?: number;
}) {
  const [hovered, setHovered] = useState<HoverState>(null);

  const points = useMemo(
    () => mergeTrendPoints(signups, notesCreated, activeUsers, scripturePillsCreated, recallOpens, days),
    [signups, notesCreated, activeUsers, scripturePillsCreated, recallOpens, days],
  );

  const showAllXLabels = days <= 14;
  const hasAnyProjection = useMemo(
    () =>
      [...USERS_SERIES, ...CONTENT_SERIES].some((s) =>
        shouldProjectSeries(points.map((p) => p[s.key])),
      ),
    [points],
  );

  if (points.length === 0) {
    return <p className="admin-usage__muted admin-usage__empty pds-caption">No trend data yet.</p>;
  }

  return (
    <div className="admin-usage__trend-chart">
      <div className="admin-usage__trend-panels">
        <TrendPanel
          panelId="users"
          title="Users"
          series={USERS_SERIES}
          points={points}
          showAllXLabels={showAllXLabels}
          hovered={hovered}
          onHover={setHovered}
        />
        <TrendPanel
          panelId="content"
          title="Content"
          series={CONTENT_SERIES}
          points={points}
          showAllXLabels={showAllXLabels}
          hovered={hovered}
          onHover={setHovered}
        />
      </div>
      {hasAnyProjection ? (
        <p className="admin-usage__muted admin-usage__trend-projection-note pds-caption">
          Dashed lines = simple linear trend (not a forecast guarantee).
        </p>
      ) : null}
    </div>
  );
}
