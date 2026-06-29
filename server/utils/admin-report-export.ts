/**
 * CSV / JSON export for admin monthly reports.
 */

import type { AdminMonthlyReportPayload, AdminReportRollup } from './admin-report-types';

export type AdminReportExportRow = {
  scope: string;
  scopeId: string;
  section: string;
  metric: string;
  value: string | number;
};

function pushMetric(
  rows: AdminReportExportRow[],
  scope: string,
  scopeId: string,
  section: string,
  metric: string,
  value: string | number,
): void {
  rows.push({ scope, scopeId, section, metric, value });
}

function payloadToRows(scope: string, scopeId: string, payload: AdminMonthlyReportPayload): AdminReportExportRow[] {
  const rows: AdminReportExportRow[] = [];
  const { usage, pulse } = payload;

  pushMetric(rows, scope, scopeId, 'usage', 'signups', usage.signups);
  pushMetric(rows, scope, scopeId, 'usage', 'activeUsers', usage.activeUsers);
  pushMetric(rows, scope, scopeId, 'usage', 'notesCreated', usage.notesCreated);
  pushMetric(rows, scope, scopeId, 'usage', 'notesEdited', usage.notesEdited);
  pushMetric(rows, scope, scopeId, 'usage', 'scripturePills', usage.scripturePills);
  pushMetric(rows, scope, scopeId, 'recall', 'opens', usage.recall.opens);
  pushMetric(rows, scope, scopeId, 'recall', 'snoozes', usage.recall.snoozes);
  pushMetric(rows, scope, scopeId, 'pulse', 'uniquePassages', pulse.uniquePassages);
  pushMetric(rows, scope, scopeId, 'xp', 'totalXp', pulse.xp.totalXp);
  pushMetric(rows, scope, scopeId, 'xp', 'users', pulse.xp.users);
  pushMetric(rows, scope, scopeId, 'threads', 'linksCreated', pulse.threads.linksCreated);

  for (const book of pulse.books) {
    pushMetric(rows, scope, scopeId, 'books', book.name, book.count);
  }
  for (const theme of pulse.themes) {
    pushMetric(rows, scope, scopeId, 'themes', theme.name, theme.count);
  }
  for (const activity of pulse.xp.byActivity) {
    pushMetric(rows, scope, scopeId, 'xpActivity', activity.label, activity.totalXp);
  }

  return rows;
}

function rollupToRows(rollup: AdminReportRollup): AdminReportExportRow[] {
  const fakePayload: AdminMonthlyReportPayload = {
    month: rollup.months.join(','),
    seasonId: rollup.scopeId,
    seasonName: rollup.scopeName,
    generatedAt: new Date().toISOString(),
    usage: rollup.usage,
    pulse: rollup.pulse,
  };
  return payloadToRows(rollup.scope, rollup.scopeId, fakePayload);
}

export function reportPayloadToExportRows(
  scope: string,
  scopeId: string,
  payload: AdminMonthlyReportPayload,
): AdminReportExportRow[] {
  return payloadToRows(scope, scopeId, payload);
}

export function reportRollupToExportRows(rollup: AdminReportRollup): AdminReportExportRow[] {
  return rollupToRows(rollup);
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportRowsToCsv(rows: AdminReportExportRow[]): string {
  const header = 'scope,scopeId,section,metric,value';
  const lines = rows.map(
    (row) =>
      `${escapeCsvCell(row.scope)},${escapeCsvCell(row.scopeId)},${escapeCsvCell(row.section)},${escapeCsvCell(row.metric)},${escapeCsvCell(row.value)}`,
  );
  return [header, ...lines].join('\n');
}

export function exportPayloadToJson(payload: AdminMonthlyReportPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function exportRollupToJson(rollup: AdminReportRollup): string {
  return JSON.stringify(rollup, null, 2);
}

export function yearRollupToJson(
  year: number,
  seasons: { seasonId: string; seasonName: string; rollup: AdminReportRollup | null; months: AdminMonthlyReportPayload[] }[],
): string {
  return JSON.stringify({ year, seasons }, null, 2);
}
