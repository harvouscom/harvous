/**
 * Utility function to format badge counts.
 * Shows "99+" for counts over 99; badges use a pill that grows horizontally (see `.badge-count` in navigation.css).
 */
export function formatBadgeCount(count: number | null | undefined): string {
  const num = count ?? 0;
  if (num > 99) {
    return '99+';
  }
  return String(num);
}
