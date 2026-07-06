/**
 * Generate and list stored admin monthly reports.
 */

import { db, AdminMonthlyReports, eq, desc } from '../db';
import { nowISO } from '../db/dates';
import { adminCalendarMonthRange } from './admin-calendar-range';
import { getUsageOverviewForRange } from './admin-usage-stats';
import { getAdminPulseXpForRange } from './admin-pulse-xp-stats';
import { getPulseReportMetrics, getMonthlyAnalyticsForReport } from './admin-pulse-stats';
import type {
  AdminMonthlyReportPayload,
  AdminReportCatalog,
  AdminReportCatalogMonth,
  AdminReportCatalogSeason,
  AdminReportCatalogYear,
} from './admin-report-types';
import {
  formatMonthLabel,
  getSeasonDisplayName,
  getSeasonForMonth,
  getSeasonMonths,
  getCalendarYearFromMonth,
  isAdminReportMonthInCatalog,
  listReportCatalogSeasonsForYear,
  ADMIN_REPORTS_FIRST_MONTH,
} from '@/utils/season-helpers';

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

export function isValidMonthKey(month: string): boolean {
  return MONTH_KEY_RE.test(month);
}

export async function buildMonthlyReportPayload(month: string): Promise<AdminMonthlyReportPayload> {
  if (!isValidMonthKey(month)) {
    throw new Error(`Invalid month key: ${month}`);
  }

  const { since, until } = adminCalendarMonthRange(month);
  const seasonId = getSeasonForMonth(month);
  const generatedAt = new Date().toISOString();

  const [usage, pulseRaw, xpRaw, monthlyAnalytics] = await Promise.all([
    getUsageOverviewForRange(since, until, { omitPassageEngagement: true }),
    getPulseReportMetrics(since, until),
    getAdminPulseXpForRange(since, until),
    getMonthlyAnalyticsForReport(month),
  ]);

  return {
    month,
    seasonId,
    seasonName: getSeasonDisplayName(seasonId),
    generatedAt,
    usage,
    pulse: {
      uniquePassages: pulseRaw.uniquePassages,
      books: pulseRaw.books,
      themes: pulseRaw.themes,
      passages: pulseRaw.passages,
      tags: pulseRaw.tags,
      translations: pulseRaw.translations,
      monthlyAnalytics,
      curiosity: pulseRaw.curiosity,
      canon: pulseRaw.canon,
      threads: {
        totalThreads: pulseRaw.threads.summary.totalThreads,
        avgNotesPerThread: pulseRaw.threads.summary.avgNotesPerThread,
        linksCreated: pulseRaw.threads.summary.linksCreated,
      },
      xp: {
        totalXp: xpRaw.totalXp,
        eventCount: xpRaw.eventCount,
        users: xpRaw.users,
        avgXpPerUser: xpRaw.avgXpPerUser,
        byActivity: xpRaw.byActivity.map((row) => ({
          label: row.label,
          totalXp: row.totalXp,
          eventCount: row.eventCount,
          users: row.users,
        })),
      },
    },
  };
}

export async function generateAdminMonthlyReport(month: string): Promise<AdminMonthlyReportPayload | null> {
  if (!isAdminReportMonthInCatalog(month)) {
    return null;
  }
  const payload = await buildMonthlyReportPayload(month);
  const seasonId = getSeasonForMonth(month);
  const existing = await db
    .select()
    .from(AdminMonthlyReports)
    .where(eq(AdminMonthlyReports.month, month))
    .limit(1);

  const row = {
    id: existing[0]?.id ?? `admin_report_${month}_${Date.now()}`,
    month,
    seasonId,
    generatedAt: nowISO(),
    payload: JSON.stringify(payload),
  };

  if (existing[0]) {
    await db.update(AdminMonthlyReports).set(row).where(eq(AdminMonthlyReports.id, existing[0].id));
  } else {
    await db.insert(AdminMonthlyReports).values(row);
  }

  return payload;
}

export function parseReportPayload(raw: string): AdminMonthlyReportPayload {
  return JSON.parse(raw) as AdminMonthlyReportPayload;
}

export async function getStoredMonthlyReport(month: string): Promise<AdminMonthlyReportPayload | null> {
  const rows = await db
    .select()
    .from(AdminMonthlyReports)
    .where(eq(AdminMonthlyReports.month, month))
    .limit(1);
  if (!rows[0]) return null;
  return parseReportPayload(rows[0].payload);
}

export async function getStoredMonthlyReports(months: string[]): Promise<Map<string, AdminMonthlyReportPayload>> {
  if (months.length === 0) return new Map();
  const rows = await db.select().from(AdminMonthlyReports).orderBy(desc(AdminMonthlyReports.month));
  const wanted = new Set(months);
  const map = new Map<string, AdminMonthlyReportPayload>();
  for (const row of rows) {
    if (!wanted.has(row.month)) continue;
    map.set(row.month, parseReportPayload(row.payload));
  }
  return map;
}

function catalogGeneratedAt(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function buildCatalogMonth(month: string, generatedAt: string | null): AdminReportCatalogMonth {
  return { month, label: formatMonthLabel(month), generatedAt };
}

function yearsFromStoredRows(
  storedByMonth: Map<string, { generatedAt: Date }>,
  minYear: number,
  maxYear: number,
): AdminReportCatalogYear[] {
  const years: AdminReportCatalogYear[] = [];

  for (let year = maxYear; year >= minYear; year -= 1) {
    const seasons: AdminReportCatalogSeason[] = listReportCatalogSeasonsForYear(year)
      .map((seasonId) => {
        const months = getSeasonMonths(seasonId)
          .filter(isAdminReportMonthInCatalog)
          .map((month) => {
            const stored = storedByMonth.get(month);
            return buildCatalogMonth(month, stored ? catalogGeneratedAt(stored.generatedAt) : null);
          });
        return {
          seasonId,
          seasonName: getSeasonDisplayName(seasonId),
          months,
        };
      })
      .filter((season) => season.months.length > 0);
    if (seasons.length > 0) {
      years.push({ year, seasons });
    }
  }

  return years;
}

export async function listAdminReportsCatalog(): Promise<AdminReportCatalog> {
  const rows = await db.select().from(AdminMonthlyReports).orderBy(desc(AdminMonthlyReports.month));
  const storedByMonth = new Map<string, { generatedAt: Date }>();
  for (const row of rows) {
    storedByMonth.set(row.month, { generatedAt: row.generatedAt });
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const firstReportYear = getCalendarYearFromMonth(ADMIN_REPORTS_FIRST_MONTH);
  let minYear = firstReportYear;
  for (const row of rows) {
    if (!isAdminReportMonthInCatalog(row.month)) continue;
    const year = getCalendarYearFromMonth(row.month);
    if (year < minYear) minYear = year;
  }

  return { years: yearsFromStoredRows(storedByMonth, minYear, currentYear) };
}

export async function listAllStoredReportMonths(): Promise<string[]> {
  const rows = await db
    .select({ month: AdminMonthlyReports.month })
    .from(AdminMonthlyReports)
    .orderBy(desc(AdminMonthlyReports.month));
  return rows.map((r) => r.month);
}
