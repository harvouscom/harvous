import React from 'react';
import { abbreviateCanonBook } from '@/utils/admin-pulse-heatmap';
import { groupCanonBookCells } from '@/utils/admin-pulse-canon-groups';

export type AdminCanonHeatmapBook = {
  name: string;
  order: number;
  count: number;
  sharePct: number;
  heatLevel: number;
};

function canonHeatBand(level: number): 'none' | 'low' | 'mid' | 'high' {
  if (level <= 0) return 'none';
  if (level < 0.34) return 'low';
  if (level < 0.67) return 'mid';
  return 'high';
}

function CanonHeatmapCell({
  cell,
}: {
  cell: { name: string; count: number; sharePct: number; heatLevel: number };
}) {
  return (
    <div
      role="listitem"
      className="admin-pulse__canon-cell"
      data-active={cell.count > 0 ? 'true' : 'false'}
      data-heat={canonHeatBand(cell.heatLevel)}
      style={{ '--pulse-heat': String(cell.heatLevel) } as React.CSSProperties}
      title={`${cell.name}: ${cell.count.toLocaleString()} notes (${cell.sharePct}% of activity)`}
    >
      <span className="admin-pulse__canon-abbr">{abbreviateCanonBook(cell.name)}</span>
    </div>
  );
}

export default function AdminCanonHeatmap({ books }: { books: AdminCanonHeatmapBook[] }) {
  const ot = books.filter((b) => b.order <= 39);
  const nt = books.filter((b) => b.order > 39);
  const total = books.reduce((sum, b) => sum + b.count, 0);

  if (total === 0) {
    return <p className="admin-usage__muted admin-usage__empty">No scripture activity in this window.</p>;
  }

  const renderTestament = (cells: AdminCanonHeatmapBook[], label: string, testament: 'ot' | 'nt') => (
    <div className="admin-pulse__canon-col">
      <h3 className="admin-usage__subheading admin-usage__subheading--group">{label}</h3>
      <div className="admin-pulse__canon-groups">
        {groupCanonBookCells(cells, testament).map(({ group, cells: groupCells }) => (
          <section
            key={group.id}
            className="admin-pulse__canon-group"
            aria-label={group.label}
            title={group.label}
          >
            <span className="admin-pulse__canon-group-label">{group.label}</span>
            <div className="admin-pulse__canon-grid" role="list">
              {groupCells.map((cell) => (
                <CanonHeatmapCell key={cell.name} cell={cell} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );

  return (
    <div className="admin-pulse__canon-wrap">
      {renderTestament(ot, 'Old Testament', 'ot')}
      {renderTestament(nt, 'New Testament', 'nt')}
    </div>
  );
}
