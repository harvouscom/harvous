/**
 * Utility function to format badge counts
 * Shows "99+" for counts over 99 to prevent overflow in fixed-size badges
 */
export function formatBadgeCount(count: number | null | undefined): string {
  const num = count ?? 0;
  if (num > 99) {
    return '99+';
  }
  return String(num);
}
