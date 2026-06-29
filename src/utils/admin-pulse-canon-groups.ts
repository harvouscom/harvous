/** Protestant canon sections — shared by Admin Pulse and the memory layer (fingerprints, arcs, recall). */

import { canonicalBookOrder } from '@/utils/scripture-osis';

export type CanonBookGroup = {
  id: string;
  label: string;
  orderStart: number;
  orderEnd: number;
  testament: 'ot' | 'nt';
};

export const CANON_BOOK_GROUPS: CanonBookGroup[] = [
  { id: 'law', label: 'Law', orderStart: 1, orderEnd: 5, testament: 'ot' },
  { id: 'history', label: 'History', orderStart: 6, orderEnd: 17, testament: 'ot' },
  { id: 'wisdom', label: 'Wisdom', orderStart: 18, orderEnd: 22, testament: 'ot' },
  { id: 'major-prophets', label: 'Major prophets', orderStart: 23, orderEnd: 27, testament: 'ot' },
  { id: 'minor-prophets', label: 'Minor prophets', orderStart: 28, orderEnd: 39, testament: 'ot' },
  { id: 'gospels', label: 'Gospels', orderStart: 40, orderEnd: 43, testament: 'nt' },
  { id: 'acts', label: 'Acts', orderStart: 44, orderEnd: 44, testament: 'nt' },
  { id: 'paul', label: "Paul's letters", orderStart: 45, orderEnd: 57, testament: 'nt' },
  { id: 'general-epistles', label: 'General letters', orderStart: 58, orderEnd: 65, testament: 'nt' },
  { id: 'revelation', label: 'Revelation', orderStart: 66, orderEnd: 66, testament: 'nt' },
];

export function canonGroupForBookOrder(order: number): CanonBookGroup | null {
  if (!Number.isFinite(order) || order < 1) return null;
  return CANON_BOOK_GROUPS.find((group) => order >= group.orderStart && order <= group.orderEnd) ?? null;
}

export function canonGroupForBook(book: string): CanonBookGroup | null {
  const order = canonicalBookOrder(book);
  if (!Number.isFinite(order)) return null;
  return canonGroupForBookOrder(order);
}

export type DominantCanonProfile = {
  sectionId: string | null;
  sectionLabel: string | null;
  testament: 'ot' | 'nt' | null;
  /** All section ids present, canonical group order. */
  sectionIds: string[];
};

/**
 * Derive dominant canon section + testament from cited passage books. Counts each book occurrence;
 * ties break by lower canonical book order (earlier in the Bible wins).
 */
export function dominantCanonProfile(books: string[]): DominantCanonProfile {
  const empty: DominantCanonProfile = {
    sectionId: null,
    sectionLabel: null,
    testament: null,
    sectionIds: [],
  };
  if (books.length === 0) return empty;

  const sectionCounts = new Map<string, number>();
  const testamentCounts: Record<'ot' | 'nt', number> = { ot: 0, nt: 0 };
  const sectionOrder = new Map<string, number>();

  for (const book of books) {
    const group = canonGroupForBook(book);
    if (!group) continue;
    sectionCounts.set(group.id, (sectionCounts.get(group.id) ?? 0) + 1);
    testamentCounts[group.testament] += 1;
    const order = canonicalBookOrder(book);
    if (Number.isFinite(order)) {
      const prev = sectionOrder.get(group.id);
      if (prev == null || order < prev) sectionOrder.set(group.id, order);
    }
  }

  if (sectionCounts.size === 0) return empty;

  const sectionIds = CANON_BOOK_GROUPS.filter((g) => sectionCounts.has(g.id)).map((g) => g.id);

  let bestId: string | null = null;
  let bestCount = 0;
  let bestOrder = Infinity;
  for (const [id, count] of sectionCounts) {
    const order = sectionOrder.get(id) ?? Infinity;
    if (count > bestCount || (count === bestCount && order < bestOrder)) {
      bestId = id;
      bestCount = count;
      bestOrder = order;
    }
  }

  const dominant = bestId ? CANON_BOOK_GROUPS.find((g) => g.id === bestId) ?? null : null;
  let testament: 'ot' | 'nt' | null = null;
  if (testamentCounts.ot > testamentCounts.nt) testament = 'ot';
  else if (testamentCounts.nt > testamentCounts.ot) testament = 'nt';
  else testament = dominant?.testament ?? null;

  return {
    sectionId: dominant?.id ?? null,
    sectionLabel: dominant?.label ?? null,
    testament,
    sectionIds,
  };
}

export function groupCanonBookCells<T extends { order: number }>(
  cells: T[],
  testament: 'ot' | 'nt',
): { group: CanonBookGroup; cells: T[] }[] {
  const byOrder = new Map(cells.map((cell) => [cell.order, cell]));
  return CANON_BOOK_GROUPS.filter((group) => group.testament === testament).map((group) => ({
    group,
    cells: Array.from({ length: group.orderEnd - group.orderStart + 1 }, (_, index) =>
      byOrder.get(group.orderStart + index),
    ).filter((cell): cell is T => cell != null),
  }));
}

export type CanonGroupStat = {
  id: string;
  label: string;
  testament: 'ot' | 'nt';
  count: number;
  sharePct: number;
};

export function aggregateCanonGroupCounts(
  bookCounts: { name: string; count: number }[],
): CanonGroupStat[] {
  const orderToCount = new Map<number, number>();
  for (const row of bookCounts) {
    const order = canonicalBookOrder(row.name);
    if (!Number.isFinite(order)) continue;
    orderToCount.set(order, (orderToCount.get(order) ?? 0) + row.count);
  }

  const total = [...orderToCount.values()].reduce((sum, count) => sum + count, 0);

  return CANON_BOOK_GROUPS.map((group) => {
    let count = 0;
    for (let order = group.orderStart; order <= group.orderEnd; order += 1) {
      count += orderToCount.get(order) ?? 0;
    }
    return {
      id: group.id,
      label: group.label,
      testament: group.testament,
      count,
      sharePct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    };
  });
}
