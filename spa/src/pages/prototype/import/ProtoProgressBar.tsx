/**
 * The design system's determinate progress bar: ink running along a ruled line,
 * matching the paper the drop-zone illustration is drawn on.
 *
 * Two details make lumpy backend progress feel honest: the fill is eased over
 * ~420ms so a jump from 20% to 75% reads as motion rather than a snap, and the
 * percentage uses tabular figures rounded *down* so it never shows 100% before
 * the work is actually done, and never jitters in width as digits change.
 *
 * There is no success/error tone. A full bar already means finished, and a failed
 * row carries its own red error line, border and Try again — colouring the bar too
 * was a third alarm for the same fact.
 */

export interface ProtoProgressBarProps {
  /** 0–1. Ignored when `indeterminate` is set. */
  value?: number;
  indeterminate?: boolean;
  showPercent?: boolean;
  /** Rendered under the bar — e.g. "Linking scripture…". */
  label?: string | null;
  className?: string;
}

export default function ProtoProgressBar({
  value = 0,
  indeterminate = false,
  showPercent = false,
  label,
  className,
}: ProtoProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, value));
  const percent = Math.floor(clamped * 100);

  return (
    <div className={`proto-progress${className ? ` ${className}` : ''}`}>
      <div className="proto-progress__row">
        <div
          className={`proto-progress__track${
            indeterminate ? ' proto-progress__track--indeterminate' : ''
          }`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={indeterminate ? undefined : percent}
          aria-label={label ?? undefined}
        >
          <div
            className="proto-progress__fill"
            style={indeterminate ? undefined : { width: `${clamped * 100}%` }}
          />
        </div>
        {showPercent && !indeterminate ? (
          <span className="proto-progress__percent">{percent}%</span>
        ) : null}
      </div>
      {label ? <span className="proto-progress__label">{label}</span> : null}
    </div>
  );
}
