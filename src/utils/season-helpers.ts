/**
 * Season Helper Utilities
 * 
 * Handles season detection and formatting for the seasonal XP system.
 * Seasons: Spring (Mar-May), Summer (Jun-Aug), Fall (Sep-Nov), Winter (Dec-Feb)
 */

/**
 * Get current season identifier (e.g., "spring-2025")
 * Winter spans Dec (current year) - Feb (next year), assigned to the year that December belongs to
 */
export function getCurrentSeason(): string {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  
  if (month >= 3 && month <= 5) return `spring-${year}`;
  if (month >= 6 && month <= 8) return `summer-${year}`;
  if (month >= 9 && month <= 11) return `fall-${year}`;
  // Winter: Dec (current year), Jan, Feb (next year)
  // Assign to the year that December belongs to (so Dec 2025 shows "Winter 2025")
  if (month === 12) return `winter-${year}`; // December belongs to current year's winter
  return `winter-${year - 1}`; // Jan, Feb belong to previous year's winter
}

/**
 * Get formatted season name for display (e.g., "Spring 2025")
 */
export function getSeasonDisplayName(season?: string): string {
  const currentSeason = season || getCurrentSeason();
  const [seasonName, year] = currentSeason.split('-');
  
  const capitalized = seasonName.charAt(0).toUpperCase() + seasonName.slice(1);
  return `${capitalized} ${year}`;
}

/**
 * Get season start date
 */
export function getSeasonStart(season?: string): Date {
  const currentSeason = season || getCurrentSeason();
  const [seasonName, year] = currentSeason.split('-');
  const yearNum = parseInt(year);
  
  let month = 0; // 0-indexed
  if (seasonName === 'spring') month = 2; // March
  else if (seasonName === 'summer') month = 5; // June
  else if (seasonName === 'fall') month = 8; // September
  else {
    // Winter: season identifier is for the year that December belongs to
    // Winter starts in December of that year
    month = 11; // December
    return new Date(yearNum, month, 1); // December of that year
  }
  
  return new Date(yearNum, month, 1);
}

/** Last day of season (local midnight, inclusive). */
export function getSeasonEnd(season?: string): Date {
  const currentSeason = season || getCurrentSeason();
  const [seasonName, year] = currentSeason.split('-');
  const yearNum = parseInt(year, 10);

  if (seasonName === 'spring') return new Date(yearNum, 4, 31);
  if (seasonName === 'summer') return new Date(yearNum, 7, 31);
  if (seasonName === 'fall') return new Date(yearNum, 10, 30);
  // Winter ends last day of February in the year after December
  return new Date(yearNum + 1, 1, 28);
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Calendar month key `YYYY-MM` → season id (e.g. `2026-01` → `winter-2025`). */
export function getSeasonForMonth(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (month >= 3 && month <= 5) return `spring-${year}`;
  if (month >= 6 && month <= 8) return `summer-${year}`;
  if (month >= 9 && month <= 11) return `fall-${year}`;
  if (month === 12) return `winter-${year}`;
  return `winter-${year - 1}`;
}

/** Calendar months in a season (`YYYY-MM` keys, chronological). */
export function getSeasonMonths(seasonId: string): string[] {
  const [seasonName, yearStr] = seasonId.split('-');
  const year = parseInt(yearStr, 10);
  if (seasonName === 'spring') {
    return [`${year}-03`, `${year}-04`, `${year}-05`];
  }
  if (seasonName === 'summer') {
    return [`${year}-06`, `${year}-07`, `${year}-08`];
  }
  if (seasonName === 'fall') {
    return [`${year}-09`, `${year}-10`, `${year}-11`];
  }
  return [`${year}-12`, `${year + 1}-01`, `${year + 1}-02`];
}

/** Four season ids for admin year browsing (spring through winter of calendar year). */
export function listSeasonsForYear(year: number): string[] {
  return [`spring-${year}`, `summer-${year}`, `fall-${year}`, `winter-${year}`];
}

/** Display label for `YYYY-MM` (e.g. "Mar 2026"). */
export function formatMonthLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const month = parseInt(monthStr, 10);
  const name = MONTH_NAMES[month - 1] ?? monthStr;
  return `${name} ${yearStr}`;
}

/** Calendar year from `YYYY-MM`. */
export function getCalendarYearFromMonth(monthKey: string): number {
  return parseInt(monthKey.split('-')[0], 10);
}

/** First calendar month shown in admin Reports (platform reporting launch). */
export const ADMIN_REPORTS_FIRST_MONTH = '2026-06';

export function compareMonthKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Whether a month appears in the Reports catalog (UI + year/season browsing). */
export function isAdminReportMonthInCatalog(monthKey: string): boolean {
  return compareMonthKeys(monthKey, ADMIN_REPORTS_FIRST_MONTH) >= 0;
}

/** Season ids for a calendar year that include at least one in-catalog month. */
export function listReportCatalogSeasonsForYear(year: number): string[] {
  return listSeasonsForYear(year).filter((seasonId) =>
    getSeasonMonths(seasonId).some(isAdminReportMonthInCatalog),
  );
}

export type AdminReportMonthUngeneratedKind = 'upcoming' | 'collecting' | 'scheduled' | 'missing';

export type AdminReportMonthStatus =
  | { kind: 'generated'; label: string }
  | { kind: AdminReportMonthUngeneratedKind; label: string; title: string };

/** UTC calendar month key for a date (`YYYY-MM`). */
export function getUtcMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** When the monthly analytics job snapshots a completed month (1st of next month, 02:00 UTC). */
export function getAdminReportSnapshotDueAt(monthKey: string): Date {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  return new Date(Date.UTC(year, month, 1, 2, 0, 0, 0));
}

function formatAdminReportSnapshotDueLabel(dueAt: Date): string {
  const name = MONTH_NAMES[dueAt.getUTCMonth()] ?? '';
  return `${name} ${dueAt.getUTCDate()}, 2:00 UTC`;
}

/** Human-readable badge + tooltip for a catalog month row. */
export function getAdminReportMonthStatus(
  monthKey: string,
  generatedAt: string | null,
  now = new Date(),
): AdminReportMonthStatus {
  if (generatedAt) {
    const label = new Date(generatedAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    return { kind: 'generated', label };
  }

  const currentMonth = getUtcMonthKey(now);
  const monthCmp = compareMonthKeys(monthKey, currentMonth);
  const dueAt = getAdminReportSnapshotDueAt(monthKey);
  const dueLabel = formatAdminReportSnapshotDueLabel(dueAt);

  if (monthCmp > 0) {
    return {
      kind: 'upcoming',
      label: 'Upcoming',
      title: 'This month has not started yet.',
    };
  }

  if (monthCmp === 0) {
    return {
      kind: 'collecting',
      label: 'In progress',
      title: `Still collecting metrics. Auto-snapshot ${dueLabel}.`,
    };
  }

  if (now < dueAt) {
    return {
      kind: 'scheduled',
      label: `Auto ${dueLabel.replace(', 2:00 UTC', ' UTC')}`,
      title: `Scheduled auto-snapshot ${dueLabel}.`,
    };
  }

  return {
    kind: 'missing',
    label: 'Backfill in Maintenance',
    title: `Expected snapshot by ${dueLabel} did not run. Regenerate from Admin → Maintenance.`,
  };
}
