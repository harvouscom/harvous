/**
 * The bar that stands while a selection does. Nothing lives in the header.
 *
 * ## Three homes, and why the first two were wrong
 *
 * This began as a bare tick in the header, which nobody could read: a tick on its own means
 * *confirm* — it is the mark on every OK button ever drawn — so it said "apply", never "turn
 * on multi-select". Replacing it with an `⋯` menu fixed the wording and left the real problem
 * untouched, and so did keeping tick-and-cross here once selecting had started. The header is
 * where *search* is. Its controls sit inside the search field's own rounded box, so anything
 * put there looks like part of a text input — which is the last thing a control that acts on
 * the rows should look like.
 *
 * So selecting is entered from the kind menu, in words (`PrototypeLibraryTabs`), and while it
 * is under way this bar says so. It is the sidebar's `.proto-select-bar`, reused rather than
 * re-styled: the same three parts in the same order, so the two surfaces do not disagree about
 * what selecting looks like.
 *
 * ## Why words and a count rather than two glyphs
 *
 * A mode needs to announce itself. Two icons in a corner can be read as buttons that happen to
 * be there; "3 selected" between two labelled actions cannot be read as anything except being
 * in the middle of something. The count is also the only part that answers the question people
 * actually have while selecting, which is how many they have so far — the checkboxes tell you
 * *which*, but not *how many* without counting them yourself.
 */
import type { LibrarySelection } from './use-library-selection';

export default function PrototypeLibrarySelectToggle({
  selection,
}: {
  selection: LibrarySelection;
}) {
  if (!selection.available || !selection.kind || !selection.active) return null;

  const count = selection.selectedIds.length;

  return (
    <div className="proto-select-bar" role="status" aria-live="polite">
      <button
        type="button"
        className="proto-select-bar__action"
        onClick={selection.toggleAll}
      >
        {selection.allSelected ? 'Deselect all' : 'Select all'}
      </button>
      <span className="proto-select-bar__count">
        {count === 1 ? '1 selected' : `${count} selected`}
      </span>
      {/* "Done" rather than the sidebar's "Clear": both end the mode, but this panel keeps a
          bulk bar under the list that already says Clear, and two Clears in one surface would
          be two names for what looks like one job. */}
      <button
        type="button"
        className="proto-select-bar__action proto-select-bar__action--done"
        onClick={() => selection.setActive(false)}
      >
        Done
      </button>
    </div>
  );
}
