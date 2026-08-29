/**
 * The way into (and out of) selecting rows in the panel.
 *
 * A button in the header rather than an item in the kind picker beside it: that menu answers
 * "which kind of thing am I looking through", and selecting is not a kind. It renders only on
 * tabs that can be selected in, so it never appears as a control that does nothing.
 *
 * While selecting, it doubles as "select all" — the sidebar's list header does the same, and
 * a second button for it would be two controls for one row of chrome that is already tight.
 */
import Icon from '@/components/react/Icon';
import { commandNoun } from '../../../lib/prototype-commands';
import type { LibrarySelection } from './use-library-selection';

export default function PrototypeLibrarySelectToggle({
  selection,
}: {
  selection: LibrarySelection;
}) {
  if (!selection.available || !selection.kind) return null;
  /* Names what this tab selects. `commandNoun` is the same table the verbs' own labels read,
     so the button and the bar under it cannot end up calling one thing two names. */
  const noun = commandNoun(selection.kind, 2);

  if (!selection.active) {
    return (
      <button
        type="button"
        className="proto-side-panel__action-btn"
        title={`Select ${noun}`}
        aria-label={`Select ${noun}`}
        onClick={() => selection.setActive(true)}
      >
        <Icon name="check" size={14} aria-hidden />
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="proto-side-panel__action-btn"
        title={selection.allSelected ? 'Deselect all' : 'Select all'}
        aria-label={selection.allSelected ? 'Deselect all' : 'Select all'}
        aria-pressed={selection.allSelected}
        onClick={selection.toggleAll}
      >
        <Icon name={selection.allSelected ? 'minus' : 'check'} size={14} aria-hidden />
      </button>
      <button
        type="button"
        className="proto-side-panel__action-btn"
        title="Done selecting"
        aria-label="Done selecting"
        onClick={() => selection.setActive(false)}
      >
        <Icon name="xmark" size={14} aria-hidden />
      </button>
    </>
  );
}
