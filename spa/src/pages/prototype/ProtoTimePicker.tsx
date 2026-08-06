/**
 * Pick a wall-clock time, in the app's own language.
 *
 * Replaces `<input type="time">`, which renders OS chrome — a system spinner
 * and a browser-drawn clock glyph that no amount of CSS reaches — so the field
 * read as a widget borrowed from macOS rather than part of Harvous.
 *
 * Built from `HarvousMenuPill`, the same control the study dock uses to pick a
 * passage: Translation / Book / Chapter : Verse. Hour : Minute · AM/PM is the
 * same grammar one row down, so anyone who has changed a verse reference
 * already knows how to change a service time. An earlier draft laid every hour
 * out as a button grid — eighteen targets stacked three rows deep for a value
 * with three parts — which is why this is a row of three menus instead.
 */
import { useMemo } from 'react';
import HarvousMenuPill from '@/components/react/HarvousMenuPill';
import {
  TIME_PICKER_HOURS,
  TIME_PICKER_MINUTES,
  buildTimeValue,
  timePartsOrDefault,
  type Meridiem,
} from '../../lib/proto-time-picker';

const HOUR_OPTIONS = TIME_PICKER_HOURS.map((hour) => ({
  value: String(hour),
  label: String(hour),
}));

const MINUTE_OPTIONS = TIME_PICKER_MINUTES.map((minute) => ({
  value: String(minute),
  // Padded, so the menu reads 00 / 05 / 10 rather than 0 / 5 / 10.
  label: String(minute).padStart(2, '0'),
}));

const MERIDIEM_OPTIONS = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
];

export interface ProtoTimePickerProps {
  /** 'HH:MM' 24-hour, or '' — an empty value still shows the default selected. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export default function ProtoTimePicker({
  value,
  onChange,
  id,
  disabled = false,
  'aria-label': ariaLabel = 'Pick a time',
}: ProtoTimePickerProps) {
  const parts = useMemo(() => timePartsOrDefault(value), [value]);

  /**
   * Every change routes through here, so the value is always a whole time —
   * and so `disabled` has one place to bite. `HarvousMenuPill` has no disabled
   * prop, so the guard is here and the wrapper blocks pointer events; refusing
   * the write is what actually matters, the styling just says so.
   */
  const set = (next: Partial<typeof parts>) => {
    if (disabled) return;
    onChange(buildTimeValue({ ...parts, ...next }));
  };

  return (
    <div
      className={`proto-time-picker${disabled ? ' proto-time-picker--disabled' : ''}`}
      id={id}
      role="group"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
    >
      {/* Hour and minute cluster tight around the colon; the meridiem sits
          apart, because it qualifies the pair rather than joining it. */}
      <div className="proto-time-picker__cluster">
        <HarvousMenuPill
          ariaLabel="Hour"
          variant="compact"
          monospaceDigits
          value={String(parts.hour12)}
          options={HOUR_OPTIONS}
          onChange={(v) => set({ hour12: Number(v) })}
        />
        <span className="proto-time-picker__colon" aria-hidden>
          :
        </span>
        <HarvousMenuPill
          ariaLabel="Minutes"
          variant="compact"
          monospaceDigits
          value={String(parts.minute)}
          options={MINUTE_OPTIONS}
          onChange={(v) => set({ minute: Number(v) })}
        />
      </div>
      <HarvousMenuPill
        ariaLabel="AM or PM"
        variant="compact"
        value={parts.meridiem}
        options={MERIDIEM_OPTIONS}
        onChange={(v) => set({ meridiem: v as Meridiem })}
      />
    </div>
  );
}
