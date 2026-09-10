/**
 * A glyph over a word, in a pressable block.
 *
 * Two surfaces share it: the question feedback on Review's result card, and the Activity row's
 * overflow menu. They are the same gesture at the same size, and a second copy would drift the
 * way the shelf row and the dock once drifted over which stem to show.
 *
 * **The word is not optional.** This feature already removed a bare `+` for being an unexplained
 * icon (see `REVIEW_ADD_COPY`), and "fewer questions like this" has no settled glyph at all. So
 * `label` is required, and `ariaLabel` only overrides the accessible name where the visible word
 * is a genuine shortening of it — otherwise the accessible name stays the visible text, which is
 * what label-in-name asks for.
 */

import Icon, { type IconName } from '@/components/react/Icon';
import { haptics } from '@/utils/haptics';

export default function ProtoIconBlock({
  icon,
  label,
  ariaLabel,
  selected,
  disabled,
  role,
  onSelect,
  className,
}: {
  icon: IconName;
  /** The word under the glyph. Never omitted — this control is not a bare icon. */
  label: string;
  /** The full sentence, where the visible word is a shortening of it. Defaults to `label`. */
  ariaLabel?: string;
  selected?: boolean;
  disabled?: boolean;
  /** `menuitem` inside a popover; omitted for a plain group of buttons. */
  role?: string;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role={role}
      className={`proto-icon-block${className ? ` ${className}` : ''}`}
      aria-pressed={typeof selected === 'boolean' ? selected : undefined}
      aria-label={ariaLabel && ariaLabel !== label ? ariaLabel : undefined}
      disabled={disabled}
      onClick={() => {
        haptics.light();
        onSelect();
      }}
    >
      <span className="proto-icon-block__glyph" aria-hidden>
        <Icon name={icon} size={16} />
      </span>
      <span className="proto-icon-block__label">{label}</span>
    </button>
  );
}
