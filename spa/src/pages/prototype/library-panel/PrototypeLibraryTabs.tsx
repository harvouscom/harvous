/**
 * Which kind of thing the panel is showing.
 *
 * A menu rather than a chip row. Seven chips wrapped or scrolled depending on width, and a
 * filter you have to scroll to reach is a filter you stop using — the same lesson the study
 * feed learned when eight scope chips turned the top of its sheet into a header band. It
 * also frees the row for the search field, which is the thing this surface is named after.
 *
 * `ProtoSelectMenu` is the house answer for choosing one of a list — a trigger plus a
 * portaled menu of radio rows — and is already what the space switcher, the sidebar's list
 * picker and the planner's scopes use. Its own comment names the risk of a ninth hand-rolled
 * variant, which is exactly what a bespoke dropdown here would be.
 */
import ProtoSelectMenu from '../ProtoSelectMenu';
import Icon from '@/components/react/Icon';
import { LIBRARY_TAB_OPTIONS, type LibraryTab } from '../sidebar-search-types';
import { commandNoun } from '../../../lib/prototype-commands';
import type { LibrarySelection } from './use-library-selection';

export default function PrototypeLibraryTabs({
  tab,
  onSelect,
  selection,
}: {
  tab: LibraryTab;
  onSelect: (tab: LibraryTab) => void;
  /** Absent on tabs that cannot be selected in — the footer then does not render. */
  selection?: LibrarySelection;
}) {
  /*
   * Selecting is entered from here, in words, under the kinds.
   *
   * It went through two worse homes first: a bare tick in the header, which reads as
   * "confirm" and sat inside the search field's own box, and an `⋯` menu beside it, which
   * moved the words into a menu but left a control that acts on the rows attached to the
   * thing you type into. A hover-reveal on the rows themselves was the obvious third answer
   * and is the wrong one on a touch screen, where there is no hover at all — the sidebar
   * tried it and its `ListViewMenu` now says outright that "there is no hover reveal any
   * more".
   *
   * So it lands where the sidebar already put it: a menu item under the list picker, reachable
   * by the same tap on a phone as by a click on a desktop, and costing the rows nothing. Its
   * own section, not a seventh option, because it is a mode you enter rather than a kind you
   * choose — and an option would leave the trigger claiming "Select folders" as the current
   * view.
   */
  const canSelect = Boolean(selection?.available && selection.kind);
  const selectFooter = canSelect && selection
    ? (close: () => void) => (
    <div className="proto-menu-section" role="group">
      <button
        type="button"
        role="menuitem"
        className="proto-menu-item"
        onClick={() => {
          selection.setActive(!selection.active);
          close();
        }}
      >
        <span className="proto-menu-item__icon" aria-hidden>
          <Icon name={selection.active ? 'xmark' : 'check-double'} size={13} />
        </span>
        <span className="proto-menu-item__label">
          {selection.active
            ? 'Done selecting'
            : /* "Multiple" earns its place: "Select folders" can be read as *choose which
                 folder*, which is what the list above this already does. */
              `Select multiple ${commandNoun(selection.kind!, 2)}`}
        </span>
      </button>
    </div>
      )
    : undefined;

  return (
    <ProtoSelectMenu<LibraryTab>
      value={tab}
      onChange={onSelect}
      label="Which kind of thing to show"
      className="proto-library-kind"
      options={LIBRARY_TAB_OPTIONS.map((option) => ({
        value: option.id,
        label: option.label,
        /* The kinds carry the same glyphs the sidebar's list modes wear, so a row here and
           a row there are recognisably the same list. */
        icon: option.iconName ? <Icon name={option.iconName as never} size={13} aria-hidden /> : undefined,
      }))}
      footer={selectFooter}
    />
  );
}
