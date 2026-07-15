/**
 * Color-tinted OG card HTML for shared threads.
 */

import {
  brandingFooter,
  DEFAULT_COLOR,
  escapeHtml,
  OG_INK,
  OG_INK_SOFT,
  THREAD_COLORS,
  truncateText,
} from '@/utils/og-image';

export function buildThreadCardHtml(input: {
  title: string;
  subtitle?: string | null;
  color?: string | null;
  noteCount: number;
}): string {
  const threadColor = THREAD_COLORS[input.color || 'blue'] || DEFAULT_COLOR;
  const displayTitle = truncateText(input.title.trim() || 'Shared study thread', 60);
  const subtitle = input.subtitle?.trim()
    ? truncateText(input.subtitle.trim(), 80)
    : '';
  const countLabel = `${input.noteCount} ${input.noteCount === 1 ? 'note' : 'notes'}`;

  const subtitleSection = subtitle
    ? `<p style="font-size: 30px; font-weight: 400; color: ${OG_INK_SOFT}; margin: 0; max-width: 900px; text-align: center;">${escapeHtml(subtitle)}</p>`
    : '';

  return `
    <div style="height: 100%; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: ${threadColor}; font-family: 'Reddit Sans', system-ui, sans-serif; padding: 80px;">
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; margin-bottom: 36px; gap: 16px;">
        <h1 style="font-size: 68px; font-weight: 700; color: ${OG_INK}; margin: 0; line-height: 1.15; max-width: 1000px;">
          ${escapeHtml(displayTitle)}
        </h1>
        ${subtitleSection}
      </div>
      <div style="display: flex; align-items: center; justify-content: center; background-color: rgba(255, 255, 255, 0.92); border-radius: 24px; padding: 16px 32px; margin-bottom: 56px;">
        <span style="font-size: 26px; font-weight: 600; color: ${OG_INK};">
          ${escapeHtml(countLabel)}
        </span>
      </div>
      ${brandingFooter()}
    </div>
  `;
}
