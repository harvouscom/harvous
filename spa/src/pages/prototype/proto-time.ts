/** Full relative time for non-sidebar surfaces (matches native sidebarCompact phrasing). */
export function protoRelativeCaption(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const now = Date.now();
  let diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return 'Just now';

  let unit: Intl.RelativeTimeFormatUnit = 'minute';
  let value = Math.floor(diffSec / 60);
  if (value >= 60) {
    value = Math.floor(value / 60);
    unit = 'hour';
    if (value >= 24) {
      value = Math.floor(value / 24);
      unit = 'day';
      if (value >= 14) {
        value = Math.floor(value / 7);
        unit = 'week';
        if (value >= 10) return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
    }
  }
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  return rtf.format(-value, unit);
}

/** Abbreviated relative time for conversation list rows (trailing timestamp). */
export function protoRelativeCaptionAbbrev(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const now = Date.now();
  let diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return 'now';

  let unit: Intl.RelativeTimeFormatUnit = 'minute';
  let value = Math.floor(diffSec / 60);
  if (value >= 60) {
    value = Math.floor(value / 60);
    unit = 'hour';
    if (value >= 24) {
      value = Math.floor(value / 24);
      unit = 'day';
      if (value >= 14) {
        value = Math.floor(value / 7);
        unit = 'week';
        if (value >= 10) return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
    }
  }
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' });
  return rtf.format(-value, unit);
}
