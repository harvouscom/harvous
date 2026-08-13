/**
 * The selection checkbox on a sidebar list row.
 *
 * A *sibling* of the row's main button, never a child: the list's keyboard
 * navigation matches `button.proto-note-row__main`
 * (`useListKeyboardNavigation`), so nesting this would make every row two
 * arrow-key stops, and a button inside a button is invalid markup besides.
 *
 * Whether it shows at all is entirely CSS — see the multi-select block in
 * `prototype-components.css`. It's hidden until the list menu's "Select…"
 * turns selecting on for the whole list; there is no per-row hover reveal.
 */
import Icon from '@/components/react/Icon';

export default function ProtoRowSelectCheckbox({
  selected,
  label,
  onToggle,
  onRangeTo,
  className = 'proto-note-row__select',
}: {
  selected: boolean;
  /** The row's title — what "Select …" / "Deselect …" names for a screen reader. */
  label: string;
  onToggle?: () => void;
  /** Shift-click extends from the last row touched. Omit where a range is meaningless. */
  onRangeTo?: () => void;
  /**
   * Folder and Thread cards are a different shape from list rows and have their own
   * `proto-collection-card__select` geometry. Only the class differs — the behaviour
   * (swallowing the row's click, the aria-checked contract, shift-to-extend) is identical,
   * and both cards used to hand-roll their own copy of it without the range support.
   */
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      role="checkbox"
      aria-checked={selected}
      aria-label={selected ? `Deselect ${label}` : `Select ${label}`}
      onClick={(e) => {
        /* The row's own click must not also fire: on most of these rows that
           would open the thing you were trying to tick. */
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey && onRangeTo) onRangeTo();
        else onToggle?.();
      }}
    >
      {selected ? (
        <span className="proto-accent-check-orb proto-accent-check-orb--selected">
          <Icon name="check" size={11} />
        </span>
      ) : (
        <span className="proto-select-orb-idle" />
      )}
    </button>
  );
}
