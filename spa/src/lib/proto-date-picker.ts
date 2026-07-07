/** Local-calendar helpers for prototype date pickers (YYYY-MM-DD, no timezone drift). */

export function parseLocalDateInput(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

export function formatLocalDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

export type ProtoDatePickerCell = {
  iso: string;
  day: number;
  inMonth: boolean;
};

/** Sunday-start month grid (6 rows × 7 cols). */
export function buildProtoDatePickerMonth(year: number, monthIndex: number): ProtoDatePickerCell[] {
  const first = new Date(year, monthIndex, 1);
  const leading = first.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: ProtoDatePickerCell[] = [];

  for (let i = 0; i < leading; i += 1) {
    const d = new Date(year, monthIndex, i - leading + 1);
    cells.push({ iso: formatLocalDateInput(d), day: d.getDate(), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(year, monthIndex, day);
    cells.push({ iso: formatLocalDateInput(d), day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = parseLocalDateInput(cells[cells.length - 1]!.iso)!;
    const d = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    cells.push({ iso: formatLocalDateInput(d), day: d.getDate(), inMonth: false });
  }
  while (cells.length < 42) {
    const last = parseLocalDateInput(cells[cells.length - 1]!.iso)!;
    const d = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    cells.push({ iso: formatLocalDateInput(d), day: d.getDate(), inMonth: false });
  }
  return cells;
}

export function formatProtoDatePickerMonthLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
