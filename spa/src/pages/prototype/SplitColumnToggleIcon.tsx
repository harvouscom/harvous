/**
 * Split-column toolbar glyph — animated left/right pane fill (inspector + sidebar parity).
 * Mirrors Font Awesome `table-columns` geometry (viewBox 0 0 512 512).
 */
const WIPE_TRANSITION = 'transform 0.26s cubic-bezier(0.32, 0.72, 0.24, 1)';

export default function SplitColumnToggleIcon({
  side,
  open,
  size,
}: {
  side: 'left' | 'right';
  open: boolean;
  size: number;
}) {
  const origin = side === 'right' ? 'right center' : 'left center';
  const rectX = side === 'right' ? 250 : 22;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        color: 'inherit',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 512 512" fill="currentColor" style={{ display: 'block' }}>
        <path d="M0 96C0 60.7 28.7 32 64 32l384 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zm64 64l0 256 160 0 0-256L64 160zm384 0l-160 0 0 256 160 0 0-256z" />
        <rect
          x={rectX}
          y={100}
          width={240}
          height={360}
          style={{
            transformBox: 'fill-box',
            transformOrigin: origin,
            transform: open ? 'scaleX(1)' : 'scaleX(0)',
            transition: WIPE_TRANSITION,
          }}
        />
      </svg>
    </span>
  );
}
