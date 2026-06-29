import type { PulseHistoryMonth } from '@/hooks/queries/useAdminPulse';
import { axisTicks, buildLinePath, niceMax } from '@/utils/admin-usage-trends-chart';

const BOOK_COLORS = ['var(--pds-accent-blue)', 'var(--pds-accent-green)', 'var(--pds-accent-orange)'];

function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-');
  const d = new Date(Number(year), Number(m) - 1, 1);
  return d.toLocaleString('en-US', { month: 'short' });
}

export default function AdminPulseHistoryChart({ history }: { history: PulseHistoryMonth[] }) {
  const bookNames = new Set<string>();
  for (const row of history) {
    for (const book of row.books) bookNames.add(book.name);
  }
  const series = [...bookNames].slice(0, 3);
  if (series.length === 0 || history.length === 0) {
    return <p className="admin-usage__muted admin-usage__empty">No monthly book history yet. Run aggregate analytics.</p>;
  }

  const width = 640;
  const height = 200;
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const pointsByBook = series.map((book) =>
    history.map((row) => row.books.find((b) => b.name === book)?.count ?? 0),
  );
  const max = niceMax(Math.max(...pointsByBook.flat(), 1));
  const xAt = (index: number) => padL + (history.length <= 1 ? plotW / 2 : (index / (history.length - 1)) * plotW);
  const yAt = (value: number, ceiling: number) => padT + plotH - (value / ceiling) * plotH;

  return (
    <div className="admin-pulse__history-chart" role="img" aria-label="Top books by month">
      <svg viewBox={`0 0 ${width} ${height}`} className="admin-pulse__history-svg">
        {axisTicks(max).map((tick) => {
          const y = yAt(tick, max);
          return (
            <g key={tick}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} className="admin-pulse__history-grid" />
              <text x={padL - 6} y={y + 4} textAnchor="end" className="admin-pulse__history-tick">
                {tick}
              </text>
            </g>
          );
        })}
        {pointsByBook.map((values, seriesIndex) => (
          <path
            key={series[seriesIndex]}
            d={buildLinePath(values, max, xAt, yAt)}
            fill="none"
            stroke={BOOK_COLORS[seriesIndex % BOOK_COLORS.length]}
            strokeWidth={2}
          />
        ))}
        {history.map((row, index) => (
          <text
            key={row.month}
            x={xAt(index)}
            y={height - 6}
            textAnchor="middle"
            className="admin-pulse__history-tick"
          >
            {formatMonthLabel(row.month)}
          </text>
        ))}
      </svg>
      <ul className="admin-pulse__history-legend">
        {series.map((book, index) => (
          <li key={book}>
            <span
              className="admin-pulse__history-swatch"
              style={{ background: BOOK_COLORS[index % BOOK_COLORS.length] }}
              aria-hidden
            />
            {book}
          </li>
        ))}
      </ul>
    </div>
  );
}
