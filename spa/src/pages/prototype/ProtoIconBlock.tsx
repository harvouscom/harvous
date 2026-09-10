/**
 * A glyph over a word, in a pressable block.
 *
 * Review's question feedback is the one thing wearing it: two blocks under the result, where the
 * reader says what they thought of the exercise they were just given. It lives in its own file
 * rather than inside the dock because the pressed state is the app's accent button and the rules
 * that get it there are fiddly enough to be worth naming once — see `.proto-icon-block` in
 * `prototype-components.css`.
 *
 * **The word is not optional.** This feature already removed a bare `+` for being an unexplained
 * icon (see `REVIEW_ADD_COPY`), and "fewer questions like this" has no settled glyph at all. So
 * `label` is required, and it is also the accessible name — there is no separate `aria-label`,
 * because a control whose spoken name differs from its visible word is the thing label-in-name
 * exists to prevent.
 */

import Icon, { type IconName } from '@/components/react/Icon';
import { haptics } from '@/utils/haptics';

export default function ProtoIconBlock({
  icon,
  label,
  selected,
  disabled,
  onSelect,
  className,
}: {
  icon: IconName;
  /** The word under the glyph, and the accessible name. Never omitted. */
  label: string;
  /** Omitted entirely where the block is an action rather than a choice. */
  selected?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`proto-icon-block${className ? ` ${className}` : ''}`}
      aria-pressed={typeof selected === 'boolean' ? selected : undefined}
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
