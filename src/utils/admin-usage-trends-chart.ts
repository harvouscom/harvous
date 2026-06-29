import type { DailyCount } from '@/hooks/queries/useAdminUsage';

export type TrendPoint = {
  date: string;
  label: string;
  signups: number;
  notes: number;
  activeUsers: number;
  scripturePills: number;
  recallOpens: number;
};

export type TrendSeriesKey = keyof Pick<
  TrendPoint,
  'signups' | 'notes' | 'activeUsers' | 'scripturePills' | 'recallOpens'
>;

export const PROJECTION_HORIZON_DAYS = 3;
export const PROJECTION_MIN_NONZERO_POINTS = 3;

export function mergeTrendPoints(
  signups: DailyCount[],
  notesCreated: DailyCount[],
  activeUsers: DailyCount[],
  scripturePillsCreated: DailyCount[],
  recallOpens: DailyCount[],
  days: number,
): TrendPoint[] {
  const recent = signups.slice(-days);
  const notesByDate = new Map(notesCreated.map((r) => [r.date, r.count]));
  const activeByDate = new Map(activeUsers.map((r) => [r.date, r.count]));
  const scriptureByDate = new Map(scripturePillsCreated.map((r) => [r.date, r.count]));
  const recallByDate = new Map(recallOpens.map((r) => [r.date, r.count]));
  return recent.map((row) => ({
    date: row.date,
    label: row.date.slice(5),
    signups: row.count,
    notes: notesByDate.get(row.date) ?? 0,
    activeUsers: activeByDate.get(row.date) ?? 0,
    scripturePills: scriptureByDate.get(row.date) ?? 0,
    recallOpens: recallByDate.get(row.date) ?? 0,
  }));
}

export function niceMax(value: number): number {
  if (value <= 0) return 5;
  if (value <= 5) return 5;
  if (value <= 10) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function buildLinePath(
  values: number[],
  max: number,
  xAt: (index: number) => number,
  yAt: (value: number, max: number) => number,
  startIndex = 0,
): string {
  if (values.length === 0) return '';
  return values
    .map((value, index) => {
      const plotIndex = startIndex + index;
      return `${index === 0 ? 'M' : 'L'} ${xAt(plotIndex).toFixed(2)} ${yAt(value, max).toFixed(2)}`;
    })
    .join(' ');
}

export function axisTicks(max: number, count = 4): number[] {
  const step = max / count;
  return Array.from({ length: count + 1 }, (_, i) => Math.round(step * i));
}

export function formatTrendTick(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (value >= 1000) {
    const k = value / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return String(value);
}

export function countNonZero(values: number[]): number {
  return values.filter((v) => v > 0).length;
}

/** Least-squares linear trend on the last min(7, n) points; projects horizonDays forward (clamped ≥ 0). */
export function projectLinearTrend(values: number[], horizonDays = PROJECTION_HORIZON_DAYS): number[] {
  if (values.length === 0 || horizonDays <= 0) return [];

  const windowSize = Math.min(7, values.length);
  const startIdx = values.length - windowSize;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < windowSize; i++) {
    const x = startIdx + i;
    const y = values[x];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denom = windowSize * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (windowSize * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / windowSize;

  return Array.from({ length: horizonDays }, (_, i) => {
    const x = values.length + i;
    const projected = intercept + slope * x;
    return Math.max(0, Math.round(projected));
  });
}

export function shouldProjectSeries(values: number[]): boolean {
  return countNonZero(values) >= PROJECTION_MIN_NONZERO_POINTS;
}

export function panelMaxForSeries(points: TrendPoint[], keys: TrendSeriesKey[]): number {
  const raw = Math.max(1, ...points.map((p) => Math.max(...keys.map((key) => p[key]))));
  return niceMax(raw);
}

export function addProjectionDates(lastDate: string, count: number): string[] {
  const base = new Date(`${lastDate}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i + 1);
    return d.toISOString().slice(0, 10);
  });
}
