import { useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import {
  addMonths,
  buildProtoDatePickerMonth,
  formatProtoDatePickerMonthLabel,
  parseLocalDateInput,
  startOfLocalDay,
} from '../../lib/proto-date-picker';

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

export interface ProtoDatePickerProps {
  value: string;
  min: string;
  /**
   * Latest selectable day, inclusive. Omit for no ceiling.
   *
   * The picker was written for scheduling, where everything ahead is open and the floor is
   * today. Reading backwards wants the mirror of that — the study feed cannot show you a day
   * that has not happened — so the bound is a prop rather than a second component.
   */
  max?: string;
  onChange: (iso: string) => void;
  id?: string;
  'aria-label'?: string;
}

export default function ProtoDatePicker({
  value,
  min,
  max,
  onChange,
  id,
  'aria-label': ariaLabel = 'Pick a date',
}: ProtoDatePickerProps) {
  const minDate = useMemo(() => parseLocalDateInput(min) ?? startOfLocalDay(new Date()), [min]);
  const maxDate = useMemo(() => (max ? parseLocalDateInput(max) : null), [max]);
  const selected = useMemo(() => parseLocalDateInput(value), [value]);

  const initialMonth = selected ?? minDate;
  const [monthCursor, setMonthCursor] = useState(() => ({
    year: initialMonth.getFullYear(),
    month: initialMonth.getMonth(),
  }));

  const cells = useMemo(
    () => buildProtoDatePickerMonth(monthCursor.year, monthCursor.month),
    [monthCursor.year, monthCursor.month],
  );

  const monthLabel = formatProtoDatePickerMonthLabel(monthCursor.year, monthCursor.month);
  const cursorStart = new Date(monthCursor.year, monthCursor.month, 1);
  const minMonthStart = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const canGoPrev = cursorStart > minMonthStart;
  const maxMonthStart = maxDate ? new Date(maxDate.getFullYear(), maxDate.getMonth(), 1) : null;
  /* Stopping the arrow as well as the cells: a month you can page into but not pick anything
     in is a dead end you have to work out for yourself. */
  const canGoNext = !maxMonthStart || cursorStart < maxMonthStart;

  function shiftMonth(delta: number) {
    const next = addMonths(new Date(monthCursor.year, monthCursor.month, 1), delta);
    if (delta < 0 && next < minMonthStart) return;
    if (delta > 0 && maxMonthStart && next > maxMonthStart) return;
    setMonthCursor({ year: next.getFullYear(), month: next.getMonth() });
  }

  function isDisabled(iso: string): boolean {
    const d = parseLocalDateInput(iso);
    if (!d) return true;
    const day = startOfLocalDay(d);
    if (day < startOfLocalDay(minDate)) return true;
    return maxDate ? day > startOfLocalDay(maxDate) : false;
  }

  return (
    <div className="proto-date-picker" id={id} role="group" aria-label={ariaLabel}>
      <div className="proto-date-picker__nav">
        <button
          type="button"
          className="proto-date-picker__nav-btn"
          aria-label="Previous month"
          disabled={!canGoPrev}
          onClick={() => shiftMonth(-1)}
        >
          <Icon name="caret-left" size={12} aria-hidden />
        </button>
        <p className="proto-date-picker__month">{monthLabel}</p>
        <button
          type="button"
          className="proto-date-picker__nav-btn"
          aria-label="Next month"
          disabled={!canGoNext}
          onClick={() => shiftMonth(1)}
        >
          <Icon name="caret-right" size={12} aria-hidden />
        </button>
      </div>
      <div className="proto-date-picker__weekdays" aria-hidden>
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="proto-date-picker__weekday">
            {label}
          </span>
        ))}
      </div>
      <div className="proto-date-picker__grid" role="grid">
        {cells.map((cell) => {
          const disabled = isDisabled(cell.iso);
          const selectedDay = value === cell.iso;
          return (
            <button
              key={cell.iso}
              type="button"
              role="gridcell"
              disabled={disabled}
              aria-selected={selectedDay}
              aria-label={cell.iso}
              className={[
                'proto-date-picker__day',
                !cell.inMonth ? 'proto-date-picker__day--outside' : '',
                selectedDay ? 'proto-date-picker__day--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onChange(cell.iso)}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
      {selected ? (
        <p className="proto-date-picker__summary">
          {selected.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      ) : null}
    </div>
  );
}
