import { bookByOrder, canonicalBookOrder } from '@/utils/scripture-osis';

export type CanonBookCell = {
  name: string;
  order: number;
  count: number;
  sharePct: number;
  heatLevel: number;
};

export type BookCountInput = { name: string; count: number };

/** All 66 canonical books in order, with zero-filled counts. */
export function buildCanonBookGrid(counts: BookCountInput[]): CanonBookCell[] {
  const countByBook = new Map<string, number>();
  for (const row of counts) {
    countByBook.set(row.name, row.count);
  }

  const cells: CanonBookCell[] = [];
  for (let order = 1; order <= 66; order += 1) {
    const name = bookByOrder(order);
    if (!name) continue;
    cells.push({
      name,
      order,
      count: countByBook.get(name) ?? 0,
      sharePct: 0,
      heatLevel: 0,
    });
  }

  return applyHeatLevels(cells);
}

/** Normalize counts to 0–1 heat intensity; assign share % of total activity. */
export function applyHeatLevels(cells: CanonBookCell[]): CanonBookCell[] {
  const total = cells.reduce((sum, cell) => sum + cell.count, 0);
  const max = cells.reduce((m, cell) => Math.max(m, cell.count), 0);

  return cells.map((cell) => ({
    ...cell,
    sharePct: total > 0 ? Math.round((cell.count / total) * 1000) / 10 : 0,
    heatLevel: max > 0 ? cell.count / max : 0,
  }));
}

/** Short label for heatmap cells (e.g. "1 Cor", "Ps"). */
export function abbreviateCanonBook(name: string): string {
  const parts = name.split(' ');
  if (parts.length === 1) {
    if (name === 'Psalms') return 'Ps';
    if (name === 'Song of Solomon') return 'Song';
    if (name === 'Ecclesiastes') return 'Eccl';
    if (name === 'Lamentations') return 'Lam';
    if (name === 'Revelation') return 'Rev';
    return name.length > 8 ? name.slice(0, 6) : name;
  }
  const num = parts[0];
  const rest = parts.slice(1).join(' ');
  const short =
    rest === 'Samuel'
      ? 'Sam'
      : rest === 'Kings'
        ? 'Kgs'
        : rest === 'Chronicles'
          ? 'Chr'
          : rest === 'Corinthians'
            ? 'Cor'
            : rest === 'Thessalonians'
              ? 'Thess'
              : rest === 'Timothy'
                ? 'Tim'
                : rest.slice(0, 4);
  return `${num} ${short}`;
}

export function sortBookCounts(counts: BookCountInput[]): BookCountInput[] {
  return [...counts].sort(
    (a, b) => canonicalBookOrder(a.name) - canonicalBookOrder(b.name) || a.name.localeCompare(b.name),
  );
}
