import type { CSSProperties } from 'react';
import type { FontChoice } from '../../../lib/proto-font-prefs';
import Icon from '@/components/react/Icon';

export type AppearancePreviewTileProps = {
  label: string;
  selected: boolean;
  onClick: () => void;
  /** Solid canvas fill (hex or CSS var) — drives glass tint on preset tiles. */
  canvasColor?: string;
  /** Wallpaper thumbnail data URL. */
  canvasImageUrl?: string;
  /** Empty photo slot — dashed border + icon instead of mini shell. */
  photoEmpty?: boolean;
  /** Image wallpaper uses translucent blur; presets use canvas color-mix glass. */
  glassMode?: 'preset' | 'image';
  /** Typeface tiles: render an "Aa" specimen in this face instead of the mini shell. */
  sampleFont?: FontChoice;
  /** Small chip under the label — marks one tile as the standing choice (e.g. "Default"). */
  badge?: string;
};

type PreviewCanvasStyle = CSSProperties & {
  '--preview-canvas'?: string;
};

export function AppearancePreviewTile({
  label,
  selected,
  onClick,
  canvasColor,
  canvasImageUrl,
  photoEmpty = false,
  glassMode = 'preset',
  sampleFont,
  badge,
}: AppearancePreviewTileProps) {
  const canvasStyle: PreviewCanvasStyle = {
    '--preview-canvas': canvasColor ?? 'var(--pds-canvas-default)',
  };
  if (canvasImageUrl) {
    canvasStyle.backgroundImage = `url("${canvasImageUrl}")`;
  } else if (canvasColor) {
    canvasStyle.backgroundColor = canvasColor;
  }

  const className = [
    'proto-appearance-preview',
    selected ? 'proto-appearance-preview--selected' : '',
    photoEmpty ? 'proto-appearance-preview--photo-empty' : '',
    glassMode === 'image' ? 'proto-appearance-preview--image' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      role="option"
      className={className}
      title={label}
      aria-label={badge ? `${label} (${badge})` : label}
      aria-pressed={selected}
      aria-selected={selected}
      onClick={onClick}
    >
      <span className="proto-appearance-preview__canvas" style={canvasStyle} aria-hidden>
        {sampleFont ? (
          /* Typeface tiles show the face itself. A row of identical mini-app mockups
             cannot tell three fonts apart — the specimen is the preview. */
          <span className="proto-appearance-preview__specimen" data-font={sampleFont}>
            Aa
          </span>
        ) : photoEmpty ? (
          <span className="proto-appearance-preview__photo-icon">
            <Icon name="file-image" size={18} />
          </span>
        ) : (
          <span className="proto-appearance-preview__shell">
            <span className="proto-appearance-preview__toolbar" />
            <span className="proto-appearance-preview__body">
              <span className="proto-appearance-preview__sidebar" />
              <span className="proto-appearance-preview__main" />
            </span>
          </span>
        )}
        {selected ? (
          <span className="proto-appearance-preview__check-orb" aria-hidden>
            <Icon name="check" size={11} />
          </span>
        ) : null}
      </span>
      <span className="proto-appearance-preview__label">{label}</span>
      {badge ? <span className="proto-appearance-preview__badge">{badge}</span> : null}
    </button>
  );
}
